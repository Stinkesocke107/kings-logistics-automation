'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const assert = require('assert');

const ROOT = __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kings-self-healing-stress-'));
process.env.KINGS_API_HEALTH_DIR = path.join(TMP, 'api-health');
process.env.KINGS_API_HEALTH_NAMESPACE = 'stress';

const { resilientFetchJson } = require('./api-resilience');
const {
  SAFE_REPAIRS,
  emptyState,
  planRepairs,
  recordAttempt,
  attemptBudget,
  runHealingCycle
} = require('./self-healing');
const { recoverStateText, verifyRecoveryLock } = require('./self-healing-state-guard');
const { needsRecovery, isRecentActiveRun } = require('./workflow-recovery');

const OUTPUT = path.join(ROOT, 'output', 'self-healing-stress.json');
const scenarios = [];

function health(status, issues = []) {
  return {
    status,
    summary: {
      criticalIssues: issues.filter((x) => x.severity === 'critical').length,
      warnings: issues.filter((x) => x.severity !== 'critical').length
    },
    issues
  };
}

async function scenario(name, fn) {
  const startedAt = new Date().toISOString();
  const logs = [];
  try {
    const details = await fn(logs);
    scenarios.push({ name, status: 'PASS', startedAt, completedAt: new Date().toISOString(), logs, details: details || null });
  } catch (error) {
    scenarios.push({ name, status: 'FAIL', startedAt, completedAt: new Date().toISOString(), logs, error: String(error.stack || error.message || error) });
  }
}

function createServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function serverUrl(server, pathname) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}${pathname}`;
}

async function main() {
  await scenario('workflow retry after failed attempt', async (logs) => {
    const config = SAFE_REPAIRS.find((x) => x.id === 'driver-updates');
    const t0 = Date.parse('2026-10-01T12:00:00Z');
    let state = emptyState();
    state = recordAttempt(state, config, { status: 'failed', action: 'dispatched', runId: 1 }, ['workflow-failed:driver-updates.yml'], t0);
    logs.push('first attempt recorded as failed');
    assert.equal(attemptBudget(config, state, t0 + 5 * 60_000).allowed, false);
    const later = attemptBudget(config, state, t0 + 16 * 60_000);
    assert.equal(later.allowed, true);
    state = recordAttempt(state, config, { status: 'recovered', action: 'dispatched', runId: 2 }, ['workflow-failed:driver-updates.yml'], t0 + 16 * 60_000);
    assert.equal(state.repairs['driver-updates'].lastSuccessAt, new Date(t0 + 16 * 60_000).toISOString());
    logs.push('retry allowed only after cooldown and recorded recovered');
    return { firstBlockedByCooldown: true, retryRecovered: true };
  });

  await scenario('API HTTP 503 recovery', async (logs) => {
    let calls = 0;
    const server = await createServer((req, res) => {
      calls += 1;
      if (calls < 3) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'temporary' }));
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }
    });
    try {
      const result = await resilientFetchJson(serverUrl(server, '/503'), { label: 'stress-503', retries: 3, timeoutMs: 250, baseDelayMs: 1, validateJson: (v) => v?.ok === true });
      assert.equal(result.ok, true);
      assert.equal(calls, 3);
      logs.push(`recovered after ${calls} calls`);
      return { calls };
    } finally { server.close(); }
  });

  await scenario('API timeout recovery', async (logs) => {
    let calls = 0;
    const server = await createServer((req, res) => {
      calls += 1;
      if (calls === 1) {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          }
        }, 120);
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }
    });
    try {
      const result = await resilientFetchJson(serverUrl(server, '/timeout'), { label: 'stress-timeout', retries: 2, timeoutMs: 30, baseDelayMs: 1, validateJson: (v) => v?.ok === true });
      assert.equal(result.ok, true);
      assert.ok(calls >= 2);
      logs.push(`timeout recovered with ${calls} calls`);
      return { calls };
    } finally { server.close(); }
  });

  await scenario('stale data producer restart', async (logs) => {
    let executions = 0;
    const result = await runHealingCycle({
      health: health('UNHEALTHY', [
        { id: 'stale-data:data/live-tracker-snapshot.json', severity: 'critical', system: 'Live Tracker', message: 'stale' },
        { id: 'stale-data:data/statistics.json', severity: 'critical', system: 'Statistics', message: 'stale' }
      ]),
      state: emptyState(),
      execute: async (config) => {
        executions += 1;
        logs.push(`executed ${config.workflow}`);
        return { id: config.id, label: config.label, workflow: config.workflow, action: 'dispatched', status: 'recovered', runId: 123, conclusion: 'success' };
      }
    });
    assert.equal(executions, 1);
    assert.equal(result.results[0].workflow, 'live-tracker.yml');
    assert.equal(result.status, 'repairs-completed');
    return { executions };
  });

  await scenario('scheduler fallback without duplicate dispatch', async (logs) => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    const stale = needsRecovery('2026-10-01T11:30:00Z', 20, now);
    const recentActive = isRecentActiveRun({ status: 'queued', created_at: '2026-10-01T11:59:00Z' }, now);
    const oldActive = isRecentActiveRun({ status: 'queued', created_at: '2026-10-01T11:30:00Z' }, now);
    assert.equal(stale, true);
    assert.equal(recentActive, true);
    assert.equal(oldActive, false);
    logs.push('stale producer qualifies for fallback');
    logs.push('recent active run suppresses duplicate fallback dispatch');
    return { stale, recentActiveSuppressesDuplicate: true };
  });

  await scenario('corrupt state safe recovery', async (logs) => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    const recovered = recoverStateText('{ definitely-not-json', now);
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.reason, 'invalid-json');
    assert.equal(verifyRecoveryLock(recovered.state, now), true);
    const ids = Object.keys(recovered.state.repairs).sort();
    assert.deepEqual(ids, SAFE_REPAIRS.map((x) => x.id).sort());
    logs.push('invalid JSON converted to exact allowlist state');
    logs.push('all automatic repair budgets fail-closed after recovery');
    return { reason: recovered.reason, failClosed: true };
  });

  await scenario('unsafe error is alert-only / no automatic action', async (logs) => {
    let executed = false;
    const result = await runHealingCycle({
      health: health('UNHEALTHY', [
        { id: 'workflow-failed:hr-leadership.yml', severity: 'critical', system: 'HR Leadership', message: 'failed' },
        { id: 'workflow-failed:convoy-checker.yml', severity: 'critical', system: 'Convoy', message: 'failed' }
      ]),
      state: emptyState(),
      execute: async () => { executed = true; throw new Error('unsafe executor must not run'); }
    });
    assert.equal(executed, false);
    assert.equal(result.plan.unresolvedUnsafe.length, 2);
    assert.equal(result.status, 'escalation-required');
    logs.push('HR and Convoy findings remained manual-only');
    return { executed, unresolved: result.plan.unresolvedUnsafe.length };
  });

  await scenario('repair loop prevention', async (logs) => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    const config = SAFE_REPAIRS.find((x) => x.id === 'live-tracker');
    let state = emptyState();
    state = recordAttempt(state, config, { status: 'failed', action: 'dispatched' }, ['workflow-failed:live-tracker.yml'], now - 70 * 60_000);
    state = recordAttempt(state, config, { status: 'failed', action: 'dispatched' }, ['workflow-failed:live-tracker.yml'], now - 30 * 60_000);
    const plan = planRepairs(health('UNHEALTHY', [{ id: 'workflow-failed:live-tracker.yml', severity: 'critical', system: 'Live Tracker', message: 'failed' }]), state, now);
    assert.equal(plan.plans.length, 0);
    assert.equal(plan.suppressed.length, 1);
    assert.equal(plan.suppressed[0].budget.reason, 'attempt-budget-exhausted');
    logs.push('third automatic repair blocked by attempt budget');
    return { suppressedReason: plan.suppressed[0].budget.reason };
  });

  await scenario('duplicate repair planning suppression', async (logs) => {
    const plan = planRepairs(health('UNHEALTHY', [
      { id: 'stale-data:data/live-tracker-snapshot.json', severity: 'critical', system: 'Live Tracker', message: 'stale' },
      { id: 'stale-data:data/statistics.json', severity: 'critical', system: 'Statistics', message: 'stale' },
      { id: 'stale-data:data/live-tracker-snapshot.json', severity: 'critical', system: 'Live Tracker', message: 'stale duplicate' }
    ]), emptyState(), Date.parse('2026-10-01T12:00:00Z'));
    assert.equal(plan.plans.length, 1);
    assert.equal(plan.plans[0].workflow, 'live-tracker.yml');
    logs.push('multiple related findings collapsed to one workflow repair plan');
    return { plans: plan.plans.length };
  });

  const failed = scenarios.filter((x) => x.status !== 'PASS');
  const report = {
    version: 1,
    point: 22,
    generatedAt: new Date().toISOString(),
    mode: 'isolated-controlled-failure-stress-test',
    safety: {
      productionFailureInjection: false,
      localApiMockOnly: true,
      productionDiscordWrites: false,
      productionPersonnelActions: false,
      productionConvoyLiveActions: false,
      automaticRestore: false,
      forcePush: false
    },
    summary: { scenarios: scenarios.length, passed: scenarios.length - failed.length, failed: failed.length },
    scenarios,
    status: failed.length ? 'STRESS-TEST-FAILED' : 'STRESS-TEST-PASSED'
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Point 22 Self-Healing stress scenarios: ${report.summary.passed}/${report.summary.scenarios}`);
  console.log(`Status: ${report.status}`);
  for (const item of failed) console.error(`- ${item.name}: ${item.error}`);
  fs.rmSync(TMP, { recursive: true, force: true });
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exitCode = 1;
});
