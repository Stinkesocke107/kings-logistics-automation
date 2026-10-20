'use strict';

// Single inventory for EVERY Kings GitHub Actions workflow. It is deliberately
// separate from the auto-recovery allowlist: reporting/verification workflows
// may be observed without being blindly rerun at a five-minute cadence.
// "scheduled": check both existence and real GitHub execution freshness.
// "on-change": run only on code/push/manual triggers; no freshness deadline.
// "manual": intentionally operator-only (never auto-dispatch).
const WORKFLOW_REGISTRY = Object.freeze(
  [
    {
      "file": "add-changelog-entry.yml",
      "label": "Changelog Editor",
      "mode": "manual",
      "area": "Changelog"
    },
    {
      "file": "api-resilience-verification.yml",
      "label": "API Resilience Verification",
      "mode": "on-change",
      "area": "Security"
    },
    {
      "file": "backup-recovery-verification.yml",
      "label": "Backup / Restore Verification",
      "mode": "on-change",
      "area": "Backup"
    },
    {
      "file": "central-scheduler.yml",
      "label": "Central Scheduler",
      "mode": "scheduled",
      "area": "Automation",
      "maxAgeMinutes": 20,
      "severity": "critical"
    },
    {
      "file": "changelog.yml",
      "label": "Changelog Publisher",
      "mode": "scheduled",
      "area": "News",
      "maxAgeMinutes": 75,
      "severity": "warning"
    },
    {
      "file": "convoy-announcement-verifier.yml",
      "label": "Convoy Announcement Verification",
      "mode": "scheduled",
      "area": "Convoys",
      "maxAgeMinutes": 180,
      "severity": "warning"
    },
    {
      "file": "convoy-checker.yml",
      "label": "Convoy / Event System",
      "mode": "scheduled",
      "area": "Convoys",
      "maxAgeMinutes": 45,
      "severity": "critical"
    },
    {
      "file": "core-backup.yml",
      "label": "Core Backup",
      "mode": "scheduled",
      "area": "Backup",
      "maxAgeMinutes": 2160,
      "severity": "critical"
    },
    {
      "file": "core-baseline-verification.yml",
      "label": "Core Baseline Verification",
      "mode": "on-change",
      "area": "Security"
    },
    {
      "file": "core-e2e-verification.yml",
      "label": "Core End-to-End Verification",
      "mode": "on-change",
      "area": "Security"
    },
    {
      "file": "core-recovery.yml",
      "label": "Core Restore / Recovery",
      "mode": "manual",
      "area": "Backup"
    },
    {
      "file": "driver-achievements.yml",
      "label": "Driver Achievements",
      "mode": "scheduled",
      "area": "Drivers",
      "maxAgeMinutes": 2160,
      "severity": "warning"
    },
    {
      "file": "driver-leadership-reports.yml",
      "label": "Driver Leadership Reports",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 2400,
      "severity": "warning"
    },
    {
      "file": "driver-management.yml",
      "label": "Driver Management",
      "mode": "scheduled",
      "area": "Drivers",
      "maxAgeMinutes": 150,
      "severity": "critical"
    },
    {
      "file": "driver-updates.yml",
      "label": "Driver Updates",
      "mode": "scheduled",
      "area": "Drivers",
      "maxAgeMinutes": 30,
      "severity": "critical"
    },
    {
      "file": "driver-weekly-summary.yml",
      "label": "Driver Weekly Summary",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 12000,
      "severity": "warning",
      "optionalUntilFirstRun": true
    },
    {
      "file": "event-leadership-reports.yml",
      "label": "Event Leadership Reports",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 2400,
      "severity": "warning"
    },
    {
      "file": "final-freeze-verification.yml",
      "label": "Final Freeze Verification",
      "mode": "scheduled",
      "area": "Security",
      "maxAgeMinutes": 540,
      "severity": "warning"
    },
    {
      "file": "git-state-hardening-verification.yml",
      "label": "Git State Hardening Verification",
      "mode": "on-change",
      "area": "Security"
    },
    {
      "file": "hr-leadership-reports.yml",
      "label": "HR Leadership Reports",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 2400,
      "severity": "warning"
    },
    {
      "file": "hr-leadership.yml",
      "label": "HR Leadership",
      "mode": "scheduled",
      "area": "HR & Staff",
      "maxAgeMinutes": 45,
      "severity": "critical"
    },
    {
      "file": "hr-weekly-summary.yml",
      "label": "HR Weekly Summary",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 12000,
      "severity": "warning",
      "optionalUntilFirstRun": true
    },
    {
      "file": "leadership-dashboard-verification.yml",
      "label": "Leadership Dashboard Verification",
      "mode": "on-change",
      "area": "Security"
    },
    {
      "file": "leadership-dashboard.yml",
      "label": "Leadership Dashboard",
      "mode": "scheduled",
      "area": "Leadership",
      "maxAgeMinutes": 780,
      "severity": "warning"
    },
    {
      "file": "legacy-convoy-import.yml",
      "label": "Legacy Convoy Import",
      "mode": "manual",
      "area": "Convoys"
    },
    {
      "file": "live-tracker.yml",
      "label": "Live Tracker / Statistics",
      "mode": "scheduled",
      "area": "Live Data",
      "maxAgeMinutes": 30,
      "severity": "critical"
    },
    {
      "file": "management-monthly-report.yml",
      "label": "Management Monthly Report",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 55000,
      "severity": "warning",
      "optionalUntilFirstRun": true
    },
    {
      "file": "management-weekly-overview.yml",
      "label": "Management Weekly Overview",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 12000,
      "severity": "warning",
      "optionalUntilFirstRun": true
    },
    {
      "file": "milestones.yml",
      "label": "VTC Milestones",
      "mode": "scheduled",
      "area": "Drivers",
      "maxAgeMinutes": 30,
      "severity": "warning"
    },
    {
      "file": "monthly-report-verification.yml",
      "label": "Monthly Report Verification",
      "mode": "scheduled",
      "area": "Security",
      "maxAgeMinutes": 55000,
      "severity": "warning",
      "optionalUntilFirstRun": true
    },
    {
      "file": "monthly-report.yml",
      "label": "Monthly Report",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 50400,
      "severity": "warning",
      "optionalUntilFirstRun": true
    },
    {
      "file": "news-production-verification.yml",
      "label": "TruckersMP News Verification",
      "mode": "scheduled",
      "area": "News",
      "maxAgeMinutes": 180,
      "severity": "warning"
    },
    {
      "file": "news.yml",
      "label": "TruckersMP News",
      "mode": "scheduled",
      "area": "News",
      "maxAgeMinutes": 35,
      "severity": "warning"
    },
    {
      "file": "probation.yml",
      "label": "Driver Probation",
      "mode": "scheduled",
      "area": "Drivers",
      "maxAgeMinutes": 180,
      "severity": "warning"
    },
    {
      "file": "self-healing-stress-verification.yml",
      "label": "Self-Healing Stress Verification",
      "mode": "on-change",
      "area": "Security"
    },
    {
      "file": "self-healing.yml",
      "label": "Safe Self-Healing",
      "mode": "scheduled",
      "area": "Automation",
      "maxAgeMinutes": 90,
      "severity": "warning"
    },
    {
      "file": "social-news.yml",
      "label": "YouTube Social News",
      "mode": "scheduled",
      "area": "News",
      "maxAgeMinutes": 90,
      "severity": "warning"
    },
    {
      "file": "staff-leadership-live-overview.yml",
      "label": "Staff Leadership Live Overview",
      "mode": "scheduled",
      "area": "HR & Staff",
      "maxAgeMinutes": 90,
      "severity": "warning"
    },
    {
      "file": "staff-leadership-reports.yml",
      "label": "Staff Leadership Reports",
      "mode": "scheduled",
      "area": "Reports",
      "maxAgeMinutes": 2400,
      "severity": "warning"
    },
    {
      "file": "staff-management.yml",
      "label": "Staff Management",
      "mode": "scheduled",
      "area": "HR & Staff",
      "maxAgeMinutes": 150,
      "severity": "critical"
    },
    {
      "file": "system-monitoring.yml",
      "label": "System Monitoring",
      "mode": "scheduled",
      "area": "Automation",
      "maxAgeMinutes": 120,
      "severity": "warning"
    },
    {
      "file": "system-tests.yml",
      "label": "Offline System Verification",
      "mode": "on-change",
      "area": "Security"
    },
    {
      "file": "weekly-reports-verification.yml",
      "label": "Weekly Reports Verification",
      "mode": "scheduled",
      "area": "Security",
      "maxAgeMinutes": 12000,
      "severity": "warning",
      "optionalUntilFirstRun": true
    }
  ]
);
const SCHEDULED_WORKFLOWS = Object.freeze(WORKFLOW_REGISTRY.filter(item => item.mode === 'scheduled'));
const ON_DEMAND_WORKFLOWS = Object.freeze(WORKFLOW_REGISTRY.filter(item => item.mode !== 'scheduled'));

function assertRegistry() {
  const files = WORKFLOW_REGISTRY.map(item => item.file);
  if (new Set(files).size !== files.length) throw new Error('Kings workflow registry contains duplicate filenames.');
  for (const item of WORKFLOW_REGISTRY) {
    if (!item.file.endsWith('.yml') || !item.label || !item.area) throw new Error('Invalid workflow identity: ' + item.file);
    if (!['scheduled','manual','on-change'].includes(item.mode)) throw new Error('Invalid Kings workflow mode: ' + item.file);
    if (item.mode === 'scheduled' && !(item.maxAgeMinutes > 0 && ['critical','warning'].includes(item.severity))) {
      throw new Error('Scheduled Kings workflow missing health limits: ' + item.file);
    }
  }
}
assertRegistry();
module.exports = {WORKFLOW_REGISTRY, SCHEDULED_WORKFLOWS, ON_DEMAND_WORKFLOWS, assertRegistry};
