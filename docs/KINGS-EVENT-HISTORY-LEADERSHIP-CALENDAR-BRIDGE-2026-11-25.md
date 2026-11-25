# Kings Logistics — Event History / Calendar in existing Leadership Reports

**25 November 2026 — First private, read-only delivery bridge for #14 and #16**

The existing Kings Event Leadership daily/weekly/monthly report workflow already re-fetches the Kings Convoy Center, finalizes it in **read-only mode** and builds the merged Convoy Overview with its frozen Legacy Calendar import.

The new `event-history-leadership-bridge.js` connects these already available reports to the existing private Event Leadership Discord messages. It does **not** create a new channel, post a separate message, contact a new Discord API, create a new server, modify an Event or authorize bookings.

## What existing Staff reports now show

- **12-month Calendar source review**: current-source unclassified Event category claims, number of UTC days needing Staff investigation, and source-claimed days exceeding three total convoy departures.
- **24-month Event History review**: reports explicitly that the original complete 24-month history has **NOT** yet been verified, even though existing dated Convoy Center events and previously frozen Legacy import entries can be grouped internally by UTC month.

The bridge reuses `monthsFrom()` and the existing `reconcileSourceInventory()` checks. It rejects incomplete finalization, stale or mismatched source generations, Center/Overview identity conflicts or invalid original-source inventory instead of publishing false numbers. The pure internal history projection keeps existing Center and frozen Legacy entries separate, never silently accepts duplicate source records and never infers that a cancelled/rescheduled Event has freed a slot.

The existing Discord message text remains under its current hard limit: when a busy original report leaves insufficient space, the optional summary is shortened or omitted rather than disrupting the already running daily/weekly/monthly Leadership report.

## Important boundaries

- Counts are **source claims**, not signed historic approval decisions.
- **Full original 24-month archive coverage is not verified**; current frozen Legacy data only covers the already imported months and must not be represented as complete history.
- **Original Event Invitation Tracker source is not yet connected**; none is simulated or invented.
- Event Capacity remains **3 total UTC convoys/day, Partner 20/month, External 20/month, Kings no monthly cap** and <120-minute spacing warning-only.
- No verified free places, release of historical holds, Event approval, cancellation or booking. **System #17 remains excluded.**
- No private Event names, IDs or full history are added to the PUBLIC GitHub Actions logs or committed files. Private Discord reporting continues exclusively in the already configured Event Leadership channel with existing permissions.

## Acceptance

1. All source-only, privacy and Discord size regression tests pass.
2. A real Kings Event Leadership Reports run generates the original report and includes the optional private calendar/history review line without increasing public logs.
3. A later separately approved task must verify complete archived month-channel history, lifecycle approvals, and existing private Discord channel permissions before promoting a history source to fully complete or publishing detailed calendar pages.

## Real-data, no-write verification on every relevant main push

The Event Leadership `verify` workflow now also runs the same authoritative Convoy Center → TruckersMP synchronization → **read-only** finalization → Overview flow to exercise the new Event History / Calendar bridge against real data, before the already-existing encrypted-state migration step.

- Both `DISCORD_WRITE_MODE` and `CONVOY_FINALIZE_WRITE_MODE` are set to `false`.
- Logs of all four source producers are discarded locally and never sent to PUBLIC Actions logs or uploaded as artifacts.
- The independent `event-history-real-source-preview.js` checks the real in-runner source and prints only `EVENT_HISTORY_CALENDAR_SOURCE_RECONCILED` or `SOURCE_UNVERIFIED` and a fixed warning that 24-month original history is incomplete.
- Failure is a visible `continue-on-error` warning, **not** a silent success or a reason to stop existing Event Leadership state migration.
- This verification does not trigger a Staff-only Discord publication itself. Existing Event Leadership daily/weekly/monthly publication remains on its pre-existing schedule.
