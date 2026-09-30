const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'system-alerts.js');

function loadProductionAlertLogic() {
  const original = fs.readFileSync(SOURCE_FILE, 'utf8');
  const mainBlock = `\nmain().catch((error) => {\n  console.error('Kings System Alerts failed:', error.message);\n  process.exit(1);\n});\n`;
  assert.ok(original.includes(mainBlock), 'system-alerts.js main block changed; update the verification loader intentionally');

  const source = original.replace(
    mainBlock,
    `\nmodule.exports = { emptyState, normalizeState, normalizedIssue, processHealth, severityRank };\n`
  );

  const moduleObject = { exports: {} };
  const localRequire = createRequire(SOURCE_FILE);
  const sandboxRequire = (request) => {
    if (request === './kings-branding') {
      return { installDiscordBranding() {} };
    }
    return localRequire(request);
  };

  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    require: sandboxRequire,
    __dirname: ROOT,
    __filename: SOURCE_FILE,
    console,
    process: {
      env: { ...process.env, DISCORD_BOT_TOKEN: 'verification-token' },
      exit() { throw new Error('process.exit must not be reached while loading alert logic'); }
    },
    fetch: async () => { throw new Error('network access is forbidden in the isolated alert-state verification'); },
    AbortSignal,
    setTimeout,
    clearTimeout,
    Buffer
  };

  vm.runInNewContext(source, sandbox, { filename: SOURCE_FILE });
  return moduleObject.exports;
}

const { emptyState, normalizeState, processHealth } = loadProductionAlertLogic();

function health(issues, checkedAt = '2026-09-30T20:00:00.000Z') {
  return {
    status: issues.length ? 'DEGRADED' : 'HEALTHY',
    checkedAt,
    issues,
    summary: {
      criticalIssues: issues.filter((item) => item.severity === 'critical').length,
      warnings: issues.filter((item) => item.severity !== 'critical').length
    }
  };
}

function issue(id, severity = 'warning', system = 'Verification') {
  return {
    id,
    severity,
    system,
    message: `${id} detected`,
    details: { verification: true }
  };
}

test('critical technical failure alerts immediately and becomes active', () => {
  const result = processHealth(
    health([issue('workflow-failed', 'critical', 'GitHub Actions')]),
    emptyState()
  );

  assert.deepEqual(result.alerts.map((item) => item.id), ['workflow-failed']);
  assert.equal(result.escalations.length, 0);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.state.active['workflow-failed'].severity, 'critical');
  assert.deepEqual(Object.keys(result.state.pending), []);
});

test('warning requires two consecutive confirmations before alerting', () => {
  const first = processHealth(
    health([issue('data-stale', 'warning', 'Data Freshness')]),
    emptyState()
  );
  assert.equal(first.alerts.length, 0);
  assert.equal(first.state.pending['data-stale'].count, 1);
  assert.deepEqual(Object.keys(first.state.active), []);

  const second = processHealth(
    health([issue('data-stale', 'warning', 'Data Freshness')], '2026-09-30T20:05:00.000Z'),
    first.state
  );
  assert.deepEqual(second.alerts.map((item) => item.id), ['data-stale']);
  assert.equal(second.state.active['data-stale'].severity, 'warning');
  assert.equal(second.state.pending['data-stale'], undefined);
});

test('active issue is deduplicated and never posts a duplicate alert', () => {
  const critical = issue('api-down', 'critical', 'API Resilience');
  const first = processHealth(health([critical]), emptyState());
  const repeat = processHealth(
    health([critical], '2026-09-30T20:10:00.000Z'),
    first.state
  );

  assert.equal(repeat.alerts.length, 0);
  assert.equal(repeat.escalations.length, 0);
  assert.equal(repeat.resolved.length, 0);
  assert.equal(Object.keys(repeat.state.active).length, 1);
});

test('warning escalation to critical is emitted exactly once', () => {
  const warning = issue('workflow-overdue', 'warning', 'Scheduler');
  const first = processHealth(health([warning]), emptyState());
  const activeWarning = processHealth(
    health([warning], '2026-09-30T20:05:00.000Z'),
    first.state
  );

  const critical = issue('workflow-overdue', 'critical', 'Scheduler');
  const escalated = processHealth(
    health([critical], '2026-09-30T20:10:00.000Z'),
    activeWarning.state
  );
  assert.deepEqual(escalated.escalations.map((item) => item.id), ['workflow-overdue']);
  assert.equal(escalated.alerts.length, 0);
  assert.equal(escalated.state.active['workflow-overdue'].severity, 'critical');

  const repeat = processHealth(
    health([critical], '2026-09-30T20:15:00.000Z'),
    escalated.state
  );
  assert.equal(repeat.escalations.length, 0);
  assert.equal(repeat.alerts.length, 0);
});

test('recovered active issue produces one resolved event and clears state', () => {
  const first = processHealth(
    health([issue('api-down', 'critical', 'API Resilience')]),
    emptyState()
  );
  const recovered = processHealth(
    health([], '2026-09-30T20:05:00.000Z'),
    first.state
  );

  assert.deepEqual(recovered.resolved.map((item) => item.id), ['api-down']);
  assert.deepEqual(Object.keys(recovered.state.active), []);
  assert.deepEqual(Object.keys(recovered.state.pending), []);

  const healthyAgain = processHealth(
    health([], '2026-09-30T20:10:00.000Z'),
    recovered.state
  );
  assert.equal(healthyAgain.resolved.length, 0);
  assert.equal(healthyAgain.alerts.length, 0);
  assert.equal(healthyAgain.changed, false);
});

test('transient warning disappears before confirmation without false alert or resolved message', () => {
  const first = processHealth(
    health([issue('temporary-api-latency', 'warning', 'API Resilience')]),
    emptyState()
  );
  const cleared = processHealth(
    health([], '2026-09-30T20:05:00.000Z'),
    first.state
  );

  assert.equal(cleared.alerts.length, 0);
  assert.equal(cleared.resolved.length, 0);
  assert.deepEqual(Object.keys(cleared.state.pending), []);
  assert.deepEqual(Object.keys(cleared.state.active), []);
});

test('final fault matrix alerts and recovers workflow, scheduler, API and stale-data failures', () => {
  const faults = [
    issue('workflow-failed', 'critical', 'GitHub Actions'),
    issue('workflow-overdue', 'critical', 'Scheduler'),
    issue('api-down', 'critical', 'API Resilience'),
    issue('data-stale', 'critical', 'Data Freshness')
  ];

  const detected = processHealth(health(faults), emptyState());
  assert.deepEqual(
    detected.alerts.map((item) => item.id).sort(),
    ['api-down', 'data-stale', 'workflow-failed', 'workflow-overdue'].sort()
  );
  assert.equal(Object.keys(detected.state.active).length, 4);

  const recovered = processHealth(
    health([], '2026-09-30T20:10:00.000Z'),
    detected.state
  );
  assert.deepEqual(
    recovered.resolved.map((item) => item.id).sort(),
    ['api-down', 'data-stale', 'workflow-failed', 'workflow-overdue'].sort()
  );
  assert.equal(Object.keys(recovered.state.active).length, 0);
  assert.equal(Object.keys(recovered.state.pending).length, 0);
});

test('healthy input produces no false positives and preserves technical-only state mode', () => {
  const state = normalizeState(null);
  const result = processHealth(health([]), state);

  assert.equal(result.alerts.length, 0);
  assert.equal(result.escalations.length, 0);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.changed, false);
  assert.equal(result.state.mode, 'technical-alerts-only');
  assert.deepEqual(Object.keys(result.state.active), []);
  assert.deepEqual(Object.keys(result.state.pending), []);
});
