# Kings Logistics — Production Audit & Safe Repair Queue

Date: 21 November 2026 (Europe/Berlin). Source: read-only GitHub Actions runs, checked-in state snapshots, workflow definitions and their job logs. This is a point-in-time observation, **not** a statement that Discord was independently queried with a bot token.

## Inventory and scope
- Main repository: `Stinkesocke107/kings-logistics-automation`.
- 44 registered workflow files: 32 scheduled and 12 on-change/manual. Sources of truth: `.github/workflows/` and `kings-workflow-registry.js`.
- Historical `kings-logistics-automation-public` and `kings-logistics-automation-archive` have `.github/disabled-workflows`; they are not alternative current production workflow directories.
- The published inventory is now reconciled and protected by `tests/all-kings-workflows.test.cjs`.

## Current production incident (do not disguise)
- Live Tracker run [44918351553](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44918351553) failed: **0 of 9** live map server checks completed successfully; one reported ATS provider timeout. Live data updates and related Statistics/Central Overview pipeline steps were skipped.
- The fail-closed outage handler successfully updated *existing* Live Tracker, Statistics, and Central Overview Discord messages with an outage explanation. Old verified measurement state is preserved.
- Last verified tracker snapshot timestamp in the checked-in file: `2026-11-18T16:00:21Z`; Statistics timestamp refers to the same day. Do not interpret stale online counts as current zeroes.
- System Monitoring run [44918334564](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44918334564) concluded successfully as a *workflow* while accurately reporting **UNHEALTHY: 6 critical incidents and 2 warnings**. Passing the monitoring job is not equivalent to a healthy platform.
- Self-Healing [44918329817](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44918329817) classified the live outage as `EXTERNAL-LIVE-DATA-BLOCKED`; it did not claim a repaired map feed.
- Core E2E, Core Baseline and Final Freeze checks are blocked at operational-health acceptance gates by the real production issue; their passing isolated tests do not authorize turning the gate green.
- See `docs/live-tracker-backup-map-source-2026-11-21.md` before evaluating any replacement. A subset of Trucky-connected drivers or a global server count must never be misrepresented as full Kings online coverage.

## Driver and Discord evidence
- Driver Management [44918303601](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44918303601) recorded **111 current TruckersMP VTC drivers**. Its online count was correctly `unavailable`, not 0. VTC totals and the private Discord Driver register intentionally have different scopes.
- Private Driver onboarding [44918599295](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44918599295) reported **74/74** active Kings Drivers with register entries and 0 missing. It performed no role or register mutations.
- Loyalty [44900863526](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44900863526) was an explicitly manually requested **live** run. Its aggregate result was 74 current drivers, 73 already correct, 0 additions, and **2 removals of managed Loyalty roles**. Since this was a live run, the removals were already applied; never dispatch it again merely to inspect history. Role/member identity and justification are not proven from the privacy-safe public summary.
- Consolidated Leadership [44905246926](https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/44905246926) updated the five existing dashboard messages and reported 0 duplicate dashboard removals. The old `data/leadership-dashboard-state.json.updatedAt` is intentional: that timestamp changes only if stored message IDs change.
- A `schedule`-triggered onboarding run was logged at `2026-11-21T15:19:53Z` although the configured cron is `17 7 * * *`. Investigate GitHub schedule latency, the workflow run payload, and available recovery safeguards before changing dispatch cadence. Do not create duplicate private audit messages.
- GitHub logs verify the existing-message updates, but they do **not** prove that every visible Discord embed across all channels was read and compared against live Discord. That still requires a controlled direct Discord audit.

## Ordered safe repair queue
1. **Private Loyalty reconciliation:** Management checks the audit trail for the one differing driver against their confirmed original Kings joining date and the exact managed tier roles. Preserve private IDs, dates and messages; no automatic roles action from a public audit.
2. **External map service:** check the upstream provider's real API recovery. Only activate a second provider with documented permission, all-server complete player-ID coverage, a two-run live acceptance test, and privacy/rate-limit safeguards. Never scrape public map pages or accept Trucky-only driver coverage as full TruckersMP coverage.
3. **Schedule reliability:** compare workflow `schedule` creation times to cron times and existing scheduler recovery; investigate delay without introducing duplicate sends.
4. **Discord delivery audit:** verify stored message IDs and current embeds directly in their actual channels; distinguish intentionally old state-file `updatedAt` from outdated Discord content. Do not recreate/delete messages merely because a state timestamp is old.
5. **Acceptance:** once external source or an honestly documented product fallback is verified, run offline tests, core baseline, Core E2E, and Final Freeze; keep operational gating truthful.

## Safety / boundaries
- This audit change does not dispatch workflows, grant roles, modify protected member or staff state, issue Discord posts, edit live tracker measurements, or weaken `UNHEALTHY` enforcement.
- No private Discord member IDs, join dates, player positions, bot credentials or webhook secrets are included.
- Historical `FINAL-FREEZE-VERIFIED` snapshots refer to their original source commit and cannot override newer failed production acceptance.
