# Kings Logistics Automation

Automation systems and tools for Kings Logistics.

## Documentation

- [Final Core Documentation](docs/final-core-documentation.md) — architecture, workflows, schedules, data/state, Discord outputs, APIs, secret names, backup/recovery, monitoring, troubleshooting, manual operations, maintenance, verifiers and safety systems.
- [System Verification — 30 September 2026](docs/system-verification-2026-09-30.md) — historical verification evidence, tested repairs and production-validation notes from that verification pass.

## Verification

Run `node --test tests/*.test.cjs` with Node.js 24. The suite uses isolated in-memory API/Discord fixtures and temporary local Git repositories; it does not require production secrets. Pull requests run the offline verification workflow automatically.

The repository also contains dedicated read-only/isolated verifiers for API resilience, Git/state hardening, weekly reports, monthly reports, public convoy announcements, backup/recovery and the complete Core E2E chain.

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

## Live Systems

- Live Tracker updates every 5 minutes
- Statistics and Central Overview use the same live data
- ETS2 & ATS activity tracking
- Automatic TruckersMP member tracking
- Central Scheduler provides freshness-gated fallback scheduling
- Monitoring runs twice per hour and requires a final `HEALTHY` state

## Production status

The technical Core and its documentation are separate from time-bound live-production acceptance evidence. Public Convoy Announcement, new News publication, complete HR Weekly production evidence and the first regular Monthly Report close remain tracked as real-world verification items before the later Core Freeze / Final Freeze stages.

---

Kings Logistics — Connecting the world, creating friendships.
