# Kings Logistics — Convoy Center & Automation Synchronization Audit
Date: 20 October 2026

## What was verified and changed

### Common live-data generation (implemented)
- `.github/workflows/live-tracker.yml` refreshes the Live Tracker, then Advanced Statistics, then Central Overview **in that order within one job**.
- The single authoritative public online snapshot is `data/live-tracker-snapshot.json` and has an `updatedAt` field.
- Statistics now stores `sourceSnapshotAt` equal to that exact Tracker `updatedAt`. A workflow verification step refuses to continue to Overview if these differ.
- Central Overview additionally rejects a previously marked Statistics generation that differs from the current Tracker generation.
- Removed the old step that merely rewrote Statistics `updatedAt` in an unrelated inline script. The producer now persists successful processing and its real source marker.
- The **current ETS2/ATS online numbers** update on Tracker refresh. Historical hourly peaks, member joins/leaves and trend aggregations have different sampling horizons; those are not magically 5-minute historical observations.
- Driver Updates and Driver Management remain independent because they use membership, Discord-role and privacy/encrypted histories rather than only online player counts.

### Convoy Center Discord content (implemented)
- The existing Convoy Overview Discord message is **edited**, not resent for every successful check.
- Its header contains a Discord-relative timestamp based on the **actual Convoy Overview generatedAt**, not a hardcoded claim that it refreshed at an exact time.
- Next Convoy now uses consistent labels for **Event Type**, **Meeting Time**, **Departure Time**, **Server**, **Route**, **Meeting Point**, **Kings Slot** and TruckersMP Event URL.
- **Departure Time** is displayed only from a parseable `departureAtUtc`; never fabricate it from Meeting Time.
- Forum status-message footers describe the **scheduled approximate 15-minute** polling, and that real GitHub scheduling can be delayed.
- Long Discord summaries are shortened at line boundaries; do not clip event links or half a status.
- Existing authoritative TruckersMP → Kings override logic, status tags, deduplication, archive rules and nonlive test-thread exclusions remain unchanged.

### News and convoy update coordination (audited, no risky merge)
- TruckersMP News polls approximately **every 5 minutes**, with its own Discord publication and deduplication state.
- Convoy Checker polls approximately **every 15 minutes**, and executes parse → TruckersMP event sync → finalization → reminders → Overview in one ordered workflow.
- The Central Scheduler monitors and recovers stale core workflows; System Monitoring flags missing healthy runs.
- **Do not assume two GitHub workflows scheduled for the same minute execute in lockstep.** Instead preserve the separate rates and track source timestamps / state freshness.
- Force-merging News and Convoy into one job would couple unrelated API failures, slow down breaking news, and risk duplicate notifications. A future consolidated scheduler should be considered only after production-proven failure isolation and state replay safety, rather than simply changing both cron expressions to match.
- YouTube remains Kings GitHub Social News; TikTok/Instagram are managed by PostPing externally, not via GitHub's former API-token checks. External provider delivery requires separate real-world testing.

## Shared writing / terminology policy

- Public and staff-facing Discord automation text: **English**, clear, compact, accessible internationally.
- Preserve existing branded markers so Discord bots can locate their own prior messages; do not rename them casually.
- Keep **Meeting Time** separate from **Departure Time**, and **Kings Slot** separate from Meeting Point.
- Event Type must be one of **Kings Convoy / Partner Convoy / External Convoy** when recorded by Kings staff; never infer the type from a partner name.
- Status must reflect actual state: **Needs Information / Ready for Approval / Scheduled / Completed / Cancelled**.
- Do not describe check frequency as a guarantee that the Discord output updated at the same moment.
- Do not show unverified zeros or an invented timestamp after a failed source fetch.
- Single managed message per running overview, no mass mentions unless explicitly configured, and preserve the dedicated Kings emoji/branding pipeline.

## Automated verification

New offline tests `tests/system-sync-and-convoy-text.test.cjs` check event/time labels, snapshot metadata, Discord character-limit handling, and one-source wiring. The standard `system-tests.yml` suite runs them on pushes.

## Not yet production-verified / follow-ups

1. **Convoy Center live message:** observe a real `Kings Convoy Checker` scheduled *live* run and inspect its Discord status/overview. The offline suite does not prove production channel permissions or the correctness of all existing source threads.
2. **Driver Updates concurrency:** a 20 October multi-dispatch run failed during Git rebase because `data/driver-history.json`, encrypted `data/driver-members.json`, and `data/driver-updates-summary.json` changed concurrently. The failure was recorded by monitoring. Do not force-push or auto-merge encrypted driver data. Retry only after checking latest healthy runs and ensure a single writer/freshness-gated recovery policy.
3. **Baseline and Final Freeze:** current gates may fail due to real workflow/data freshness problems (Convoy Checker, Driver Updates), even when the offline code suite passes. These must be resolved, not hidden or bypassed.
4. **End-to-end traffic:** observe one genuine synced Tracker/Statistics/Overview cycle, one Convoy Center event/update, and one new TruckersMP News item before declaring all productive systems healthy.
5. **Additional message templates:** HR, Driver Management, Support, Events, reports, Changelog and Leadership each require a separate content + live-channel acceptance review. This pass audited the dependency mapping but did **not** re-author every independent Discord message.
