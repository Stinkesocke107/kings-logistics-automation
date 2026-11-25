# Kings Event Capacity — Convoy Center Source Reconciliation (2026-11-24)

**Status: Draft branch only; no real-guild ingestion, private-data download, production workflow modification or Discord posting.**

## Problem

The existing Kings Convoy Checker and Convoy Overview are related, but intentionally have different record sets. The Checker includes all non-ignored threads (including unfinished requests and read errors); the Overview's registered convoy list contains genuine Center records with a TMP Event ID or an expressly Completed staff status, and a separately imported, de-duplicated frozen Legacy Calendar. A simple equality of the total number of rows is therefore not proof that confirmed events were copied consistently.

## Implemented

The new read-only event-capacity-source-reconcile.js validates the actual report and Overview shapes before the capacity adapter may signal that sources are complete/fresh. It checks:

1. Total/actual Checker thread counts, Overview active real submissions, and read-error inventory.
2. Source-thread IDs for expected Center registrations and orphan/duplicate Center registrations.
3. Event ID, explicit status and departure timestamp **agreement for matching Center threads** (timezone-offset timestamps are compared as the same instant).
4. A Center event with a valid external Event ID, or a positively Completed staff entry, must be represented in registeredConvoys.
5. A genuinely unfinished Center entry without an Event ID need not appear in registeredConvoys; it remains visible through the raw Checker report and is not automatically accepted.
6. Frozen Legacy Calendar imported count equals retained legacy registered entries plus expressly suppressed duplicates.
7. A legacy event sharing a genuine Center Event ID must be suppressed in the Overview.
8. Two different Center threads claiming the same Event ID trigger a manual-conflict blocker even when their labels or departure values happen to match.
9. Unknown sources, malformed rows, contradictory information and missing summaries fail closed; source issue results only contain fixed issue codes and aggregate counts, not event titles, staff IDs, or organizer details.

The existing event-capacity-adapter.js uses this new reconciler. A discrepancy sets dataFresh false, and the policy engine's downstream capacity view must label availability **unverified**, never confidently free.

### Explicit scope limits

- This is **record-level self-consistency**, not a cryptographic source signature. Existing trustedSource/integrityVerified flags are not proof of source authenticity.
- It does **not** grant a Kings event classification, staff acceptance, quota exception or confirmed attendance.
- It does **not** migrate, alter, accept, cancel or publish any event.
- Historical Legacy Calendar entries with insufficient approval, UTC departure or event-type provenance remain review candidates. A successfully matched inventory is **not** permission to infer old accepted events or to remove reservations.
- Exact role IDs, actual private channel access, authoritative archived content, immutable original allocation on reschedule, reliable meeting/end times and platform-neutral sources must still be verified before a live deployment.

### Test coverage and rollout

tests/event-capacity-source-reconcile.test.cjs covers valid/missing/misassigned/duplicated Center registrations; matching-count status/ID/date inconsistencies; stale error records; legacy import and suppressed collisions; test threads; synthetic private-data redaction. Adapter and read-service fixtures were updated to match the genuine Overview data model.

This feature is included only in the existing draft PR #143. No production jobs import or call these new modules. Before real-world activation, deploy the separate protected source ingestion, verify all historical/archived events privately, and run a controlled, read-only comparison with approved staff review.

**Release posture: SOURCE SELF-CHECK PROTOTYPE / OFFLINE ONLY.**
