'use strict';

const fs = require('fs');
const path = require('path');

const SAFE_WORKFLOWS = Object.freeze([
  // The Central Scheduler is technical orchestration only. Recovering it restores
  // the normal allowlisted operational cadences without teaching Monitoring to
  // directly run Convoy, HR, Staff, Management, or personnel workflows.
  Object.freeze({
    file: 'central-scheduler.yml',
    label: 'Central Scheduler',
    recoverAfterMinutes: 15,
    inputs: Object.freeze({ force_all: 'true' })
  }),
  Object.freeze({ file: 'driver-updates.yml', label: 'Driver Updates', recoverAfterMinutes: 20 }),
  Object.freeze({ file: 'live-tracker.yml', label: 'Live Tracker / Statistics', recoverAfterMinutes: 20 })
]);

const DEFAULT_WAIT_MS = 90_000;
const DEFAULT_POLL_MS = 5_000;
const RECENT_ACTIVE_MINUTES = 15;

function ageMinutes(timestamp, nowMs = Date.now()) {
  const parsed = Date.parse(timestamp || '');
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / 60_000);
}

function needsRecovery(lastSuccessAt, recoverAfterMinutes, nowMs = Date.now()) {
  return ageMinutes(lastSuccessAt, nowMs) > recoverAfterMinutes;
}

function isRecentActiveRun(run, nowMs = Date.now()) {
  if (!run || !['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.status)) return false;
  const timestamp = run.run_started_at || run.created_at;
  return ageMinutes(timestamp, nowMs) <= RECENT_ACTIVE_MINUTES;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function githubJson(repo, token, endpoint, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repo}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kings-logistics-workflow-recovery',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message = payload?.message || `GitHub API returned HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function getRuns(repo, token, file) {
  const encoded = encodeURIComponent(file);
  const data = await githubJson(repo, token, `/actions/workflows/${encoded}/runs?branch=main&per_page=30`);
  return Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
}

function latestSuccessfulRun(runs) {
  return runs.find((run) => run.status === 'completed' && run.conclusion === 'success') || null;
}

async function dispatchWorkflow(repo, token, config) {
  const encoded = encodeURIComponent(config.file);
  const body = { ref: 'main' };
  if (config.inputs) body.inputs = { ...config.inputs };

  await githubJson(repo, token, `/actions/workflows/${encoded}/dispatches`, {
    method: 'POST',
    body
  });
}

async function waitForFreshSuccess(repo, token, file, notBeforeMs, waitMs, pollMs) {
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    const runs = await getRuns(repo, token, file);
    const freshSuccess = runs.find((run) => {
      if (run.status !== 'completed' || run.conclusion !== 'success') return false;
      const created = Date.parse(run.created_at || run.run_started_at || '');
      return Number.isFinite(created) && created >= notBeforeMs - 10_000;
    });

    if (freshSuccess) return freshSuccess;

    const freshFailure = runs.find((run) => {
      if (run.status !== 'completed' || run.conclusion === 'success') return false;
      const created = Date.parse(run.created_at || run.run_started_at || '');
      return Number.isFinite(created) && created >= notBeforeMs - 10_000;
    });

    if (freshFailure) {
      throw new Error(`${file} recovery run completed with ${freshFailure.conclusion || 'unknown'}.`);
    }

    await sleep(pollMs);
  }

  return null;
}

async function recoverWorkflow(repo, token, config, waitMs, pollMs) {
  const checkedAt = new Date().toISOString();
  const initialRuns = await getRuns(repo, token, config.file);
  const latestSuccess = latestSuccessfulRun(initialRuns);
  const lastSuccessAt = latestSuccess?.updated_at || latestSuccess?.run_started_at || latestSuccess?.created_at || null;
  const age = ageMinutes(lastSuccessAt);

  if (!needsRecovery(lastSuccessAt, config.recoverAfterMinutes)) {
    return {
      file: config.file,
      label: config.label,
      checkedAt,
      action: 'none',
      status: 'fresh',
      lastSuccessAt,
      ageMinutes: Number.isFinite(age) ? Number(age.toFixed(2)) : null
    };
  }

  const activeRun = initialRuns.find((run) => isRecentActiveRun(run));
  let recoveryStartMs = activeRun
    ? Date.parse(activeRun.created_at || activeRun.run_started_at || '') - 10_000
    : Date.now();
  let action = 'wait-existing';

  if (!activeRun) {
    recoveryStartMs = Date.now();
    await dispatchWorkflow(repo, token, config);
    action = 'dispatched';
    console.log(`[RECOVERY] ${config.label}: dispatched safe workflow recovery.`);
  } else {
    console.log(`[RECOVERY] ${config.label}: a recent run is already ${activeRun.status}; waiting instead of dispatching a duplicate.`);
  }

  const recoveredRun = await waitForFreshSuccess(repo, token, config.file, recoveryStartMs, waitMs, pollMs);

  if (!recoveredRun) {
    return {
      file: config.file,
      label: config.label,
      checkedAt,
      action,
      status: 'pending-timeout',
      lastSuccessAt,
      ageMinutes: Number.isFinite(age) ? Number(age.toFixed(2)) : null
    };
  }

  return {
    file: config.file,
    label: config.label,
    checkedAt,
    action,
    status: 'recovered',
    lastSuccessAt: recoveredRun.updated_at || recoveredRun.run_started_at || recoveredRun.created_at || null,
    runId: recoveredRun.id || null,
    event: recoveredRun.event || null
  };
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const waitMs = parsePositiveInt(process.env.KINGS_RECOVERY_WAIT_MS, DEFAULT_WAIT_MS);
  const pollMs = parsePositiveInt(process.env.KINGS_RECOVERY_POLL_MS, DEFAULT_POLL_MS);

  if (!repo || !token) {
    console.log('Workflow recovery skipped: GITHUB_REPOSITORY or GITHUB_TOKEN is unavailable.');
    return;
  }

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    safety: {
      allowlistedWorkflows: SAFE_WORKFLOWS.map((item) => item.file),
      schedulerDispatchAllowed: true,
      convoyLiveDispatchAllowed: false,
      personnelWorkflowDispatchAllowed: false
    },
    results: []
  };

  const results = await Promise.all(SAFE_WORKFLOWS.map(async (config) => {
    try {
      return await recoverWorkflow(repo, token, config, waitMs, pollMs);
    } catch (error) {
      console.error(`[RECOVERY] ${config.label}: ${error.message}`);
      return {
        file: config.file,
        label: config.label,
        checkedAt: new Date().toISOString(),
        action: 'error',
        status: 'error',
        error: error.message,
        httpStatus: error.status || null
      };
    }
  }));

  report.results = results;
  fs.mkdirSync(path.join(process.cwd(), 'output'), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), 'output', 'workflow-recovery.json'),
    JSON.stringify(report, null, 2) + '\n',
    'utf8'
  );

  for (const result of results) {
    console.log(`[RECOVERY] ${result.label}: ${result.status} (${result.action}).`);
  }

  console.log('Safety: Monitoring may recover only the Central Scheduler, Driver Updates, and Live Tracker. Convoy live and personnel workflows are never dispatched directly by Monitoring.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Workflow recovery engine failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  SAFE_WORKFLOWS,
  ageMinutes,
  needsRecovery,
  isRecentActiveRun,
  parsePositiveInt
};
