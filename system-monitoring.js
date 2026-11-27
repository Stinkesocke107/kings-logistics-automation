const fs = require('fs');
const path = require('path');
const { resilientFetchJson } = require('./api-resilience');
const { operationalReadinessFromIssues } = require('./system-health-readiness');
const {assessDailyUtcSchedule} = require('./scheduled-cadence-health');
const { isOperationalWorkflowRun } = require('./workflow-run-classifier');
const {ageMinutes, isFreshAge} = require('./monitoring-time');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'system-health.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'Stinkesocke107/kings-logistics-automation';
const GITHUB_API = 'https://api.github.com';
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || null;

const {WORKFLOW_REGISTRY, SCHEDULED_WORKFLOWS, ON_DEMAND_WORKFLOWS} = require('./kings-workflow-registry');
// All routinely scheduled Kings systems are monitored, not just the original
// central-core shortlist. Manual and push-only tools are checked for presence
// but intentionally never classified as stale because they have no live clock.
const WORKFLOWS = SCHEDULED_WORKFLOWS;

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
  'api-resilience.js',
  'kings-branding.js',
  '.github/workflows/central-scheduler.yml',
  '.github/workflows/live-tracker.yml',
  '.github/workflows/driver-updates.yml',
  '.github/workflows/convoy-checker.yml',
  '.github/workflows/driver-management.yml',
  '.github/workflows/hr-leadership.yml',
  '.github/workflows/staff-management.yml',
  '.github/workflows/leadership-dashboard.yml',
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
  // Legacy Achievement publisher is no longer scheduled. Live health depends
  // on the active private Kings joining-date Loyalty audit instead.
  { file: 'data/driver-loyalty-roles-summary.json', label: 'Driver Loyalty register data', maxAgeMinutes: 2400, severity: 'warning' }
];

function checkConvoyCompleteness(issues) {
  const file = 'data/convoy-completeness-state.json';
  const result = readJson(file);
  if (!result.exists) return { ok: null, reason: 'awaiting-first-healthy-live-snapshot' };
  if (result.error || !result.data || !Number.isFinite(Number(result.data.actualConvoys))) {
    issues.push(issue('convoy-completeness-invalid', 'critical', 'Convoy Completeness', 'The last healthy convoy snapshot is unreadable or invalid.'));
    return { ok: false, reason: 'invalid-snapshot' };
  }
  const age = ageMinutes(result.data.updatedAt);
  if (!isFreshAge(age, 45)) {
    issues.push(issue('convoy-completeness-stale', 'critical', 'Convoy Completeness', 'No healthy convoy snapshot in the last 45 minutes.', { ageMinutes: age, latestCount: result.data.actualConvoys }));
    return { ok: false, reason: 'stale', ageMinutes: age };
  }
  return { ok: true, ageMinutes: age, latestCount: result.data.actualConvoys };
}

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

  return resilientFetchJson(`${GITHUB_API}${pathname}`, {
    label: 'GitHub Actions API',
    retries: 3,
    timeoutMs: 15000,
    fetchOptions: {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Kings Logistics System Monitoring/1.0'
      }
    }
  });
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

function checkFreshData(issues, workflows = []) {
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
    const staffWorkflow = config.file === 'data/staff-management-summary.json'
      ? workflows.find((item) => item.file === 'staff-management.yml') : null;
    const workflowHeartbeat = Boolean(staffWorkflow?.ok);
    // A healthy Staff workflow may substitute for a missing summary timestamp,
    // but an explicitly future-dated summary must never be accepted as fresh.
    const futureTimestamp = Number.isFinite(age) && age < -5;
    const ok = !futureTimestamp && (workflowHeartbeat || isFreshAge(age, config.maxAgeMinutes));
    if (!ok) {
      issues.push(issue(
        `stale-data:${config.file}`,
        config.severity,
        config.label,
        `${config.label} is stale or has no valid updatedAt timestamp.`,
        { updatedAt, ageMinutes: Number.isFinite(age) ? age : null, maxAgeMinutes: config.maxAgeMinutes }
      ));
    }
    results.push({ file: config.file, label: config.label, ok, updatedAt, freshnessBasis: workflowHeartbeat ? 'staff-management-workflow' : 'data-timestamp', ageMinutes: Number.isFinite(age) ? age : null, maxAgeMinutes: config.maxAgeMinutes });
  }
  return results;
}

function checkApiHealth(issues) {
  const directory = path.join(DATA_DIR, 'api-health');

  if (!fs.existsSync(directory)) {
    return {
      initialized: false,
      services: [],
      healthy: 0,
      degraded: 0,
      down: 0,
      invalid: 0
    };
  }

  const files = fs.readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort();

  const services = [];
  let healthy = 0;
  let degraded = 0;
  let down = 0;
  let invalid = 0;

  for (const name of files) {
    const relativePath = `data/api-health/${name}`;
    const file = path.join(directory, name);
    let data;

    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      invalid += 1;
      issues.push(issue(
        `api-health-invalid:${name}`,
        'critical',
        'API Resilience',
        `API health state is invalid JSON: ${relativePath}`,
        { error: String(error.message || error) }
      ));
      services.push({ file: relativePath, service: name.replace(/\.json$/i, ''), status: 'invalid' });
      continue;
    }

    const service = String(data?.service || name.replace(/\.json$/i, '')).trim();
    const status = String(data?.status || 'unknown').toLowerCase();
    const details = {
      service,
      consecutiveFailures: Number(data?.consecutiveFailures || 0),
      lastSuccessAt: data?.lastSuccessAt || null,
      lastFailureAt: data?.lastFailureAt || null,
      circuitOpenUntil: data?.circuitOpenUntil || null,
      lastError: data?.lastError || null
    };

    if (status === 'healthy') {
      healthy += 1;
    } else if (status === 'degraded') {
      degraded += 1;
      issues.push(issue(
        `api-health:${service}`,
        'warning',
        'API Resilience',
        `${service} is degraded after repeated request failures.`,
        details
      ));
    } else if (status === 'down') {
      down += 1;
      issues.push(issue(
        `api-health:${service}`,
        'critical',
        'API Resilience',
        `${service} is down or its circuit breaker is open.`,
        details
      ));
    } else {
      degraded += 1;
      issues.push(issue(
        `api-health:${service}`,
        'warning',
        'API Resilience',
        `${service} has an unknown API health state.`,
        details
      ));
    }

    services.push({
      file: relativePath,
      service,
      status,
      consecutiveFailures: details.consecutiveFailures,
      lastSuccessAt: details.lastSuccessAt,
      lastFailureAt: details.lastFailureAt,
      circuitOpenUntil: details.circuitOpenUntil
    });
  }

  return {
    initialized: files.length > 0,
    services,
    healthy,
    degraded,
    down,
    invalid
  };
}

// A map-free Tracker has its OWN fresh, officially sourced aggregate data.
// It must never be promoted into a verified Kings player-presence feed.
// The legacy player-map snapshot remains historical and is checked separately.
function checkOfficialTrackerSource(delivery,now=Date.now()){
  let configured=false,autoMode=false;
  try{
    const workflow=fs.readFileSync(
      path.join(ROOT,'.github/workflows/live-tracker.yml'),'utf8');
    autoMode=/KINGS_TRACKER_SOURCE_MODE:\s*'auto'/.test(workflow);
    configured=autoMode||/KINGS_TRACKER_SOURCE_MODE:\s*'official'/.test(workflow);
  }catch{
    return {mode:'unknown',status:'not-verified'};
  }
  if(!configured)return {mode:'map',status:'not-applicable'};
  const recent=timestamp=>{
    const ms=Date.parse(timestamp||'');
    return Number.isFinite(ms)&&ms>0&&
      ms<=now+5*60000&&now-ms<=25*60000;
  };
  const mapLabels=['Live Tracker','Advanced Statistics','Central Overview'];
  const delivered=delivery?.allDisplaysVerified===true&&
    Array.isArray(delivery.displaysVerified)&&
    mapLabels.every(label=>delivery.displaysVerified.includes(label));
  if(autoMode&&delivery?.mode==='verified-live'){
    // Recovery canary is NOT sufficient: actual full Tracker, Statistics and
    // Overview must share one recent, proven generation before map is green.
    const snapshot=readJson('data/live-tracker-snapshot.json').data;
    const statistics=readJson('data/statistics.json').data;
    const online=Number.isSafeInteger(snapshot?.online)&&snapshot.online>=0;
    const games=Number.isSafeInteger(snapshot?.ets2Online)&&snapshot.ets2Online>=0&&
      Number.isSafeInteger(snapshot?.atsOnline)&&snapshot.atsOnline>=0;
    const verified=delivery.source==='verified-map'&&
      delivery.livePlayerCountsAvailable===true&&delivered&&
      recent(delivery.checkedAt)&&recent(snapshot?.updatedAt)&&
      delivery.sourceSnapshotAt===snapshot?.updatedAt&&
      statistics?.sourceSnapshotAt===snapshot?.updatedAt&&
      online&&games&&snapshot.online===snapshot.ets2Online+snapshot.atsOnline;
    return verified?
      {mode:'map-live',status:'verified',source:'verified-map',
       updatedAt:snapshot.updatedAt,kingsOnline:snapshot.online}:
      {mode:'map-live',status:'not-verified'};
  }
  const state=readJson('data/live-tracker-official.json');
  const value=state.data;
  const ms=Date.parse(value?.updatedAt||'');
  const checked=Date.parse(delivery?.checkedAt||'');
  const fresh=ts=>Number.isFinite(ts)&&ts>0&&
    ts<=now+5*60000&&now-ts<=25*60000;
  const labels=['Live Tracker','Advanced Statistics','Central Overview'];
  const fullLabels=delivery?.allDisplaysVerified===true&&
    Array.isArray(delivery.displaysVerified)&&
    labels.every(label=>delivery.displaysVerified.includes(label));
  const memberOk=Number.isSafeInteger(value?.vtcMemberCount)&&
    value.vtcMemberCount>=0&&value.vtcMemberCount<=20000;
  const totalsPresent=value?.allTruckersMpPlayers!==null;
  const totalsOk=totalsPresent?
    Number.isSafeInteger(value?.allTruckersMpPlayers)&&
    Number.isSafeInteger(value?.ets2AllPlayers)&&
    Number.isSafeInteger(value?.atsAllPlayers)&&
    Number.isSafeInteger(value?.activeTruckersMpServers)&&
    value.ets2AllPlayers>=0&&value.atsAllPlayers>=0&&
    value.allTruckersMpPlayers===value.ets2AllPlayers+value.atsAllPlayers&&
    value.activeTruckersMpServers>=0:
    value?.ets2AllPlayers===null&&value?.atsAllPlayers===null&&
    value?.activeTruckersMpServers===null;
  const source=totalsPresent?'official-vtc-and-servers':'official-vtc-only';
  const ok=!state.error&&state.exists&&value?.version===1&&
    value.source==='truckersmp-official-v2'&&
    value.sourceMode==='map-independent'&&value.kingsOnline===null&&
    memberOk&&totalsOk&&fresh(ms)&&fresh(checked)&&
    Math.abs(checked-ms)<=25*60000&&fullLabels&&
    delivery.mode==='fallback-delivered'&&delivery.source===source&&
    delivery.livePlayerCountsAvailable===false;
  return ok?{
    mode:'map-independent',status:'verified',source,
    updatedAt:value.updatedAt,vtcMemberCount:value.vtcMemberCount,
    allTruckersMpPlayers:value.allTruckersMpPlayers,kingsOnline:null
  }:{mode:'map-independent',status:'not-verified'};
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

async function wasCancelledBeforeExecution(run) {
  if (!run?.id || run.conclusion === 'success') return false;

  try {
    const data = await githubJson(`/repos/${GITHUB_REPOSITORY}/actions/runs/${run.id}/jobs?per_page=100`);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    if (!jobs.length) return false;

    return jobs.every((job) => {
      const steps = Array.isArray(job.steps) ? job.steps : [];
      return job.conclusion === 'cancelled' && steps.length === 0;
    });
  } catch (error) {
    console.warn(
      `Could not classify workflow run ${run.id} as pre-execution cancellation: ${String(error.message || error)}`
    );
    return false;
  }
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
  const data = await githubJson(`/repos/${GITHUB_REPOSITORY}/actions/workflows/${encodedFile}/runs?branch=main&per_page=30`);
  const allRuns = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
  // A successful but severely delayed daily cron must not be reported as
  // punctual solely because the workflow's last-success freshness is green.
  // Also check the actual expected UTC slot, never count manual/push runs
  // as a scheduled delivery. No catch-up jobs or Discord posts are launched.
  const scheduleCadence = config.dailyUtcSchedule
    ? assessDailyUtcSchedule(allRuns, config.dailyUtcSchedule)
    : null;
  if (scheduleCadence && scheduleCadence.status !== 'on-time') {
    const missing = scheduleCadence.status === 'missing';
    issues.push(issue(
      `workflow-schedule-${missing ? 'missing' : 'late'}:${config.file}`,
      'warning',
      config.label,
      missing
        ? `${config.label} did not deliver the expected daily scheduled run within the grace period.`
        : `${config.label} scheduled run started ${scheduleCadence.delayMinutes} minutes after its UTC slot.`,
      scheduleCadence
    ));
  }
  // Count genuine full-production push runs for the three protected
  // personnel producers too: a successful post-fix main push must supersede
  // an older failed manual run. All CI-only push events and Convoy dry-runs
  // remain excluded by the fail-closed, file-specific classifier.
  const runs = allRuns.filter((run) => isOperationalWorkflowRun(run, config.file));

  if (!runs.length) {
    if (!config.optionalUntilFirstRun) {
      issues.push(issue(
        `workflow-no-runs:${config.file}`,
        config.severity,
        config.label,
        `${config.label} has no workflow runs.`
      ));
    }
    return { ...config, exists: true, ok: Boolean(config.optionalUntilFirstRun) && (!scheduleCadence || scheduleCadence.status === 'on-time'), latestRun: null, noRunsYet: true, scheduleCadence };
  }

  const latest = runs[0];
  const latestCompleted = runs.find((run) => run.status === 'completed') || null;
  const latestSuccess = runs.find((run) => run.status === 'completed' && run.conclusion === 'success');
  const activeStatuses = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);
  const latestActive = runs.find((run) => activeStatuses.has(run.status)) || null;
  const latestCompletedAt = latestCompleted
    ? new Date(latestCompleted.updated_at || latestCompleted.run_started_at || latestCompleted.created_at || 0).getTime()
    : 0;
  const latestActiveAt = latestActive
    ? new Date(latestActive.run_started_at || latestActive.created_at || 0).getTime()
    : 0;
  const activeAge = latestActive
    ? ageMinutes(latestActive.run_started_at || latestActive.created_at)
    : Number.POSITIVE_INFINITY;
  const activeGraceMinutes = Number.isFinite(Number(config.activeGraceMinutes))
    ? Number(config.activeGraceMinutes)
    : 20;
  const recentActiveRun = Boolean(
    latestActive &&
    isFreshAge(activeAge, activeGraceMinutes)
  );
  const newerRecoveryActive = Boolean(
    latestCompleted &&
    latestCompleted.conclusion !== 'success' &&
    latestActive &&
    Number.isFinite(latestActiveAt) &&
    latestActiveAt > latestCompletedAt
  );

  const benignPreExecutionCancellation = latestCompleted
    ? await wasCancelledBeforeExecution(latestCompleted)
    : false;

  const activityAt = latestSuccess?.updated_at || latestSuccess?.run_started_at || latestSuccess?.created_at;
  const age = ageMinutes(activityAt);
  const cancelledWithFreshSuccess = Boolean(
    latestCompleted?.conclusion === 'cancelled' &&
    isFreshAge(age, config.maxAgeMinutes)
  );
  let ok = !scheduleCadence || scheduleCadence.status === 'on-time';
  const reasons = [];
  if (scheduleCadence && scheduleCadence.status !== 'on-time') {
    reasons.push('schedule-' + scheduleCadence.status);
  }

  if (!isFreshAge(age, config.maxAgeMinutes)) {
    if (recentActiveRun) {
      reasons.push('active-run-in-progress');
    } else {
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
  }

  if (latestCompleted && latestCompleted.conclusion !== 'success') {
    if (newerRecoveryActive) {
      reasons.push('recovery-in-progress');
    } else if (cancelledWithFreshSuccess) {
      reasons.push('cancelled-but-fresh-success-exists');
    } else if (benignPreExecutionCancellation) {
      reasons.push('superseded-before-execution');
    } else {
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
  }

  return {
    file: config.file,
    label: config.label,
    area: config.area,
    mode: config.mode,
    exists: true,
    ok,
    maxAgeMinutes: config.maxAgeMinutes,
    ageMinutes: Number.isFinite(age) ? age : null,
    reasons,
    scheduleCadence,
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
    } : null,
    latestActive: latestActive ? {
      id: latestActive.id,
      status: latestActive.status,
      createdAt: latestActive.created_at,
      startedAt: latestActive.run_started_at || null,
      ageMinutes: Number.isFinite(activeAge) ? activeAge : null,
      withinGrace: recentActiveRun
    } : null,
    recoveryInProgress: newerRecoveryActive || recentActiveRun,
    benignPreExecutionCancellation
  };
}

function checkWorkflowRegistryCoverage(issues) {
  const workflowDir = path.join(ROOT, '.github', 'workflows');
  const registered = new Set(WORKFLOW_REGISTRY.map(item => item.file));
  const present = fs.existsSync(workflowDir)
    ? fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/i.test(name))
    : [];
  const unregistered = present.filter(file => !registered.has(file));
  const missing = WORKFLOW_REGISTRY.filter(item => !present.includes(item.file)).map(item => item.file);
  for (const file of unregistered) {
    issues.push(issue('workflow-unregistered:' + file, 'warning', 'Workflow Registry',
      'A Kings workflow is not classified for monitoring: ' + file));
  }
  // Scheduled-file absence is already reported by checkWorkflow; do not count
  // the same problem twice, but do track manual/push-only tool disappearance.
  for (const file of missing) {
    if (ON_DEMAND_WORKFLOWS.some(item => item.file === file)) {
      issues.push(issue('workflow-tool-missing:' + file, 'warning', 'Workflow Registry',
        'On-demand Kings workflow is missing: ' + file));
    }
  }
  return {
    registered: WORKFLOW_REGISTRY.length,
    scheduled: SCHEDULED_WORKFLOWS.length,
    onDemand: ON_DEMAND_WORKFLOWS.length,
    onChange: ON_DEMAND_WORKFLOWS.filter(item => item.mode === 'on-change').length,
    manual: ON_DEMAND_WORKFLOWS.filter(item => item.mode === 'manual').length,
    present: present.length,
    missing,
    unregistered,
    complete: missing.length === 0 && unregistered.length === 0
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
      results.push({ file: config.file, label: config.label, area: config.area, mode: config.mode, exists: fs.existsSync(workflowPath(config.file)), ok: false, apiError: true });
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
    `- API services healthy: **${result.summary.apiServicesHealthy}/${result.summary.apiServicesChecked}** · Degraded: **${result.summary.apiServicesDegraded}** · Down: **${result.summary.apiServicesDown}**`,
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
  const workflowRegistry = checkWorkflowRegistryCoverage(issues);
  const workflows = await checkWorkflows(issues);
  const freshData = checkFreshData(issues, workflows);
  const integrity = checkCrossSystemIntegrity(issues);
  const convoyCompleteness = checkConvoyCompleteness(issues);
  // Run API-health inspection after workflow API calls so the monitoring engine's
  // own GitHub API health state is included in this same health report.
  const apiHealth = checkApiHealth(issues);
  // Optional operational evidence, authored only by Kings Live Systems.
  // Do not upgrade full-live source freshness or readiness based on fallback.
  const liveDeliveryResult = readJson('data/live-systems-delivery.json');
  const liveDelivery = liveDeliveryResult.exists && !liveDeliveryResult.error
    ? liveDeliveryResult.data : null;
  const officialTracker=checkOfficialTrackerSource(liveDelivery);

  issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.system.localeCompare(b.system));

  const status = buildStatus(issues);
  // Global status retains ALL alerts; readiness excludes only historic
  // Final-Freeze self-reference to permit a new verification attempt.
  const operationalReadiness = operationalReadinessFromIssues(issues);
  const result = {
    version: 1,
    mode: 'read-only-monitoring',
    checkedAt: nowISO(),
    status,
    healthy: status === 'HEALTHY',
    operationalReadiness,
    summary: {
      workflowsRegistered: workflowRegistry.registered,
      workflowsScheduled: workflowRegistry.scheduled,
      workflowsOnDemand: workflowRegistry.onDemand,
      workflowRegistryComplete: workflowRegistry.complete,
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
      apiServicesChecked: apiHealth.services.length,
      apiServicesHealthy: apiHealth.healthy,
      apiServicesDegraded: apiHealth.degraded,
      apiServicesDown: apiHealth.down,
      convoyCompletenessHealthy: convoyCompleteness.ok,
      integrityChecks: integrity.length,
      integrityHealthy: integrity.filter((item) => item.ok).length,
      criticalIssues: issues.filter((item) => item.severity === 'critical').length,
      warnings: issues.filter((item) => item.severity === 'warning').length
    },
    issues,
    workflows,
    workflowRegistry,
    data: {
      freshness: freshData,
      apiHealth,
      liveDelivery,
      officialTracker,
      integrity,
      convoyCompleteness,
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
  console.log(`Workflow registry: ${workflowRegistry.registered} total, ${workflowRegistry.scheduled} scheduled, ${workflowRegistry.onDemand} on-demand, ${workflowRegistry.unregistered.length} unclassified`);
  console.log(`Workflows checked: ${result.summary.workflowsChecked}`);
  console.log(`Workflow health: ${result.summary.workflowsHealthy}/${result.summary.workflowsChecked}`);
  console.log(`JSON health: ${result.summary.validJsonFiles}/${result.summary.jsonFilesChecked}`);
  console.log(`Critical files: ${result.summary.criticalFilesPresent}/${result.summary.criticalFilesExpected}`);
  console.log(`API services: ${result.summary.apiServicesHealthy}/${result.summary.apiServicesChecked} healthy, ${result.summary.apiServicesDegraded} degraded, ${result.summary.apiServicesDown} down`);
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
