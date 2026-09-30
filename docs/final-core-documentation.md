# Kings Logistics Automation — Final Core Documentation

**Documentation date:** 30 September 2026  
**Repository:** `Stinkesocke107/kings-logistics-automation`  
**Production branch:** `main`  
**Runtime:** GitHub Actions + Node.js 24  
**Purpose:** Operational, maintenance, recovery, verification and safety documentation for the Kings Logistics Automation/Core Systems.

> This document describes the current Core architecture and operating model. It is the documentation deliverable for Point 19. It does **not** by itself declare the Core frozen or finally complete. Time-bound production proofs for Public Convoy Announcement, News, HR Weekly and the first regular Monthly Report remain separate acceptance evidence before the later Core Freeze / Final Freeze stages.

---

## 1. System purpose and operating principles

The Kings Logistics Automation repository is the central automation layer for Kings Logistics. It combines live TruckersMP data, Discord publishing and management views, convoy automation, driver/staff/HR state, scheduled reports, monitoring, alerts, backup/recovery, API resilience, Git-state safety and read-only verification.

The Core follows these operating principles:

1. **Production runs only on `main`.** Production workflows contain branch guards and production push triggers are restricted to `main`.
2. **Fail closed instead of inventing data.** Invalid/corrupt state, incomplete reporting data and unusable API responses should fail or defer rather than silently reset or publish false values.
3. **Persistent state is versioned in Git where appropriate.** Workflows use `scripts/git-safe-push.sh` to reduce data loss from concurrent workflow writes.
4. **Sensitive state remains encrypted.** Driver, Staff and HR state files identified by backup validation must remain AES-256-GCM containers.
5. **Technical recovery is tightly scoped.** Automated workflow recovery may dispatch only explicitly allowlisted technical pollers. It never makes personnel decisions or changes Discord roles/permissions.
6. **Verifier workflows are read-only or isolated.** Failure injection uses local mocks, Git conflict tests use temporary repositories and backup restore tests use disposable sandboxes.
7. **Health is explicit.** Monitoring must end in `HEALTHY`; otherwise the monitoring workflow fails after preserving evidence and sending technical alerts where possible.
8. **Duplicate prevention is part of the design.** Scheduled publishers use persisted state, Discord history and/or freshness gates to avoid repeated posts or dispatches.

---

## 2. High-level architecture

```text
TruckersMP APIs / Map APIs / Discord / GitHub Actions API
                        │
                        ▼
              Resilient API access
              api-resilience.js
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   Live systems    People systems    Convoy systems
   + Statistics    Driver/Staff/HR   + announcements
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                 Repository state
                data/*.json +
                data/api-health/*
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
 Discord outputs    Reports         Monitoring
 webhooks/bot API   weekly/monthly  audits/alerts
        │               │                │
        └───────────────┼────────────────┘
                        ▼
              Backup / Recovery / E2E
```

### Main layers

- **Scheduling layer:** native GitHub Actions cron plus `Kings Central Scheduler` fallback chain.
- **Integration layer:** TruckersMP, TruckersMP Map/ETS2Map, Discord API/webhooks and GitHub Actions API.
- **State layer:** JSON state under `data/`, including encrypted sensitive state and API-health telemetry.
- **Publishing layer:** Discord webhooks and bot messages to operational channels.
- **Safety layer:** data integrity, system hardening, repository security, Discord permission audit, API resilience, safe Git push and recovery safety gates.
- **Verification layer:** offline tests, read-only live verifiers and isolated backup/recovery roundtrips.

---

## 3. Repository layout

### Core source files

Root JavaScript files implement the production systems, safety engines and verifiers. Important groups include:

- Live/community intelligence: `tracker.js`, `statistics.js`, `central-overview.js`
- Driver systems: `driver-updates.js`, `driver-management.js`, `driver-loa.js`, `driver-status-alerts.js`, `driver-achievements.js`, `driver-weekly-summary.js`, `probation.js`
- Staff/HR: `staff-management.js`, `hr-probation.js`, `hr-leadership.js`, `hr-weekly-summary.js`, `hr-weekly-summary-runner.js`
- Convoys: `convoy-checker.js`, `convoy-truckersmp-sync.js`, `convoy-time-display.js`, `convoy-notifications.js`, `convoy-reminders.js`, `convoy-driver-reminders.js`, `kings-convoy-announcements.js`, `convoy-archive.js`, `convoy-overview.js`, `convoy-overview-discord.js`
- Information/reporting: `news.js`, `milestones.js`, `changelog.js`, `add-changelog-entry.js`, `management-overview.js`, `management-weekly-overview-v3.js`, `monthly-report-v2.js`
- Core/safety: `api-resilience.js`, `system-monitoring.js`, `system-alerts.js`, `system-monitor-discord.js`, `data-integrity.js`, `system-hardening.js`, `security-audit.js`, `discord-permission-audit.js`, `workflow-recovery.js`, `core-backup.js`, `core-recovery.js`, `recovery-safety-check.js`
- Verification: `api-resilience-verifier.js`, `git-state-hardening-verifier.js`, `weekly-reports-verifier-v2.js`, `monthly-report-verifier.js`, `kings-convoy-announcement-verifier.js`, `core-e2e-verifier.js`, `backup-final-check.js`, `backup-restore-verify.js`, `branding-self-test.js`

### Other directories

- `.github/workflows/` — production, manual and verification workflows.
- `data/` — persistent JSON state and API-health telemetry.
- `data/api-health/` — per-service resilience/circuit-breaker state.
- `output/` — generated reports/evidence used by workflows and artifacts.
- `tests/` — isolated regression/integration tests.
- `scripts/git-safe-push.sh` — guarded Git persistence helper.
- `docs/` — system verification and operating documentation.

### Generated files intentionally not persisted

`.gitignore` excludes runtime/audit material such as:

- `backup-staging/`
- `restore-source/`
- `recovery-plan.json`
- `recovery-result.json`
- `data/system-health.json`
- `data/data-integrity.json`
- `data/system-hardening.json`
- `data/security-audit.json`
- `data/discord-permission-audit.json`

These are preserved as GitHub Actions artifacts where the workflows specify retention.

---

## 4. Scheduler model

All cron expressions are GitHub Actions cron and therefore **UTC**. Germany is normally UTC+1 in winter and UTC+2 in summer; operational documentation should continue to use UTC to avoid DST ambiguity.

The system uses two scheduling layers:

1. **Native workflow schedules** — primary producer cadence.
2. **Kings Central Scheduler** — self-sustaining fallback chain with freshness gates.

### Central Scheduler

`central-scheduler.yml` has an emergency/bootstrap native cron at:

- `17,47 * * * *` — twice per hour.

Once active, it queues a standby successor and runs an aligned 5-minute loop for roughly five hours. Scheduler slots are aligned to `xx:03,08,13,...,58 UTC`.

Fallback/freshness policy:

| Managed workflow | Fallback rule |
|---|---|
| Live Tracker | Dispatch when no schedule/workflow_dispatch run is seen for 9 minutes |
| Milestones | 5-minute target; 240-second freshness gate |
| Management Overview | Staggered 15-minute fallback |
| Convoy Checker | Staggered 15-minute fallback in `live` mode |
| HR Leadership | Staggered 15-minute fallback |
| Driver Management | Native hourly preferred; fallback after 65 minutes |
| Staff Management | Native hourly preferred; fallback after 65 minutes |

The scheduler checks the latest managed `schedule`/`workflow_dispatch` run before dispatching and skips a duplicate when the workflow is still fresh.

---

## 5. Complete workflow catalog

There are 30 current workflow files in `.github/workflows/`.

| # | Workflow | Trigger / UTC schedule | Main role |
|---:|---|---|---|
| 1 | Add Changelog Entry | Manual | Add an item to `data/changelog-queue.json` |
| 2 | API Resilience Verification | Manual + relevant pushes | Local failure matrix + production API-health verification |
| 3 | Backup Recovery Verification | Manual + backup/recovery pushes | Isolated full backup/restore roundtrip |
| 4 | Kings Central Scheduler | Manual + push + `17,47 * * * *` bootstrap | Scheduler fallback and self-sustaining handoff |
| 5 | Kings Changelog Publisher | Manual | Publish queued changelog and persist state/history |
| 6 | Public Convoy Announcement Verification | Manual + push + every 15 min from `:10` | Read-only public convoy announcement proof |
| 7 | Kings Convoy Checker | Manual dry-run/live + push dry-run + every 15 min from `:06` live | Full convoy pipeline |
| 8 | Kings Automation Core - Backup | Manual + daily `03:06` | Validated backup / restore point |
| 9 | Kings Core End-to-End Verification | Manual + relevant pushes | Full read-only/isolated Core E2E gate |
| 10 | Kings Automation Core - Recovery | Manual only | Preview or protected apply from restore point |
| 11 | Kings Driver Achievements | Manual + daily `09:20` | Achievement processing and Driver Leadership output |
| 12 | Kings Driver Management | Manual + push + hourly `:17` | Driver management, LOA, status alerts |
| 13 | Kings Driver Updates | Manual + push + every 5 min from `:01` | TruckersMP member changes/history |
| 14 | Kings Driver Weekly Summary | Manual preview/publish + Monday `10:05` | Weekly Driver report |
| 15 | Git State Hardening Verification | Manual + relevant pushes | Git/state concurrency and conflict policy verification |
| 16 | Kings HR Leadership Overview | Manual + push + `:11,:26,:41,:56` | HR probation sync and HR overview |
| 17 | Kings HR Weekly Summary | Manual preview/publish + Monday `10:15` | Weekly HR report |
| 18 | Kings Live Systems | Manual + push + every 5 min from `:03` | Live Tracker + Statistics + Central Overview |
| 19 | Kings Management Overview | Manual + push + `:01,:16,:31,:46` | Live management overview |
| 20 | Kings Management Weekly Overview | Manual preview/publish + Monday `10:30` | Weekly Management report |
| 21 | Kings Milestone Detector | Manual + push + every 5 min from `:03` | Member milestones + changelog queue |
| 22 | Kings Monthly Report Verification | Manual + push + day 1 `11:00` | Read-only monthly readiness/publication verification |
| 23 | Kings Monthly Report | Manual preview/publish + day 1 `10:00` | Previous calendar month report |
| 24 | Kings TruckersMP News | Manual + every 5 min from `:02` | New Kings TruckersMP news publication |
| 25 | Kings Driver Probation Tracker | Manual + push + hourly `:34` | Driver probation state |
| 26 | Kings Staff Management | Manual + push + hourly `:43` | Staff state/overview |
| 27 | Kings Statistics Manual | Manual | Manual Statistics + Central Overview refresh |
| 28 | Kings System Monitoring | Manual + relevant pushes + `:15,:45` | Health, recovery, audits, monitor and alerts |
| 29 | Kings Offline System Verification | PR + relevant pushes + manual | Syntax + isolated test suite |
| 30 | Kings Weekly Reports Verification | Manual + push + Monday `11:00` | Read-only Driver/HR/Management weekly proof |

### Weekly report order

The Monday reporting chain is intentionally staggered:

1. Driver Weekly — 10:05 UTC
2. HR Weekly — 10:15 UTC
3. Management Weekly — 10:30 UTC
4. Weekly Reports Verifier — 11:00 UTC

The HR verifier may defer HR publication only when Driver Management did not provide complete coverage for the reporting week.

### Monthly report order

1. Monthly Report — first day of month at 10:00 UTC
2. Monthly Report Verification — first day of month at 11:00 UTC

The official report requires complete calendar coverage for the previous reporting month. Missing Driver History is omitted clearly rather than invented as zero.

---

## 6. Core data flows

### 6.1 Live Systems

```text
TruckersMP VTC members
TruckersMP servers
TruckersMP Map / ETS2Map live data
TruckersMP location metadata
           │
           ▼
       tracker.js
           │
   ┌───────┴────────┐
   ▼                ▼
Discord Live     data/live-tracker-snapshot.json
Tracker message  (aggregate/public-safe only)
                    │
                    ├──► statistics.js
                    └──► central-overview.js
```

The stored live snapshot intentionally contains aggregate information only. Driver names, TruckersMP IDs and live locations are used transiently for the Discord tracker but are not persisted in the public-safe repository snapshot.

If no usable TruckersMP servers are returned, or all live server checks fail, the tracker refuses to replace the last-known-good state with a false zero-online snapshot.

### 6.2 News

```text
TruckersMP VTC News API
        │
        ▼
     news.js
        │
   compare with
 data/last-news.json
        │
   new article?
    │       │
   no      yes
    │       ▼
    │   Discord webhook
    │       │ success first
    │       ▼
    └──► save exact article as new state
```

First run establishes a baseline without replaying historical news. If the previously saved article drops out of the API response, only the newest article is posted to avoid historical spam. State is saved only after a successful Discord delivery for that article.

### 6.3 Driver / Staff / HR

TruckersMP VTC member and role data feeds encrypted state files and public/leadership summaries. `DRIVER_STATE_KEY` is the primary state key; Staff uses `STAFF_STATE_KEY` when provided, otherwise the driver key with cryptographic domain separation.

Sensitive states use AES-256-GCM and must remain encrypted in the repository and backup artifacts.

### 6.4 Convoy pipeline

Live convoy execution is staged so independent steps can continue, but the workflow ends non-zero if any stage fails:

```text
0. Convoy Checker / submission state
1. TruckersMP Event sync
2. Discord timestamp normalization
3. One-time notifications
4. Post-convoy follow-up
5. Driver reminders
6. Kings public convoy announcement
7. Archive after configured delay
8. Generate overview statistics
9. Sync convoy overview to Discord
10. Final failure gate
```

Scheduled Convoy Checker runs are live. Push-triggered executions and the default manual mode are dry-run. Dry-run intentionally does not count as proof of mutating production paths.

### 6.5 Monitoring flow

```text
workflow-recovery.js (safe allowlist only)
             │
             ▼
system-monitoring.js
             │
      ┌──────┼───────────┬──────────┐
      ▼      ▼           ▼          ▼
data-integrity  system-hardening  security-audit  API health
      │      │           │          │
      └──────┴──────┬────┴──────────┘
                    ▼
         discord-permission-audit
                    │
             data/system-health.json
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
 system-monitor channel    system-alerts channel
         │                     │
         └──────────┬──────────┘
                    ▼
             Require HEALTHY
```

---

## 7. State and data files

### Persistent operational state

| File / family | Purpose |
|---|---|
| `data/live-tracker-snapshot.json` | Public-safe aggregate live snapshot + Discord message ID |
| `data/statistics.json` | Historical/statistical data + successful-processing heartbeat |
| `data/central-overview.json` | Central overview state |
| `data/last-news.json` | Last successfully processed TruckersMP news article |
| `data/driver-members.json` | Encrypted current Driver member baseline |
| `data/driver-history.json` | Public-safe Driver history used by reports |
| `data/driver-change-guard.json` | Driver change protection/checkpoint state |
| `data/driver-management.json` | Encrypted Driver Management state |
| `data/driver-management-summary.json` | Driver Management summary |
| `data/driver-loa.json` | Encrypted LOA state |
| `data/driver-achievements.json` | Encrypted Driver achievement state |
| `data/driver-achievements-summary.json` | Achievement summary |
| `data/probation-state.json` | Driver probation state |
| `data/hr-probation.json` | Encrypted HR review/probation state |
| `data/staff-management.json` | Encrypted Staff state |
| `data/staff-management-summary.json` | Staff summary |
| `data/driver-weekly-summary-state.json` | Driver weekly publication/checkpoint state |
| `data/hr-weekly-summary-state.json` | HR weekly publication/checkpoint state |
| `data/management-weekly-overview-state.json` | Management weekly publication/checkpoint state |
| `data/monthly-report-state.json` | Monthly publication/checkpoint state when produced |
| `data/milestones.json` | Milestone state |
| `data/changelog-queue.json` | Pending changelog entries |
| `data/changelog-state.json` | Changelog publication checkpoint |
| `data/changelog-history.json` | Changelog history |
| `data/system-alerts-state.json` | Active/pending technical alert dedupe state |
| `data/api-health/*.json` | Per-integration health, failure count, circuit state and timestamps |

### Generated evidence / artifact-only data

- `data/system-health.json`
- `data/data-integrity.json`
- `data/system-hardening.json`
- `data/security-audit.json`
- `data/discord-permission-audit.json`
- `output/workflow-recovery.json`
- `output/api-resilience-verification.json`
- `output/api-resilience-final-report.json`
- `output/git-state-hardening-verification.json`
- `output/git-state-hardening-final-report.json`
- `output/weekly-reports-verification.json`
- `output/monthly-report-verification.json`
- `output/kings-convoy-announcement-verification.json`
- `output/core-e2e-verification.json`
- convoy report files under `output/`

These files are primarily retained through GitHub Actions artifacts and are not all expected to be tracked in Git.

---

## 8. Discord integration and outputs

### Known guild and operational destinations

The production workflows currently use guild ID `1114967437788577792`.

| Destination | Purpose |
|---|---|
| `🚛｜driver-leadership` | Driver Management, Driver Weekly, Driver Achievements |
| `hr-leadership` | HR/Probation and HR Weekly |
| `staff-leadership` | Staff Management |
| `management-overview` | Management live and weekly overview |
| `convoy-reminders` | Driver convoy reminders |
| `system-monitor` | Current technical health monitor |
| `system-alerts` | New/escalated/resolved technical alerts |
| Convoy Management Forum `1550619824005062697` | Internal convoy workflow/source data |
| Kings Convoy Source Forum `1506133821693755502` | Source for Kings-only public convoy announcements |
| Public Convoy Announcement Channel `1351613882791366838` | Public Kings convoy announcement output |
| Convoy Overview Channel `1550619865805754378` | Convoy overview/statistics output |

Other systems publish through configured webhooks, including Live Tracker, Statistics, Central Overview, News, Driver Updates, Milestones, Changelog and Monthly Reports.

### Discord safety rules

Technical and management helpers use narrow write guards. Examples:

- System Alerts can only POST technical messages to the resolved `system-alerts` channel.
- Staff Management can only POST/PATCH messages in the resolved Staff Leadership channel.
- Verifier workflows use Discord read-only access.
- Monitoring and verification must not change members, roles, permissions, channels, bans, kicks, timeouts, promotions, demotions or personnel decisions.

---

## 9. External APIs and services

### TruckersMP API v2

Primary production service: `https://api.truckersmp.com/v2`

Verified use includes:

- `/servers`
- `/vtc/64284/members`
- `/vtc/64284/roles`
- `/vtc/64284/news`
- `/events/<eventId>`

VTC ID `64284` represents Kings Logistics in the current automation code.

### TruckersMP Map / ETS2Map

- `https://map.truckersmp.com/locations_ets2.min.json`
- `https://map.truckersmp.com/locations_ats.min.json`
- `https://tracker.ets2map.com/v3/area` for live player area data per TruckersMP map/server ID

### Discord

- Discord REST API v10: `https://discord.com/api/v10`
- Discord webhooks configured through GitHub Secrets

### GitHub

- GitHub Actions runtime and artifacts
- GitHub REST API for workflow state/dispatch in Central Scheduler, monitoring and safe workflow recovery
- Git repository itself as the persistent source of truth for tracked state

---

## 10. API resilience and circuit-breaker policy

`api-resilience.js` centralizes resilient external reads.

Default policy:

- Retries: `3` retries after the initial request where configured with defaults
- Timeout: `15,000 ms`
- Base retry delay: `750 ms`
- Maximum delay: `15,000 ms`
- Exponential backoff + jitter
- Retryable HTTP status: `408`, `425`, `429`, `5xx`
- Default circuit failure threshold: `5`
- Default circuit cooldown: `60,000 ms`

Retry-safe methods include GET, HEAD, PUT, DELETE, OPTIONS and PATCH. Unsafe POST requests are **not** retried by default for ambiguous timeouts/network/5xx failures; an explicit HTTP 429 may be retried because the remote service rejected the request for rate limiting. This prevents duplicate Discord publications when a POST may have succeeded remotely but the response was lost.

An HTTP 200 response is not considered healthy until required JSON parsing and validation also succeed.

Per-service health is persisted in `data/api-health/` with fields such as status, consecutive failures, success/failure timestamps, last error and circuit-open-until time.

---

## 11. Secrets and protected configuration

**Never place secret values in this document, source code, commits, issues or logs.** Only names are documented here.

### GitHub Secrets used by the Core

- `DISCORD_BOT_TOKEN`
- `DISCORD_WEBHOOK_URL`
- `STATS_DISCORD_WEBHOOK_URL`
- `CENTRAL_OVERVIEW_WEBHOOK_URL`
- `NEWS_DISCORD_WEBHOOK_URL`
- `DRIVER_UPDATES_WEBHOOK_URL`
- `DRIVER_STATE_KEY`
- `STAFF_STATE_KEY` *(optional code-supported override; Staff otherwise uses `DRIVER_STATE_KEY` with domain separation)*
- `MILESTONE_DISCORD_WEBHOOK_URL`
- `NEWS_NOTIFICATIONS_ROLE_ID`
- `MONTHLY_REPORT_DISCORD_WEBHOOK_URL`
- `CHANGELOG_DISCORD_WEBHOOK_URL`

### Built-in GitHub credentials

- `${{ github.token }}` / `GITHUB_TOKEN` — ephemeral GitHub Actions token; permissions are defined per workflow.

### Protected recovery variable

- `KINGS_RECOVERY_ENVIRONMENT_ARMED=ENABLED` — required only inside the protected `kings-production-recovery` environment for an APPLY recovery.

### Other non-secret runtime configuration names

Examples include:

- `DISCORD_GUILD_ID`
- channel name/ID variables
- `KINGS_API_HEALTH_NAMESPACE`
- `KINGS_API_HEALTH_DIR`
- `KINGS_RECOVERY_WAIT_MS`
- `KINGS_RECOVERY_POLL_MS`
- `TRUCKERSMP_API_BASE`
- `KINGS_VTC_NAME`
- preview/dry-run flags

---

## 12. Sensitive-state protection

`DRIVER_STATE_KEY` must be at least 32 characters. Driver sensitive state is encrypted using AES-256-GCM with SHA-256 domain-separated key derivation and a random 12-byte IV.

Backup final validation explicitly requires these sensitive state files to remain AES-256-GCM encrypted:

- `data/driver-members.json`
- `data/driver-management.json`
- `data/driver-loa.json`
- `data/hr-probation.json`
- `data/driver-achievements.json`
- `data/staff-management.json`

The backup system forbids environment files, private keys and other credential material.

---

## 13. Backup system

### Schedule and retention

`Kings Automation Core - Backup` runs every day at **03:06 UTC**.

- Normal backup: **30-day** artifact retention
- Manual restore point: **90-day** artifact retention

### Backup contents

The backup process covers current root JavaScript, workflows, data JSON files and README through dynamic final coverage validation. It also validates a set of critical Core files.

### Backup gates

A backup is not HEALTHY unless all required checks pass, including:

- current repository coverage
- required Core files present
- all manifest files exist in staging
- SHA-256 checksum match
- JSON validity
- sensitive state remains encrypted
- forbidden secret/key files absent
- isolated restore roundtrip succeeds

A failed health check still preserves the artifact for investigation but fails the workflow.

### Never backed up

Examples:

- `.env`, `.env.*`
- `.git/`
- `node_modules/`
- staging/recovery directories
- private key/certificate/keystore formats
- local credential/token/secret files ignored by Git

---

## 14. Recovery procedure

### Recovery is manual by design

`Kings Automation Core - Recovery` never runs on a schedule.

Inputs:

- `backup_run_number`
- `recovery_mode`: `preview` or `apply`
- `confirmation`

### Preview mode

Use Preview first. It validates the selected restore point and creates a recovery plan without modifying repository files.

### APPLY requirements

All of the following are mandatory:

1. Run on `main`.
2. Selected backup run must have completed successfully.
3. Artifact must be a real `restore-point`.
4. Exact confirmation must be `RESTORE_KINGS`.
5. Protected environment must provide `KINGS_RECOVERY_ENVIRONMENT_ARMED=ENABLED`.
6. Recovery safety gate must pass.
7. An emergency pre-recovery backup must be created and HEALTHY.
8. `main` must not have changed while recovery is being prepared.
9. Recovered JSON/JavaScript must pass syntax/parse checks.
10. `main` is checked again for branch drift immediately before push.

### Recovery safety gate

`recovery-safety-check.js` verifies:

- same repository and branch
- selected workflow run number matches metadata
- safe normalized relative paths only
- no path traversal
- no symlinks
- no forbidden secret/system paths
- only approved file types/scopes
- valid SHA-256 metadata and actual checksums
- valid file sizes
- no unexpected untracked files in the artifact
- JSON parses successfully

Approved recovery scope is limited to repository-level JS, workflow YAML, top-level `data/*.json`, README/.gitignore and package metadata where present.

### Recovery audit

Recovery writes plan/result artifacts retained for 90 days. APPLY also retains the emergency pre-recovery backup for 90 days.

---

## 15. Monitoring and alerts

### Monitoring cadence

`Kings System Monitoring` runs at `:15` and `:45` UTC each hour, and also runs after relevant Core/producer changes.

### Monitoring engines

A monitoring run combines:

- safe workflow recovery
- system health/freshness evaluation
- API health
- data integrity
- final hardening
- repository security audit
- Discord permission audit
- Discord live monitor update
- Discord technical alerts

### Health contract

The final monitoring workflow requires:

```text
status = HEALTHY
```

If the final state is not HEALTHY, the workflow fails after attempting to preserve evidence/state and update technical outputs.

### Alerts

`system-alerts.js` maintains `data/system-alerts-state.json`.

- Critical issues alert immediately.
- Warnings require **two consecutive confirmations** before an alert is posted.
- Existing active issues are deduplicated.
- Severity escalation is reported.
- Resolution is reported when an active finding disappears.
- Alerts contain no automatic mention parsing.

The System Alerts helper is hard-limited to GET operations plus POSTing technical messages to the resolved `system-alerts` channel.

---

## 16. Automatic workflow recovery currently allowed

The existing monitoring recovery engine is intentionally narrower than the future Point 21 Self-Healing system.

Current `workflow-recovery.js` allowlist:

- `driver-updates.yml`
- `live-tracker.yml`

A workflow becomes eligible when no successful run has been seen for more than **20 minutes**. The recovery engine checks for a recent active run first; if one exists, it waits instead of dispatching a duplicate.

Default wait/poll settings:

- wait: 90 seconds
- poll: 5 seconds
- recent-active window: 15 minutes

Explicitly forbidden from automatic recovery dispatch:

- live Convoy workflow
- HR workflow
- Staff workflow
- Management workflow
- Probation/personnel workflows

This is **safe workflow recovery**, not the complete future Point 21 Self-Healing implementation.

---

## 17. Verifier systems

### Offline System Verification

Runs Node.js syntax checks, shell syntax validation and the isolated `tests/*.test.cjs` suite. It does not require production secrets.

### API Resilience Verification

- failure injection: local mock server only
- no deliberate external API disruption
- production API-health inspection is read-only
- circuit breaker/retry behavior tested under controlled conditions

### Git State Hardening Verification

Uses temporary local repositories to prove:

- same-file conflicts abort rather than auto-overwrite
- independent concurrent changes can be rebased and retained
- forgotten tracked state is blocked before push
- rebased JSON is parsed before push
- push races use bounded refetch/retry

### Weekly Reports Verification

Read-only validation of Driver, HR and Management weekly publication state against Discord history. It never publishes a report.

### Monthly Report Verification

Read-only behavior:

- before month close: verify readiness and absence of an early official publication
- on the first day: verify previous month has exactly one matching Discord post and matching publication state

### Public Convoy Announcement Verification

Runs shortly after Convoy Checker. When a real Kings convoy is inside the 2-hour public announcement window, the exact TruckersMP Event ID must already have the bot announcement in the public output channel.

### Backup Recovery Verification

Builds a backup and restores it into a disposable isolated sandbox. Every manifest file and SHA-256 checksum must match; the sandbox is removed afterward. It never overwrites the live repository.

### Core End-to-End Verification

Aggregates the Core verification chain and requires:

- complete regression/integration suite
- read-only health snapshot = HEALTHY
- 0 Critical Issues
- 0 Warnings
- API resilience verification
- Git/state hardening verification
- Weekly verifier
- Monthly verifier
- Public Convoy verifier
- isolated Backup/Restore roundtrip

Safety rules:

- no production Discord writes by the verifier
- Discord GET/read-only verification only
- local API failure injection only
- temporary local Git conflict injection only
- disposable restore sandbox only
- no personnel/role/permission actions

Time-bound real production proofs remain tracked separately.

---

## 18. Git/state persistence and concurrency safety

Workflows that persist state use full-history checkout where required and `scripts/git-safe-push.sh`.

Core rules:

- dirty tracked state must not be silently forgotten
- concurrent independent state updates should be preserved through safe rebase/retry
- conflicting same-file changes stop for reconciliation rather than selecting a winner automatically
- rebased JSON state must remain parseable
- bounded retries prevent endless push loops

API-health telemetry has one special case in the Convoy workflow: a telemetry persistence conflict is non-fatal because a newer remote health state is preferred over failing an otherwise completed convoy solely because telemetry changed concurrently.

---

## 19. Manual workflows / operator runbook

### Manual preview before publishing reports

For Driver Weekly, HR Weekly, Management Weekly and Monthly Report:

1. Open the corresponding GitHub Actions workflow.
2. Use `workflow_dispatch`.
3. Select `preview` first.
4. Inspect logs/output for period, data completeness and destination.
5. Use `publish` only when a manual official publication is intentionally required.
6. Verify state and Discord history afterward.

### Convoy manual execution

Default manual mode is `dry-run`.

- Use dry-run for preflight and validation.
- Use `live` only when an authorized production execution is intended.
- Never treat dry-run as proof that skipped Discord mutations/public announcements worked.

### Changelog

1. `Add Changelog Entry` adds a category/change to the queue.
2. `Kings Changelog Publisher` publishes queued content and updates state/history.

### Manual Statistics refresh

`Kings Statistics Manual` shares the Live Systems concurrency group and refreshes Statistics + Central Overview.

### Backup restore point

For a planned risky Core change:

1. Run `Kings Automation Core - Backup`.
2. Choose `restore-point`.
3. Provide a meaningful restore point name.
4. Confirm the backup is HEALTHY before proceeding with the risky change.

### Recovery

1. Identify a HEALTHY restore-point backup run number.
2. Run Recovery in `preview`.
3. Review the recovery plan artifact.
4. If real restoration is authorized, use APPLY only through the protected recovery environment with exact `RESTORE_KINGS` confirmation.
5. Inspect emergency backup, recovery audit and resulting commit.
6. Run Monitoring and Core E2E afterward.

---

## 20. Troubleshooting guide

### System Monitoring is UNHEALTHY

Check in this order:

1. `data/system-health.json` artifact and workflow summary.
2. Critical issues before warnings.
3. Latest producer workflow status and freshness.
4. `data/api-health/` state for degraded/down integrations.
5. `system-alerts` and `system-monitor` Discord outputs.
6. Data Integrity / Hardening / Security / Discord Permission audit artifacts.
7. Whether safe workflow recovery attempted Driver Updates or Live Tracker.

Do **not** raise freshness thresholds merely to hide genuine scheduler gaps.

### API service is DEGRADED/DOWN

Check:

- last HTTP/error code
- consecutive failure count
- circuit-open-until time
- remote service status
- whether JSON schema/validation changed despite HTTP 200

Do not manually clear API-health state simply to make monitoring green. Confirm the external integration is healthy first.

### News did not publish

Check:

1. News workflow succeeded.
2. TruckersMP `/vtc/64284/news` returned a valid list.
3. `data/last-news.json` is valid.
4. Latest API article ID differs from saved ID.
5. Webhook secret exists.
6. Discord post succeeded before state advanced.
7. Re-run verifier/next scheduled check; do not manually reset state without evidence.

### Duplicate publication suspected

Check persisted publication state and Discord history before rerunning in publish/live mode. Do not delete state as a first response.

### Convoy pipeline failed

Because stages are independent, inspect each stage outcome and `output/convoy-check-results.json`. A final workflow failure may represent one failed stage even if later independent stages completed. Resolve the exact stage; do not rerun live blindly if a notification/announcement may already have been sent.

### Git push conflict

The safe policy is to stop on a real same-file conflict. Reconcile intentionally from the newest `main` and rerun the producer as appropriate. Never force-push automated state to hide the conflict.

### Backup is UNHEALTHY

Inspect:

- missing repository coverage
- required Core files
- checksum mismatch
- malformed JSON
- encrypted sensitive state format
- forbidden files
- isolated restore verification

Never use an unhealthy backup for APPLY recovery.

### Recovery stopped before APPLY

Expected safety blockers include:

- invalid confirmation
- protected environment not armed
- selected backup not successful/restore-point
- backup health not HEALTHY
- repository/branch mismatch
- hash/size/path validation failure
- main changed during preparation
- emergency backup unhealthy

Resolve the blocker and start a new recovery run; do not bypass the gate.

---

## 21. Maintenance guide

### After changing a production script

1. Run/allow Offline System Verification.
2. Confirm syntax and isolated test suite pass.
3. Confirm any associated specialized verifier passes.
4. Inspect production workflow run on `main`.
5. Confirm Monitoring returns HEALTHY.
6. Confirm no unexpected state or Discord output changed.
7. If the change affects backup/recovery scope, run Backup Recovery Verification.
8. Update this documentation when architecture, schedules, states, destinations, secrets or runbooks change.

### After changing a workflow schedule

Update all of:

- native cron
- Central Scheduler freshness/fallback assumptions where applicable
- Monitoring freshness thresholds
- this document

Then verify the scheduler does not create duplicate dispatches.

### After adding a new persistent state file

1. Decide whether it is public-safe or sensitive.
2. If sensitive, encrypt it before committing.
3. Add persistence handling to the producer workflow.
4. Add backup coverage/validation if required.
5. Add monitoring/integrity checks.
6. Add it to this state catalog.

### After adding a new external API

1. Route reads through `api-resilience.js` where practical.
2. Define strict response validation.
3. Give it a stable API-health label/namespace.
4. Decide safe retry semantics; avoid ambiguous unsafe POST retries.
5. Add tests and verifier coverage.
6. Add it to this API catalog.

### Secret rotation

When rotating a secret:

1. Change only the GitHub Secret/Environment value, never commit the value.
2. Run the affected workflow manually where safe.
3. Confirm API/Discord output.
4. Confirm Monitoring returns HEALTHY.

For `DRIVER_STATE_KEY`/`STAFF_STATE_KEY`, rotation requires an explicit state migration plan because existing encrypted state depends on the prior key. Do not rotate these keys casually.

---

## 22. Safety invariants

The following rules are part of the Core operating contract:

- No automated technical recovery may change Discord roles/permissions or make personnel decisions.
- No verifier may publish production Discord content.
- No recovery APPLY may run without protected-environment arming, exact confirmation and a HEALTHY emergency backup.
- No invalid/corrupt sensitive state should silently become an empty baseline.
- No false zero live snapshot should replace last-known-good data when all upstream live checks failed.
- No ambiguous unsafe POST should be automatically retried by the shared resilience layer.
- No same-file Git conflict should be auto-overwritten.
- No secret/key file should enter a backup artifact.
- No backup should be considered final until isolated restore + checksum verification succeeds.
- No Monitoring run should report success when the final health state is not HEALTHY.

---

## 23. Current production-proof status at documentation time

As of **30 September 2026**, the following time-bound proofs are still tracked independently from this documentation:

| Area | Status | Required real-world proof |
|---|---|---|
| Public Convoy Announcement | Pending live proof | Monthly Convoy #12 on 02.10.2026: exact event, bot, channel, no duplicate |
| News System | Pending live proof | Next genuine new Kings/TruckersMP news: exactly one correct publication + state/dedupe |
| Weekly Reports | Partial production proof | Driver and Management already observed; next complete HR weekly period still required |
| Monthly Report | Pending first regular close | September 2026 report must publish once with correct state/period/dedupe |

These do not block creating the documentation, but they do block claiming the final time-bound production evidence is complete.

---

## 24. Point 19 acceptance checklist

This document covers the required Point 19 areas:

- [x] Complete Core architecture
- [x] Complete workflow catalog
- [x] Cron/scheduler times
- [x] Data flows and state files
- [x] Discord channels/outputs
- [x] External APIs/services
- [x] Secret names only — no values
- [x] Backup & Recovery
- [x] Monitoring & Alerts
- [x] Troubleshooting
- [x] Manual workflows/runbooks
- [x] Maintenance guide
- [x] Verifier systems
- [x] Safety systems/invariants
- [x] Current production-proof caveats

**Point 19 documentation deliverable: COMPLETE.**

The next development stage is **Point 20 — Stable Core Baseline / Core Freeze**, which must be based on a fresh repository/health verification and must not override the separate time-bound live-proof requirements above.

---

## 25. Useful validation commands

Local/offline Core checks:

```sh
for file in *.js tests/*.cjs; do node --check "$file"; done
bash -n scripts/git-safe-push.sh
node branding-self-test.js
node --test tests/*.test.cjs
```

Production health and verification should be performed through the corresponding GitHub Actions workflows so that secrets, permissions, artifacts, Discord read access and repository state are evaluated in the actual production environment.

---

Kings Logistics — Connecting the world, creating friendships.
