# Kings Logistics Automation

Automation systems and tools for Kings Logistics.

## Documentation

- [Point 22 Self-Healing Stress Test — 1 October 2026](docs/self-healing-stress-2026-10-01.md) — controlled failure matrix, corrupt-state fail-closed recovery, Discord 429 hardening and the post-Point-22 Core v1.2 baseline.
- [Point 21 Safe Self-Healing — 1 October 2026](docs/self-healing-2026-10-01.md) — automatic technical recovery allowlist, cooldowns, attempt budgets and verification evidence.
- [Stable Core Baseline / Core Freeze — 1 October 2026](docs/core-baseline-2026-10-01.md) — historical Kings Core v1.0 / Point 20 reference, fingerprint, acceptance evidence and freeze rules.
- [Final Core Documentation](docs/final-core-documentation.md) — architecture, workflows, schedules, data/state, Discord outputs, APIs, secret names, backup/recovery, monitoring, troubleshooting, manual operations, maintenance, verifiers and safety systems.
- [System Verification — 30 September 2026](docs/system-verification-2026-09-30.md) — historical verification evidence, tested repairs and production-validation notes from that verification pass.

## Stable Core Baseline

**Kings Core v1.2** is the accepted post-Point-22 stable technical baseline.

- Baseline ID: `KINGS-CORE-BASELINE-2026-10-01-P22`
- Reference branch: `baseline/core-v1.2-point22-2026-10-01`
- Verified repository HEAD: `023b2cb28495175ea7d328ef5b4b96017d44cdc9`
- Protected Core files: `115`
- Core SHA-256 fingerprint: `d48743e08f9e6efe21531d5787cc31a27461920969b9f80695f96edd4343216d`
- Baseline checks: `19/19`
- Baseline result: `VERIFIED-STABLE-BASELINE`

Historical freezes remain preserved:

- Kings Core v1.1 — `baseline/core-v1.1-point21-2026-10-01`
- Kings Core v1.0 — `baseline/core-v1-2026-10-01`

Runtime state under `data/**` remains mutable by design and may continue to be updated by production automations without invalidating the static Core fingerprint.

## Verification

Run `node --test tests/*.test.cjs` with Node.js 24. The post-Point-22 Core suite passes **107/107 tests** with **0 failures** and **0 skipped**.

Point 22 additionally verifies **9/9 controlled Self-Healing stress scenarios** and **21/21 stress acceptance checks**. The final post-stress system state is `HEALTHY` with **0 Critical Issues** and **0 Warnings**.

The repository contains dedicated read-only/isolated verifiers for API resilience, Git/state hardening, weekly reports, monthly reports, public convoy announcements, backup/recovery, the complete Core E2E chain, Safe Self-Healing, the Self-Healing stress matrix and the Stable Core Baseline gate.

## Safe Self-Healing

Point 21 provides a scheduled technical Self-Healing layer running every 15 minutes at minutes `07`, `22`, `37` and `52`.

Automatic recovery is intentionally restricted to:

- Live Tracker / Statistics
- Driver Updates
- normal Core Backup

Point 22 adds controlled stress verification and a fail-closed persistent-state guard. Corrupt Self-Healing state cannot reset the repair system into an unrestricted state; automatic repairs are temporarily locked instead. The Discord permission audit also retries bounded 429/408/5xx and network/timeout failures while respecting Discord retry timing.

Cooldowns, attempt budgets, duplicate-run suppression and a complete post-repair health re-check prevent repair loops or false recovery claims. Convoy live, HR, Staff, Management, personnel, Discord role/member mutations, automatic restore and force-push actions remain blocked from automatic Self-Healing.

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
- Self-Healing Stress Verification
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

- Point 19 — Final Documentation: **COMPLETE**
- Point 20 — Stable Core Baseline / Core Freeze: **COMPLETE**
- Point 21 — Safe Self-Healing: **COMPLETE**
- Point 22 — Self-Healing Stress Test: **COMPLETE**
- Point 23 — Final Freeze / Ultimate Completion: **PENDING REAL PRODUCTION PROOFS**

The remaining real-world acceptance evidence must not be simulated or bypassed: Monthly Convoy #12 public announcement, the next genuine Kings/TruckersMP News publication, the first complete HR Weekly production proof and the first regular September 2026 Monthly Report publication.

---

Kings Logistics — Connecting the world, creating friendships.
