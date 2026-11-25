# Kings Logistics — Convoy Checker → Event Calendar (read-only source integration)

**25 November 2026 | GitHub Free only | New functional same-run read-only integration**

## What is now connected

The existing scheduled Kings Convoy Checker is authoritative for *current source reports*, but **not** for historical Staff decisions or booked/free capacity. After successful Checker scan, official TruckersMP sync/finalization, existing Convoy completeness verification, and Overview generation, the new step `event_calendar_readonly` calls `event-calendar-inline-checker.js`.

This script reads only the two finalized **in-runner** reports:
- `output/convoy-check-results.json`
- `output/convoy-overview.json`

It uses the standalone `event-capacity-pilot-source.js` 12-month UTC candidate projector and its `event-capacity-pilot-reconcile.js` Centre/Overview and legacy inventory consistency checks. No second Discord fetch, GitHub artifact re-download, new hosting, private event database, scheduled bot or public Event export is required.

The run emits only one of two fixed public-safe statuses:
- `SOURCE_CALENDAR_READONLY_READY`: the current runner source reports are consistent enough for **internal planning review**. This does NOT mean Staff approvals, full historic evidence, actual calendar publication, or free capacity are verified.
- `CALENDAR_UNVERIFIED`: source incomplete, inconsistent, missing finalization or stale. It **fails closed** and never opens a slot or suggests that approval can proceed automatically.

A failing advisory step is visible in the workflow but uses `continue-on-error: true` so it does not turn an otherwise successful existing Convoy Checker run into a failed operational dispatch. The established critical Convoy stages retain their existing fail gates. Source records stay only within the ephemeral workflow and its existing restricted artifact policy; public log/step summary emits **no Event IDs, dates, private Staff data or categorized totals**.

## Planning rules are unchanged

The internal candidate projection uses current CEO-approved limits: maximum **3 confirmed Convoys total per UTC day** (Kings, Partner and External combined); at most **20 Partner** and **20 External** per UTC month separately; no monthly cap for Kings Convoys; any departures less than 120 minutes apart are a **warning only**. Existing confirmed Events keep their approval; Kings > Partner > External is a human review priority for *new, unconfirmed* requests. Neither this projector nor the separate manual GET-only source pilot produces a certified free-slot count.

## Still deliberately OFF

- #12 Event Capacity final approvals and 24-month verified source history
- #14 complete historical lifecycle reconciliation
- #15 private Invitation Tracker source integration
- #16 authorized Discord monthly/day Event Calendar and message publication
- #18 Event Operations decisions and assignments

The excluded #17 Event Booking & Slot Management is **not** introduced.

The separate manual `capacity_source_pilot` is still available on `Kings Offline System Verification` (default false), checking published scheduled Checker ZIP provenance and source freshness, while the **same-run integration** checks current finalized source reports without needing GitHub's scheduler to have published a recent ZIP before the check.

## Acceptance

1. CI offline regression suite green.
2. Main Convoy Checker runs with the new advisory step after stage 8 on a valid live source.
3. Observe only the fixed ready or unverified status and verify the original operational writes and reports remain unaffected.
4. Never interpret a structurally valid report as a 24-month historical approval record or as a booking authorization.
