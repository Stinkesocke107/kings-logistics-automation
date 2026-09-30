'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, 'output', 'core-baseline-verification.json');
const BASELINE_ID = String(process.env.KINGS_CORE_BASELINE_ID || 'KINGS-CORE-BASELINE-2026-10-01').trim();
const BASELINE_VERSION = '1.0';

const issues = [];
const checks = [];

function normalize(value) {
  return String(value || '').split(path.sep).join('/').replace(/^\.\//, '');
}

function readJson(relativePath) {
  const file = path.join(ROOT, relativePath);
  if (!fs.existsSync(file)) throw new Error(`${relativePath} is missing.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function check(name, ok, details = null) {
  const entry = { name, ok: Boolean(ok), details };
  checks.push(entry);
  if (!entry.ok) {
    const suffix = details === null || details === undefined
      ? ''
      : `: ${typeof details === 'string' ? details : JSON.stringify(details)}`;
    issues.push(`${name}${suffix}`);
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(directory, predicate, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, predicate, output);
    else if (entry.isFile() && predicate(absolute)) output.push(normalize(path.relative(ROOT, absolute)));
  }
  return output;
}

function protectedCoreFiles() {
  const files = new Set();

  for (const name of fs.readdirSync(ROOT)) {
    const absolute = path.join(ROOT, name);
    if (!fs.statSync(absolute).isFile()) continue;
    if (name.endsWith('.js')) files.add(name);
    if (['.gitignore', 'package.json', 'package-lock.json'].includes(name)) files.add(name);
  }

  for (const file of walk(path.join(ROOT, '.github', 'workflows'), (absolute) => /\.ya?ml$/i.test(absolute))) {
    files.add(file);
  }

  for (const file of walk(path.join(ROOT, 'scripts'), () => true)) files.add(file);
  for (const file of walk(path.join(ROOT, 'tests'), (absolute) => /\.(?:cjs|js|mjs|sh)$/i.test(absolute))) files.add(file);

  return [...files].sort();
}

function fingerprint(files) {
  const manifest = files.map((relativePath) => {
    const file = path.join(ROOT, relativePath);
    return {
      path: relativePath,
      size: fs.statSync(file).size,
      sha256: sha256(file)
    };
  });

  const hash = crypto.createHash('sha256');
  for (const item of manifest) {
    hash.update(item.path);
    hash.update('\0');
    hash.update(String(item.size));
    hash.update('\0');
    hash.update(item.sha256);
    hash.update('\n');
  }

  return { manifest, sha256: hash.digest('hex') };
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function safeReport(label, relativePath) {
  try {
    return readJson(relativePath);
  } catch (error) {
    check(`${label} report exists and parses`, false, error.message);
    return null;
  }
}

function main() {
  const commit = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const branch = process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD');

  check('Baseline ID is defined', Boolean(BASELINE_ID), BASELINE_ID || null);
  check('Baseline runs on main', branch === 'main', branch);

  const trackedStatus = git('status', '--porcelain', '--untracked-files=no');
  check('Tracked Git worktree is clean', trackedStatus === '', trackedStatus || 'clean');

  const systemHealth = safeReport('System Health', 'data/system-health.json');
  if (systemHealth) {
    check('System Health is HEALTHY', systemHealth.status === 'HEALTHY', systemHealth.status);
    check('System Health has 0 Critical Issues', Number(systemHealth.summary?.criticalIssues || 0) === 0, systemHealth.summary?.criticalIssues ?? null);
    check('System Health has 0 Warnings', Number(systemHealth.summary?.warnings || 0) === 0, systemHealth.summary?.warnings ?? null);
  }

  const api = safeReport('API Resilience', 'output/api-resilience-final-report.json');
  if (api) {
    check('API Resilience is healthy', api.healthy === true && (api.issues || []).length === 0, { healthy: api.healthy, issues: api.issues?.length || 0 });
    check('All production APIs are healthy',
      Number(api.productionApiHealth?.degraded || 0) === 0 &&
      Number(api.productionApiHealth?.down || 0) === 0 &&
      Number(api.productionApiHealth?.invalid || 0) === 0 &&
      Number(api.productionApiHealth?.openCircuits || 0) === 0,
      api.productionApiHealth || null
    );
  }

  const gitHardening = safeReport('Git/State Hardening', 'output/git-state-hardening-final-report.json');
  if (gitHardening) {
    check('Git/State Hardening is healthy', gitHardening.healthy === true && (gitHardening.issues || []).length === 0, { healthy: gitHardening.healthy, issues: gitHardening.issues?.length || 0 });
    check('All state-writing workflows are protected',
      Number(gitHardening.workflowAudit?.stateWritingWorkflows || 0) > 0 &&
      Number(gitHardening.workflowAudit?.stateWritingWorkflows || 0) === Number(gitHardening.workflowAudit?.protectedStateWritingWorkflows || 0),
      gitHardening.workflowAudit || null
    );
  }

  const backupCore = safeReport('Core Backup', 'backup-staging/backup-health.json');
  const backupFinal = safeReport('Final Backup', 'backup-staging/backup-final-health.json');
  const restore = safeReport('Backup Restore', 'backup-staging/backup-restore-verification.json');

  if (backupCore) check('Core Backup is healthy', backupCore.healthy === true, backupCore.status || null);
  if (backupFinal) check('Final Backup validation is healthy', backupFinal.healthy === true, backupFinal.status || null);
  if (restore) {
    check('Backup Restore roundtrip is healthy', restore.healthy === true, restore.status || null);
    check('Backup Restore covers every manifest file',
      Number(restore.summary?.manifestFiles || 0) > 0 &&
      Number(restore.summary?.manifestFiles || 0) === Number(restore.summary?.restoredFiles || 0) &&
      Number(restore.summary?.manifestFiles || 0) === Number(restore.summary?.checksumsVerified || 0),
      restore.summary || null
    );
  }

  const e2e = safeReport('Core E2E', 'output/core-e2e-verification.json');
  if (e2e) {
    check('Core E2E is healthy', e2e.healthy === true && Number(e2e.summary?.failed || 0) === 0, { healthy: e2e.healthy, summary: e2e.summary || null });
  }

  const files = protectedCoreFiles();
  check('Protected Core scope is non-empty', files.length >= 50, files.length);
  const core = fingerprint(files);

  const healthy = issues.length === 0;
  const report = {
    version: 1,
    point: 20,
    checkedAt: new Date().toISOString(),
    baseline: {
      id: BASELINE_ID,
      version: BASELINE_VERSION,
      status: healthy ? 'VERIFIED-STABLE-BASELINE' : 'BASELINE-REJECTED',
      sourceCommit: commit,
      sourceTree: tree,
      protectedCoreFingerprintSha256: core.sha256,
      protectedCoreFiles: core.manifest.length,
      protectedScope: [
        'root JavaScript files',
        '.github/workflows/*.yml|yaml',
        'scripts/**',
        'tests/**',
        '.gitignore',
        'package metadata when present'
      ],
      mutableRuntimeStateExcluded: [
        'data/**',
        'output/**',
        'backup-staging/**',
        'restore-source/**',
        'generated audit/monitoring reports',
        'documentation-only files'
      ]
    },
    gates: {
      systemHealthHealthy: systemHealth?.status === 'HEALTHY',
      criticalIssues: Number(systemHealth?.summary?.criticalIssues || 0),
      warnings: Number(systemHealth?.summary?.warnings || 0),
      apiHealthy: api?.healthy === true,
      gitStateHealthy: gitHardening?.healthy === true,
      backupHealthy: backupCore?.healthy === true && backupFinal?.healthy === true,
      restoreHealthy: restore?.healthy === true,
      coreE2EHealthy: e2e?.healthy === true,
      trackedGitClean: trackedStatus === ''
    },
    checks,
    issues,
    coreManifest: core.manifest,
    healthy
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('Kings Stable Core Baseline Verification — Point 20');
  console.log(`Baseline ID: ${BASELINE_ID}`);
  console.log(`Source commit: ${commit}`);
  console.log(`Protected Core files: ${core.manifest.length}`);
  console.log(`CORE_BASELINE_FINGERPRINT=${core.sha256}`);
  console.log(`Checks: ${checks.filter((item) => item.ok).length}/${checks.length}`);
  console.log(`Issues: ${issues.length}`);
  console.log(`Status: ${report.baseline.status}`);

  for (const issue of issues) console.error(`- ${issue}`);
  if (!healthy) process.exitCode = 1;
}

main();
