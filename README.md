# Kings Logistics Automation

Automation systems and tools for Kings Logistics.

## Documentation

- [Stable Core Baseline / Core Freeze — 1 October 2026](docs/core-baseline-2026-10-01.md) — verified Kings Core v1.0 reference, fingerprint, acceptance evidence and freeze rules.
- [Final Core Documentation](docs/final-core-documentation.md) — architecture, workflows, schedules, data/state, Discord outputs, APIs, secret names, backup/recovery, monitoring, troubleshooting, manual operations, maintenance, verifiers and safety systems.
- [System Verification — 30 September 2026](docs/system-verification-2026-09-30.md) — historical verification evidence, tested repairs and production-validation notes from that verification pass.

## Stable Core Baseline

**Kings Core v1.0** is the accepted Point 20 stable technical baseline.

- Baseline ID: `KINGS-CORE-BASELINE-2026-10-01`
- Reference branch: `baseline/core-v1-2026-10-01`
- Verified repository HEAD: `86750676b620ea748f07f56d616443ca36040ad9`
- Protected Core files: `107`
- Core SHA-256 fingerprint: `75f8857f2c8da4529afcdf8f2d71d1a0d3a0a9579a0e0236db51d4def6b59af8`
- Point 20 result: `VERIFIED-STABLE-BASELINE`

Runtime state under `data/**` remains mutable by design and may continue to be updated by production automations without invalidating the static Core fingerprint.

## Verification

Run `node --test tests/*.test.cjs` with Node.js 24. The current Point 20 suite passed **98/98 tests**. The suite uses isolated in-memory API/Discord fixtures and temporary local Git repositories; it does not require production secrets. Pull requests run the offline verification workflow automatically.

The repository also contains dedicated read-only/isolated verifiers for API resilience, Git/state hardening, weekly reports, monthly reports, public convoy announcements, backup/recovery, the complete Core E2E chain and the Stable Core Baseline gate.

## Current Systems

- Kings Live Tracker
- Kings Central Live Snapshot
- Kings Advanced Statistics
- Kings Central Overview
- TruckersMP News Automation
- Automatic Driver Updates
- Driver Management / LOA / Status Alerts
- Driver Probation Tracker
- Driver Achievements
- Staff Management
- HR Probation & Leadership Overview
- Driver / HR / Management Weekly Reports
- Milestone Automation
- Changelog Automation
- Monthly Kings Reports
- Convoy Automation & Public Convoy Announcements
- Central Scheduler & Safe Workflow Recovery
- API Resilience & API Health
- System Monitoring & Technical Alerts
- Data Integrity / Hardening / Security / Discord Permission Audits
- Core Backup, Restore Points & Protected Recovery
- Core End-to-End Verification
- Stable Core Baseline Verification / Core Freeze

## Live Systems

- Live Tracker updates every 5 minutes
- Statistics and Central Overview use the same live data
- ETS2 & ATS activity tracking
- Automatic TruckersMP member tracking
- Central Scheduler provides freshness-gated fallback scheduling
- Monitoring runs twice per hour and requires a final `HEALTHY` state

## Production status

Point 20 — **Stable Core Baseline / Core Freeze is complete** for the technical Core. Time-bound live-production acceptance evidence remains separate: the real Monthly Convoy #12 public announcement, the next genuine Kings News publication, the first complete HR Weekly production proof and the first regular September 2026 Monthly Report publication must still be observed before the later Final Freeze / final production acceptance stage.

---

Kings Logistics — Connecting the world, creating friendships.
