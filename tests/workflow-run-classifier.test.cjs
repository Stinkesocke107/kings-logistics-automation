'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isOperationalWorkflowRun, FULL_PRODUCTION_PUSH_WORKFLOWS } = require('../workflow-run-classifier');

test('only reviewed protected personnel producers count real production main push', () => {
  assert.deepEqual([...FULL_PRODUCTION_PUSH_WORKFLOWS].sort(), [
    'driver-management.yml', 'hr-leadership.yml', 'staff-management.yml'
  ]);
  for (const workflow of FULL_PRODUCTION_PUSH_WORKFLOWS) {
    assert.equal(isOperationalWorkflowRun({ event: 'push', status: 'completed', conclusion: 'success' }, workflow), true);
  }
  for (const ciOnly of ['system-tests.yml', 'final-freeze-verification.yml',
    'convoy-checker.yml', 'self-healing.yml', 'event-leadership-reports.yml', 'live-tracker.yml']) {
    assert.equal(isOperationalWorkflowRun({ event: 'push', status: 'completed', conclusion: 'success' }, ciOnly), false);
  }
});

test('newest successful Driver or Staff real push supersedes prior failed manual production run', () => {
  const latestFirst = [
    { event: 'push', status: 'completed', conclusion: 'success', id: 2 },
    { event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', id: 1 }
  ];
  for (const file of ['driver-management.yml', 'staff-management.yml', 'hr-leadership.yml']) {
    const operational = latestFirst.filter((run) => isOperationalWorkflowRun(run, file));
    assert.deepEqual(operational.map((run) => run.id), [2, 1]);
    assert.equal(operational.find((run) => run.status === 'completed').conclusion, 'success');
  }
  assert.deepEqual(latestFirst.filter((run) => isOperationalWorkflowRun(run, 'final-freeze-verification.yml')).map((r) => r.id), [1]);
});

test('skipped callback, non-live Convoy manual run and unknown events never count as healthy', () => {
  assert.equal(isOperationalWorkflowRun({ event: 'workflow_run', status: 'completed', conclusion: 'skipped' }, 'driver-management.yml'), false);
  assert.equal(isOperationalWorkflowRun({ event: 'workflow_run', status: 'completed', conclusion: 'failure' }, 'driver-management.yml'), true);
  assert.equal(isOperationalWorkflowRun({ event: 'workflow_dispatch', display_title: 'Convoy test dry-run' }, 'convoy-checker.yml'), false);
  assert.equal(isOperationalWorkflowRun({ event: 'workflow_dispatch', display_title: 'Live convoy check' }, 'convoy-checker.yml'), true);
  assert.equal(isOperationalWorkflowRun({ event: 'schedule' }, 'system-monitoring.yml'), true);
  assert.equal(isOperationalWorkflowRun({ event: 'pull_request' }, 'driver-management.yml'), false);
  assert.equal(isOperationalWorkflowRun(null, 'driver-management.yml'), false);
});
