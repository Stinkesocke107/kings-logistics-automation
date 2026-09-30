'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEFAULT_STATE_FILE = path.join(ROOT, 'data', 'self-healing-state.json');
const DEFAULT_REPORT_FILE = path.join(ROOT, 'output', 'self-healing.json');
const DEFAULT_WAIT_MS = 90_000;
const DEFAULT_POLL_MS = 5_000;
const RECENT_ACTIVE_MINUTES = 15;
const HISTORY_RETENTION_HOURS = 24;

const SAFE_REPAIRS = Object.freeze([
  Object.freeze({
    id: 'live-tracker',
    label: 'Live Tracker / Statistics',
    workflow: 'live-tracker.yml',
    triggerIssueIds: Object.freeze([
      'workflow-overdue:live-tracker.yml',
      'workflow-failed:live-tracker.yml',
      'stale-data:data/live-tracker-snapshot.json',
      'stale-data:data/statistics.json'
    ]),
    cooldownMinutes: 15,
    attemptWindowMinutes: 120,
    maxAttemptsPerWindow: 2,
    inputs: null
  }),
  Object.freeze({
    id: 'driver-updates',
    label: 'Driver Updates',
    workflow: 'driver-updates.yml',
    triggerIssueIds: Object.freeze([
      'workflow-overdue:driver-updates.yml',
      'workflow-failed:driver-updates.yml'
    ]),
    cooldownMinutes: 15,
    attemptWindowMinutes: 120,
    maxAttemptsPerWindow: 2,
    inputs: null
  }),
  Object.freeze({
    id: 'core-backup',
    label: 'Core Backup',
    workflow: 'core-backup.yml',
    triggerIssueIds: Object.freeze([
      'workflow-overdue:core-backup.yml',
      'workflow-failed:core-backup.yml'
    ]),
    cooldownMinutes: 60,
    attemptWindowMinutes: 360,
    maxAttemptsPerWindow: 2,
    inputs: Object.freeze({ backup_type: 'normal', restore_point_name: '' })
  })
]);

const FORBIDDEN_WORKFLOW_PATTERN = /convoy|hr|staff|management|probation|achievement|milestone|changelog|monthly|weekly|recovery|self-healing/i;

function nowISO(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ageMinutes(timestamp, nowMs = Date.now()) {
  const parsed = Date.parse(timestamp || '');
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / 60_000);
}

function isRecentActiveRun(run, nowMs = Date.now()) {
  if (!run || !['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.status)) return false;
  const timestamp = run.run_started_at || run.created_at;
  return ageMinutes(timestamp, nowMs) <= RECENT_ACTIVE_MINUTES;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path.relative(ROOT, file)}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function emptyState() {
  return {
    version: 1,
    mode: 'technical-safe-self-healing',
    updatedAt: null,
    repairs: {}
  };
}

function normalizeAttempt(item) {
  if (!item || typeof item !== 'object') return null;
  const at = String(item.at || '');
  if (!Number.isFinite(Date.parse(at))) return null;
  return {
    at,
    outcome: String(item.outcome || 'unknown'),
    action: String(item.action || 'unknown'),
    runId: item.runId ?? null,
    issueIds: Array.isArray(item.issueIds) ? item.issueIds.map(String) : []
  };
}

function normalizeState(value, nowMs = Date.now()) {
  const state = emptyState();
  if (!value || typeof value !== 'object') return state;

  const cutoffMs = nowMs - HISTORY_RETENTION_HOURS * 60 * 60 * 1000;
  const repairs = value.repairs && typeof value.repairs === 'object' ? value.repairs : {};

  for (const config of SAFE_REPAIRS) {
    const previous = repairs[config.id] && typeof repairs[config.id] === 'object' ? repairs[config.id] : {};
    const attempts = (Array.isArray(previous.attempts) ? previous.attempts : [])
      .map(normalizeAttempt)
      .filter(Boolean)
      .filter((item) => Date.parse(item.at) >= cutoffMs)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    state.repairs[config.id] = {
      attempts,
      lastAttemptAt: attempts.length ? attempts[attempts.length - 1].at : null,
      lastSuccessAt: previous.lastSuccessAt || null,
      lastFailureAt: previous.lastFailureAt || null
    };
  }

  state.updatedAt = value.updatedAt || null;
  return state;
}

function issueIdsFromHealth(health) {
  return (Array.isArray(health?.issues) ? health.issues : [])
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean);
}

function repairForIssue(issueId) {
  return SAFE_REPAIRS.find((config) => config.triggerIssueIds.includes(issueId)) || null;
}

function attemptBudget(config, state, nowMs = Date.now()) {
  const repairState = state?.repairs?.[config.id] || { attempts: [] };
  const attempts = Array.isArray(repairState.attempts) ? repairState.attempts : [];
  const windowStart = nowMs - config.attemptWindowMinutes * 60_000;
  const attemptsInWindow = attempts.filter((item) => Date.parse(item.at || '') >= windowStart);
  const lastAttemptAt = repairState.lastAttemptAt || (attempts.length ? attempts[attempts.length - 1].at : null);
  const cooldownRemainingMinutes = lastAttemptAt
    ? Math.max(0, config.cooldownMinutes - ageMinutes(lastAttemptAt, nowMs))
    : 0;

  if (cooldownRemainingMinutes > 0) {
    return {
      allowed: false,
      reason: 'cooldown',
      attemptsInWindow: attemptsInWindow.length,
      maxAttemptsPerWindow: config.maxAttemptsPerWindow,
      cooldownRemainingMinutes: Number(cooldownRemainingMinutes.toFixed(2))
    };
  }

  if (attemptsInWindow.length >= config.maxAttemptsPerWindow) {
    return {
      allowed: false,
      reason: 'attempt-budget-exhausted',
      attemptsInWindow: attemptsInWindow.length,
      maxAttemptsPerWindow: config.maxAttemptsPerWindow,
      cooldownRemainingMinutes: 0
    };
  }

  return {
    allowed: true,
    reason: null,
    attemptsInWindow: attemptsInWindow.length,
    maxAttemptsPerWindow: config.maxAttemptsPerWindow,
    cooldownRemainingMinutes: 0
  };
}

function planRepairs(health, state, nowMs = Date.now()) {
  const currentIssueIds = issueIdsFromHealth(health);
  const plans = [];
  const suppressed = [];

  for (const config of SAFE_REPAIRS) {
    const triggerIssueIds = currentIssueIds.filter((id) => config.triggerIssueIds.includes(id));
    if (!triggerIssueIds.length) continue;

    const budget = attemptBudget(config, state, nowMs);
    const item = {
      id: config.id,
      label: config.label,
      workflow: config.workflow,
      triggerIssueIds,
      budget
    };

    if (budget.allowed) plans.push(item);
    else suppressed.push(item);
  }

  const repairableIds = new Set(SAFE_REPAIRS.flatMap((config) => config.triggerIssueIds));
  const unresolvedUnsafe = (Array.isArray(health?.issues) ? health.issues : [])
    .filter((item) => item?.id && !repairableIds.has(String(item.id)))
    .map((item) => ({
      id: String(item.id),
      severity: item.severity === 'critical' ? 'critical' : 'warning',
      system: String(item.system || 'Kings System'),
      message: String(item.message || 'Technical issue requires review.')
    }));

  return { plans, suppressed, unresolvedUnsafe, currentIssueIds };
}

function recordAttempt(state, config, result, issueIds, nowMs = Date.now()) {
  const normalized = normalizeState(state, nowMs);
  if (!normalized.repairs[config.id]) normalized.repairs[config.id] = { attempts: [], lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null };

  const at = nowISO(nowMs);
  const attempt = {
    at,
    outcome: String(result.status || 'unknown'),
    action: String(result.action || 'unknown'),
    runId: result.runId ?? null,
    issueIds: Array.isArray(issueIds) ? issueIds.map(String) : []
  };

  normalized.repairs[config.id].attempts.push(attempt);
  normalized.repairs[config.id].lastAttemptAt = at;

  if (result.status === 'recovered') normalized.repairs[config.id].lastSuccessAt = at;
  else normalized.repairs[config.id].lastFailureAt = at;

  normalized.updatedAt = at;
  return normalizeState(normalized, nowMs);
}

async function githubJson(repo, token, endpoint, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repo}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kings-logistics-self-healing',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(20_000)
  });

  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `GitHub API returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function getRuns(repo, token, workflow) {
  const encoded = encodeURIComponent(workflow);
  const data = await githubJson(repo, token, `/actions/workflows/${encoded}/runs?branch=main&per_page=10`);
  return Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
}

async function dispatchWorkflow(repo, token, config) {
  if (FORBIDDEN_WORKFLOW_PATTERN.test(config.workflow)) {
    throw new Error(`Safety guard blocked non-allowlisted workflow dispatch: ${config.workflow}`);
  }
  if (!SAFE_REPAIRS.some((item) => item.workflow === config.workflow)) {
    throw new Error(`Safety guard blocked unknown workflow dispatch: ${config.workflow}`);
  }

  const encoded = encodeURIComponent(config.workflow);
  const body = { ref: 'main' };
  if (config.inputs) body.inputs = config.inputs;
  await githubJson(repo, token, `/actions/workflows/${encoded}/dispatches`, { method: 'POST', body });
}

async function waitForResult(repo, token, workflow, notBeforeMs, waitMs, pollMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const runs = await getRuns(repo, token, workflow);
    const relevant = runs.filter((run) => {
      const created = Date.parse(run.created_at || run.run_started_at || '');
      return Number.isFinite(created) && created >= notBeforeMs - 10_000;
    });

    const success = relevant.find((run) => run.status === 'completed' && run.conclusion === 'success');
    if (success) return { status: 'recovered', run: success };

    const failure = relevant.find((run) => run.status === 'completed' && run.conclusion !== 'success');
    if (failure) return { status: 'failed', run: failure };

    await sleep(pollMs);
  }
  return { status: 'pending-timeout', run: null };
}

async function executeRepair(repo, token, config, waitMs, pollMs) {
  const runs = await getRuns(repo, token, config.workflow);
  const active = runs.find((run) => isRecentActiveRun(run));
  let action = 'wait-existing';
  let notBeforeMs = Date.now();

  if (active) {
    const created = Date.parse(active.created_at || active.run_started_at || '');
    if (Number.isFinite(created)) notBeforeMs = created;
    console.log(`[SELF-HEAL] ${config.label}: recent run already ${active.status}; waiting instead of dispatching a duplicate.`);
  } else {
    await dispatchWorkflow(repo, token, config);
    action = 'dispatched';
    console.log(`[SELF-HEAL] ${config.label}: dispatched safe repair workflow ${config.workflow}.`);
  }

  const waited = await waitForResult(repo, token, config.workflow, notBeforeMs, waitMs, pollMs);
  return {
    id: config.id,
    label: config.label,
    workflow: config.workflow,
    action,
    status: waited.status,
    runId: waited.run?.id || null,
    conclusion: waited.run?.conclusion || null,
    completedAt: waited.run?.updated_at || null
  };
}

async function runHealingCycle({ health, state, nowMs = Date.now(), execute = null }) {
  const normalizedState = normalizeState(state, nowMs);
  const plan = planRepairs(health, normalizedState, nowMs);
  let nextState = normalizedState;
  const results = [];

  for (const planned of plan.plans) {
    const config = SAFE_REPAIRS.find((item) => item.id === planned.id);
    if (!config) continue;

    let result;
    try {
      result = execute
        ? await execute(config, planned)
        : { id: config.id, label: config.label, workflow: config.workflow, action: 'not-executed', status: 'error', error: 'No executor supplied.' };
    } catch (error) {
      result = {
        id: config.id,
        label: config.label,
        workflow: config.workflow,
        action: 'error',
        status: 'error',
        error: String(error.message || error),
        httpStatus: error.status || null
      };
    }

    results.push({ ...result, triggerIssueIds: planned.triggerIssueIds });
    nextState = recordAttempt(nextState, config, result, planned.triggerIssueIds, Date.now());
  }

  const hasFailedRepair = results.some((item) => item.status !== 'recovered');
  const hasCriticalUnsafe = plan.unresolvedUnsafe.some((item) => item.severity === 'critical');
  const hasSuppressed = plan.suppressed.length > 0;
  const status = hasFailedRepair || hasCriticalUnsafe || hasSuppressed
    ? 'escalation-required'
    : results.length
      ? 'repairs-completed'
      : health?.status === 'HEALTHY'
        ? 'healthy-no-action'
        : 'no-safe-repair-available';

  return { status, plan, results, state: nextState };
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GITHUB_TOKEN || '';
  const healthFile = path.resolve(process.env.KINGS_SELF_HEAL_HEALTH_FILE || path.join(ROOT, 'data', 'system-health.json'));
  const stateFile = path.resolve(process.env.KINGS_SELF_HEAL_STATE_FILE || DEFAULT_STATE_FILE);
  const reportFile = path.resolve(process.env.KINGS_SELF_HEAL_REPORT_FILE || DEFAULT_REPORT_FILE);
  const waitMs = parsePositiveInt(process.env.KINGS_SELF_HEAL_WAIT_MS, DEFAULT_WAIT_MS);
  const pollMs = parsePositiveInt(process.env.KINGS_SELF_HEAL_POLL_MS, DEFAULT_POLL_MS);

  const health = readJson(healthFile, null);
  if (!health) throw new Error(`${path.relative(ROOT, healthFile)} is missing. Run system-monitoring.js first.`);

  const state = normalizeState(readJson(stateFile, null));
  const canExecute = Boolean(repo && token);

  const cycle = await runHealingCycle({
    health,
    state,
    execute: canExecute
      ? (config) => executeRepair(repo, token, config, waitMs, pollMs)
      : null
  });

  const report = {
    version: 1,
    point: 21,
    generatedAt: new Date().toISOString(),
    mode: 'technical-safe-self-healing',
    initialHealth: {
      status: health.status || 'UNKNOWN',
      criticalIssues: Number(health.summary?.criticalIssues || 0),
      warnings: Number(health.summary?.warnings || 0),
      issueIds: issueIdsFromHealth(health)
    },
    safety: {
      allowlistedWorkflows: SAFE_REPAIRS.map((item) => item.workflow),
      forbiddenPattern: FORBIDDEN_WORKFLOW_PATTERN.source,
      convoyLiveDispatchAllowed: false,
      personnelWorkflowDispatchAllowed: false,
      discordMutationAllowed: false,
      roleOrMemberMutationAllowed: false,
      automaticRestoreAllowed: false,
      forcePushAllowed: false
    },
    planning: {
      planned: cycle.plan.plans,
      suppressed: cycle.plan.suppressed,
      unsafeOrManualOnlyIssues: cycle.plan.unresolvedUnsafe
    },
    results: cycle.results,
    status: cycle.status
  };

  writeJson(stateFile, cycle.state);
  writeJson(reportFile, report);

  console.log('Kings Self-Healing — Point 21');
  console.log(`Initial health: ${report.initialHealth.status}; Critical=${report.initialHealth.criticalIssues}; Warnings=${report.initialHealth.warnings}`);
  console.log(`Planned safe repairs: ${cycle.plan.plans.length}`);
  console.log(`Suppressed by safety budget/cooldown: ${cycle.plan.suppressed.length}`);
  console.log(`Manual-only/unrepairable issues: ${cycle.plan.unresolvedUnsafe.length}`);
  for (const result of cycle.results) {
    console.log(`[SELF-HEAL] ${result.label}: ${result.status} (${result.action})${result.runId ? ` run=${result.runId}` : ''}`);
  }
  console.log(`Self-Healing status: ${cycle.status}`);
  console.log('Safety: only Live Tracker, Driver Updates and normal Core Backup may be dispatched. No Convoy live, HR, Staff, Management, personnel, Discord role/member, restore or force-push actions are permitted.');

  if (!canExecute && cycle.plan.plans.length) {
    console.error('Safe repairs were required but GITHUB_REPOSITORY/GITHUB_TOKEN is unavailable.');
    process.exitCode = 1;
  } else if (['escalation-required', 'no-safe-repair-available'].includes(cycle.status) && health.status !== 'HEALTHY') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Kings Self-Healing failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  SAFE_REPAIRS,
  FORBIDDEN_WORKFLOW_PATTERN,
  ageMinutes,
  isRecentActiveRun,
  parsePositiveInt,
  emptyState,
  normalizeState,
  issueIdsFromHealth,
  repairForIssue,
  attemptBudget,
  planRepairs,
  recordAttempt,
  runHealingCycle
};
