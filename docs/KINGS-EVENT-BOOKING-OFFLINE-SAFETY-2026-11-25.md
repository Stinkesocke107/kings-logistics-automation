# Kings Event Booking & Slot Management — Offline Safe Review (System 17)

**Status:** DRAFT/DEVELOPMENT ONLY — NOT DEPLOYED — 25 November 2026.
**Scope:** Event Systems #12 Capacity, #16 Calendar, #17 Booking & Slot Management.
**Infrastructure:** GitHub Free only; no VPS, paid database or additional hosting.

## Purpose

The new pure Node.js module `event-capacity-booking-safety-review.js` prepares a private, human-readable preflight for a **potential** Event Booking/Slot request using the existing Kings staff calendar. It does **not** reserve a slot, accept an invitation, authorize an Event, change Convoy Center, publish to Discord or certify available capacity.

Input is deliberately limited to four non-secret fields:

- `category`: Kings Convoy, Partner Convoy or External Convoy.
- `meetingAtUtc`: canonical millisecond UTC timestamp or null.
- `departureAtUtc`: required canonical millisecond UTC timestamp.
- `plannedEndAtUtc`: canonical millisecond UTC timestamp or null.

A corresponding already projected `projectKingsStaffCalendarReview(...)` private year/month view must be supplied. The module does **not** read actual Discord sources. It checks the selected UTC calendar month, UTC day continuity, observed daily/monthly bucket agreement, read-only flags and the configured limits (combined 2/day, 20 Partner/month, 20 External/month, Kings events quota-exempt).

## Outcome and safety

- Both current calendar counts and historical provisional holds are only **review hints**, never certified free availability. Historical and current figures may overlap and are **not added** together.
- Observed quota saturation, signed historical hold saturation, missing history, original-evidence gaps, missing meeting/end timestamps and missing event/slot evidence are all marked for authorized human review.
- Kings-owned quota exemption does **not** remove Staff approval requirements.
- Outbound invitation `Accepted` must never imply an internal Kings Event approval.
- Parking locations, attendee slots, double booking, full meeting-to-end overlap, 120-minute departure spacing and source completeness are **not checked** by this module. They remain blockers for a real reservation. There are no fake overlap or availability claims.
- Renderer returns a private ephemeral Discord payload *shape only*; it does not call Discord, mention users or send messages. No raw Event IDs, secret keys, personal details, origin messages or token material are accepted or returned.
- No imports into the production `convoy-checker.js`, main Actions workflows or any scheduled worker.

## Regression coverage

`tests/event-capacity-booking-safety-review.test.cjs` checks the no-booking contract, Kings exemption, both monthly quotas, mixed daily saturation, missing meeting/end information, invalid UTC dates, cross-month mismatches, forged calendar snapshots, field allow-list, ephemeral renderer and live-workflow isolation.

Separately, `event-capacity-staff-calendar-review.js` now enforces that externally supplied 24-month evidence reports contain **exactly consecutive declared UTC months in order**. Merely providing any 24 rows must not cause missing months to appear reviewed. Associated tests reject shifted or forged windows and preserve the existing incomplete-evidence status.

## Further work before any pilot / go-live

1. Establish real authenticated current and historical Convoy Center/Discord coverage and verifiable staff roles.
2. Implement event identity and recipient/parking slot models with verified duplicate and overlap constraints, using a private encrypted evidence boundary.
3. Connect Event Booking requests to authorized Event Coordination human decisions and cross-check Event Capacity and Invitation Tracker. No automatic acceptance.
4. Reconcile owner-controlled historical checkpoints, secure least-privilege private repositories, real backup/restore and required retention.
5. Demonstrate actual protected Discord behavior and obtain explicit CEO release approval.

**Do not merge or activate PR #143 for live use on the strength of these offline tests.** Existing `main` and Convoy Checker remain unchanged.
