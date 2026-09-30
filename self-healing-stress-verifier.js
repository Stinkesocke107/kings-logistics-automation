'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const STRESS = path.join(ROOT, 'output', 'self-healing-stress.json');
const HEALTH = path.join(ROOT, 'data', 'system-health.json');
const OUT = path.join(ROOT, 'output', 'self-healing-stress-verification.json');

const requiredScenarios = [
  'workflow retry after failed attempt',
  'API HTTP 503 recovery',
  'API timeout recovery',
  'stale data producer restart',
  'scheduler fallback without duplicate dispatch',
  'corrupt state safe recovery',
  'unsafe error is alert-only / no automatic action',
  'repair loop prevention',
  'duplicate repair planning suppression'
];

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} is missing.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const stress = read(STRESS);
  const health = read(HEALTH);
  const scenarios = Array.isArray(stress.scenarios) ? stress.scenarios : [];
  const byName = new Map(scenarios.map((x) => [x.name, x]));
  const checks = [];
  const add = (name, ok, details = null) => checks.push({ name, ok: Boolean(ok), details });

  add('Point 22 report identity', stress.point === 22 && stress.version === 1, { point: stress.point, version: stress.version });
  add('Stress mode is isolated controlled failure', stress.mode === 'isolated-controlled-failure-stress-test', stress.mode);
  add('No production failure injection', stress.safety?.productionFailureInjection === false, stress.safety);
  add('Local API mock only', stress.safety?.localApiMockOnly === true, stress.safety);
  add('No production Discord writes', stress.safety?.productionDiscordWrites === false, stress.safety);
  add('No personnel or Convoy live actions', stress.safety?.productionPersonnelActions === false && stress.safety?.productionConvoyLiveActions === false, stress.safety);
  add('No automatic restore or force push', stress.safety?.automaticRestore === false && stress.safety?.forcePush === false, stress.safety);

  for (const name of requiredScenarios) {
    const item = byName.get(name);
    add(`Scenario passed: ${name}`, item?.status === 'PASS', item ? { status: item.status, logs: item.logs } : 'missing');
  }

  add('All stress scenarios passed', stress.status === 'STRESS-TEST-PASSED' && Number(stress.summary?.failed || 0) === 0, stress.summary);
  add('Full repair logs captured', scenarios.every((x) => Array.isArray(x.logs) && x.logs.length > 0), scenarios.map((x) => ({ name: x.name, logCount: x.logs?.length || 0 })));
  add('Final production health is HEALTHY', health.status === 'HEALTHY', health.status);
  add('Final production Critical Issues = 0', Number(health.summary?.criticalIssues || 0) === 0, health.summary?.criticalIssues ?? null);
  add('Final production Warnings = 0', Number(health.summary?.warnings || 0) === 0, health.summary?.warnings ?? null);

  const failed = checks.filter((x) => !x.ok);
  const result = {
    version: 1,
    point: 22,
    checkedAt: new Date().toISOString(),
    status: failed.length ? 'SELF-HEALING-STRESS-FAILED' : 'VERIFIED-SELF-HEALING-STRESS',
    summary: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length, scenarios: scenarios.length, finalHealth: health.status || 'UNKNOWN' },
    checks,
    issues: failed.map((x) => x.name),
    healthy: failed.length === 0
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Point 22 verifier: ${result.summary.passed}/${result.summary.checks}`);
  console.log(`Final Health: ${result.summary.finalHealth}`);
  console.log(`Status: ${result.status}`);
  if (failed.length) process.exitCode = 1;
}

try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
