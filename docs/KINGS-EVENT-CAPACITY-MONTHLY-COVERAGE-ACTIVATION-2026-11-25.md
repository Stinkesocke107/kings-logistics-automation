# Kings Event Capacity — Monthly Historical Coverage & Controlled Activation

**Date:** 25 November 2026
**Status:** Development-only, private read-only calculations in Draft PR #143.
**Runtime requirement:** Existing GitHub Actions Convoy Checker. No permanent hosted Discord bot, VPS or additional scheduled workflows.

## Monthly evidence coverage diagnostic

\`event-capacity-github-monthly-coverage.js\` is a **strictly read-only historical evidence diagnostic**, not a free-slot calculation or complete historic archive.

It takes a UTC month (\`YYYY-MM\`) and summarizes every day:
- Nominal **15-minute reference intervals** fully elapsed up to the evaluation time. GitHub Actions scheduling is not guaranteed to start punctually.
- Intervals in which a syntactically valid source archive observation was supplied; duplicates from the same run/attempt are not double-counted, and inconsistent metadata for the same run are rejected.
- Intervals without a matching observation, and whether the period extends beyond the current **14-day GitHub Actions artifact retention** of the Convoy Checker workflow.
- Unresolved Event evidence review count and Legacy Calendar reconciliation count from the earlier \`planHistoricalReview\` analyzer.
- Explicit reasons preventing any certified historical monthly completeness claim.

The module deliberately requires further independent proof even if a synthetic archive contains all 15-minute samples: **poll snapshots do not attest every Event lifecycle transition or archived/deleted thread**. It NEVER asserts complete historical coverage or confirmed free capacity, and never infers that an Event was accepted, cancelled, or rescheduled merely because a snapshot exists.

The pure helper \`monthCoverageFromVerifiedInputs\` does not authenticate inputs. Its result explicitly marks \`sourceAuthenticatedByGateway:false\` and \`ownerPinCheckedByGateway:false\`.

The higher-level \`createGithubOnlyMonthlyCoverageReader\` creates the fixed first-party GitHub authenticated scheduled-report reader and uses an independently protected owner-pinned ledger. It reads both sources and ledger twice, verifies the same source/ledger state, and only then marks the two gateway checks true. **It currently uses only the latest current authenticated report**, not an automatically assumed complete historical archive. Its output remains \`historicalCoverageCertified:false\` and \`freeSlotsCertified:false\` even when both checks succeed.

Source report data, Staff messages, private IDs and internal decision history must never be logged or committed to the PUBLIC Kings source repo. The diagnostics are intended for protected internal views.

## Go-live decision (25 November 2026)

The code repo \`Stinkesocke107/kings-logistics-automation\` is PUBLIC. The Event Capacity work is still isolated in **Draft PR #143**, rather than merged into \`main\`. The \`main\` Convoy Checker continues running, but the **Event Capacity preview input and opt-in worker exist only on the Draft branch** as of this check. The production Event Capacity flag has NOT been enabled here.

There are two different activation milestones:

### Milestone A — first safe, read-only live diagnostic

Before enabling even a production preview:
1. Review/merge only the audited **read-only** GitHub code necessary for the preview after current HEAD offline CI is green. The existing \`workflow_dispatch\` read-only \`capacity_action: preview\` input is safe by design only after verifying the actual deployed commit and permissions.
2. Ensure the preview cannot write to private Staff channels, the Convoy Center, roles, acceptance statuses, public Git history, or issue threads.
3. Keep \`KINGS_EVENT_CAPACITY_ENABLED\`, \`KINGS_EVENT_CAPACITY_COMMANDS_ENABLED\`, and \`KINGS_EVENT_CAPACITY_EVIDENCE_ENABLED\` unset/false. No background polling or automatic approval is enabled.
4. Preview may reveal only **fixed public-safe readiness states** in GitHub Actions logs; it must not expose channel IDs, Event data, private archive contents, any Staff identity or access token.
5. Verify the preview's real GitHub Actions log, not just mock unit tests. A successful status-only preview would NOT imply verified capacity/free slots.

**No merge, workflow dispatch or production change was performed in this draft.** Activation of the Draft's optional Discord dashboard or staff commands is NOT approved by these tests.

### Milestone B — protected live ledger, verified counts and release

Still REQUIRED before any production staff decision processing:
- Two separately provisioned PRIVATE GitHub repositories (encrypted data and separate signed witness) with distinct fine-grained credentials and strict branch/administration boundaries.
- Owner-retained OFFLINE Ed25519 highwater receipts; the owner private signing key must never enter GitHub Actions, Discord or GitHub secrets.
- Real private Staff channel and CEO/Event Leadership/Coordination role IDs, live Discord effective-permission checks and incident procedures.
- Full historical accepted/cancelled/rescheduled Event inventory and independent archival coverage evidence, including periods beyond 14-day ephemeral ZIP retention. A current source report is not an archive.
- 24-month protected audit history, tested separately encrypted retention/restore, key-rotation and durable task/replay policies.
- Final integration with the real owner-pinned encrypted vault and authenticated GitHub source, source and role reconciliation on every authorized write, explicit human approval and CEO release sign-off.
- A separate reviewed evidence record proving that all release gates passed. CLI flags or environment booleans alone are not authorization.

**Operational conclusion: Milestone B is NOT ready. Do not enable Event Capacity production Sync, Bootstrap, commands, capacity approvals or free-slot publication.**

## Test coverage

- \`tests/event-capacity-github-monthly-coverage.test.cjs\`: March 2027 UTC daily 15-minute gaps, empty/future month, leap-year February, duplicate run metadata, mismatching ZIP archive, complete simulated snapshots still refusing free-slot certification, and the 14-day artifact-retention backfill warning.
- \`tests/event-capacity-github-authenticated-source.test.cjs\`: checks a live-like double authenticated ZIP/ledger read with a monthly diagnostics projection; fails on changed source or owner checkpoint.

**All development remains GitHub-hosted. There is no newly hosted bot and no automatic Event decision activation.**
