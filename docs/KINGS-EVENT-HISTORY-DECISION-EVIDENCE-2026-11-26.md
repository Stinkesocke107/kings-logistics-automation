# Kings Logistics — #14 Event History decision-evidence audit and #16 Calendar hold review

**26 November 2026 | Existing private Event Leadership + Event Operations / Capacity**

## Problem resolved at source-observation level

The reconciled **Convoy Center + frozen Legacy Calendar** source verifies present-day inventory consistency, but **does not prove** the original Event Staff's historical acceptances, cancellations, completed attendance, old confirmed holds, or 24 months of exhaustive event history. A green source-integrity probe is not a completed historical audit.

The existing 24-month historical review therefore needs to distinguish **where source claims came from** and **which original Staff decisions require evidence**. The forward 12-month Calendar also contains separately frozen Legacy date claims that cannot be interpreted as released or empty availability.

## New read-only audit signals

All values are internally derived from existing reconciled source files; only aggregate counters reach the AES-GCM encrypted Event Leadership state.

- **24-month source provenance:** months with only Convoy Center claims, only frozen Legacy claims, both sources, or no source claims. These four groups must sum to 24; zero source claims for a month is not proof of zero actual convoys.
- **Unresolved past Center outcomes:** Convoy Center entries in the 24-month window whose departure is in the past but whose source status is not 'Completed', 'Cancelled' or 'Canceled'. Entries with statuses such as 'Scheduled', 'Ready for Approval', 'Needs Information', 'Rescheduled' and unknown statuses are flagged for manual evidence review, **never automatically completed or cancelled**.
- **Frozen Legacy claims needing original Staff records:** the total observed frozen Legacy source entries (dated, undated, past, future). A frozen Legacy status is not an independently verified Staff decision.
- **Future dated Legacy holds to review:** a count of frozen Legacy entries dated inside the 12-month Calendar window, **kept separate** from classified Convoy Center capacity. They may indicate original commitments; they never certify an available slot or displace an approved Convoy.
- **Undated source claims:** kept separately in the existing History review; do not invent dates or infer a review month.

These signals are **not user/Staff assignments**. Their functional reviewer in existing #18 Event Operations is the Event Coordination Lead, with Event Coordinators handling routine coordination autonomously. Actual evidence must be checked in the authoritative Event source and decisions recorded manually by authorised staff.

## Connected systems

1. `event-history-leadership-bridge.js` computes aggregate provenance and decision-evidence flags from separately reconciled source records.
2. `event-leadership-observation.js` validates and encrypts the allowlisted values into the existing event-state container. If old state lacks a new required field or is stale, **Unavailable** is displayed instead of an invented zero.
3. `leadership-dashboard.js` adds one small **History — Decision Evidence Review** field to existing fixed private Event Leadership and one compact **Evidence Gaps** field to Management Leadership. No extra Discord message or channel.
4. `event-operations-staff-triage.js` adds read-only manual tasks: **NORMAL** review of future Legacy holds; **FOLLOW_UP** for unresolved past Center outcomes and original frozen Legacy evidence.
5. `event-history-real-source-preview.js` now checks the additional invariants in the **existing GET-only live source verification**. CI emits only allowlisted fixed status lines, never private identities, routes, dates, URLs, messages, exact source counts or event IDs.

## Authority and completeness gates

**Still NOT verified:** original 24-month archive completeness; Staff approvals/declines; confirmed holds/capacity released; who attended; complete invitations; independently approved future availability. No automatic event actions, decisions, capacity release, slot booking, rescheduling, role changes, additional data exports or invitations. **System #17 Event Booking & Slot Management remains cancelled.**

Acceptance means a real read-only source scan, passing synthetic tests and a successful private dashboard update. It **does not** upgrade individual Staff decisions to verified status.