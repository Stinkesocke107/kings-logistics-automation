const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'data-integrity.json');
const HEALTH_FILE = path.join(DATA_DIR, 'system-health.json');
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || null;

const SOURCES = {
  live: 'data/live-tracker-snapshot.json',
  driver: 'data/driver-management-summary.json',
  staff: 'data/staff-management-summary.json',
  achievements: 'data/driver-achievements-summary.json',
  milestones: 'data/milestones.json',
  statistics: 'data/statistics.json',
  driverHistory: 'data/driver-history.json'
};

function nowISO() {
  return new Date().toISOString();
}

function readJson(relativePath) {
  const file = path.join(ROOT, relativePath);
  if (!fs.existsSync(file)) return { exists: false, data: null, error: null };
  try {
    return { exists: true, data: JSON.parse(fs.readFileSync(file, 'utf8')), error: null };
  } catch (error) {
    return { exists: true, data: null, error: String(error.message || error) };
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 0;
}

function issue(id, severity, system, message, details = null) {
  return { id, severity, system, message, details };
}

function check(name, ok, details = null) {
  return { check: name, ok: Boolean(ok), details };
}

function severityRank(value) {
  return value === 'critical' ? 2 : value === 'warning' ? 1 : 0;
}

function statusFromIssues(issues) {
  const highest = issues.reduce((max, item) => Math.max(max, severityRank(item.severity)), 0);
  if (highest >= 2) return 'UNHEALTHY';
  if (highest === 1) return 'DEGRADED';
  return 'HEALTHY';
}

function addCountComparison({ checks, issues, id, label, baselineLabel, baseline, sourceLabel, source, warningTolerance = 2, criticalDifference = 10 }) {
  if (baseline === null || source === null) {
    checks.push(check(label, false, { reason: 'missing-numeric-value', baselineLabel, baseline, sourceLabel, source }));
    issues.push(issue(
      id,
      'warning',
      'Cross-System Integrity',
      `${label} could not be verified because one of the member totals is missing or invalid.`,
      { [baselineLabel]: baseline, [sourceLabel]: source }
    ));
    return;
  }

  const difference = Math.abs(baseline - source);
  const ok = difference <= warningTolerance;
  checks.push(check(label, ok, { [baselineLabel]: baseline, [sourceLabel]: source, difference, tolerance: warningTolerance }));
  if (!ok) {
    issues.push(issue(
      id,
      difference >= criticalDifference ? 'critical' : 'warning',
      'Cross-System Integrity',
      `${sourceLabel} member total (${source}) differs from ${baselineLabel} (${baseline}).`,
      { difference, tolerance: warningTolerance }
    ));
  }
}

function loadSources(issues, checks) {
  const loaded = {};
  for (const [key, relativePath] of Object.entries(SOURCES)) {
    const result = readJson(relativePath);
    if (!result.exists) {
      issues.push(issue(`integrity-source-missing:${key}`, 'critical', 'Data Integrity', `Required integrity source is missing: ${relativePath}`));
      checks.push(check(`source:${key}`, false, { file: relativePath, reason: 'missing' }));
      loaded[key] = null;
      continue;
    }
    if (result.error) {
      issues.push(issue(`integrity-source-invalid:${key}`, 'critical', 'Data Integrity', `Required integrity source is invalid JSON: ${relativePath}`, { error: result.error }));
      checks.push(check(`source:${key}`, false, { file: relativePath, reason: 'invalid-json' }));
      loaded[key] = null;
      continue;
    }
    checks.push(check(`source:${key}`, true, { file: relativePath }));
    loaded[key] = result.data;
  }
  return loaded;
}

function checkMemberConsensus(data, issues, checks) {
  const driverCount = number(data.driver?.currentDrivers);
  const liveCount = number(data.live?.members);
  const achievementCount = number(data.achievements?.currentDrivers);
  const achievementTracked = number(data.achievements?.trackedCurrentDrivers);
  const milestoneCount = number(data.milestones?.memberCountAtLastUpdate);
  const historyCount = number(data.driverHistory?.currentDrivers);
  const statsHistory = Array.isArray(data.statistics?.history) ? data.statistics.history : [];
  const latestStats = statsHistory.length ? statsHistory[statsHistory.length - 1] : null;
  const statsCount = number(latestStats?.members);

  const baseline = driverCount ?? liveCount;
  const baselineLabel = driverCount !== null ? 'Driver Management' : 'Live Tracker';

  addCountComparison({ checks, issues, id: 'driver-count-mismatch', label: 'Live Tracker vs Driver Management', baselineLabel, baseline, sourceLabel: 'Live Tracker', source: liveCount });
  addCountComparison({ checks, issues, id: 'integrity-achievement-driver-count', label: 'Achievements vs Driver Management', baselineLabel, baseline, sourceLabel: 'Driver Achievements', source: achievementCount });
  addCountComparison({ checks, issues, id: 'integrity-achievement-tracked-count', label: 'Achievement tracked drivers vs Driver Management', baselineLabel, baseline, sourceLabel: 'Achievement Tracked Drivers', source: achievementTracked });
  addCountComparison({ checks, issues, id: 'integrity-milestone-driver-count', label: 'Milestones vs Driver Management', baselineLabel, baseline, sourceLabel: 'Milestones', source: milestoneCount });
  addCountComparison({ checks, issues, id: 'integrity-history-driver-count', label: 'Driver History vs Driver Management', baselineLabel, baseline, sourceLabel: 'Driver History', source: historyCount });
  addCountComparison({ checks, issues, id: 'integrity-statistics-driver-count', label: 'Statistics vs Driver Management', baselineLabel, baseline, sourceLabel: 'Statistics', source: statsCount });
}

function checkLiveSnapshot(data, issues, checks) {
  const live = data.live;
  if (!live) return;

  const members = number(live.members);
  const online = number(live.online);
  const ets2 = number(live.ets2Online);
  const ats = number(live.atsOnline);
  const valuesValid = [members, online, ets2, ats].every((value) => value !== null && Number.isInteger(value) && value >= 0);
  checks.push(check('live-snapshot-numeric-values', valuesValid, { members, online, ets2, ats }));
  if (!valuesValid) {
    issues.push(issue('integrity-live-invalid-values', 'critical', 'Live Tracker', 'Live Tracker contains invalid or negative member/activity values.', { members, online, ets2, ats }));
    return;
  }

  const componentsMatch = ets2 + ats === online;
  checks.push(check('live-game-total', componentsMatch, { online, ets2, ats }));
  if (!componentsMatch) {
    issues.push(issue('integrity-live-game-total', 'critical', 'Live Tracker', `ETS2 + ATS online (${ets2 + ats}) does not equal total online (${online}).`, { ets2, ats, online }));
  }

  const plausible = online <= members && ets2 <= online && ats <= online;
  checks.push(check('live-online-plausibility', plausible, { members, online, ets2, ats }));
  if (!plausible) {
    issues.push(issue('integrity-live-online-plausibility', 'critical', 'Live Tracker', 'Live Tracker online counts exceed their parent totals.', { members, online, ets2, ats }));
  }
}

function checkDriverSummary(data, issues, checks) {
  const driver = data.driver;
  if (!driver) return;

  const currentDrivers = number(driver.currentDrivers);
  const activity = driver.activity || {};
  const bucketNames = ['grace', 'active', 'approvedLeave', 'info7Days', 'attention14Days', 'hrReview30Days', 'unknown'];
  const buckets = Object.fromEntries(bucketNames.map((name) => [name, number(activity[name]) ?? 0]));
  const allBucketsValid = bucketNames.every((name) => nonNegativeInteger(activity[name] ?? 0));
  const total = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  const ok = allBucketsValid && currentDrivers !== null && total === currentDrivers;

  checks.push(check('driver-activity-partition', ok, { currentDrivers, activityTotal: total, buckets }));
  if (!ok) {
    issues.push(issue('driver-activity-total-mismatch', 'critical', 'Driver Management', `Driver activity buckets total ${total}, but currentDrivers is ${currentDrivers}.`, { buckets }));
  }

  const onlineNow = number(driver.onlineNow);
  if (onlineNow !== null && currentDrivers !== null) {
    const onlinePlausible = Number.isInteger(onlineNow) && onlineNow >= 0 && onlineNow <= currentDrivers;
    checks.push(check('driver-online-plausibility', onlinePlausible, { onlineNow, currentDrivers }));
    if (!onlinePlausible) {
      issues.push(issue('integrity-driver-online-plausibility', 'critical', 'Driver Management', 'Driver Management onlineNow is outside the valid Driver range.', { onlineNow, currentDrivers }));
    }
  }
}

function checkAchievements(data, issues, checks) {
  const achievements = data.achievements;
  if (!achievements) return;

  const currentDrivers = number(achievements.currentDrivers);
  const trackedDrivers = number(achievements.trackedCurrentDrivers);
  const trackedMatches = currentDrivers !== null && trackedDrivers !== null && currentDrivers === trackedDrivers;
  checks.push(check('achievement-tracked-coverage', trackedMatches, { currentDrivers, trackedDrivers }));
  if (!trackedMatches) {
    issues.push(issue('integrity-achievement-coverage', 'warning', 'Driver Achievements', 'Achievement tracking does not cover exactly the current Driver cohort.', { currentDrivers, trackedDrivers }));
  }

  const order = ['1m', '3m', '6m', '1y', '2y', '3y', '4y', '5y'];
  const counts = achievements.counts || {};
  let validCounts = true;
  let monotonic = true;
  let previous = null;

  for (const key of order) {
    const value = number(counts[key]);
    if (value === null || !Number.isInteger(value) || value < 0 || (currentDrivers !== null && value > currentDrivers)) validCounts = false;
    if (previous !== null && value !== null && value > previous) monotonic = false;
    if (value !== null) previous = value;
  }

  checks.push(check('achievement-count-ranges', validCounts, { counts, currentDrivers }));
  checks.push(check('achievement-count-order', monotonic, { counts }));

  if (!validCounts) {
    issues.push(issue('integrity-achievement-counts', 'critical', 'Driver Achievements', 'Achievement counts contain an invalid value or exceed the current Driver total.', { counts, currentDrivers }));
  }
  if (!monotonic) {
    issues.push(issue('integrity-achievement-order', 'warning', 'Driver Achievements', 'Longer-tenure achievement counts exceed a shorter-tenure achievement count.', { counts }));
  }

  const upcoming = number(achievements.upcoming30Days);
  const upcomingValid = upcoming !== null && Number.isInteger(upcoming) && upcoming >= 0;
  checks.push(check('achievement-upcoming-range', upcomingValid, { upcoming30Days: upcoming }));
  if (!upcomingValid) {
    issues.push(issue('integrity-achievement-upcoming', 'warning', 'Driver Achievements', 'upcoming30Days is missing, negative, or non-integer.', { upcoming30Days: upcoming }));
  }
}

function checkStaffSummary(data, issues, checks) {
  const staff = data.staff;
  if (!staff) return;

  const currentStaff = number(staff.currentStaff);
  const trackedStaff = number(staff.trackedStaffRecords);
  const driverCount = number(data.driver?.currentDrivers) ?? number(data.live?.members);

  const trackedMatches = currentStaff !== null && trackedStaff !== null && currentStaff === trackedStaff;
  checks.push(check('staff-tracked-coverage', trackedMatches, { currentStaff, trackedStaff }));
  if (!trackedMatches) {
    issues.push(issue('integrity-staff-coverage', 'warning', 'Staff Management', 'Tracked Staff records do not equal the current Staff count.', { currentStaff, trackedStaff }));
  }

  const plausible = currentStaff !== null && Number.isInteger(currentStaff) && currentStaff >= 0 && (driverCount === null || currentStaff <= driverCount);
  checks.push(check('staff-count-plausibility', plausible, { currentStaff, driverCount }));
  if (!plausible) {
    issues.push(issue('staff-count-invalid', 'critical', 'Staff Management', `Staff count (${currentStaff}) is not plausible for the current Driver count (${driverCount}).`));
  }
}

function checkMilestones(data, issues, checks) {
  const milestones = data.milestones;
  if (!milestones) return;

  const count = number(milestones.memberCountAtLastUpdate);
  const countValid = count !== null && Number.isInteger(count) && count >= 0;
  checks.push(check('milestone-member-count', countValid, { memberCountAtLastUpdate: count }));
  if (!countValid) {
    issues.push(issue('integrity-milestone-member-count', 'critical', 'VTC Milestones', 'memberCountAtLastUpdate is invalid.', { memberCountAtLastUpdate: count }));
  }

  const reached = Array.isArray(milestones.reachedMilestones) ? milestones.reachedMilestones : null;
  const reachedValues = reached ? reached.map((value) => number(value)) : [];
  const validReached = Boolean(reached) && reachedValues.every((value) => value !== null && Number.isInteger(value) && value > 0);
  const uniqueReached = validReached && new Set(reachedValues).size === reachedValues.length;
  checks.push(check('milestone-history-format', validReached && uniqueReached, { reachedMilestones: reached }));
  if (!validReached || !uniqueReached) {
    issues.push(issue('integrity-milestone-history', 'warning', 'VTC Milestones', 'reachedMilestones is invalid or contains duplicates.', { reachedMilestones: reached }));
  }
}

function checkStatistics(data, issues, checks) {
  const statistics = data.statistics;
  if (!statistics) return;

  const history = Array.isArray(statistics.history) ? statistics.history : null;
  if (!history || !history.length) {
    checks.push(check('statistics-history-present', false));
    issues.push(issue('integrity-statistics-history-missing', 'critical', 'Statistics', 'Statistics history is missing or empty.'));
    return;
  }
  checks.push(check('statistics-history-present', true, { days: history.length }));

  const dates = history.map((entry) => String(entry?.date || ''));
  const validDates = dates.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  const uniqueDates = new Set(dates).size === dates.length;
  const sortedDates = dates.every((value, index) => index === 0 || value > dates[index - 1]);
  checks.push(check('statistics-date-series', validDates && uniqueDates && sortedDates, { validDates, uniqueDates, sortedDates }));
  if (!validDates || !uniqueDates || !sortedDates) {
    issues.push(issue('integrity-statistics-date-series', 'critical', 'Statistics', 'Statistics history dates are invalid, duplicated, or out of order.', { validDates, uniqueDates, sortedDates }));
  }

  let rowValuesValid = true;
  let continuityValid = true;
  let sampleStructureValid = true;
  let maxPeakOnline = 0;
  let maxPeakETS2 = 0;
  let maxPeakATS = 0;

  history.forEach((entry, index) => {
    const numericFields = ['startMembers', 'members', 'peakOnline', 'peakETS2', 'peakATS', 'activitySamples', 'ets2PlayerSamples', 'atsPlayerSamples'];
    if (!numericFields.every((field) => nonNegativeInteger(entry?.[field] ?? 0))) rowValuesValid = false;

    const peakOnline = number(entry?.peakOnline) ?? 0;
    const peakETS2 = number(entry?.peakETS2) ?? 0;
    const peakATS = number(entry?.peakATS) ?? 0;
    if (peakETS2 > peakOnline || peakATS > peakOnline) rowValuesValid = false;

    maxPeakOnline = Math.max(maxPeakOnline, peakOnline);
    maxPeakETS2 = Math.max(maxPeakETS2, peakETS2);
    maxPeakATS = Math.max(maxPeakATS, peakATS);

    if (index > 0) {
      const previousMembers = number(history[index - 1]?.members);
      const currentStart = number(entry?.startMembers);
      if (previousMembers !== null && currentStart !== null && previousMembers !== currentStart) continuityValid = false;
    }

    const sampledHours = Array.isArray(entry?.sampledHours) ? entry.sampledHours : [];
    const activitySamples = number(entry?.activitySamples) ?? 0;
    if (new Set(sampledHours).size !== sampledHours.length || activitySamples !== sampledHours.length || activitySamples > 24) sampleStructureValid = false;
  });

  checks.push(check('statistics-row-values', rowValuesValid));
  checks.push(check('statistics-member-continuity', continuityValid));
  checks.push(check('statistics-sample-structure', sampleStructureValid));

  if (!rowValuesValid) issues.push(issue('integrity-statistics-values', 'critical', 'Statistics', 'Statistics history contains invalid counts or impossible peak relationships.'));
  if (!continuityValid) issues.push(issue('integrity-statistics-continuity', 'warning', 'Statistics', 'A day startMembers value does not match the previous day members value.'));
  if (!sampleStructureValid) issues.push(issue('integrity-statistics-samples', 'warning', 'Statistics', 'Hourly sample tracking contains duplicates, a count mismatch, or more than 24 samples in a day.'));

  const allTime = statistics.allTime || {};
  const allTimeValid =
    nonNegativeInteger(allTime.peakOnline ?? 0) &&
    nonNegativeInteger(allTime.peakETS2 ?? 0) &&
    nonNegativeInteger(allTime.peakATS ?? 0) &&
    Number(allTime.peakOnline || 0) >= maxPeakOnline &&
    Number(allTime.peakETS2 || 0) >= maxPeakETS2 &&
    Number(allTime.peakATS || 0) >= maxPeakATS;
  checks.push(check('statistics-all-time-peaks', allTimeValid, { allTime, retainedHistoryMax: { peakOnline: maxPeakOnline, peakETS2: maxPeakETS2, peakATS: maxPeakATS } }));
  if (!allTimeValid) {
    issues.push(issue('integrity-statistics-all-time', 'critical', 'Statistics', 'All-time peaks are lower than a peak present in retained Statistics history.', { allTime, maxPeakOnline, maxPeakETS2, maxPeakATS }));
  }
}

function checkTimestamps(data, issues, checks) {
  const futureToleranceMs = 10 * 60 * 1000;
  const timestampFields = [
    ['Live Tracker', data.live?.updatedAt],
    ['Driver Management', data.driver?.updatedAt],
    ['Staff Management', data.staff?.updatedAt],
    ['Driver Achievements', data.achievements?.updatedAt],
    ['VTC Milestones', data.milestones?.updatedAt],
    ['Statistics', data.statistics?.updatedAt],
    ['Driver History', data.driverHistory?.updatedAt]
  ];

  for (const [label, value] of timestampFields) {
    if (!value) continue;
    const timestamp = new Date(value).getTime();
    const valid = Number.isFinite(timestamp) && timestamp <= Date.now() + futureToleranceMs;
    checks.push(check(`timestamp:${label}`, valid, { updatedAt: value }));
    if (!valid) {
      issues.push(issue(`integrity-future-timestamp:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 'warning', 'Data Integrity', `${label} has an invalid or future updatedAt timestamp.`, { updatedAt: value }));
    }
  }
}

function mergeIntoHealth(result) {
  const healthResult = readJson('data/system-health.json');
  if (!healthResult.exists || healthResult.error || !healthResult.data || typeof healthResult.data !== 'object') return false;

  const health = healthResult.data;
  const mergedById = new Map();
  for (const item of Array.isArray(health.issues) ? health.issues : []) {
    if (item?.id) mergedById.set(String(item.id), item);
  }
  for (const item of result.issues) {
    if (item?.id) mergedById.set(String(item.id), item);
  }

  health.issues = [...mergedById.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || String(a.system || '').localeCompare(String(b.system || '')));
  health.status = statusFromIssues(health.issues);
  health.healthy = health.status === 'HEALTHY';
  health.summary = health.summary && typeof health.summary === 'object' ? health.summary : {};
  health.summary.deepIntegrityChecks = result.summary.checks;
  health.summary.deepIntegrityHealthy = result.summary.healthyChecks;
  health.summary.criticalIssues = health.issues.filter((item) => item.severity === 'critical').length;
  health.summary.warnings = health.issues.filter((item) => item.severity === 'warning').length;
  health.data = health.data && typeof health.data === 'object' ? health.data : {};
  health.data.deepIntegrity = {
    checkedAt: result.checkedAt,
    status: result.status,
    summary: result.summary,
    checks: result.checks
  };
  health.note = 'Read-only technical monitoring. Kings Systems only observes and reports health/integrity; it never performs personnel, member, role, permission, kick, ban, promotion, demotion, or disciplinary actions.';

  writeJson(HEALTH_FILE, health);
  return true;
}

function writeStepSummary(result, merged) {
  if (!STEP_SUMMARY) return;
  const icon = result.status === 'HEALTHY' ? '✅' : result.status === 'DEGRADED' ? '⚠️' : '❌';
  const lines = [
    '',
    '## 🩺 Kings Data Integrity / Cross-System Checks',
    '',
    `${icon} **Status: ${result.status}**`,
    '',
    `- Checks: **${result.summary.checks}**`,
    `- Healthy: **${result.summary.healthyChecks}**`,
    `- Critical findings: **${result.summary.criticalIssues}**`,
    `- Warnings: **${result.summary.warnings}**`,
    `- Merged into System Health: **${merged ? 'Yes' : 'No'}**`,
    ''
  ];

  if (result.issues.length) {
    lines.push('### Integrity Findings', '');
    for (const finding of result.issues.slice(0, 25)) {
      const marker = finding.severity === 'critical' ? '❌' : '⚠️';
      lines.push(`- ${marker} **${finding.system}:** ${finding.message}`);
    }
  } else {
    lines.push('All deep cross-system integrity checks passed.');
  }

  lines.push('', 'Safety: read-only checks only. No Driver, Staff, HR, Discord role, permission, membership, kick, ban, promotion, demotion, or disciplinary action is performed.', '');
  fs.appendFileSync(STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

function runChecks() {
  const issues = [];
  const checks = [];
  const data = loadSources(issues, checks);

  checkMemberConsensus(data, issues, checks);
  checkLiveSnapshot(data, issues, checks);
  checkDriverSummary(data, issues, checks);
  checkAchievements(data, issues, checks);
  checkStaffSummary(data, issues, checks);
  checkMilestones(data, issues, checks);
  checkStatistics(data, issues, checks);
  checkTimestamps(data, issues, checks);

  const result = {
    version: 1,
    mode: 'read-only-cross-system-integrity',
    checkedAt: nowISO(),
    status: statusFromIssues(issues),
    healthy: issues.length === 0,
    summary: {
      checks: checks.length,
      healthyChecks: checks.filter((item) => item.ok).length,
      failedChecks: checks.filter((item) => !item.ok).length,
      criticalIssues: issues.filter((item) => item.severity === 'critical').length,
      warnings: issues.filter((item) => item.severity === 'warning').length
    },
    issues,
    checks,
    sources: Object.values(SOURCES),
    note: 'Read-only technical integrity checks. No personnel, member, role, permission, kick, ban, promotion, demotion, or disciplinary actions are performed.'
  };

  writeJson(OUTPUT_FILE, result);
  const merged = mergeIntoHealth(result);
  writeStepSummary(result, merged);

  console.log('===========================================');
  console.log('Kings Data Integrity / Cross-System Checks');
  console.log('===========================================');
  console.log(`Status: ${result.status}`);
  console.log(`Checks: ${result.summary.healthyChecks}/${result.summary.checks} healthy`);
  console.log(`Critical findings: ${result.summary.criticalIssues}`);
  console.log(`Warnings: ${result.summary.warnings}`);
  console.log(`Merged into System Health: ${merged ? 'yes' : 'no'}`);
  for (const finding of issues) {
    console.log(`[${finding.severity.toUpperCase()}] ${finding.system}: ${finding.message}`);
  }
  console.log('Safety: read-only integrity checks; no personnel or Discord role actions.');

  return result;
}

function main() {
  try {
    runChecks();
  } catch (error) {
    const failure = {
      version: 1,
      mode: 'read-only-cross-system-integrity',
      checkedAt: nowISO(),
      status: 'UNHEALTHY',
      healthy: false,
      summary: { checks: 0, healthyChecks: 0, failedChecks: 1, criticalIssues: 1, warnings: 0 },
      issues: [issue('data-integrity-engine-failed', 'critical', 'Data Integrity', `Data Integrity engine failed: ${String(error.message || error)}`)],
      checks: [],
      sources: Object.values(SOURCES),
      note: 'Read-only technical integrity engine failure. No personnel or Discord role actions were performed.'
    };
    try { writeJson(OUTPUT_FILE, failure); } catch {}
    const merged = mergeIntoHealth(failure);
    try { writeStepSummary(failure, merged); } catch {}
    console.error('Kings Data Integrity engine failed:', error);
    console.log(`Failure merged into System Health: ${merged ? 'yes' : 'no'}`);
  }
}

main();
