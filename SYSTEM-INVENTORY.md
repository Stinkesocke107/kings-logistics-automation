# Kings Logistics – Automation Inventory

Status: cleanup in progress (2026-10-17). **Do not infer deletion safety from this file alone.**

## Verified removals
- Removed `.github/workflows/statistics.yml`: redundant manual-only invocation of Statistics and Central Overview; these run automatically via `live-tracker.yml`.
- Removed `.github/workflows/leadership-channel-diagnostic.yml`: one-time, push-on-self-change diagnostic with no production schedule.
- Removed `.github/workflows/leadership-dashboard-bootstrap.yml`: one-time manual bootstrap duplicated by active scheduled `leadership-dashboard.yml`.
- Removed `.github/workflows/legacy-convoy-discovery.yml` and `.github/workflows/legacy-october-audit.yml`: completed one-time discovery/audit launchers; historical scripts and data retained.
- Workflow count reduced from 49 to 44. Existing data and Discord messages untouched.


## Operating policy
- Production systems run automatically via schedule, push or workflow_run. Manual dispatch is an emergency/recovery option only.
- Never auto-run legacy migration, one-shot bootstrap, destructive diagnostics or backfill.
- Preserve Discord messages, historical state and encrypted mappings.
- Before removing any workflow, verify all script, workflow_run, system monitoring, scheduler, tests and documentation references; run offline/core checks after each change.

## Active automatic production systems
- Live Tracker, Advanced Statistics and Central Overview: `.github/workflows/live-tracker.yml` (scheduled).
- Central Scheduler: `central-scheduler.yml` (scheduled and workflow_run recovery).
- Driver Updates and Driver Management; HR Leadership, Probation, Staff Management, Convoy Checker.
- Leadership Dashboards, News, Milestones, Backups, system monitoring, self-healing, plus scheduled report producers.

## Known maintenance-only or one-time workflows: audit before removal
- `legacy-convoy-import.yml`: manual-only historical import; retain strictly as controlled recovery option, NEVER schedule automatically.
- Verification workflows: retain on code changes or periodic verification as appropriate; do not treat these as redundant based on names.

## Consolidated Leadership publication
- `driver-weekly-summary.yml`, `hr-weekly-summary.yml`, `management-weekly-overview.yml` have `LEADERSHIP_CONSOLIDATED_ONLY=true`; legacy Discord publication is suppressed.
- These may still produce weekly summary state consumed by the consolidated dashboards. Keep until dependencies are proven absent or replaced.

## Next clean-up gates
1. Map workflow-to-script-to-state and cross-workflow references.
2. Identify truly unused one-shot/duplicate workflows, remove one at a time.
3. Ensure all productive functions run automatically, but do NOT automate migrations or replay historical notifications.
4. Verify GitHub Actions, read-only system health, alerts, dashboard and state persistence after changes.

## Leadership consolidation (2026-10-17)
- Removed `.github/workflows/leadership-overviews.yml` because it duplicated scheduled consolidated dashboard publication.
- Central Scheduler and monitoring now target `leadership-dashboard.yml`.
- Driver/HR/Management weekly producers remain automatically scheduled because the consolidated dashboard reads their state files; legacy Discord posts stay suppressed.
- Workflow count after consolidation: 43.

## Automated Changelog publishing (2026-10-17)
- Changelog publisher now polls the explicit editorial queue every 15 minutes; an empty queue causes no Discord posts.
- Adding editorial entries remains an intentional controlled action to avoid exposing internal GitHub commits as public news.
- No changelog history or queued items were modified during automation setup.
