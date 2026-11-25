# Kings Event Capacity — Historical Event Evidence Review Planner

**Development date:** 25 November 2026
**Status:** draft-only, read-only; no live task creation or Discord modifications. PR #143 remains unmerged.
**Hosting:** the existing scheduled GitHub Actions Convoy Checker; no long-running bot host or new workflow.

## What is implemented

The new \`event-capacity-github-historical-review.js\` prepares a **PRIVATE, evidence-focused review plan** from the latest authenticated scheduled Kings Convoy Checker ZIP and the owner-pinned encrypted Staff decision ledger.

It identifies separate tasks for:
- Accepted \`Scheduled\` and \`Completed\` entries without verifiable historical Staff acceptance/status evidence, approved Partner/External/Kings classification, UTC departure, meeting or planned-end evidence.
- A source category or departure that conflicts with the reviewed Staff ledger.
- \`Cancelled\` entries requiring evidence of the historical release of a previously accepted quota. A current cancellation label is **not proof of when a slot was released**.
- \`Rescheduled\` entries whose private historical decision/revision and new UTC departure do not match the source.
- Frozen \`legacy-calendar\` records needing manual source linking and historical acceptance/cancellation review; duplicate legacy identifiers are flagged, not silently accepted.
- Ledger-only records no longer visible in the latest Convoy Center report. These may be legitimate historic entries, deleted threads or missing current source; the system does not delete them.
- Unrecognized or inconsistent source status/identity, when a trusted parser can still identify a private review case.

Tasks have HMAC-based stable private \`taskKey\` identifiers scoped to the exact Kings Discord guild/forum and review-reason, preventing direct disclosure of sequential event numbers through the task key. Known existing task keys are **linked** without generating duplicates. Task state is only \`Needs Human Review\`, never automatically marked Done or assigned to individual staff.

The private report provides paginated **25-item pages**, deterministic urgency/UTC-date ordering and separate summary counts. Its reviewed source references and dates remain **PRIVATE**. Public Discord and GitHub logs must never contain individual event IDs, raw Staff identifiers, or private review notes.

## Two trust layers

1. \`planHistoricalReview\` is a **pure, non-authenticating projection**. Its output explicitly declares \`sourceAuthenticatedByGateway:false\`, \`ownerPinCheckedByGateway:false\`, \`historicCoverageCertified:false\`, \`freeSlotsCertified:false\` and \`decisionsCommitted:false\`.
2. \`createGithubOnlyHistoricalReviewReader\` constructs the existing strictly allowlisted scheduled GitHub REST source reader. It checks that the scope is exactly the Kings guild/forum, reads the owner-pinned ledger, loads the authenticated GitHub ZIP, constructs the plan, then re-reads **both GitHub source and owner-pinned ledger**. If the source ZIP fingerprint, source content, owner checkpoint or private ledger differs, it **fails closed**. Only after successful repeat checks are the first two trusted-gateway flags set to true.

An injected \`ownerPinnedVault\` must be constructed from the real signed owner-receipt, encrypted two-private-GitHub-repo adapters before any production use. A mock is only a synthetic test. No new secrets, repositories or real staff authorization were created here.

## Historical capacity warning

A **single current Convoy Checker artifact is not an exhaustive archive of all earlier submitted or accepted Convoys**. A source report with zero current records, zero review tasks and an empty ledger still cannot attest that a historical UTC month is complete.

Therefore this module NEVER signs a complete historical period, automatically accepts/declines/cancels anything, reallocates a rescheduled Convoy, releases a slot, records an exception or sets remaining capacity as verified. **\`historicCoverageCertified:false\` and \`freeSlotsCertified:false\` are mandatory for every output.** A separate independently reviewed **coverage evidence / cutoff certification** is still required before the Kings dashboard may claim free capacity.

## Tests

- \`tests/event-capacity-github-historical-review.test.cjs\`: accepted and missing records, stable/reused task keys, Legacy Calendar and legacy identity collision, cancellation release and reschedule decisions, ledger-only/Completed evidence, category disputes, privacy, pagination, incomplete inventory and invalid source time/scope.
- \`tests/event-capacity-github-authenticated-source.test.cjs\`: extended to use synthetic real fixed-repository GitHub REST ZIP downloads and owner-pinned ledger reads **twice**, and to reject changed sources or ledger states.

**Release status:** Draft PR #143 only, no production integration, no automatic historic approvals, no private data leakage and no hosted Discord bot requirement.
