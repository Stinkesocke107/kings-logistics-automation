'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const OUTPUT = path.join(ROOT, 'output');
const REPORT_FILE = path.join(OUTPUT, 'final-freeze-verification.json');
const FINAL_STATE_FILE = path.join(DATA, 'final-freeze-state.json');

function readJson(file, required = true) {
  if (!fs.existsSync(file)) {
    if (!required) return null;
    throw new Error(`${path.relative(ROOT, file)} is missing.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}
function countObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0;
}
function dateOk(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
function fileExists(relative) {
  return fs.existsSync(path.join(ROOT, relative));
}

function validateLiveProofs() {
  const convoy = readJson(path.join(DATA, 'public-convoy-live-proof.json'), false);
  const news = readJson(path.join(DATA, 'news-live-proof.json'), false);
  const hr = readJson(path.join(DATA, 'hr-weekly-live-proof.json'), false);
  const monthly = readJson(path.join(DATA, 'monthly-live-proof.json'), false);

  const items = [
    {
      id: 'public-convoy-35810',
      label: 'Monthly Convoy #12 public announcement',
      file: 'data/public-convoy-live-proof.json',
      ready: Boolean(
        convoy?.version === 1 &&
        convoy?.status === 'VERIFIED-LIVE-PUBLIC-CONVOY-35810' &&
        Number(convoy?.eventId) === 35810 &&
        /^\d+$/.test(String(convoy?.discordMessageId || '')) &&
        /^\d+$/.test(String(convoy?.discordChannelId || '')) &&
        /^\d+$/.test(String(convoy?.discordBotId || '')) &&
        dateOk(convoy?.verifiedAt)
      ),
      proof: convoy
    },
    {
      id: 'news',
      label: 'Genuine Kings/TruckersMP News publication',
      file: 'data/news-live-proof.json',
      ready: Boolean(
        news?.version === 1 &&
        news?.status === 'VERIFIED-LIVE-NEWS' &&
        Number(news?.articleId) > 70783 &&
        Number(news?.duplicateMatches) === 1 &&
        /^\d+$/.test(String(news?.discordMessageId || '')) &&
        /^\d+$/.test(String(news?.discordChannelId || '')) &&
        /^\d+$/.test(String(news?.discordWebhookId || '')) &&
        dateOk(news?.verifiedAt)
      ),
      proof: news
    },
    {
      id: 'hr-weekly',
      label: 'First complete-coverage HR Weekly publication',
      file: 'data/hr-weekly-live-proof.json',
      ready: Boolean(
        hr?.version === 1 &&
        hr?.status === 'VERIFIED-LIVE-HR-WEEKLY' &&
        hr?.targetWeek?.key &&
        /^\d+$/.test(String(hr?.discordMessageId || '')) &&
        /^\d+$/.test(String(hr?.discordChannelId || '')) &&
        hr?.statePublished === true &&
        dateOk(hr?.verifiedAt)
      ),
      proof: hr
    },
    {
      id: 'monthly-2026-09',
      label: 'September 2026 Monthly Report publication',
      file: 'data/monthly-live-proof.json',
      ready: Boolean(
        monthly?.version === 1 &&
        monthly?.status === 'VERIFIED-LIVE-MONTHLY-2026-09' &&
        monthly?.targetMonth?.key === '2026-09' &&
        Number(monthly?.officialReportMatches) === 1 &&
        /^\d+$/.test(String(monthly?.discordMessageId || '')) &&
        /^\d+$/.test(String(monthly?.discordChannelId || '')) &&
        dateOk(monthly?.verifiedAt)
      ),
      proof: monthly
    }
  ];

  return {
    items,
    ready: items.every((item) => item.ready),
    pending: items.filter((item) => !item.ready).map((item) => ({ id: item.id, label: item.label, file: item.file }))
  };
}

function main() {
  const checks = [];
  const technicalIssues = [];
  const add = (name, ok, details = null) => {
    const item = { name, ok: Boolean(ok), details };
    checks.push(item);
    if (!item.ok) technicalIssues.push(name);
  };

  const health = readJson(path.join(DATA, 'system-health.json'));
  const api = readJson(path.join(OUTPUT, 'api-resilience-final-report.json'));
  const gitState = readJson(path.join(OUTPUT, 'git-state-hardening-final-report.json'));
  const stress = readJson(path.join(OUTPUT, 'self-healing-stress-verification.json'));
  const e2e = readJson(path.join(OUTPUT, 'core-e2e-verification.json'));
  const baseline = readJson(path.join(OUTPUT, 'core-baseline-verification.json'));
  const backup = readJson(path.join(ROOT, 'backup-staging', 'backup-health.json'));
  const backupFinal = readJson(path.join(ROOT, 'backup-staging', 'backup-final-health.json'));
  const restore = readJson(path.join(ROOT, 'backup-staging', 'backup-restore-verification.json'));
  const selfHealing = readJson(path.join(DATA, 'self-healing-state.json'));
  const alerts = readJson(path.join(DATA, 'system-alerts-state.json'));

  add('System Health = HEALTHY', health.status === 'HEALTHY', health.status);
  add('Critical Issues = 0', Number(health.summary?.criticalIssues || 0) === 0, health.summary?.criticalIssues ?? null);
  add('Warnings = 0', Number(health.summary?.warnings || 0) === 0, health.summary?.warnings ?? null);
  add('All monitored APIs healthy', Number(health.summary?.apiServicesHealthy || 0) === Number(health.summary?.apiServicesChecked || 0) && Number(health.summary?.apiServicesChecked || 0) > 0, health.summary || null);

  add('API Resilience verified', api.healthy === true && (api.issues || []).length === 0, { healthy: api.healthy, issues: api.issues?.length || 0 });
  add('No degraded/down/open API circuits',
    Number(api.productionApiHealth?.degraded || 0) === 0 &&
    Number(api.productionApiHealth?.down || 0) === 0 &&
    Number(api.productionApiHealth?.invalid || 0) === 0 &&
    Number(api.productionApiHealth?.openCircuits || 0) === 0,
    api.productionApiHealth || null
  );

  add('Git/State hardening verified', gitState.healthy === true && (gitState.issues || []).length === 0, { healthy: gitState.healthy, issues: gitState.issues?.length || 0 });
  add('All state-writing workflows protected', Number(gitState.workflowAudit?.stateWritingWorkflows || 0) > 0 && Number(gitState.workflowAudit?.stateWritingWorkflows || 0) === Number(gitState.workflowAudit?.protectedStateWritingWorkflows || 0), gitState.workflowAudit || null);

  add('Point 22 stress verification passed', stress.healthy === true && stress.status === 'VERIFIED-SELF-HEALING-STRESS' && Number(stress.summary?.failed || 0) === 0, stress.summary || null);
  add('Core E2E passed', e2e.healthy === true && Number(e2e.summary?.failed || 0) === 0, e2e.summary || null);
  add('Stable Core baseline verified', baseline.healthy === true && baseline.baseline?.status === 'VERIFIED-STABLE-BASELINE', baseline.baseline || null);

  add('Backup HEALTHY', backup.healthy === true && backupFinal.healthy === true, { core: backup.status || null, final: backupFinal.status || null });
  add('Restore HEALTHY and complete', restore.healthy === true && Number(restore.summary?.manifestFiles || 0) > 0 && Number(restore.summary?.manifestFiles) === Number(restore.summary?.restoredFiles) && Number(restore.summary?.manifestFiles) === Number(restore.summary?.checksumsVerified), restore.summary || null);

  const expectedRepairIds = ['live-tracker', 'driver-updates', 'core-backup'].sort();
  const repairIds = Object.keys(selfHealing.repairs || {}).sort();
  add('Self-Healing mode technical-safe', selfHealing.mode === 'technical-safe-self-healing', selfHealing.mode);
  add('Self-Healing repair allowlist state exact', JSON.stringify(repairIds) === JSON.stringify(expectedRepairIds), repairIds);
  add('No active System Alerts', countObject(alerts.active) === 0, countObject(alerts.active));
  add('No pending System Alerts', countObject(alerts.pending) === 0, countObject(alerts.pending));

  const trackedStatus = git('status', '--porcelain', '--untracked-files=no');
  add('Tracked Git worktree clean before final-state write', trackedStatus === '', trackedStatus || 'clean');
  add('Running on main', (process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD')) === 'main', process.env.GITHUB_REF_NAME || null);

  const requiredDocs = [
    'README.md',
    'docs/final-core-documentation.md',
    'docs/core-baseline-2026-10-01.md',
    'docs/self-healing-2026-10-01.md',
    'docs/self-healing-stress-2026-10-01.md'
  ];
  add('Required Core documentation present', requiredDocs.every(fileExists), requiredDocs.filter((file) => !fileExists(file)));

  const live = validateLiveProofs();
  const technicalReady = technicalIssues.length === 0;
  const finalReady = technicalReady && live.ready;
  const commit = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const status = !technicalReady ? 'FINAL-FREEZE-BLOCKED' : live.ready ? 'FINAL-FREEZE-VERIFIED' : 'PENDING-LIVE-PROOFS';

  const report = {
    version: 1,
    point: 23,
    checkedAt: new Date().toISOString(),
    status,
    repository: { commit, tree, branch: process.env.GITHUB_REF_NAME || 'main' },
    baseline: baseline.baseline,
    technical: {
      ready: technicalReady,
      checks: checks.length,
      passed: checks.filter((item) => item.ok).length,
      failed: technicalIssues.length,
      issues: technicalIssues,
      checksDetail: checks
    },
    liveProofs: live,
    finalReady
  };

  writeJson(REPORT_FILE, report);

  if (finalReady) {
    const finalState = {
      version: 1,
      status: 'FINAL-FREEZE-VERIFIED',
      verifiedAt: report.checkedAt,
      sourceCommit: commit,
      sourceTree: tree,
      protectedCoreFingerprintSha256: baseline.baseline?.protectedCoreFingerprintSha256 || null,
      protectedCoreFiles: baseline.baseline?.protectedCoreFiles || null,
      baselineId: baseline.baseline?.id || null,
      baselineVersion: baseline.baseline?.version || null,
      liveProofs: Object.fromEntries(live.items.map((item) => [item.id, {
        status: item.proof?.status || null,
        verifiedAt: item.proof?.verifiedAt || null,
        messageId: item.proof?.discordMessageId || null
      }]))
    };
    writeJson(FINAL_STATE_FILE, finalState);
  }

  console.log(`Kings Final Freeze — Point 23: ${status}`);
  console.log(`Technical gates: ${report.technical.passed}/${report.technical.checks}`);
  console.log(`Live proofs: ${live.items.filter((item) => item.ready).length}/${live.items.length}`);
  for (const item of live.items) console.log(`- ${item.label}: ${item.ready ? 'VERIFIED' : 'PENDING'}`);
  for (const issue of technicalIssues) console.error(`- TECHNICAL BLOCKER: ${issue}`);

  if (!technicalReady) process.exitCode = 1;
}

try { main(); } catch (error) { console.error(`Final Freeze verifier failed: ${error.stack || error.message}`); process.exitCode = 1; }
