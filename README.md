# Kings Logistics Automation

Automation systems and tools for Kings Logistics.

## Documentation

- [Point 21 Safe Self-Healing — 1 October 2026](docs/self-healing-2026-10-01.md) — automatic technical recovery allowlist, cooldowns, attempt budgets, verification evidence and post-Point-21 Core baseline.
- [Stable Core Baseline / Core Freeze — 1 October 2026](docs/core-baseline-2026-10-01.md) — historical Kings Core v1.0 / Point 20 reference, fingerprint, acceptance evidence and freeze rules.
- [Final Core Documentation](docs/final-core-documentation.md) — architecture, workflows, schedules, data/state, Discord outputs, APIs, secret names, backup/recovery, monitoring, troubleshooting, manual operations, maintenance, verifiers and safety systems.
- [System Verification — 30 September 2026](docs/system-verification-2026-09-30.md) — historical verification evidence, tested repairs and production-validation notes from that verification pass.

## Stable Core Baseline

**Kings Core v1.1** is the accepted post-Point-21 stable technical baseline.

- Baseline ID: `KINGS-CORE-BASELINE-2026-10-01-P21`
- Reference branch: `baseline/core-v1.1-point21-2026-10-01`
- Verified repository HEAD: `97e9153c98c48258ecdaaa941d6636a14cbbde66`
- Protected Core files: `111`
- Core SHA-256 fingerprint: `e6eaea56851655b16fe0dfb8bff0db7b23c59a6927ab753b3a6076b63f592adf`
- Baseline result: `VERIFIED-STABLE-BASELINE`

Kings Core v1.0 remains preserved on `baseline/core-v1-2026-10-01` as the historical Point 20 freeze.

Runtime state under `data/**` remains mutable by design and may continue to be updated by production automations without invalidating the static Core fingerprint.

## Verification

Run `node --test tests/*.test.cjs` with Node.js 24. The post-Point-21 Core suite passes **106/106 tests**. The suite uses isolated in-memory API/Discord fixtures and temporary local Git repositories; it does not require production secrets. Pull requests run the offline verification workflow automatically.

The repository also contains dedicated read-only/isolated verifiers for API resilience, Git/state hardening, weekly reports, monthly reports, public convoy announcements, backup/recovery, the complete Core E2E chain, Safe Self-Healing and the Stable Core Baseline gate.

## Safe Self-Healing

Point 21 adds a scheduled technical Self-Healing layer running every 15 minutes at minutes `07`, `22`, `37` and `52`.

Automatic recovery is intentionally restricted to:

- Live Tracker / Statistics
- Driver Updates
- normal Core Backup

Cooldowns, attempt budgets, duplicate-run suppression and a complete post-repair health re-check prevent repair loops or false recovery claims. Convoy live, HR, Staff, Management, personnel, Discord role/member mutations, automatic restore and force-push actions are blocked from automatic Self-Healing.

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
- Safe Self-Healing
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
- Safe Self-Healing checks technical health every 15 minutes on an offset schedule
- Monitoring runs twice per hour and requires a final `HEALTHY` state

## Production status

Point 21 — **Safe Self-Healing is complete**, and Kings Core v1.1 is the current verified technical baseline. Time-bound live-production acceptance evidence remains separate: the real Monthly Convoy #12 public announcement, the next genuine Kings News publication, the first complete HR Weekly production proof and the first regular September 2026 Monthly Report publication must still be observed before the later Final Freeze / final production acceptance stage.

---

Kings Logistics — Connecting the world, creating friendships.
