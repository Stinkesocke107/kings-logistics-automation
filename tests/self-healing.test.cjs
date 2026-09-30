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
