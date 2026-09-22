const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'system-hardening.json');
const HEALTH_FILE = path.join(DATA_DIR, 'system-health.json');
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || null;

const REQUIRED_CORE_FILES = [
  'system-monitoring.js',
  'system-alerts.js',
  'data-integrity.js',
  'system-hardening.js',
  'core-backup.js',
  'backup-final-check.js',
  'core-recovery.js',
  'recovery-safety-check.js',
  '.github/workflows/system-monitoring.yml',
  '.github/workflows/core-backup.yml',
  '.github/workflows/core-recovery.yml'
];

const FORBIDDEN_EXACT = new Set(['.env', 'credentials.json', 'secrets.json']);
const FORBIDDEN_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx', '.crt', '.cer', '.jks', '.keystore', '.token', '.secret'];

function nowISO() { return new Date().toISOString(); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function readJson(file) {
  try { return { data: JSON.parse(fs.readFileSync(file, 'utf8')), error: null }; }
  catch (error) { return { data: null, error: String(error.message || error) }; }
}
function severityRank(value) { return value === 'critical' ? 2 : value === 'warning' ? 1 : 0; }
function statusFromIssues(issues) {
  const highest = issues.reduce((max, item) => Math.max(max, severityRank(item.severity)), 0);
  if (highest >= 2) return 'UNHEALTHY';
  if (highest === 1) return 'DEGRADED';
  return 'HEALTHY';
}
function issue(id, severity, system, message, details = null) { return { id, severity, system, message, details }; }
function check(name, ok, details = null) { return { check: name, ok: Boolean(ok), details }; }

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${(result.stderr || '').trim()}`);
  return String(result.stdout || '').split('\0').filter(Boolean);
}

function checkRequiredCore(files, issues, checks) {
  const set = new Set(files);
  const missing = REQUIRED_CORE_FILES.filter((file) => !set.has(file));
  checks.push(check('required-core-files', missing.length === 0, { expected: REQUIRED_CORE_FILES.length, missing }));
  if (missing.length) issues.push(issue('hardening-core-files-missing', 'critical', 'System Hardening', `${missing.length} required technical core file(s) are missing.`, missing));
}

function checkForbiddenFiles(files, issues, checks) {
  const forbidden = files.filter((relativePath) => {
    const normalized = relativePath.replace(/\\/g, '/');
    const base = path.posix.basename(normalized).toLowerCase();
    if (base === '.env.example') return false;
    if (base === '.env' || base.startsWith('.env.')) return true;
    if (FORBIDDEN_EXACT.has(base)) return true;
    return FORBIDDEN_EXTENSIONS.some((ext) => base.endsWith(ext));
  });
  checks.push(check('no-tracked-secret-files', forbidden.length === 0, { forbidden }));
  if (forbidden.length) issues.push(issue('hardening-secret-files-tracked', 'critical', 'Repository Security', 'Forbidden secret/credential file(s) are tracked in git.', forbidden));
}

function checkPrivateKeyMaterial(files, issues, checks) {
  const textFiles = files.filter((file) => /\.(?:js|cjs|mjs|json|ya?ml|md|txt)$/i.test(file) || path.basename(file).startsWith('.'));
  const hits = [];
  for (const relativePath of textFiles) {
    const full = path.join(ROOT, relativePath);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile() || fs.statSync(full).size > 2 * 1024 * 1024) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) hits.push(relativePath);
  }
  checks.push(check('no-private-key-material', hits.length === 0, { hits }));
  if (hits.length) issues.push(issue('hardening-private-key-material', 'critical', 'Repository Security', 'Private key material was detected in tracked text files.', hits));
}

function checkJsonFiles(files, issues, checks) {
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  const invalid = [];
  for (const relativePath of jsonFiles) {
    const result = readJson(path.join(ROOT, relativePath));
    if (result.error) invalid.push({ file: relativePath, error: result.error });
  }
  checks.push(check('tracked-json-valid', invalid.length === 0, { checked: jsonFiles.length, invalid: invalid.map((item) => item.file) }));
  if (invalid.length) issues.push(issue('hardening-invalid-json', 'critical', 'Repository Integrity', `${invalid.length} tracked JSON file(s) are invalid.`, invalid.map((item) => item.file)));
}

function checkJavaScriptSyntax(files, issues, checks) {
  const scripts = files.filter((file) => /\.(?:js|cjs|mjs)$/i.test(file));
  const failures = [];
  for (const relativePath of scripts) {
    const result = spawnSync(process.execPath, ['--check', relativePath], { cwd: ROOT, encoding: 'utf8' });
    if (result.status !== 0) failures.push({ file: relativePath, error: String(result.stderr || result.stdout || '').trim().slice(0, 800) });
  }
  checks.push(check('javascript-syntax', failures.length === 0, { checked: scripts.length, failures: failures.map((item) => item.file) }));
  if (failures.length) issues.push(issue('hardening-js-syntax', 'critical', 'Repository Integrity', `${failures.length} JavaScript file(s) fail node --check.`, failures.map((item) => item.file)));
}

function workflowFiles(files) { return files.filter((file) => /^\.github\/workflows\/.*\.ya?ml$/i.test(file)); }
function extractWorkflowName(content, fallback) {
  const match = content.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  return match ? match[1].trim() : fallback;
}
function extractNodeReferences(content) {
  const refs = [];
  const regex = /\bnode(?:\s+--[A-Za-z0-9_-]+(?:=[^\s]+)?)*\s+["']?([A-Za-z0-9_./-]+\.(?:js|cjs|mjs))["']?/g;
  let match;
  while ((match = regex.exec(content))) refs.push(match[1]);
  return [...new Set(refs)];
}

function checkWorkflows(files, issues, checks) {
  const workflows = workflowFiles(files);
  const fileSet = new Set(files);
  const names = new Map();
  const missingScripts = [];
  const missingPermissions = [];
  const dangerousPermission = [];
  const pullRequestTarget = [];

  for (const relativePath of workflows) {
    const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    const name = extractWorkflowName(content, relativePath);
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(relativePath);

    for (const ref of extractNodeReferences(content)) {
      const normalized = path.posix.normalize(ref.replace(/^\.\//, ''));
      if (!fileSet.has(normalized)) missingScripts.push({ workflow: relativePath, script: normalized });
    }
    if (!/^permissions:\s*(?:$|\{)/m.test(content)) missingPermissions.push(relativePath);
    if (/^permissions:\s*write-all\s*$/m.test(content)) dangerousPermission.push(relativePath);
    if (/^\s*pull_request_target\s*:/m.test(content)) pullRequestTarget.push(relativePath);
  }

  const duplicateNames = [...names.entries()].filter(([, paths]) => paths.length > 1).map(([name, paths]) => ({ name, paths }));
  checks.push(check('workflow-script-references', missingScripts.length === 0, { workflows: workflows.length, missingScripts }));
  checks.push(check('workflow-unique-names', duplicateNames.length === 0, { duplicateNames }));
  checks.push(check('workflow-explicit-permissions', missingPermissions.length === 0, { missingPermissions }));
  checks.push(check('workflow-no-write-all', dangerousPermission.length === 0, { dangerousPermission }));
  checks.push(check('workflow-no-pull-request-target', pullRequestTarget.length === 0, { pullRequestTarget }));

  if (missingScripts.length) issues.push(issue('hardening-workflow-missing-script', 'critical', 'Workflow Integrity', 'A workflow references a script that is not tracked in the repository.', missingScripts));
  if (duplicateNames.length) issues.push(issue('hardening-workflow-duplicate-name', 'warning', 'Workflow Integrity', 'Duplicate GitHub Actions workflow names were found.', duplicateNames));
  if (missingPermissions.length) issues.push(issue('hardening-workflow-permissions-missing', 'warning', 'Workflow Security', 'Workflow(s) do not declare explicit permissions.', missingPermissions));
  if (dangerousPermission.length) issues.push(issue('hardening-workflow-write-all', 'critical', 'Workflow Security', 'Workflow(s) use permissions: write-all.', dangerousPermission));
  if (pullRequestTarget.length) issues.push(issue('hardening-pull-request-target', 'warning', 'Workflow Security', 'pull_request_target is enabled and requires manual security review.', pullRequestTarget));
}

function checkGitignore(issues, checks) {
  const file = path.join(ROOT, '.gitignore');
  if (!fs.existsSync(file)) {
    checks.push(check('gitignore-secret-rules', false, { reason: 'missing-.gitignore' }));
    issues.push(issue('hardening-gitignore-missing', 'critical', 'Repository Security', '.gitignore is missing.'));
    return;
  }
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const requiredRules = ['.env', '*.pem', '*.key', 'credentials.json', 'secrets.json'];
  const missing = requiredRules.filter((rule) => !lines.includes(rule));
  checks.push(check('gitignore-secret-rules', missing.length === 0, { missing }));
  if (missing.length) issues.push(issue('hardening-gitignore-secret-rules', 'warning', 'Repository Security', 'Recommended secret-file ignore rules are missing.', missing));
}

function mergeIntoHealth(result) {
  if (!fs.existsSync(HEALTH_FILE)) return false;
  const healthResult = readJson(HEALTH_FILE);
  if (healthResult.error || !healthResult.data || typeof healthResult.data !== 'object') return false;
  const health = healthResult.data;
  const mergedById = new Map();
  for (const item of Array.isArray(health.issues) ? health.issues : []) if (item?.id) mergedById.set(String(item.id), item);
  for (const item of result.issues) if (item?.id) mergedById.set(String(item.id), item);
  health.issues = [...mergedById.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || String(a.system || '').localeCompare(String(b.system || '')));
  health.status = statusFromIssues(health.issues);
  health.healthy = health.status === 'HEALTHY';
  health.summary = health.summary && typeof health.summary === 'object' ? health.summary : {};
  health.summary.hardeningChecks = result.summary.checks;
  health.summary.hardeningHealthy = result.summary.healthyChecks;
  health.summary.criticalIssues = health.issues.filter((item) => item.severity === 'critical').length;
  health.summary.warnings = health.issues.filter((item) => item.severity === 'warning').length;
  health.data = health.data && typeof health.data === 'object' ? health.data : {};
  health.data.hardening = { checkedAt: result.checkedAt, status: result.status, summary: result.summary, checks: result.checks };
  health.note = 'Read-only technical monitoring, integrity, and hardening. Kings Systems observes and reports only; it never performs personnel, member, role, permission, kick, ban, promotion, demotion, or disciplinary actions.';
  writeJson(HEALTH_FILE, health);
  return true;
}

function writeStepSummary(result, merged) {
  if (!STEP_SUMMARY) return;
  const icon = result.status === 'HEALTHY' ? '✅' : result.status === 'DEGRADED' ? '⚠️' : '❌';
  const lines = ['', '## 🔧 Kings Final System Hardening', '', `${icon} **Status: ${result.status}**`, '', `- Checks: **${result.summary.checks}**`, `- Healthy: **${result.summary.healthyChecks}**`, `- Critical findings: **${result.summary.criticalIssues}**`, `- Warnings: **${result.summary.warnings}**`, `- Tracked files inspected: **${result.summary.trackedFiles}**`, `- Merged into System Health: **${merged ? 'Yes' : 'No'}**`, ''];
  if (result.issues.length) {
    lines.push('### Hardening Findings', '');
    for (const finding of result.issues.slice(0, 25)) {
      const marker = finding.severity === 'critical' ? '❌' : '⚠️';
      lines.push(`- ${marker} **${finding.system}:** ${finding.message}`);
    }
  } else lines.push('All final hardening checks passed.');
  lines.push('', 'Safety: technical/read-only validation only. No Discord member, role, permission, Driver, Staff, HR, or personnel action is performed.', '');
  fs.appendFileSync(STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
  const issues = [];
  const checks = [];
  const files = trackedFiles();
  checkRequiredCore(files, issues, checks);
  checkForbiddenFiles(files, issues, checks);
  checkPrivateKeyMaterial(files, issues, checks);
  checkJsonFiles(files, issues, checks);
  checkJavaScriptSyntax(files, issues, checks);
  checkWorkflows(files, issues, checks);
  checkGitignore(issues, checks);

  const result = {
    version: 1,
    mode: 'read-only-final-hardening',
    checkedAt: nowISO(),
    status: statusFromIssues(issues),
    healthy: issues.length === 0,
    summary: {
      checks: checks.length,
      healthyChecks: checks.filter((item) => item.ok).length,
      failedChecks: checks.filter((item) => !item.ok).length,
      criticalIssues: issues.filter((item) => item.severity === 'critical').length,
      warnings: issues.filter((item) => item.severity === 'warning').length,
      trackedFiles: files.length,
      javascriptFiles: files.filter((file) => /\.(?:js|cjs|mjs)$/i.test(file)).length,
      workflowFiles: workflowFiles(files).length,
      jsonFiles: files.filter((file) => file.endsWith('.json')).length
    },
    issues,
    checks,
    note: 'Read-only final technical hardening. No personnel, member, role, permission, kick, ban, promotion, demotion, or disciplinary actions are performed.'
  };
  writeJson(OUTPUT_FILE, result);
  const merged = mergeIntoHealth(result);
  writeStepSummary(result, merged);
  console.log('=================================');
  console.log('Kings Final System Hardening');
  console.log('=================================');
  console.log(`Status: ${result.status}`);
  console.log(`Checks: ${result.summary.healthyChecks}/${result.summary.checks} healthy`);
  console.log(`Tracked files: ${result.summary.trackedFiles}`);
  console.log(`JavaScript files: ${result.summary.javascriptFiles}`);
  console.log(`Workflow files: ${result.summary.workflowFiles}`);
  console.log(`JSON files: ${result.summary.jsonFiles}`);
  console.log(`Critical findings: ${result.summary.criticalIssues}`);
  console.log(`Warnings: ${result.summary.warnings}`);
  console.log(`Merged into System Health: ${merged ? 'yes' : 'no'}`);
  for (const finding of issues) console.log(`[${finding.severity.toUpperCase()}] ${finding.system}: ${finding.message}`);
  console.log('Safety: read-only technical validation; no personnel or Discord role actions.');
  return result;
}

try { run(); }
catch (error) {
  const failure = {
    version: 1,
    mode: 'read-only-final-hardening',
    checkedAt: nowISO(),
    status: 'UNHEALTHY',
    healthy: false,
    summary: { checks: 0, healthyChecks: 0, failedChecks: 1, criticalIssues: 1, warnings: 0, trackedFiles: 0, javascriptFiles: 0, workflowFiles: 0, jsonFiles: 0 },
    issues: [issue('system-hardening-engine-failed', 'critical', 'System Hardening', `System hardening engine failed: ${String(error.message || error)}`)],
    checks: [],
    note: 'Read-only final technical hardening engine failure. No personnel or Discord role actions were performed.'
  };
  try { writeJson(OUTPUT_FILE, failure); } catch {}
  const merged = mergeIntoHealth(failure);
  try { writeStepSummary(failure, merged); } catch {}
  console.error('Kings System Hardening failed:', error);
  console.log(`Failure merged into System Health: ${merged ? 'yes' : 'no'}`);
  process.exitCode = 1;
}
