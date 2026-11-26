# Kings Logistics — Event History #14 / Calendar #16: priority-month evidence review

26 November 2026 — one private human-only extension of #12/#14/#16/#18

## Reason
Reconciled Convoy Center and frozen Legacy source inventories do not prove original Staff approvals, cancellations, holds or historic completeness. Existing dashboards show total source gaps; the Event Coordination Lead also needs the specific UTC month to audit first.

## New protected month-level worklist
The new event-history-review-agenda.js derives up to SIX items using only reconciled 24-month historical rows and 12-month future Legacy rows. Each entry has exactly code, utcMonth and aggregate count; never individual Staff/VTC/Event identities, exact event dates, routes, thread IDs, links or source messages.

- FUTURE_LEGACY_HOLD: nearest forward UTC months with frozen Legacy entries needing original Staff hold checks before any availability decision.
- PAST_CENTER_OUTCOME: most recent historical UTC months containing Center source events not positively marked Completed or Cancelled.
- UNDATED_LEGACY / UNDATED_CENTER: original source records without a reliable UTC date; these appear only as Undated.
- LEGACY_ORIGINAL_EVIDENCE: historical UTC months whose frozen Legacy entries need original Staff decision evidence.
- HISTORICAL_MONTH_NO_CLAIMS: historical source months without source claims; count is null, not a fabricated zero-events statement.

The agenda spreads its first slots across active issue types and fills remaining slots deterministically. It is proposed manual review order, not any actual Staff assignment, approval or booking.

## Existing-system connections
The Event History bridge builds per-month unresolved Center outcomes and the protected monthly agenda. The AES-GCM encrypted Event Leadership observation accepts only the exact bounded code/month/count schema; older observations without it show Unavailable rather than an invented empty audit. The existing fixed private Event Leadership dashboard displays a small month review field; Management Leadership shows only the next review month. The established GET-only Event History real-source proof verifies agenda integrity. Existing Event Leadership and Consolidated Leadership workflow source checks include the new module.

## Boundaries
Month-level source flags never certify original Staff approvals, completed attendance, free Event Calendar slots, releases of confirmed holds or complete 24-month archives. Event Coordination Lead checks original records manually; Event Coordinators retain routine invitation autonomy. No Discord source writes, no additional channels, no individual assignments, no public data, no auto approvals, invitations or cancellations. System #17 Event Booking & Slot Management stays removed.

## Release gate
Pass full offline PR tests, then real GET-only Event History and Capacity source verification and existing fixed private Leadership dashboard update. Green technical source readiness does not make historical Staff decisions verified.