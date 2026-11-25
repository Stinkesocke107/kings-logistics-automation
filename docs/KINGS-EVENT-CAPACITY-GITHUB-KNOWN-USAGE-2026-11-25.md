# Kings Event Capacity — GitHub-only Known Accepted Usage

**Date:** 25 November 2026. **Status:** isolated, read-only Draft PR #143; no production bot or decision writes.

## Purpose

The Kings Event Capacity system can now calculate a **conservative minimum of accepted Convoy allocations** from the authenticated Kings Convoy Checker source and the owner-pinned, encrypted private Staff decision ledger. The result is not a guarantee that the remaining difference between a policy limit and the observed count is an available slot.

**GitHub Actions is the execution platform. No additional VPS, hosted bot or new scheduled workflow is required.**

### Capacity policy applied

| Category | Accepted event quota |
| --- | --- |
| Partner + Other External together | Maximum 2 per UTC departure day |
| Partner | Maximum 20 per UTC departure month |
| Other External | Maximum 20 per UTC departure month |
| Kings-owned | Unlimited; no Partner/External quota consumption |

The existing Kings evaluation and Convoy Center normalization engines are reused, rather than copying their limits or inventing new status rules. Scheduled/Completed retain historic accepted allocation, but Completed does **not** establish attendance. Submitted, Pending, Needs Information, Ready for Approval and Cancelled do not consume quota when those statuses are independently trusted. A properly confirmed Rescheduled item counts at the new UTC departure date; an unclear move must not make either day appear free.

An Event Management/CEO exception can be counted separately without increasing a quota. A third external/partner event is displayed as **3/2 with a distinct exception count** when verified, never as 3/3 with a fabricated extra slot. The 120-minute separation remains advisory.

## What is computed

The new \`event-capacity-github-known-usage.js\` returns a private **KnownAcceptedMinimum** projection:

- Selected UTC month and one entry for every UTC day, including leap years.
- Known accepted Partner, Other External and Kings-owned counts by UTC day and month, and combined external daily usage.
- Explicit indicators when known accepted events already reach/exceed daily or monthly limits; these are policy risk indicators, not automatic rejections.
- Explicit approved-exception counts, disputed/possibly occupied event counts, missing-data counts, source inventory issues, unreconciled legacy records, two-hour advisories and meeting/end overlaps.
- No raw Event IDs, organizers, Discord member IDs, decision references or private texts in the returned projection.
- **remainingVerified: null**, **freeSlotsCertified: false**, **partnerFreeVerified: false**, **externalFreeVerified: false**, **historicalReconciliationVerified: false** until separately verified complete historical acceptance and cancellations exist.

A missing or unclear accepted event may be absent from the known count, so the count is a **minimum**, not an authoritative total. **Events with a known Staff-versus-source category/departure conflict are excluded from the proven minimum** and shown separately as disputed records/possible occupancy; they must still block any verified-free inference. A zero in this projection must **NEVER** be interpreted as an open quota slot.

## Trust boundaries

The pure \`knownUsageFromVerifiedInputs\` helper is a projection, not an authentication mechanism. It only checks data structure/scope/consistency; **sourceAuthenticatedByGateway:false** and **ownerPinCheckedByGateway:false** explicitly denote that no connection was authenticated by this helper.

The higher-level \`createGithubOnlyKnownUsageReader\` constructs the fixed \`createAuthenticatedKingsSource\` GitHub REST reader and consumes an independently owner-pinned private vault supplied by a trusted runtime. It:

1. Reads the owner-pinned encrypted ledger and current authenticated scheduled GitHub report.
2. Checks the correct Kings Guild/Forum and source run/attempt/artifact/commit/ZIP digest and report inventory.
3. Builds the conservative usage result using the prior private audited Staff classifications, UTC dates and accepted statuses; explicitly denies certified free capacity.
4. Reads the authenticated GitHub report **again** and reads the owner-pinned ledger **again**.
5. If source identity, report content, encrypted ledger state or owner checkpoint changed, **fails closed**. It only marks source/authentication and pin verification on the final private result after both passes agree.

No live job imports this module. The proposed runtime still requires a real owner-pinned private GitHub data vault and the separate signed checkpoint witness. These are not configured for production.

## Test coverage

- \`tests/event-capacity-github-known-usage.test.cjs\`: combined 2/day, Partner and External separate 20/month, Kings unlimited, UTC month boundary, Completed historical allocations without attendance inference, Cancelled/Pending exclusion, unknown approved classification, missing planned end, unreconciled legacy entries, approved exceptions without increasing a limit, rescheduling only with verified approval, invalid source/ledger and leap-year month rendering.
- \`tests/event-capacity-github-authenticated-source.test.cjs\`: the factory uses real GitHub REST routing against synthetic responses, downloads/validates the source ZIP twice, checks the owner-pinned ledger twice, never displays free places, and rejects source/archive changes, stale checkpoints or missing owner protection.

## Remaining release gates

This module is **not yet a confirmed-availability service**. Historical Event acceptance statuses, staff-authorized cancellations, verified reschedules, Legacy Calendar coverage, special exceptions, role permissions and independent signing/backup restoration must be reconciled before Kings can display a certified remaining place. Neither an empty live source report nor an empty ledger proves that the past and current inventory is complete.

A future separately controlled historical coverage certification must be reviewed and approved by the Kings CEO before any verified free-slot mode is considered. No auto-approval, notification, acceptance, cancellation, publication or quota exception is enabled here. PR #143 remains Draft and unmerged.
