const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'security-audit.json');
const HEALTH_FILE = path.join(DATA_DIR, 'system-health.json');
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || null;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'Stinkesocke107/kings-logistics-automation';
const GITHUB_API = 'https://api.github.com';

function nowISO() { return new Date().toISOString(); }
function severityRank(value) { return value === 'critical' ? 2 : value === 'warning' ? 1 : 0; }
function statusFromIssues(issues) {
  const highest = issues.reduce((max, item) => Math.max(max, severityRank(item.severity)), 0);
  if (highest >= 2) return 'UNHEALTHY';
  if (highest === 1) return 'DEGRADED';
  return 'HEALTHY';
}
function issue(id, severity, system, message, details = null) { return { id, severity, system, message, details }; }
function check(name, ok, details = null) { return { check: name, ok: Boolean(ok), details }; }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function readJson(file) {
  try { return { data: JSON.parse(fs.readFileSync(file, 'utf8')), error: null }; }
  catch (error) { return { data: null, error: String(error.message || error) }; }
}

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${(result.stderr || '').trim()}`);
  return String(result.stdout || '').split('\0').filter(Boolean);
}

function textFiles(files) {
  return files.filter((file) => /\.(?:js|cjs|mjs|json|ya?ml|md|txt|env|ini|cfg|conf)$/i.test(file) || path.basename(file).startsWith('.'));
}

function scanCredentials(files, issues, checks) {
  const patterns = [
    { category: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
    { category: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
    { category: 'Discord webhook', regex: /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]{20,}/g },
    { category: 'Discord token', regex: /\b[MN][A-Za-z0-9_-]{22,26}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,45}\b/g },
    { category: 'AWS access key', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
    { category: 'Private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g }
  ];

  const hits = [];
  for (const relativePath of textFiles(files)) {
    const full = path.join(ROOT, relativePath);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile() || fs.statSync(full).size > 2 * 1024 * 1024) continue;
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(content))) {
        const line = content.slice(0, match.index).split(/\r?\n/).length;
        hits.push({ file: relativePath, line, category: pattern.category });
        if (hits.length >= 100) break;
      }
      if (hits.length >= 100) break;
    }
    if (hits.length >= 100) break;
  }

  const unique = [...new Map(hits.map((item) => [`${item.file}:${item.line}:${item.category}`, item])).values()];
  checks.push(check('credential-pattern-scan', unique.length === 0, { scannedFiles: textFiles(files).length, findings: unique }));
  if (unique.length) {
    issues.push(issue(
      'security-credential-pattern-detected',
      'critical',
      'Repository Security',
      `${unique.length} possible credential/token pattern(s) were detected in tracked files. Secret values are intentionally not included in this report.`,
      unique
    ));
  }
}

function scanActionPinning(files, issues, checks) {
  const workflows = files.filter((file) => /^\.github\/workflows\/.*\.ya?ml$/i.test(file));
  const unpinned = [];
  const external = [];

  for (const relativePath of workflows) {
    const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(/^\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/);
      if (!match) return;
      const value = match[1];
      if (value.startsWith('./')) return;

      if (value.startsWith('docker://')) {
        external.push({ file: relativePath, line: index + 1, action: value.split('@')[0] });
        if (!/@sha256:[a-f0-9]{64}$/i.test(value)) unpinned.push({ file: relativePath, line: index + 1, action: value.split('@')[0], ref: value.includes('@') ? value.split('@').pop() : null });
        return;
      }

      const at = value.lastIndexOf('@');
      const action = at >= 0 ? value.slice(0, at) : value;
      const ref = at >= 0 ? value.slice(at + 1) : '';
      external.push({ file: relativePath, line: index + 1, action });
      if (!/^[a-f0-9]{40}$/i.test(ref)) unpinned.push({ file: relativePath, line: index + 1, action, ref: ref || null });
    });
  }

  checks.push(check('external-actions-pinned', unpinned.length === 0, { externalUses: external.length, unpinned }));
  if (unpinned.length) {
    issues.push(issue(
      'security-unpinned-github-actions',
      'warning',
      'GitHub Actions Security',
      `${unpinned.length} external GitHub Action reference(s) are not pinned to an immutable commit SHA.`,
      unpinned
    ));
  }
}

async function githubJson(pathname) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Kings Logistics Security Audit/1.0'
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const response = await fetch(`${GITHUB_API}${pathname}`, { headers, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function rulesetTargetsMain(detail) {
  const include = detail?.conditions?.ref_name?.include;
  if (!Array.isArray(include) || include.length === 0) return true;
  return include.some((value) => {
    const normalized = String(value).toLowerCase();
    return normalized === '~default_branch' || normalized === '~all' || normalized === 'main' || normalized === 'refs/heads/main' || normalized === 'refs/heads/*' || normalized === '*';
  });
}

async function checkMainProtection(issues, checks) {
  try {
    const listed = await githubJson(`/repos/${GITHUB_REPOSITORY}/rulesets`);
    const rulesets = Array.isArray(listed) ? listed : [];
    const inspected = [];
    let protectedMain = false;

    for (const item of rulesets) {
      if (item?.target !== 'branch') continue;
      const detail = await githubJson(`/repos/${GITHUB_REPOSITORY}/rulesets/${item.id}`);
      const rules = Array.isArray(detail?.rules) ? detail.rules.map((rule) => rule.type) : [];
      const active = detail?.enforcement === 'active';
      const targetsMain = rulesetTargetsMain(detail);
      const deletion = rules.includes('deletion');
      const forcePush = rules.includes('non_fast_forward');
      inspected.push({ id: item.id, name: item.name, enforcement: detail?.enforcement || null, targetsMain, deletionProtection: deletion, forcePushProtection: forcePush });
      if (active && targetsMain && deletion && forcePush) protectedMain = true;
    }

    checks.push(check('main-branch-protection', protectedMain, { rulesets: inspected }));
    if (!protectedMain) {
      issues.push(issue(
        'security-main-protection-inactive',
        'warning',
        'GitHub Repository Protection',
        'main is not currently verified as protected by an active ruleset that blocks branch deletion and non-fast-forward/force pushes.',
        { rulesets: inspected }
      ));
    }
  } catch (error) {
    checks.push(check('main-branch-protection', false, { reason: 'verification-failed' }));
    issues.push(issue(
      'security-main-protection-unverified',
      'warning',
      'GitHub Repository Protection',
      'Could not verify repository rulesets from the GitHub API.',
      { error: String(error.message || error).replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 300) }
    ));
  }
}

function mergeIntoHealth(result) {
  if (!fs.existsSync(HEALTH_FILE)) return false;
  const read = readJson(HEALTH_FILE);
  if (read.error || !read.data || typeof read.data !== 'object') return false;
  const health = read.data;
  const merged = new Map();
  for (const item of Array.isArray(health.issues) ? health.issues : []) if (item?.id) merged.set(String(item.id), item);
  for (const item of result.issues) if (item?.id) merged.set(String(item.id), item);
  health.issues = [...merged.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || String(a.system || '').localeCompare(String(b.system || '')));
  health.status = statusFromIssues(health.issues);
  health.healthy = health.status === 'HEALTHY';
  health.summary = health.summary && typeof health.summary === 'object' ? health.summary : {};
  health.summary.securityChecks = result.summary.checks;
  health.summary.securityHealthy = result.summary.healthyChecks;
  health.summary.criticalIssues = health.issues.filter((item) => item.severity === 'critical').length;
  health.summary.warnings = health.issues.filter((item) => item.severity === 'warning').length;
  health.data = health.data && typeof health.data === 'object' ? health.data : {};
  health.data.securityAudit = { checkedAt: result.checkedAt, status: result.status, summary: result.summary, checks: result.checks };
  health.note = 'Read-only technical monitoring, integrity, hardening, and security auditing. Kings Systems observes and reports only; it never performs personnel, member, role, permission, kick, ban, promotion, demotion, or disciplinary actions.';
  writeJson(HEALTH_FILE, health);
  return true;
}

function writeStepSummary(result, merged) {
  if (!STEP_SUMMARY) return;
  const icon = result.status === 'HEALTHY' ? '✅' : result.status === 'DEGRADED' ? '⚠️' : '❌';
  const lines = [
    '',
    '## 🔐 Kings Repository Security Audit',
    '',
    `${icon} **Status: ${result.status}**`,
    '',
    `- Checks: **${result.summary.checks}**`,
    `- Healthy: **${result.summary.healthyChecks}**`,
    `- Critical findings: **${result.summary.criticalIssues}**`,
    `- Warnings: **${result.summary.warnings}**`,
    `- Merged into System Health: **${merged ? 'Yes' : 'No'}**`,
    ''
  ];
  if (result.issues.length) {
    lines.push('### Security Findings', '');
    for (const finding of result.issues.slice(0, 25)) {
      const marker = finding.severity === 'critical' ? '❌' : '⚠️';
      lines.push(`- ${marker} **${finding.system}:** ${finding.message}`);
    }
  } else {
    lines.push('Repository security checks passed.');
  }
  lines.push('', 'Secret values are never written to the report. This audit is read-only and performs no Discord/member/personnel changes.', '');
  fs.appendFileSync(STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const issues = [];
  const checks = [];
  const files = trackedFiles();

  scanCredentials(files, issues, checks);
  scanActionPinning(files, issues, checks);
  await checkMainProtection(issues, checks);

  const result = {
    version: 1,
    mode: 'read-only-repository-security-audit',
    checkedAt: nowISO(),
    status: statusFromIssues(issues),
    healthy: issues.length === 0,
    summary: {
      checks: checks.length,
      healthyChecks: checks.filter((item) => item.ok).length,
      failedChecks: checks.filter((item) => !item.ok).length,
      criticalIssues: issues.filter((item) => item.severity === 'critical').length,
      warnings: issues.filter((item) => item.severity === 'warning').length,
      trackedFiles: files.length
    },
    issues,
    checks,
    note: 'Read-only repository security audit. Secret values are never included in output. No Discord roles, permissions, members, Driver/Staff/HR status, kicks, bans, promotions, demotions, or disciplinary actions are performed.'
  };

  writeJson(OUTPUT_FILE, result);
  const merged = mergeIntoHealth(result);
  writeStepSummary(result, merged);

  console.log('================================');
  console.log('Kings Repository Security Audit');
  console.log('================================');
  console.log(`Status: ${result.status}`);
  console.log(`Checks: ${result.summary.healthyChecks}/${result.summary.checks} healthy`);
  console.log(`Critical findings: ${result.summary.criticalIssues}`);
  console.log(`Warnings: ${result.summary.warnings}`);
  console.log(`Merged into System Health: ${merged ? 'yes' : 'no'}`);
  for (const finding of issues) console.log(`[${finding.severity.toUpperCase()}] ${finding.system}: ${finding.message}`);
  console.log('Safety: audit is read-only; secret values are never printed.');
}

main().catch((error) => {
  console.error('Kings Repository Security Audit failed:', String(error.message || error));
  process.exit(1);
});
