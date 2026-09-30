#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
MAX_ATTEMPTS="${GIT_SAFE_PUSH_ATTEMPTS:-6}"
BASE_DELAY="${GIT_SAFE_PUSH_BASE_DELAY_SECONDS:-2}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Safe push requires all tracked state changes to be committed together."
  exit 1
fi

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "Safe push attempt ${attempt}/${MAX_ATTEMPTS}..."

  # Fetch first so the rebase always uses the newest remote branch.
  git fetch origin "$BRANCH"

  if ! git rebase "origin/$BRANCH"; then
    echo "Rebase conflict detected. Aborting this attempt safely."
    git rebase --abort || true
    exit 1
  fi

  if git push origin "HEAD:$BRANCH"; then
    echo "Safe push completed successfully."
    exit 0
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    delay=$((BASE_DELAY * attempt + RANDOM % 3))
    echo "Remote changed during push. Retrying in ${delay}s..."
    sleep "$delay"
  fi
done

echo "Safe push failed after ${MAX_ATTEMPTS} attempts."
exit 1
