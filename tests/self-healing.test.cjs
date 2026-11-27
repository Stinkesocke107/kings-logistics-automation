'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SAFE_REPAIRS,
  FORBIDDEN_WORKFLOW_PATTERN,
  emptyState,
  normalizeState,
  attemptBudget,
  planRepairs,
  recordAttempt,
  runHealingCycle
} = require('../self-healing.js');

function health(status, issues) {
  const criticalIssues = issues.filter((item) => item.severity === 'critical').length;
  const warnings = issues.filter((item) => item.severity !== 'critical').length;
  return {
    status,
    summary: { criticalIssues, warnings },
    issues
  };
}

test('Point 21 allowlist contains only safe technical repair workflows', () => {
  assert.deepEqual(
    SAFE_REPAIRS.map((item) => item.workflow),
    ['live-tracker.yml', 'driver-updates.yml', 'core-backup.yml']
  );

  for (const item of SAFE_REPAIRS) {
    assert.equal(FORBIDDEN_WORKFLOW_PATTERN.test(item.workflow), false, `${item.workflow} must stay outside forbidden workflow classes`);
  }

  const dangerous = [
    'convoy-checker.yml',
    'hr-leadership.yml',
    'staff-management.yml',
    'management-overview.yml',
    'driver-management.yml',
    'hr-probation.yml',
    'monthly-report.yml',
    'driver-weekly-summary.yml'
  ];

  for (const workflow of dangerous) {
    assert.equal(FORBIDDEN_WORKFLOW_PATTERN.test(workflow), true, `${workflow} must be blocked from automatic Point 21 dispatch`);
  }
});

test('stale Live Tracker data maps to one safe Live Tracker repair', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const result = planRepairs(
    health('UNHEALTHY', [
      { id: 'stale-data:data/live-tracker-snapshot.json', severity: 'critical', system: 'Live Tracker data', message: 'stale' },
      { id: 'stale-data:data/statistics.json', severity: 'critical', system: 'Statistics data', message: 'stale' }
    ]),
    emptyState(),
    now
  );

  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].id, 'live-tracker');
  assert.deepEqual(result.plans[0].triggerIssueIds.sort(), [
    'stale-data:data/live-tracker-snapshot.json',
    'stale-data:data/statistics.json'
  ]);
  assert.equal(result.unresolvedUnsafe.length, 0);
});

test('confirmed dual map outage skips futile extra Tracker dispatch without hiding critical incidents', async () => {
  const now = Date.parse('2026-11-27T02:00:00Z');
  const incidents = [
    { id: 'api-health:ETS2Map area', severity: 'critical' },
    { id: 'api-health:truckersmp-map-live', severity: 'critical' },
    { id: 'stale-data:data/live-tracker-snapshot.json', severity: 'critical' },
    { id: 'stale-data:data/statistics.json', severity: 'critical' }
  ];
  const current = {
    ...health('UNHEALTHY', incidents),
    data: { officialTracker: { mode: 'map-independent', status: 'verified' } }
  };
  const plan = planRepairs(current, emptyState(), now);
  assert.equal(plan.plans.length, 0);
  assert.equal(plan.suppressed.length, 1);
  assert.equal(plan.suppressed[0].workflow, 'live-tracker.yml');
  assert.equal(plan.suppressed[0].suppressionReason, 'external-map-providers-down');
  assert.deepEqual(plan.unresolvedUnsafe.map((item) => item.id).sort(), [
    'api-health:ETS2Map area', 'api-health:truckersmp-map-live'
  ]);
  let executed = false;
  const cycle = await runHealingCycle({
    health: current, state: emptyState(), nowMs: now,
    execute: async () => { executed = true; throw new Error('must not dispatch'); }
  });
  assert.equal(executed, false);
  assert.equal(cycle.status, 'escalation-required');
  assert.equal(cycle.results.length, 0);
});

test('map outage suppression fails open to safe retry if fallback or map outage proof is missing', () => {
  const now = Date.parse('2026-11-27T02:00:00Z');
  const incidents = [
    { id: 'api-health:ETS2Map area', severity: 'critical' },
    { id: 'api-health:truckersmp-map-live', severity: 'critical' },
    { id: 'stale-data:data/statistics.json', severity: 'critical' }
  ];
  const base = health('UNHEALTHY', incidents);
  const invalidFallback = {
    ...base, data: { officialTracker: { mode: 'map-independent', status: 'not-verified' } }
  };
  assert.equal(planRepairs(invalidFallback, emptyState(), now).plans.length, 1);
  const singleProvider = {
    ...health('UNHEALTHY', incidents.slice(1)),
    data: { officialTracker: { mode: 'map-independent', status: 'verified' } }
  };
  assert.equal(planRepairs(singleProvider, emptyState(), now).plans.length, 1);
});

test('a genuine Tracker workflow failure is never suppressed even during confirmed dual-provider outage', () => {
  const now = Date.parse('2026-11-27T02:00:00Z');
  const current = {
    ...health('UNHEALTHY', [
      { id: 'api-health:ETS2Map area', severity: 'critical' },
      { id: 'api-health:truckersmp-map-live', severity: 'critical' },
      { id: 'stale-data:data/statistics.json', severity: 'critical' },
      { id: 'workflow-failed:live-tracker.yml', severity: 'critical' }
    ]),
    data: { officialTracker: { mode: 'map-independent', status: 'verified' } }
  };
  const plan = planRepairs(current, emptyState(), now);
  assert.equal(plan.plans.length, 1);
  assert.equal(plan.suppressed.length, 0);
  assert.equal(plan.plans[0].workflow, 'live-tracker.yml');
});

test('failed or overdue Core Backup maps to normal safe backup repair', () => {
  const result = planRepairs(
    health('UNHEALTHY', [
      { id: 'workflow-failed:core-backup.yml', severity: 'critical', system: 'Core Backup', message: 'failed' }
    ]),
    emptyState(),
    Date.parse('2026-10-01T12:00:00Z')
  );

  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].workflow, 'core-backup.yml');
  assert.equal(SAFE_REPAIRS.find((item) => item.id === 'core-backup').inputs.backup_type, 'normal');
});

test('personnel and convoy findings are manual-only and never create repair plans', () => {
  const result = planRepairs(
    health('UNHEALTHY', [
      { id: 'workflow-failed:hr-leadership.yml', severity: 'critical', system: 'HR Leadership', message: 'failed' },
      { id: 'workflow-overdue:staff-management.yml', severity: 'critical', system: 'Staff Management', message: 'stale' },
      { id: 'workflow-failed:convoy-checker.yml', severity: 'critical', system: 'Convoy / Event System', message: 'failed' }
    ]),
    emptyState(),
    Date.parse('2026-10-01T12:00:00Z')
  );

  assert.equal(result.plans.length, 0);
  assert.equal(result.unresolvedUnsafe.length, 3);
  assert.deepEqual(result.unresolvedUnsafe.map((item) => item.id).sort(), [
    'workflow-failed:convoy-checker.yml',
    'workflow-failed:hr-leadership.yml',
    'workflow-overdue:staff-management.yml'
  ]);
});

test('cooldown suppresses repeated automatic repair attempts', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const config = SAFE_REPAIRS.find((item) => item.id === 'live-tracker');
  let state = emptyState();
  state = recordAttempt(
    state,
    config,
    { status: 'failed', action: 'dispatched', runId: 123 },
    ['workflow-failed:live-tracker.yml'],
    now - 5 * 60_000
  );

  const budget = attemptBudget(config, state, now);
  assert.equal(budget.allowed, false);
  assert.equal(budget.reason, 'cooldown');

  const result = planRepairs(
    health('UNHEALTHY', [
      { id: 'workflow-failed:live-tracker.yml', severity: 'critical', system: 'Live Tracker', message: 'failed' }
    ]),
    state,
    now
  );
  assert.equal(result.plans.length, 0);
  assert.equal(result.suppressed.length, 1);
  assert.equal(result.suppressed[0].budget.reason, 'cooldown');
});

test('attempt budget stops repair loops even after cooldown expires', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const config = SAFE_REPAIRS.find((item) => item.id === 'driver-updates');
  let state = emptyState();

  state = recordAttempt(state, config, { status: 'failed', action: 'dispatched' }, ['workflow-failed:driver-updates.yml'], now - 70 * 60_000);
  state = recordAttempt(state, config, { status: 'failed', action: 'dispatched' }, ['workflow-failed:driver-updates.yml'], now - 30 * 60_000);

  const budget = attemptBudget(config, normalizeState(state, now), now);
  assert.equal(budget.allowed, false);
  assert.equal(budget.reason, 'attempt-budget-exhausted');
  assert.equal(budget.attemptsInWindow, 2);
});

test('healing cycle executes only planned safe repair and records recovery', async () => {
  const calls = [];
  const result = await runHealingCycle({
    health: health('UNHEALTHY', [
      { id: 'workflow-overdue:driver-updates.yml', severity: 'critical', system: 'Driver Updates', message: 'stale' }
    ]),
    state: emptyState(),
    nowMs: Date.parse('2026-10-01T12:00:00Z'),
    execute: async (config, planned) => {
      calls.push({ id: config.id, workflow: config.workflow, triggerIssueIds: planned.triggerIssueIds });
      return {
        id: config.id,
        label: config.label,
        workflow: config.workflow,
        action: 'dispatched',
        status: 'recovered',
        runId: 456,
        conclusion: 'success'
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].workflow, 'driver-updates.yml');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, 'recovered');
  assert.equal(result.status, 'repairs-completed');
  assert.equal(result.state.repairs['driver-updates'].attempts.length, 1);
});

test('manual-only critical issue produces escalation without executing anything', async () => {
  let executed = false;
  const result = await runHealingCycle({
    health: health('UNHEALTHY', [
      { id: 'workflow-failed:driver-management.yml', severity: 'critical', system: 'Driver Management', message: 'failed' }
    ]),
    state: emptyState(),
    nowMs: Date.parse('2026-10-01T12:00:00Z'),
    execute: async () => {
      executed = true;
      throw new Error('must not execute');
    }
  });

  assert.equal(executed, false);
  assert.equal(result.results.length, 0);
  assert.equal(result.plan.unresolvedUnsafe.length, 1);
  assert.equal(result.status, 'escalation-required');
});

test('self-healing engine does not treat unrelated technical warnings as a repair error', async () => {
  const result = await runHealingCycle({
    health: health('DEGRADED', [{ id: 'workflow-failed:final-freeze-verification.yml', severity: 'warning', system: 'Final Freeze', message: 'latest quality gate failed' }]),
    state: emptyState(), execute: async () => { throw Error('No unsafe dispatch expected'); }
  });
  assert.equal(result.status, 'no-safe-repair-available');
  assert.equal(result.plan.plans.length, 0);
  assert.deepEqual(result.plan.unresolvedUnsafe.map(item=>item.severity), ['warning']);
});


test('Self-Healing refuses a malformed persisted envelope instead of resetting repair limits', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  assert.throws(() => normalizeState({}, now), /Invalid Self-Healing state envelope/);
  assert.throws(() => normalizeState({ ...emptyState(), version: 99 }, now), /Invalid Self-Healing state envelope/);
  assert.doesNotThrow(() => normalizeState(null, now)); // first boot only
});

test('Self-Healing fails closed if stored retry attempts are corrupt or missing', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  const state = emptyState();
  state.repairs['driver-updates'] = { attempts: [{ at: 'broken-date' }], lastAttemptAt: null };
  assert.throws(() => normalizeState(state, now), /Invalid Self-Healing attempt history/);

  state.repairs['driver-updates'].attempts = { at: 'not-an-array' };
  assert.throws(() => normalizeState(state, now), /Invalid Self-Healing attempt list/);

  state.repairs['driver-updates'] = { attempts: [], lastAttemptAt: new Date(now - 60000).toISOString() };
  assert.throws(() => normalizeState(state, now), /Inconsistent Self-Healing last attempt/);
});

test('Self-Healing rejects future attempts and missing active histories', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  const state = emptyState();
  const futureAt = new Date(now + 10 * 60_000).toISOString();
  state.repairs['core-backup'] = { attempts: [{ at: futureAt, outcome: 'failed' }], lastAttemptAt: futureAt };
  assert.throws(() => normalizeState(state, now), /Future-dated Self-Healing attempt/);

  const missing = emptyState();
  missing.updatedAt = new Date(now).toISOString();
  assert.throws(() => normalizeState(missing, now), /Missing Self-Healing repair history/);
});

test('a complete persisted repair history remains valid and enforces its attempt budget', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  const config = SAFE_REPAIRS.find((item) => item.id === 'driver-updates');
  let state = emptyState();
  state = recordAttempt(state, config, {status:'failed',action:'dispatched'}, ['workflow-failed:driver-updates.yml'], now - 70 * 60_000);
  state = recordAttempt(state, config, {status:'failed',action:'dispatched'}, ['workflow-failed:driver-updates.yml'], now - 30 * 60_000);
  const restored = normalizeState(state, now);
  assert.equal(restored.repairs['driver-updates'].attempts.length, 2);
  assert.equal(attemptBudget(config, restored, now).allowed, false);
});
