'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, 'output', 'core-e2e-verification.json');
const issues = [];
const advisories = [];
const checks = [];

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function readJson(relativePath) {
  const file = path.join(ROOT, relativePath);
  if (!fs.existsSync(file)) throw new Error(`${relativePath} is missing.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function check(name, ok, details = null) {
  checks.push({ name, ok: Boolean(ok), details });
  if (!ok) issues.push(details ? `${name}: ${typeof details === 'string' ? details : JSON.stringify(details)}` : name);
}

function validateReport(label, relativePath) {
  let report;
  try {
    report = readJson(relativePath);
  } catch (error) {
    check(`${label} report exists and parses`, false, error.message);
    return null;
  }

  const reportIssues = Array.isArray(report.issues) ? report.issues : [];
  const badStatus = ['UNHEALTHY', 'DEGRADED', 'FAILED', 'FAIL', 'ERROR'].includes(String(report.status || '').toUpperCase());
  const fatal = Boolean(report.fatalError);
  const unhealthy = report.healthy === false;
  check(`${label} report healthy`, !fatal && !unhealthy && !badStatus && reportIssues.length === 0, {
    healthy: report.healthy ?? null,
    status: report.status ?? null,
    issues: reportIssues.length,
    fatalError: report.fatalError ?? null
  });
  return report;
}

const requiredFiles = [
  '.github/workflows/central-scheduler.yml',
  '.github/workflows/convoy-checker.yml',
  '.github/workflows/driver-management.yml',
  '.github/workflows/driver-updates.yml',
  '.github/workflows/hr-leadership.yml',
  '.github/workflows/staff-management.yml',
  '.github/workflows/live-tracker.yml',
  '.github/workflows/statistics.yml',
  '.github/workflows/management-overview.yml',
  '.github/workflows/news.yml',
  '.github/workflows/driver-weekly-summary.yml',
  '.github/workflows/hr-weekly-summary.yml',
  '.github/workflows/management-weekly-overview.yml',
  '.github/workflows/monthly-report.yml',
  '.github/workflows/system-monitoring.yml',
  '.github/workflows/core-backup.yml',
  'tracker.js',
  'statistics.js',
  'driver-management.js',
  'staff-management.js',
  'hr-leadership.js',
  'news.js',
  'system-monitoring.js',
  'system-alerts.js',
  'api-resilience.js',
  'scripts/git-safe-push.sh'
];
check('Core production files present', requiredFiles.every(exists), requiredFiles.filter((file) => !exists(file)));

const driver = readJson('data/driver-management-summary.json');
const staff = readJson('data/staff-management-summary.json');
const live = readJson('data/live-tracker-snapshot.json');
const statistics = readJson('data/statistics.json');
const achievements = readJson('data/driver-achievements-summary.json');
const alerts = readJson('data/system-alerts-state.json');
const news = readJson('data/last-news.json');
const driverWeekly = readJson('data/driver-weekly-summary-state.json');
const hrWeekly = readJson('data/hr-weekly-summary-state.json');
const managementWeekly = readJson('data/management-weekly-overview-state.json');

check('Driver Management is advisory-only', driver.mode === 'advisory-only', driver.mode);
check('Driver Management has current roster', Number(driver.currentDrivers) > 0, driver.currentDrivers);
const activityTotal = Object.values(driver.activity || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
check('Driver activity buckets match current roster', activityTotal === Number(driver.currentDrivers), { activityTotal, currentDrivers: driver.currentDrivers });
check('Live Tracker matches Driver Management roster', Number(live.members) === Number(driver.currentDrivers), { live: live.members, driver: driver.currentDrivers });
check('Live Tracker game totals are internally consistent', Number(live.online) === Number(live.ets2Online) + Number(live.atsOnline), { online: live.online, ets2: live.ets2Online, ats: live.atsOnline });
check('Staff Management is advisory-only', staff.mode === 'advisory-only', staff.mode);
check('Staff tracking covers current staff', Number(staff.trackedStaffRecords) >= Number(staff.currentStaff) && Number(staff.currentStaff) >= 0, { currentStaff: staff.currentStaff, tracked: staff.trackedStaffRecords });
check('Achievements cover current drivers', Number(achievements.currentDrivers) === Number(driver.currentDrivers) && Number(achievements.trackedCurrentDrivers) === Number(driver.currentDrivers), { achievements: achievements.currentDrivers, tracked: achievements.trackedCurrentDrivers, drivers: driver.currentDrivers });
check('News dedupe state is initialized', Boolean(news.lastId && news.lastTitle && news.lastUrl), { lastId: news.lastId, updatedAt: news.updatedAt });
check('Weekly publication states parse and contain history', Array.isArray(driverWeekly.publishedWeeks) && driverWeekly.publishedWeeks.length > 0 && Array.isArray(hrWeekly.publishedWeeks) && hrWeekly.publishedWeeks.length > 0 && Array.isArray(managementWeekly.publishedWeeks) && managementWeekly.publishedWeeks.length > 0, { driver: driverWeekly.publishedWeeks?.length, hr: hrWeekly.publishedWeeks?.length, management: managementWeekly.publishedWeeks?.length });
check('System Alert state is technical-only', alerts.mode === 'technical-alerts-only', alerts.mode);
check('No active System Alerts remain', Object.keys(alerts.active || {}).length === 0, Object.keys(alerts.active || {}));
check('No pending System Alerts remain', Object.keys(alerts.pending || {}).length === 0, Object.keys(alerts.pending || {}));

const history = Array.isArray(statistics.history) ? statistics.history : [];
const latestDay = history.at(-1) || null;
check('Statistics history is populated', history.length > 0, history.length);
check('Latest Statistics roster matches Live Tracker', latestDay && Number(latestDay.members) === Number(live.members), { latestDate: latestDay?.date, statisticsMembers: latestDay?.members, liveMembers: live.members });

const apiHealthDir = path.join(ROOT, 'data', 'api-health');
const apiFiles = fs.existsSync(apiHealthDir) ? fs.readdirSync(apiHealthDir).filter((name) => name.endsWith('.json')).sort() : [];
let apiHealthy = 0;
let apiBad = 0;
let openCircuits = 0;
for (const name of apiFiles) {
  const value = readJson(path.join('data', 'api-health', name));
  if (String(value.status || '').toLowerCase() === 'healthy') apiHealthy += 1;
  else apiBad += 1;
  const until = value.circuitOpenUntil ? new Date(value.circuitOpenUntil).getTime() : 0;
  if (Number.isFinite(until) && until > Date.now()) openCircuits += 1;
}
check('Production API health inventory is complete', apiFiles.length >= 15, apiFiles.length);
check('Production API health is green', apiBad === 0 && openCircuits === 0, { total: apiFiles.length, healthy: apiHealthy, bad: apiBad, openCircuits });

const systemHealth = validateReport('System Health', 'data/system-health.json');
validateReport('Data Integrity', 'data/data-integrity.json');
validateReport('System Hardening', 'data/system-hardening.json');
validateReport('Repository Security', 'data/security-audit.json');
const permissionAudit = validateReport('Discord Permission Audit', 'data/discord-permission-audit.json');
if (permissionAudit?.summary?.scopedHighRiskFindings > 0) {
  advisories.push(`${permissionAudit.summary.scopedHighRiskFindings} Discord scoped permission finding(s) are accepted advisory-only per Point 15.`);
}
check('Final System Health is HEALTHY with no issues', systemHealth?.status === 'HEALTHY' && Number(systemHealth?.summary?.criticalIssues || 0) === 0 && Number(systemHealth?.summary?.warnings || 0) === 0, { status: systemHealth?.status, critical: systemHealth?.summary?.criticalIssues, warnings: systemHealth?.summary?.warnings });

validateReport('API Resilience', 'output/api-resilience-final-report.json');
validateReport('Git/State Hardening', 'output/git-state-hardening-final-report.json');
validateReport('Weekly Reports', 'output/weekly-reports-verification.json');
validateReport('Monthly Report', 'output/monthly-report-verification.json');
const convoy = validateReport('Public Convoy Announcement', 'output/kings-convoy-announcement-verification.json');
if (convoy?.summary) {
  check('Convoy verifier has no missing due announcements or errors', Number(convoy.summary.missingInWindow || 0) === 0 && Number(convoy.summary.errors || 0) === 0, convoy.summary);
}

const backupCore = validateReport('Core Backup', 'backup-staging/backup-health.json');
const backupFinal = validateReport('Final Backup', 'backup-staging/backup-final-health.json');
const restore = validateReport('Backup Restore Roundtrip', 'backup-staging/backup-restore-verification.json');
if (restore?.summary) {
  check('Backup restore file count matches manifest', Number(restore.summary.manifestFiles) === Number(restore.summary.restoredFiles), restore.summary);
  check('Backup restore SHA-256 coverage is complete', Number(restore.summary.manifestFiles) === Number(restore.summary.checksumsVerified), restore.summary);
}
check('Backup layers are healthy', backupCore?.healthy === true && backupFinal?.healthy === true && restore?.healthy === true, { core: backupCore?.healthy, final: backupFinal?.healthy, restore: restore?.healthy });

const report = {
  version: 1,
  point: 17,
  checkedAt: new Date().toISOString(),
  mode: 'read-only-cross-system-end-to-end-verification',
  summary: {
    checks: checks.length,
    passed: checks.filter((item) => item.ok).length,
    failed: checks.filter((item) => !item.ok).length,
    apiServices: apiFiles.length,
    apiHealthy,
    openCircuits,
    activeAlerts: Object.keys(alerts.active || {}).length,
    pendingAlerts: Object.keys(alerts.pending || {}).length
  },
  timeBoundProductionProofs: {
    publicConvoyAnnouncement: 'Mechanism/readiness is verified here; Point 5 still requires the real in-window production post.',
    news: 'Dedupe/state/tests are verified here; Point 9 still requires the next real new-news production post.',
    weeklyHR: 'Verifier accepts the intentional partial-coverage deferral; Point 11 still requires the next complete HR production week.',
    monthly: 'Verifier accepts readiness before month close; Point 12 still requires the scheduled real monthly production publish.'
  },
  advisories,
  issues,
  checks,
  healthy: issues.length === 0
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('Kings Core End-to-End Verification — Point 17');
console.log(`Checks: ${report.summary.passed}/${report.summary.checks}`);
console.log(`Production APIs: ${apiHealthy}/${apiFiles.length} healthy; open circuits=${openCircuits}`);
console.log(`System Alerts: active=${report.summary.activeAlerts}; pending=${report.summary.pendingAlerts}`);
console.log(`Advisories: ${advisories.length}`);
console.log(`Issues: ${issues.length}`);
for (const item of advisories) console.log(`- ADVISORY: ${item}`);
for (const item of issues) console.error(`- ${item}`);

if (issues.length) process.exitCode = 1;
