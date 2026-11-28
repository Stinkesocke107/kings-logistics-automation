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

// Execute the actual workflow's embedded Bash with a fake gh executable.
// This catches accidental regressions where an old active run is re-dispatched.
test('Central Scheduler never dispatches a second job while an overdue run is still active', () => {
  const os = require('node:os');
  const {spawnSync} = require('node:child_process');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kings-scheduler-'));
  try {
    const contents = source;
    const start = contents.indexOf('      - name: Run one resilient scheduler pass');
    const begin = contents.indexOf('        run: |\n', start);
    const end = contents.indexOf('\n      - name: Scheduler summary', begin);
    assert.ok(begin > start && end > begin);
    const script = contents.slice(begin + '        run: |\n'.length, end)
      .split('\n').map((line) => line.startsWith('          ') ? line.slice(10) : line).join('\n');
    const oldTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const fixture = path.join(temp, 'snapshot.json');
    const dispatched = path.join(temp, 'dispatch.txt');
    const fakeGh = path.join(temp, 'gh');
    fs.writeFileSync(fakeGh, '#!/bin/sh\ncase " $* " in\n  *" --method POST "*) echo POST >> "$KINGS_TEST_DISPATCH";;\n  *" --method GET "*) cat "$KINGS_TEST_SNAPSHOT";;\n  *) printf active;;\nesac\n');
    fs.chmodSync(fakeGh, 0o755);
    for (const event of ['schedule', 'push']) {
      fs.writeFileSync(fixture, JSON.stringify({workflow_runs:[
        {id:456, event, head_branch:'main', status:'in_progress', created_at:oldTime}
      ]}));
      const result = spawnSync('bash', ['-c', 'set -euo pipefail\n' + script], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 15000,
      env: {...process.env, PATH: temp + path.delimiter + process.env.PATH,
        GITHUB_EVENT_NAME:'schedule', GITHUB_REPOSITORY:'test/kings',
        KINGS_TEST_SNAPSHOT:fixture, KINGS_TEST_DISPATCH:dispatched}
    });
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
    assert.equal(fs.existsSync(dispatched), false, 'An overdue active GitHub run must NEVER be dispatched again');
    assert.match(result.stdout, /operator review required\. No duplicate dispatch/);
    }
  } finally {
    fs.rmSync(temp, {recursive:true, force:true});
  }
});

test('Central Scheduler blocks recovery during a production main push as well as a schedule', () => {
  const activeFunction = source.slice(source.indexOf('active_managed_run()'), source.indexOf('latest_successful_run()'));
  assert.match(activeFunction, /\.event == "push"/,
    'Main branch code push may still be writing protected Driver, Staff or Tracker data.');
  assert.match(activeFunction, /\.status == "in_progress"/);
  assert.match(activeFunction, /\.status == "queued"/);
});
