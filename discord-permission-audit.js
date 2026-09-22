const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'discord-permission-audit.json');
const HEALTH_FILE = path.join(DATA_DIR, 'system-health.json');
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || null;

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';

const PERMISSIONS = {
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  MODERATE_MEMBERS: 1n << 40n
};

const CRITICAL_PERMISSIONS = new Set([
  'ADMINISTRATOR',
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'MANAGE_ROLES',
  'MODERATE_MEMBERS'
]);

const WARNING_PERMISSIONS = new Set([
  'MANAGE_GUILD',
  'MANAGE_CHANNELS',
  'MANAGE_WEBHOOKS',
  'MUTE_MEMBERS',
  'DEAFEN_MEMBERS',
  'MOVE_MEMBERS',
  'MANAGE_NICKNAMES'
]);

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

async function discord(pathname) {
  if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'User-Agent': 'Kings Logistics Discord Permission Audit/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function permissionNames(bitfield) {
  return Object.entries(PERMISSIONS)
    .filter(([, bit]) => (bitfield & bit) === bit)
    .map(([name]) => name);
}

function mergeIntoHealth(result) {
  if (!fs.existsSync(HEALTH_FILE)) return false;
  const read = readJson(HEALTH_FILE);
  if (read.error || !read.data || typeof read.data !== 'object') return false;

  const health = read.data;
  const merged = new Map();
  for (const item of Array.isArray(health.issues) ? health.issues : []) {
    if (item?.id) merged.set(String(item.id), item);
  }

  // Remove old permission-audit findings before merging the current snapshot.
  for (const id of [...merged.keys()]) {
    if (id.startsWith('discord-permission-')) merged.delete(id);
  }
  for (const item of result.issues) {
    if (item?.id) merged.set(String(item.id), item);
  }

  health.issues = [...merged.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || String(a.system || '').localeCompare(String(b.system || '')));
  health.status = statusFromIssues(health.issues);
  health.healthy = health.status === 'HEALTHY';
  health.summary = health.summary && typeof health.summary === 'object' ? health.summary : {};
  health.summary.discordPermissionChecks = result.summary.checks;
  health.summary.discordPermissionHealthy = result.summary.healthyChecks;
  health.summary.criticalIssues = health.issues.filter((item) => item.severity === 'critical').length;
  health.summary.warnings = health.issues.filter((item) => item.severity === 'warning').length;
  health.data = health.data && typeof health.data === 'object' ? health.data : {};
  health.data.discordPermissionAudit = {
    checkedAt: result.checkedAt,
    status: result.status,
    summary: result.summary,
    bot: result.bot,
    permissions: result.permissions
  };
  health.note = 'Read-only technical monitoring, integrity, hardening, repository security, and Discord permission auditing. Kings Systems observes and reports only; it never changes members, roles, permissions, kicks, bans, timeouts, promotions, demotions, or personnel decisions.';
  writeJson(HEALTH_FILE, health);
  return true;
}

function writeStepSummary(result, merged) {
  if (!STEP_SUMMARY) return;
  const icon = result.status === 'HEALTHY' ? '✅' : result.status === 'DEGRADED' ? '⚠️' : '❌';
  const lines = [
    '',
    '## 🔑 Kings Discord Permission Audit',
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
    lines.push('### Permission Findings', '');
    for (const finding of result.issues) {
      const marker = finding.severity === 'critical' ? '❌' : '⚠️';
      lines.push(`- ${marker} **${finding.message}**`);
    }
  } else {
    lines.push('No prohibited or unnecessary high-risk Discord permissions were detected.');
  }

  lines.push('', 'This audit is GET-only. It never adds, removes, or changes Discord permissions or roles.', '');
  fs.appendFileSync(STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const issues = [];
  const checks = [];

  const me = await discord('/users/@me');
  const member = await discord(`/guilds/${DISCORD_GUILD_ID}/members/${me.id}`);
  const roles = await discord(`/guilds/${DISCORD_GUILD_ID}/roles`);

  const assignedRoleIds = new Set([String(DISCORD_GUILD_ID), ...(Array.isArray(member?.roles) ? member.roles.map(String) : [])]);
  const assignedRoles = (Array.isArray(roles) ? roles : [])
    .filter((role) => assignedRoleIds.has(String(role.id)))
    .map((role) => ({
      id: String(role.id),
      name: String(role.name || 'Unnamed Role'),
      permissions: String(role.permissions || '0')
    }));

  let effective = 0n;
  for (const role of assignedRoles) {
    try { effective |= BigInt(role.permissions); } catch {}
  }

  const effectiveNames = permissionNames(effective);
  const critical = effectiveNames.filter((name) => CRITICAL_PERMISSIONS.has(name));
  const warnings = effectiveNames.filter((name) => WARNING_PERMISSIONS.has(name));

  const roleSources = assignedRoles.map((role) => {
    let bits = 0n;
    try { bits = BigInt(role.permissions); } catch {}
    return {
      name: role.name,
      highRiskPermissions: permissionNames(bits).filter((name) => CRITICAL_PERMISSIONS.has(name) || WARNING_PERMISSIONS.has(name))
    };
  }).filter((role) => role.highRiskPermissions.length);

  checks.push(check('discord-bot-resolved', Boolean(me?.id && member), { botId: String(me?.id || ''), guildId: String(DISCORD_GUILD_ID) }));
  checks.push(check('discord-no-prohibited-permissions', critical.length === 0, { detected: critical }));
  checks.push(check('discord-no-unnecessary-high-risk-permissions', warnings.length === 0, { detected: warnings }));

  if (critical.length) {
    issues.push(issue(
      'discord-permission-prohibited',
      'critical',
      'Discord Permission Security',
      `Kings Systems has prohibited/high-impact Discord permission(s): ${critical.join(', ')}. Human review is required; the audit will not change them automatically.`,
      { permissions: critical, roleSources }
    ));
  }

  if (warnings.length) {
    issues.push(issue(
      'discord-permission-high-risk',
      'warning',
      'Discord Permission Security',
      `Kings Systems has additional high-risk Discord permission(s) that should be reviewed for least privilege: ${warnings.join(', ')}.`,
      { permissions: warnings, roleSources }
    ));
  }

  const result = {
    version: 1,
    mode: 'read-only-discord-permission-audit',
    checkedAt: nowISO(),
    status: statusFromIssues(issues),
    healthy: issues.length === 0,
    summary: {
      checks: checks.length,
      healthyChecks: checks.filter((item) => item.ok).length,
      failedChecks: checks.filter((item) => !item.ok).length,
      criticalIssues: issues.filter((item) => item.severity === 'critical').length,
      warnings: issues.filter((item) => item.severity === 'warning').length,
      assignedRoles: assignedRoles.length
    },
    issues,
    checks,
    bot: {
      id: String(me.id),
      username: String(me.username || 'Kings Systems')
    },
    permissions: {
      critical,
      warnings,
      roleSources
    },
    note: 'GET-only Discord permission audit. No roles, permissions, members, kicks, bans, timeouts, promotions, demotions, or personnel actions are changed.'
  };

  writeJson(OUTPUT_FILE, result);
  const merged = mergeIntoHealth(result);
  writeStepSummary(result, merged);

  console.log('================================');
  console.log('Kings Discord Permission Audit');
  console.log('================================');
  console.log(`Status: ${result.status}`);
  console.log(`Checks: ${result.summary.healthyChecks}/${result.summary.checks} healthy`);
  console.log(`Assigned roles inspected: ${result.summary.assignedRoles}`);
  console.log(`Critical permission findings: ${critical.length}`);
  console.log(`High-risk permission warnings: ${warnings.length}`);
  for (const finding of issues) console.log(`[${finding.severity.toUpperCase()}] ${finding.message}`);
  console.log('Safety: GET-only audit; no Discord permissions or roles are changed.');
}

main().catch((error) => {
  console.error('Kings Discord Permission Audit failed:', String(error.message || error));
  process.exit(1);
});
