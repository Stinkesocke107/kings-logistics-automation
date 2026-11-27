'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../.github/workflows/central-scheduler.yml'), 'utf8');

test('Central Scheduler reads main branch production runs for freshness decisions', () => {
  const start = source.indexOf('managed_run_snapshot()');
  const stop = source.indexOf('active_managed_run()', start);
  assert.ok(start >= 0 && stop > start);
  const snapshot = source.slice(start, stop);
  assert.ok(snapshot.includes('-f per_page=50'));
  assert.ok(snapshot.includes('-f branch=main'), 'No feature-branch success can count as main production success.');
});

test('Central Scheduler treats future-dated GitHub metadata as a manual-review blocker', () => {
  for (const age of ['active_age', 'age', 'completed_age']) {
    assert.ok(source.includes('if [ "$' + age + '" -lt -300 ]; then'),
      'Missing future-skew guard for ' + age);
  }
  assert.ok(source.includes('recovery deferred for operator review.'));
});

test('Central Scheduler never recovers manual restores or Event approvals', () => {
  assert.ok(source.includes('dispatch_if_due live-tracker.yml 540'));
  assert.ok(source.includes('dispatch_if_due system-monitoring.yml 4500'));
  assert.ok(!source.includes('dispatch_if_due core-recovery.yml'));
  assert.ok(!source.includes('dispatch_if_due event-operations-manual-review.yml'));
});
