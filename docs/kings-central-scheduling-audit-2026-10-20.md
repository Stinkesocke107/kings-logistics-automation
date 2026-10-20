# Kings Logistics — Central Scheduling and Reliability Audit
Date: 2026-10-20

## Decision

**Keep one 5-minute common recovery heartbeat and independent staggered production tasks.** Do not force every production pipeline to run at exactly the same minute. GitHub Actions cron is best-effort, and simultaneous Discord/API/Git writes would increase rate limits and state conflicts.

At audit time, there are **43 workflow YAML files**, including manual-only recovery/import, automated producers, periodic reports, monitoring, backup, CI verification, and production evidence checks. A workflow file is **not** necessarily another independent live timer.

### Common recovery: `.github/workflows/central-scheduler.yml`

A shared recovery heartbeat runs at `3-58/5 * * * *` plus independent existing `workflow_run` watchdog wake-ups. Its latest successful invocation was checked against actual GitHub logs.

Monitored and conditionally redispatched (only when overdue and no currently healthy active execution):

| Producer | Native target | Recovery latest-success threshold |
| --- | --- | --- |
| Live Tracker → Statistics → Overview (`live-tracker.yml`) | approximately 5 minutes | 9 minutes |
| Driver Updates (`driver-updates.yml`) | approximately 5 minutes | 12 minutes |
| TruckersMP News (`news.yml`) | approximately 5 minutes | 12 minutes |
| YouTube Social News (`social-news.yml`) | approximately 5 minutes | 20 minutes |
| Milestone Detector (`milestones.yml`) | approximately 5 minutes | 9 minutes |
| Convoy Center (`convoy-checker.yml`) | approximately 15 minutes | 15 minutes; explicit `live` recovery |
| HR Leadership (`hr-leadership.yml`) | approximately 15 minutes | 20 minutes |
| Staff Management (`staff-management.yml`) | approximately 10 minutes | 20 minutes |
| Driver Management (`driver-management.yml`) | approximately hourly | 75 minutes |
| Consolidated Leadership Dashboard (`leadership-dashboard.yml`) | recurring + weekly/monthly windows | 13 hours |
| Changelog Publisher (`changelog.yml`) | approximately 15 minutes | 30 minutes |

Rules:
- One GitHub runs API snapshot per producer per scheduler pass.
- Active managed runs are not double-dispatched unless truly stuck past the existing 20-minute stuck-run age.
- Completed recent runs observe a five-minute recovery cooldown to prevent failure dispatch storms.
- `push` updating Scheduler code is a normal recovery check, **not** a forced full production replay.
- Manual `force_all=true` remains a deliberate exceptional operator action, with active-run protection.
- The social recovery passes explicit `verify_connections_only=false`, `post_latest_test=false`; it can never activate the historical-video proof.
- All data-writing workflows keep their own concurrency, deduplication, secret isolation and saved state. No state/backfill is deleted.

### Remove unnecessary independent verification clocks

- **News production verifier**: automatically runs `workflow_run` only after a successful **Kings TruckersMP News** run on main; retains **one independent hourly fallback**. Previously it ran independently every five minutes, potentially verifying a stale or delayed producer.
- **Public convoy announcement verifier**: automatically runs `workflow_run` after a successful **live** Convoy Checker run on main; dry-run triggers are excluded; retains **one hourly fallback**. Previously independently every 15 minutes.
- These two changes remove **14 scheduled verification trigger opportunities per hour**, replacing them with producer-coupled triggers plus hourly fallbacks. They do not guarantee 14 fewer jobs overall, because verification still follows successful producer events.

### Data consistency

- Live, Statistics and Central Overview share a single public-safe `live-tracker-snapshot.json` and the precise matching `sourceSnapshotAt`.
- News, convoy data, encrypted driver membership and external social media are separate authoritative sources. They should not be coerced to share one "observation time" or one failure domain.
- Drivers joining/leaving and ETS2/ATS online counts have different meanings and cannot be reduced to the same dataset.
- Convoy Center processing is ordered within its own job; its Discord overview shows the true snapshot generation time rather than claiming exactly 15-minute refreshes.

### External provider reliability

- YouTube sometimes serves temporary HTTP 404 for otherwise valid public Atom feeds. Social News now tries both official YouTube feed paths, checks channel identity on either path, and **does not** publish or reset state if no valid feed is available.
- HR Probation had a 15-second outer AbortSignal that expired during legitimate Discord 429 retry waits. The module now lets the shared Discord fetch wrapper create a fresh per-attempt timeout while preserving its strict non-personnel-write safety guard.
- Temporary YouTube/news/changelog outages are surfaced in System Monitoring as warnings. Driver / Convoy / HR health remains independently critical.

### Verification evidence

- `tests/social-news.test.cjs`: fallback from YouTube 404, explicit wrong-channel rejection, deduplication and one-time test safety.
- `tests/central-schedule-routing.test.cjs`: managed producer coverage, embedded Bash syntax, bounded retry conditions, event-driven verification and monitoring.
- `tests/system-sync-and-convoy-text.test.cjs`: one-snapshot consistency and Convoy Center field accuracy.
- `system-tests.yml` is the combined CI suite; production status is determined separately by the actual scheduled/manual runs and the Core Baseline/Final Freeze gates.
- Observed a successful actual Central Scheduler execution in which the four added producers were checked and a stale HR Leadership producer was dispatched.
- Observed a successful YouTube Social News recovery run and a successful regular HR Leadership run after the preceding Discord rate-limit failure.

## Important limitations

- GitHub-hosted scheduled workflows can be **late**; five-minute cron does not guarantee actual five-minute execution.
- PostPing TikTok and Instagram are independent Discord bot notifications, **not** monitored by this GitHub runner. Verify their actual next video/Reel delivery directly in Discord.
- The full message contents of every separate Driver, HR, Leadership, Awards and Support system have not all been visually checked in Discord in this scheduling pass.
- Weekly, monthly and manual-only jobs **must retain different cadence and operational safeguards**; replacing them with a blanket five-minute production run would be wrong.
- Do not treat the entire Kings system as fully operational until fresh Core Baseline, Final Freeze, Monitoring, scheduled Convoy, News and Social outputs have been checked after the last code deployment.

## On the next audit

1. Review one actual `workflow_run` triggered News publication verifier following News success and one following a `Kings Convoy Checker (live)` success.
2. Confirm that every critical recovery target remains active after changes and that alarms are raised for stale sources.
3. Compare the last completed production outputs and timestamps over 24 hours, not only successful one-shot tests.
4. If GitHub Actions scheduling continues to slip by hours, consider moving the common 5-minute heartbeat to a paid external scheduler/service after cost/reliability analysis; avoid removing native fallbacks before demonstrating the new controller's reliability.
