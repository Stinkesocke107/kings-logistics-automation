const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'system-health.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'Stinkesocke107/kings-logistics-automation';
const GITHUB_API = 'https://api.github.com';
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || null;

const WORKFLOWS = [
  { file: 'live-tracker.yml', label: 'Live Tracker / Statistics', maxAgeMinutes: 30, severity: 'critical' },
  { file: 'driver-updates.yml', label: 'Driver Updates', maxAgeMinutes: 30, severity: 'critical' },
  { file: 'convoy-checker.yml', label: 'Convoy / Event System', maxAgeMinutes: 45, severity: 'critical' },
  { file: 'driver-management.yml', label: 'Driver Management', maxAgeMinutes: 150, severity: 'critical' },
  { file: 'hr-leadership.yml', label: 'HR Leadership', maxAgeMinutes: 45, severity: 'critical' },
  { file: 'staff-management.yml', label: 'Staff Management', maxAgeMinutes: 150, severity: 'critical' },
  { file: 'management-overview.yml', label: 'Management Overview', maxAgeMinutes: 45, severity: 'warning' },
  { file: 'milestones.yml', label: 'VTC Milestones', maxAgeMinutes: 30, severity: 'warning' },
  { file: 'driver-achievements.yml', label: 'Driver Achievements', maxAgeMinutes: 2160, severity: 'warning' },
  { file: 'driver-weekly-summary.yml', label: 'Driver Weekly Summary', maxAgeMinutes: 12000, severity: 'warning', optionalUntilFirstRun: true },
  { file: 'hr-weekly-summary.yml', label: 'HR Weekly Summary', maxAgeMinutes: 12000, severity: 'warning', optionalUntilFirstRun: true },
  { file: 'management-weekly-overview.yml', label: 'Management Weekly Overview', maxAgeMinutes: 12000, severity: 'warning', optionalUntilFirstRun: true },
  { file: 'monthly-report.yml', label: 'Monthly Report', maxAgeMinutes: 50400, severity: 'warning', optionalUntilFirstRun: true },
  { file: 'core-backup.yml', label: 'Core Backup', maxAgeMinutes: 2160, severity: 'critical' }
];

const CRITICAL_FILES = [
  'tracker.js',
  'statistics.js',
  'driver-updates.js',
  'driver-management.js',
  'driver-loa.js',
  'driver-status-alerts.js',
  'staff-management.js',
  'management-overview.js',
  'milestones.js',
  'driver-achievements.js',
  'core-backup.js',
  'core-recovery.js',
  'system-monitoring.js',
  '.github/workflows/live-tracker.yml',
  '.github/workflows/driver-updates.yml',
  '.github/workflows/convoy-checker.yml',
  '.github/workflows/driver-management.yml',
  '.github/workflows/hr-leadership.yml',
  '.github/workflows/staff-management.yml',
  '.github/workflows/management-overview.yml',
  '.github/workflows/core-backup.yml',
  '.github/workflows/core-recovery.yml',
  '.github/workflows/system-monitoring.yml'
];

const ENCRYPTED_STATE_FILES = [
  'data/driver-members.json',
  'data/driver-management.json',
  'data/driver-loa.json',
  'data/hr-probation.json',
  'data/driver-achievements.json',
  'data/staff-management.json'
];

const FRESH_DATA = [
  { file: 'data/live-tracker-snapshot.json', label: 'Live Tracker data', maxAgeMinutes: 25, severity: 'critical' },
  { file: 'data/statistics.json', label: 'Statistics data', maxAgeMinutes: 35, severity: 'critical' },
  { file: 'data/driver-management-summary.json', label: 'Driver Management data', maxAgeMinutes: 160, severity: 'critical' },
  { file: 'data/staff-management-summary.json', label: 'Staff Management data', maxAgeMinutes: 180, severity: 'warning' },
  { file: 'data/driver-achievements-summary.json', label: 'Driver Achievement data', maxAgeMinutes: 2400, severity: 'warning' }
];

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

function ageMinutes(value) {
  if (!value) return Infinity;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}

function severityRank(value) {
  return value === 'critical' ? 2 : value === 'warning' ? 1 : 0;
}

function issue(id, severity, system, message, details = null) {
  return { id, severity, system, message, details };
}

function workflowPath(file) {
  return path.join(ROOT, '.github', 'workflows', file);
}

async function githubJson(pathname) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is missing.');
  const response = await fetch(`${GITHUB_API}${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Kings Logistics System Monitoring/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function checkCriticalFiles(issues) {
  let present = 0;
  const missing = [];
  for (const relativePath of CRITICAL_FILES) {
    if (fs.existsSync(path.join(ROOT, relativePath))) present++;
    else missing.push(relativePath);
  }
  if (missing.length) {
    issues.push(issue(
      'critical-files-missing',
      'critical',
      'Repository Core',
      `${missing.length} critical Kings system file(s) are missing.`,
      missing
    ));
  }
  return { expected: CRITICAL_FILES.length, present, missing };
}

function checkJsonFiles(issues) {
  if (!fs.existsSync(DATA_DIR)) {
    issues.push(issue('data-directory-missing', 'critical', 'Data Integrity', 'The data directory is missing.'));
    return { checked: 0, valid: 0, invalid: [] };
  }

  const files = fs.readdirSync(DATA_DIR).filter((name) => name.toLowerCase().endsWith('.json'));
  const invalid = [];
  for (const name of files) {
    try {
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
    } catch (error) {
      invalid.push({ file: `data/${name}`, error: String(error.message || error) });
    }
  }
  if (invalid.length) {
    issues.push(issue(
      'invalid-json',
      'critical',
      'Data Integrity',
      `${invalid.length} JSON data file(s) are invalid.`,
      invalid.map((item) => item.file)
    ));
  }
  return { checked: files.length, valid: files.length - invalid.length, invalid };
}

function checkEncryptedStates(issues) {
  const checked = [];
  for (const relativePath of ENCRYPTED_STATE_FILES) {
    const result = readJson(relativePath);
    if (!result.exists) {
      issues.push(issue(
        `encrypted-state-missing:${relativePath}`,
        'critical',
        'Privacy / State',
        `Sensitive state file is missing: ${relativePath}`
      ));
      checked.push({ file: relativePath, ok: false, reason: 'missing' });
      continue;
    }
    if (result.error) {
      checked.push({ file: relativePath, ok: false, reason: 'invalid-json' });
      continue;
    }
    const ok = result.data?.encrypted === true && result.data?.algorithm === 'aes-256-gcm';
    if (!ok) {
      issues.push(issue(
        `encrypted-state-format:${relativePath}`,
        'critical',
        'Privacy / State',
        `Sensitive state is not in the expected encrypted format: ${relativePath}`
      ));
    }
    checked.push({ file: relativePath, ok, reason: ok ? null : 'unexpected-format' });
  }
  return checked;
}

function checkFreshData(issues) {
  const results = [];
  for (const config of FRESH_DATA) {
    const result = readJson(config.file);
    if (!result.exists) {
      issues.push(issue(`fresh-data-missing:${config.file}`, config.severity, config.label, `${config.file} is missing.`));
      results.push({ ...config, ok: false, ageMinutes: null, updatedAt: null });
      continue;
    }
    if (result.error) {
      results.push({ ...config, ok: false, ageMinutes: null, updatedAt: null });
      continue;
    }
    const updatedAt = result.data?.updatedAt || result.data?.checkedAt || null;
    const age = ageMinutes(updatedAt);
    const ok = Number.isFinite(age) && age <= config.maxAgeMinutes;
    if (!ok) {
      issues.push(issue(
        `stale-data:${config.file}`,
        config.severity,
        config.label,
        `${config.label} is stale or has no valid updatedAt timestamp.`,
        { updatedAt, ageMinutes: Number.isFinite(age) ? age : null, maxAgeMinutes: config.maxAgeMinutes }
      ));
    }
    results.push({ file: config.file, label: config.label, ok, updatedAt, ageMinutes: Number.isFinite(age) ? age : null, maxAgeMinutes: config.maxAgeMinutes });
  }
  return results;
}

function checkCrossSystemIntegrity(issues) {
  const live = readJson('data/live-tracker-snapshot.json').data;
  const driver = readJson('data/driver-management-summary.json').data;
  const staff = readJson('data/staff-management-summary.json').data;
  const checks = [];

  if (live && driver) {
    const liveMembers = Number(live.members);
    const driverMembers = Number(driver.currentDrivers);
    if (Number.isFinite(liveMembers) && Number.isFinite(driverMembers)) {
      const difference = Math.abs(liveMembers - driverMembers);
      const ok = difference <= 2;
      if (!ok) {
        issues.push(issue(
          'driver-count-mismatch',
          difference >= 10 ? 'critical' : 'warning',
          'Cross-System Integrity',
          `Driver totals differ between Live Tracker (${liveMembers}) and Driver Management (${driverMembers}).`,
          { difference }
        ));
      }
      checks.push({ check: 'driver-count-consistency', ok, liveMembers, driverMembers, difference });
    }
  }

  if (driver?.activity && Number.isFinite(Number(driver.currentDrivers))) {
    const activity = driver.activity;
    const activityTotal = [
      activity.grace,
      activity.active,
      activity.approvedLeave,
      activity.info7Days,
      activity.attention14Days,
      activity.hrReview30Days,
      activity.unknown
    ].reduce((sum, value) => sum + (Number(value) || 0), 0);
    const currentDrivers = Number(driver.currentDrivers);
    const ok = activityTotal === currentDrivers;
    if (!ok) {
      issues.push(issue(
        'driver-activity-total-mismatch',
        'critical',
        'Driver Management',
        `Driver activity buckets total ${activityTotal}, but currentDrivers is ${currentDrivers}.`
      ));
    }
    checks.push({ check: 'driver-activity-total', ok, activityTotal, currentDrivers });
  }

  if (staff && live) {
    const currentStaff = Number(staff.currentStaff);
    const members = Number(live.members);
    const ok = Number.isFinite(currentStaff) && Number.isFinite(members) && currentStaff >= 0 && currentStaff <= members;
    if (!ok) {
      issues.push(issue(
        'staff-count-invalid',
        'critical',
        'Staff Management',
        `Staff count (${staff.currentStaff}) is not plausible for the current VTC member count (${live.members}).`
      ));
    }
    checks.push({ check: 'staff-count-plausibility', ok, currentStaff, members });
  }

  return checks;
}

async function checkWorkflow(config, issues) {
  const localPath = workflowPath(config.file);
  if (!fs.existsSync(localPath)) {
    issues.push(issue(
      `workflow-file-missing:${config.file}`,
      config.severity,
      config.label,
      `Workflow file is missing: .github/workflows/${config.file}`
    ));
    return { ...config, exists: false, ok: false, latestRun: null };
  }

  const encodedFile = encodeURIComponent(config.file);
  const data = await githubJson(`/repos/${GITHUB_REPOSITORY}/actions/workflows/${encodedFile}/runs?branch=main&per_page=10`);
  const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];

  if (!runs.length) {
    if (!config.optionalUntilFirstRun) {
      issues.push(issue(
        `workflow-no-runs:${config.file}`,
        config.severity,
        config.label,
        `${config.label} has no workflow runs.`
      ));
    }
    return { ...config, exists: true, ok: Boolean(config.optionalUntilFirstRun), latestRun: null, noRunsYet: true };
  }

  const latest = runs[0];
  const latestCompleted = runs.find((run) => run.status === 'completed') || null;
  const activityAt = latest.run_started_at || latest.created_at || latest.updated_at;
  const age = ageMinutes(activityAt);
  let ok = true;
  const reasons = [];

  if (!Number.isFinite(age) || age > config.maxAgeMinutes) {
    ok = false;
    reasons.push('overdue');
    issues.push(issue(
      `workflow-overdue:${config.file}`,
      config.severity,
      config.label,
      `${config.label} has not run within the expected time window.`,
      { latestActivityAt: activityAt || null, ageMinutes: Number.isFinite(age) ? age : null, maxAgeMinutes: config.maxAgeMinutes }
    ));
  }

  const latestIsRunning = ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(String(latest.status));
  if (!latestIsRunning && latestCompleted && latestCompleted.conclusion !== 'success') {
    ok = false;
    reasons.push(`latest-completed-${latestCompleted.conclusion || 'unknown'}`);
    issues.push(issue(
      `workflow-failed:${config.file}`,
      config.severity,
      config.label,
      `${config.label} latest completed run ended with ${latestCompleted.conclusion || 'unknown'}.`,
      { runId: latestCompleted.id, completedAt: latestCompleted.updated_at || null }
    ));
  }

  return {
    file: config.file,
    label: config.label,
    exists: true,
    ok,
    maxAgeMinutes: config.maxAgeMinutes,
    ageMinutes: Number.isFinite(age) ? age : null,
    reasons,
    latestRun: {
      id: latest.id,
      event: latest.event,
      status: latest.status,
      conclusion: latest.conclusion,
      createdAt: latest.created_at,
      startedAt: latest.run_started_at,
      updatedAt: latest.updated_at
    },
    latestCompleted: latestCompleted ? {
      id: latestCompleted.id,
      conclusion: latestCompleted.conclusion,
      updatedAt: latestCompleted.updated_at
    } : null
  };
}

async function checkWorkflows(issues) {
  if (!GITHUB_TOKEN) {
    issues.push(issue('github-token-missing', 'critical', 'Monitoring Engine', 'GITHUB_TOKEN is missing; workflow monitoring cannot run.'));
    return [];
  }

  const results = [];
  for (const config of WORKFLOWS) {
    try {
      results.push(await checkWorkflow(config, issues));
    } catch (error) {
      issues.push(issue(
        `workflow-api-error:${config.file}`,
        'warning',
        'Monitoring Engine',
        `Could not inspect ${config.label}: ${String(error.message || error)}`
      ));
      results.push({ file: config.file, label: config.label, exists: fs.existsSync(workflowPath(config.file)), ok: false, apiError: true });
    }
  }
  return results;
}

function buildStatus(issues) {
  const highest = issues.reduce((max, item) => Math.max(max, severityRank(item.severity)), 0);
  if (highest >= 2) return 'UNHEALTHY';
  if (highest === 1) return 'DEGRADED';
  return 'HEALTHY';
}

function writeStepSummary(result) {
  if (!STEP_SUMMARY) return;
  const icon = result.status === 'HEALTHY' ? '✅' : result.status === 'DEGRADED' ? '⚠️' : '❌';
  const lines = [
    '## 👑 Kings System Monitoring',
    '',
    `${icon} **Status: ${result.status}**`,
    '',
    `- Workflows checked: **${result.summary.workflowsChecked}**`,
    `- JSON files valid: **${result.summary.validJsonFiles}/${result.summary.jsonFilesChecked}**`,
    `- Critical files present: **${result.summary.criticalFilesPresent}/${result.summary.criticalFilesExpected}**`,
    `- Critical issues: **${result.summary.criticalIssues}**`,
    `- Warnings: **${result.summary.warnings}**`,
    ''
  ];

  if (result.issues.length) {
    lines.push('### Current Findings', '');
    for (const finding of result.issues.slice(0, 25)) {
      const marker = finding.severity === 'critical' ? '❌' : '⚠️';
      lines.push(`- ${marker} **${finding.system}:** ${finding.message}`);
    }
  } else {
    lines.push('No current health findings.');
  }

  lines.push('', 'Monitoring is read-only. It does not change members, roles, permissions, or personnel status.', '');
  fs.appendFileSync(STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  console.log('=================================');
  console.log('Kings System Monitoring');
  console.log('=================================');

  const issues = [];
  const criticalFiles = checkCriticalFiles(issues);
  const json = checkJsonFiles(issues);
  const encryptedStates = checkEncryptedStates(issues);
  const freshData = checkFreshData(issues);
  const integrity = checkCrossSystemIntegrity(issues);
  const workflows = await checkWorkflows(issues);

  issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.system.localeCompare(b.system));

  const status = buildStatus(issues);
  const result = {
    version: 1,
    mode: 'read-only-monitoring',
    checkedAt: nowISO(),
    status,
    healthy: status === 'HEALTHY',
    summary: {
      workflowsChecked: workflows.length,
      workflowsHealthy: workflows.filter((item) => item.ok).length,
      jsonFilesChecked: json.checked,
      validJsonFiles: json.valid,
      criticalFilesExpected: criticalFiles.expected,
      criticalFilesPresent: criticalFiles.present,
      encryptedStatesChecked: encryptedStates.length,
      encryptedStatesHealthy: encryptedStates.filter((item) => item.ok).length,
      freshDataChecks: freshData.length,
      freshDataHealthy: freshData.filter((item) => item.ok).length,
      integrityChecks: integrity.length,
      integrityHealthy: integrity.filter((item) => item.ok).length,
      criticalIssues: issues.filter((item) => item.severity === 'critical').length,
      warnings: issues.filter((item) => item.severity === 'warning').length
    },
    issues,
    workflows,
    data: {
      freshness: freshData,
      integrity,
      encryptedStates
    },
    repository: {
      criticalFiles
    },
    note: 'Read-only monitoring. Kings Systems only observes and reports technical health; it never performs personnel, member, role, permission, kick, ban, or disciplinary actions.'
  };

  writeJson(OUTPUT_FILE, result);
  writeStepSummary(result);

  console.log(`System status: ${status}`);
  console.log(`Workflows checked: ${result.summary.workflowsChecked}`);
  console.log(`Workflow health: ${result.summary.workflowsHealthy}/${result.summary.workflowsChecked}`);
  console.log(`JSON health: ${result.summary.validJsonFiles}/${result.summary.jsonFilesChecked}`);
  console.log(`Critical files: ${result.summary.criticalFilesPresent}/${result.summary.criticalFilesExpected}`);
  console.log(`Critical issues: ${result.summary.criticalIssues}`);
  console.log(`Warnings: ${result.summary.warnings}`);

  for (const finding of issues) {
    console.log(`[${finding.severity.toUpperCase()}] ${finding.system}: ${finding.message}`);
  }

  console.log('Safety: monitoring is read-only and performs no personnel or Discord role actions.');
}

main().catch((error) => {
  console.error('Kings System Monitoring engine failed:', error);
  process.exit(1);
});
