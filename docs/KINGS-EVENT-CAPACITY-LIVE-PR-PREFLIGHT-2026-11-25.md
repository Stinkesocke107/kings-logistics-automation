# Kings Event Capacity — PR-only real GitHub live preflight

**Date:** 25 November 2026
**Activation stage:** Safe live metadata smoke test on Draft PR #143 only. Never a production Event Capacity release.

## What runs automatically now

The existing workflow **Kings Offline System Verification** runs a new strictly read-only step ONLY when the PR is exactly **#143** from the same Kings source repository and the expected feature branch. This runs as part of existing pull-request CI; no new workflow, scheduler, VPS, hosted bot or GitHub repository was created.

The step calls the event-capacity-github-live-preflight.js module with ONLY GitHub's built-in read-only pull-request token, never a Discord bot token or private data/witness credentials.

It checks:
1. The current execution is the exact trusted Kings same-repository PR 143 targeting main, not a fork or direct push.
2. The latest eligible successful **scheduled main Kings Convoy Checker** GitHub run exists within the existing 30-minute source freshness window.
3. The independently fetched run is the same successful scheduled main-branch run with the expected repository, workflow, source SHA, run attempt and execution duration.
4. Only two fixed GitHub API metadata GET requests are permitted. No raw Event reports, archive ZIPs, Staff messages, Discord REST, private ledgers, GitHub issues, contents writes, artifact downloads or Event acceptances are invoked.
5. The output contains ONLY allowlisted states: SCHEDULED_METADATA_VERIFIED, SCHEDULED_METADATA_UNVERIFIED, or CONTEXT_REJECTED, and constant safety flags. No run IDs, commit SHA, bot tokens, private IDs or staff/event information is written to public CI logs.

GitHub cron can run late; an older run is NOT proof of a current usable Event source. The preflight warns if it cannot verify the live scheduled run while preserving the unrelated Kings regression result. A successful preflight is **NOT** permission to write to Discord or certify Convoy slots.

## What was NOT activated

- The full Event Capacity dashboard, Discord bootstrap/sync, Staff command polling, event approvals, verified free slots and owner-controlled ledger writes are still OFF.
- Feature branch unmerged and PR #143 remains Draft.
- The main Convoy Checker continues separately, untouched.
- No owner-private signing key, bot token, private repository or actual Event archive was exposed to public PR CI.
- This test has no Discord API capability, so it cannot yet attest live Discord permissions or display a live Event Capacity dashboard.

## Next activation gates

1. Validate the real PR preflight execution and its redacted log. If scheduled metadata is unverified, diagnose source freshness without overriding fail-closed rules.
2. After explicit security review, selectively release ONLY independently audited read-only preview code to main, not the still unfinished private-vault and staff-decision modules.
3. Deploy a manual read-only preview with fixed redacted readiness results; do not enable Discord messages merely because a metadata preflight passed.
4. Separately provision private data and witness repos, offline owner receipt custody and recovery, current Discord roles/permissions, historical Event archives, and durable audit backups before any protected write or verified free-slot claim.

All operations remain GitHub-hosted. No permanent bot host required.
