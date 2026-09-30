'use strict';

const fs = require('fs');
const path = require('path');
const { SAFE_REPAIRS, FORBIDDEN_WORKFLOW_PATTERN } = require('./self-healing');

const ROOT = __dirname;
const REPORT_FILE = path.join(ROOT, 'output', 'self-healing.json');
const STATE_FILE = path.join(ROOT, 'data', 'self-healing-state.json');
const HEALTH_FILE = path.join(ROOT, 'data', 'system-health.json');
const WORKFLOW_FILE = path.join(ROOT, '.github', 'workflows', 'self-healing.yml');
const OUTPUT_FILE = path.join(ROOT, 'output', 'self-healing-verification.json');

const checks = [];
const issues = [];

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} is missing.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function check(name, ok, details = null) {
  const entry = { name, ok: Boolean(ok), details };
  checks.push(entry);
  if (!entry.ok) issues.push(`${name}${details === null ? '' : `: ${typeof details === 'string' ? details : JSON.stringify(details)}`}`);
}

function sameStringSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function main() {
  const report = readJson(REPORT_FILE);
  const state = readJson(STATE_FILE);
  const health = readJson(HEALTH_FILE);
  const workflowText = fs.existsSync(WORKFLOW_FILE) ? fs.readFileSync(WORKFLOW_FILE, 'utf8') : '';

  const expectedWorkflows = SAFE_REPAIRS.map((item) => item.workflow);
  const reportWorkflows = Array.isArray(report?.safety?.allowlistedWorkflows) ? report.safety.allowlistedWorkflows : [];
  const stateRepairIds = Object.keys(state?.repairs || {});
  const expectedRepairIds = SAFE_REPAIRS.map((item) => item.id);

  check('Point 21 report version is valid', report.version === 1 && report.point === 21, { version: report.version, point: report.point });
  check('Self-Healing mode is technical-only', report.mode === 'technical-safe-self-healing' && state.mode === 'technical-safe-self-healing', { report: report.mode, state: state.mode });
  check('Allowlisted workflow set is exact', JSON.stringify(reportWorkflows) === JSON.stringify(expectedWorkflows), reportWorkflows);
  check('No allowlisted workflow matches forbidden workflow classes', expectedWorkflows.every((file) => !FORBIDDEN_WORKFLOW_PATTERN.test(file)), expectedWorkflows);
  check('Persistent repair-state ID set is exact', sameStringSet(stateRepairIds, expectedRepairIds), { stateRepairIds, expectedRepairIds });

  check('Convoy live dispatch is disabled', report.safety?.convoyLiveDispatchAllowed === false, report.safety?.convoyLiveDispatchAllowed);
  check('Personnel workflow dispatch is disabled', report.safety?.personnelWorkflowDispatchAllowed === false, report.safety?.personnelWorkflowDispatchAllowed);
  check('Discord mutation is disabled', report.safety?.discordMutationAllowed === false && report.safety?.roleOrMemberMutationAllowed === false, report.safety || null);
  check('Automatic restore is disabled', report.safety?.automaticRestoreAllowed === false, report.safety?.automaticRestoreAllowed);
  check('Force push is disabled', report.safety?.forcePushAllowed === false, report.safety?.forcePushAllowed);

  const planned = Array.isArray(report?.planning?.planned) ? report.planning.planned : [];
  const results = Array.isArray(report?.results) ? report.results : [];
  check('Every planned repair is allowlisted', planned.every((item) => expectedWorkflows.includes(item.workflow)), planned.map((item) => item.workflow));
  check('Every executed repair is allowlisted', results.every((item) => expectedWorkflows.includes(item.workflow)), results.map((item) => item.workflow));
  check('No executed repair failed or timed out', results.every((item) => item.status === 'recovered'), results.map((item) => ({ workflow: item.workflow, status: item.status })));

  check('Self-Healing workflow exists', Boolean(workflowText), fs.existsSync(WORKFLOW_FILE));
  check('Self-Healing workflow is scheduled and manually dispatchable', /workflow_dispatch\s*:/.test(workflowText) && /schedule\s*:/.test(workflowText), null);
  check('Self-Healing cadence is the approved 15-minute offset schedule', /cron:\s*['"]7,22,37,52 \* \* \* \*['"]/.test(workflowText), null);
  check('Self-Healing workflow has Actions write and Contents write mutation scopes', /actions:\s*write/.test(workflowText) && /contents:\s*write/.test(workflowText), null);
  check('Self-Healing workflow uses safe push helper', /scripts\/git-safe-push\.sh/.test(workflowText), null);

  check('Final System Health is HEALTHY', health.status === 'HEALTHY', health.status);
  check('Final System Health has 0 Critical Issues', Number(health.summary?.criticalIssues || 0) === 0, health.summary?.criticalIssues ?? null);
  check('Final System Health has 0 Warnings', Number(health.summary?.warnings || 0) === 0, health.summary?.warnings ?? null);

  const healthy = issues.length === 0;
  const output = {
    version: 1,
    point: 21,
    checkedAt: new Date().toISOString(),
    status: healthy ? 'VERIFIED-SELF-HEALING' : 'SELF-HEALING-VERIFICATION-FAILED',
    summary: {
      checks: checks.length,
      passed: checks.filter((item) => item.ok).length,
      failed: checks.filter((item) => !item.ok).length,
      safeRepairWorkflows: expectedWorkflows.length,
      executedRepairs: results.length,
      finalHealth: health.status || 'UNKNOWN',
      criticalIssues: Number(health.summary?.criticalIssues || 0),
      warnings: Number(health.summary?.warnings || 0)
    },
    checks,
    issues,
    healthy
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log('Kings Self-Healing Verification — Point 21');
  console.log(`Checks: ${output.summary.passed}/${output.summary.checks}`);
  console.log(`Safe repair workflows: ${output.summary.safeRepairWorkflows}`);
  console.log(`Executed repairs this run: ${output.summary.executedRepairs}`);
  console.log(`Final Health: ${output.summary.finalHealth}; Critical=${output.summary.criticalIssues}; Warnings=${output.summary.warnings}`);
  console.log(`Status: ${output.status}`);
  for (const issue of issues) console.error(`- ${issue}`);

  if (!healthy) process.exitCode = 1;
}

main();
