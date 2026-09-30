#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
MAX_ATTEMPTS="${GIT_SAFE_PUSH_ATTEMPTS:-6}"
BASE_DELAY="${GIT_SAFE_PUSH_BASE_DELAY_SECONDS:-2}"

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "GIT_SAFE_PUSH_ATTEMPTS must be a positive integer."
  exit 1
fi

if ! [[ "$BASE_DELAY" =~ ^[0-9]+$ ]]; then
  echo "GIT_SAFE_PUSH_BASE_DELAY_SECONDS must be a non-negative integer."
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Safe push must run inside a Git repository."
  exit 1
fi

# A workflow must commit every tracked mutation before entering the shared
# push/rebase section. Otherwise a rebase could carry unrelated working-tree
# state forward or Git could refuse the operation in an unpredictable place.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Safe push requires all tracked state changes to be committed together."
  exit 1
fi

# New state files are especially easy to forget when a producer introduces a
# new JSON/API-health file. Refuse to push while an untracked file exists under
# data/ so a successful workflow can never silently omit newly generated state.
mapfile -t UNTRACKED_DATA < <(git ls-files --others --exclude-standard -- data 2>/dev/null || true)
if [ "${#UNTRACKED_DATA[@]}" -gt 0 ]; then
  echo "Safe push refuses untracked files under data/. Commit or intentionally ignore them first:"
  printf ' - %s\n' "${UNTRACKED_DATA[@]}"
  exit 1
fi

retry_delay() {
  local attempt="$1"
  echo $((BASE_DELAY * attempt + RANDOM % 3))
}

validate_rebased_json() {
  local remote_ref="$1"
  local file
  local invalid=0

  # Only validate JSON files that belong to the local commits being pushed.
  # If Git auto-merges an independent remote edit into one of those files,
  # parsing the final working-tree version also validates the combined result.
  mapfile -t JSON_FILES < <(
    git diff --name-only --diff-filter=ACMR "${remote_ref}...HEAD" -- '*.json' 2>/dev/null || true
  )

  for file in "${JSON_FILES[@]}"; do
    [ -f "$file" ] || continue
    if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$file" >/dev/null 2>&1; then
      echo "Safe push blocked invalid JSON after rebase: $file"
      invalid=1
    fi
  done

  if [ "$invalid" -ne 0 ]; then
    return 1
  fi
}

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "Safe push attempt ${attempt}/${MAX_ATTEMPTS}..."

  # Fetch can fail transiently. Retry it within the same bounded budget instead
  # of failing the whole producer immediately.
  if ! git fetch origin "$BRANCH"; then
    if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
      echo "Safe push could not fetch origin/$BRANCH after ${MAX_ATTEMPTS} attempts."
      exit 1
    fi

    delay="$(retry_delay "$attempt")"
    echo "Fetch failed. Retrying in ${delay}s..."
    sleep "$delay"
    continue
  fi

  # Never auto-resolve same-file state conflicts. Abort and leave the original
  # local commit intact so both versions remain recoverable for manual review.
  if ! git rebase "origin/$BRANCH"; then
    echo "Rebase conflict detected. Aborting safely without overwriting remote or local state."
    git rebase --abort || true
    exit 1
  fi

  if ! validate_rebased_json "origin/$BRANCH"; then
    echo "Safe push stopped because rebased JSON state is invalid."
    exit 1
  fi

  if git push origin "HEAD:$BRANCH"; then
    echo "Safe push completed successfully."
    exit 0
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    delay="$(retry_delay "$attempt")"
    echo "Remote changed during push. Refetching and retrying in ${delay}s..."
    sleep "$delay"
  fi
done

echo "Safe push failed after ${MAX_ATTEMPTS} attempts."
exit 1
