# Kings Event Capacity — Independent read-only MAIN preview

**Scope:** independent from the unfinished Event Capacity Draft PR #143.
**Hosting:** existing GitHub Actions Kings Offline System Verification workflow, no new hosted bot and no separate scheduled workflow.

## Minimal production-compatible scope

This tiny change was branched directly from main. It does NOT cherry-pick the unfinished Staff commands, encrypted private ledger, stored Event decisions, historical coverage, Discord dashboard or any Event Capacity write paths from PR #143.

It adds:
- event-capacity-readonly-preview.js — standalone fixed-repository, metadata-ONLY GitHub Actions verifier.
- tests/event-capacity-readonly-preview.test.cjs — synthetic PR/manual workflow, missing permission, spoofing, stale source, token-redaction, no-write/no-Discord tests.
- Existing system-tests.yml — one new optional boolean input named capacity_preview (default false) on workflow_dispatch, plus a constrained same-repo PR verification. No changes whatsoever to the main production Convoy Checker workflow.

**Trust boundary:** READ-ONLY GitHub Actions token with actions:read/contents:read and fixed GET endpoints. The diagnostic accepts ONLY GitHub Actions workflow metadata from the scheduled Kings Convoy Checker (live). No Event IDs, channel IDs, raw ZIP bytes, private GitHub repos, bot secrets or Staff notes are accessed or emitted.

It returns one of three public-safe status strings:
- SCHEDULED_SOURCE_METADATA_VERIFIED — recent successful main scheduled Convoy Checker metadata checked by two GETs.
- SCHEDULED_SOURCE_METADATA_UNVERIFIED — source stale, changed, unavailable or denied. Does not imply availability.
- CONTEXT_REJECTED — not the expected main manual opt-in or trusted same-repo validation PR.

Each state explicitly keeps:
- Discord NOT CONTACTED
- ZIP NOT DOWNLOADED
- Event WRITES DISABLED
- Free slots UNVERIFIED

## Activation and safety

The read-only preview only becomes available on main AFTER the dedicated change is independently reviewed and merged. Before that it runs on the focused branch's PR only.

Once reviewed/merged, start through GitHub Actions -> Kings Offline System Verification -> Run workflow -> main -> capacity_preview = true. This is a MANUAL probe, never an automatic job and not an approval of new Event Capacity features.

Do NOT activate any Event Capacity commands/sync/dashboard, real Staff approvals, encrypted ledger writes, or certified quota availability. The large PR #143 remains Draft and unmerged until separately approved.

The probe's 30-minute run freshness window intentionally may return UNVERIFIED when GitHub cron runs late. That is a useful live finding, not a reason to relax security checks.

The user can inspect the read-only run status in GitHub Actions logs without giving the system or the public log any private Event/Discord data.
