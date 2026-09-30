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

const CONVOY_DRIVER_ROLE_ID = '1476774746480709675';
const CONVOY_APPROVAL_ROLE_IDS = [
  '1378658861816217600',
  '1363949241138941952',
  '1492930716156166165',
  '1492930713459364031',
  '1199767340787703828',
  '1433646186778329228',
  '1492929616019718285',
  '1114967608920395866'
];

const PERMISSIONS = {
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  MODERATE_MEMBERS: 1n << 40n
};

const CRITICAL = new Set(['ADMINISTRATOR', 'KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_ROLES', 'MODERATE_MEMBERS']);
const GLOBAL_WARNING = new Set([
  'MANAGE_GUILD', 'MANAGE_CHANNELS', 'MANAGE_MESSAGES', 'MANAGE_WEBHOOKS',
  'MANAGE_EVENTS', 'MANAGE_THREADS', 'MENTION_EVERYONE', 'MUTE_MEMBERS',
  'DEAFEN_MEMBERS', 'MOVE_MEMBERS', 'MANAGE_NICKNAMES'
]);
const SCOPED_HIGH_RISK = new Set([
  ...CRITICAL,
  'MANAGE_CHANNELS', 'MANAGE_MESSAGES', 'MANAGE_WEBHOOKS', 'MANAGE_EVENTS',
  'MANAGE_THREADS', 'MENTION_EVERYONE'
]);

const BASE_TARGETS = [
  { key: 'driver-leadership', name: 'driver-leadership', types: [0, 5], required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'] },
  { key: 'staff-leadership', name: 'staff-leadership', types: [0, 5], required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'] },
  { key: 'hr-leadership', name: 'hr-leadership', types: [0, 5], required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'] },
  { key: 'management-overview', name: 'management-overview', types: [0, 5], required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'EMBED_LINKS'] },
  { key: 'system-monitor', name: 'system-monitor', types: [0, 5], required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'] },
  { key: 'system-alerts', name: 'system-alerts', types: [0, 5], required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'EMBED_LINKS'] },
  {
    key: 'convoy-management-forum',
    id: '1550619824005062697',
    types: [15, 16],
    required: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY', 'SEND_MESSAGES_IN_THREADS', 'MANAGE_THREADS'],
    allowedRisk: ['MANAGE_THREADS']
  },
  {
    key: 'kings-convoy-source-forum',
    id: '1506133821693755502',
    types: [15, 16],
    required: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY']
  },
  {
    key: 'public-convoys',
    id: '1351613882791366838',
    types: [0, 5],
    required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'EMBED_LINKS', 'ATTACH_FILES', 'MENTION_EVERYONE'],
    allowedRisk: ['MENTION_EVERYONE']
  },
  {
    key: 'convoy-overview',
    id: '1550619865805754378',
    types: [0, 5],
    required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY']
  },
  {
    key: 'convoy-reminders',
    id: '1550997669596631200',
    types: [0, 5],
    required: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY']
  }
];

function nowISO() { return new Date().toISOString(); }
function bits(value) { try { return BigInt(value || 0); } catch { return 0n; } }
function severityRank(value) { return value === 'critical' ? 2 : value === 'warning' ? 1 : 0; }
function statusFromIssues(issues) {
  const highest = issues.reduce((max, item) => Math.max(max, severityRank(item.severity)), 0);
  return highest >= 2 ? 'UNHEALTHY' : highest === 1 ? 'DEGRADED' : 'HEALTHY';
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function normalizeChannelName(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function permissionNames(value) {
  const valueBits = bits(value);
  return Object.entries(PERMISSIONS).filter(([, bit]) => (valueBits & bit) === bit).map(([name]) => name);
}
function hasPermission(value, name) {
  const valueBits = bits(value);
  if ((valueBits & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) return true;
  return Boolean(PERMISSIONS[name] && (valueBits & PERMISSIONS[name]) === PERMISSIONS[name]);
}
function basePermissions(guildId, memberRoleIds, roles) {
  const ids = new Set([String(guildId), ...(memberRoleIds || []).map(String)]);
  return (roles || []).reduce((all, role) => ids.has(String(role.id)) ? all | bits(role.permissions) : all, 0n);
}
function applyOverwrite(value, overwrite) {
  return overwrite ? (value & ~bits(overwrite.deny)) | bits(overwrite.allow) : value;
}
function effectiveChannelPermissions(channel, guildId, memberId, memberRoleIds, base) {
  let value = bits(base);
  if (hasPermission(value, 'ADMINISTRATOR')) return value;
  const overwrites = Array.isArray(channel?.permission_overwrites) ? channel.permission_overwrites : [];
  value = applyOverwrite(value, overwrites.find((o) => Number(o.type) === 0 && String(o.id) === String(guildId)));
  const roleIds = new Set((memberRoleIds || []).map(String));
  let allow = 0n;
  let deny = 0n;
  for (const overwrite of overwrites) {
    if (Number(overwrite.type) !== 0 || !roleIds.has(String(overwrite.id))) continue;
    allow |= bits(overwrite.allow);
    deny |= bits(overwrite.deny);
  }
  value = (value & ~deny) | allow;
  return applyOverwrite(value, overwrites.find((o) => Number(o.type) === 1 && String(o.id) === String(memberId)));
}
function missingPermissions(value, required) { return required.filter((name) => !hasPermission(value, name)); }
function candidateChannels(target, channels) {
  const types = new Set(target.types);
  if (target.id) return (channels || []).filter((c) => types.has(Number(c.type)) && String(c.id) === String(target.id));
  const wanted = normalizeChannelName(target.name);
  return (channels || []).filter((c) => types.has(Number(c.type)) && normalizeChannelName(c.name) === wanted);
}
function resolveTarget(target, channels, context) {
  const candidates = candidateChannels(target, channels).map((channel) => {
    const effective = effectiveChannelPermissions(channel, context.guildId, context.memberId, context.memberRoleIds, context.base);
    const missing = missingPermissions(effective, target.required);
    return { channel, effective, missing, satisfies: missing.length === 0, visible: hasPermission(effective, 'VIEW_CHANNEL') };
  });
  const good = candidates.filter((item) => item.satisfies);
  if (good.length === 1) return { status: 'resolved', selected: good[0], candidates };
  if (good.length > 1) return { status: 'ambiguous', selected: null, candidates };
  if (!candidates.length) return { status: 'missing', selected: null, candidates };
  return { status: 'insufficient', selected: candidates.find((item) => item.visible) || candidates[0], candidates };
}
function roleById(roles, id) {
  return (roles || []).find((role) => String(role.id) === String(id)) || null;
}
function roleMentionRequiresPermission(role) {
  return Boolean(role && role.mentionable !== true);
}
function targetsForGuild(roles) {
  const targets = BASE_TARGETS.map((target) => ({
    ...target,
    required: [...target.required],
    allowedRisk: [...(target.allowedRisk || [])]
  }));

  const byKey = new Map(targets.map((target) => [target.key, target]));
  const approvalRoles = CONVOY_APPROVAL_ROLE_IDS.map((id) => roleById(roles, id)).filter(Boolean);
  const approvalNeedsMentionPermission = approvalRoles.some(roleMentionRequiresPermission);
  if (approvalNeedsMentionPermission) {
    byKey.get('convoy-management-forum').required.push('MENTION_EVERYONE');
    byKey.get('convoy-management-forum').allowedRisk.push('MENTION_EVERYONE');
  }

  const driverRole = roleById(roles, CONVOY_DRIVER_ROLE_ID);
  const driverNeedsMentionPermission = roleMentionRequiresPermission(driverRole);
  if (driverNeedsMentionPermission) {
    byKey.get('convoy-reminders').required.push('MENTION_EVERYONE');
    byKey.get('convoy-reminders').allowedRisk.push('MENTION_EVERYONE');
  }

  return {
    targets,
    roleMentionPolicy: {
      approvalRolesFound: approvalRoles.length,
      approvalRolesConfigured: CONVOY_APPROVAL_ROLE_IDS.length,
      approvalNeedsMentionPermission,
      driverRoleFound: Boolean(driverRole),
      driverRoleMentionable: driverRole ? Boolean(driverRole.mentionable) : null,
      driverNeedsMentionPermission
    }
  };
}
function permissionGrantSources(channel, permissionName, context) {
  const permission = PERMISSIONS[permissionName];
  if (!permission) return [];
  const relevantIds = new Set([String(context.guildId), ...context.memberRoleIds.map(String), String(context.memberId)]);
  return (channel?.permission_overwrites || [])
    .filter((overwrite) => relevantIds.has(String(overwrite.id)) && (bits(overwrite.allow) & permission) === permission)
    .map((overwrite) => ({
      id: String(overwrite.id),
      type: Number(overwrite.type) === 1 ? 'member' : String(overwrite.id) === String(context.guildId) ? 'everyone' : 'role',
      name: Number(overwrite.type) === 1
        ? 'Kings Systems bot member overwrite'
        : String(overwrite.id) === String(context.guildId)
          ? '@everyone'
          : context.roleNames.get(String(overwrite.id)) || 'Unknown role'
    }));
}
function scopedHighRiskFindings(channels, targetById, context) {
  const findings = [];
  for (const channel of channels || []) {
    if (![0, 5, 15, 16].includes(Number(channel.type))) continue;
    const effective = effectiveChannelPermissions(channel, context.guildId, context.memberId, context.memberRoleIds, context.base);
    const detected = permissionNames(effective).filter((name) => SCOPED_HIGH_RISK.has(name));
    const target = targetById.get(String(channel.id));
    const allowed = new Set(target?.allowedRisk || []);
    const unexpected = detected.filter((name) => !allowed.has(name));
    if (unexpected.length) {
      findings.push({
        channelId: String(channel.id),
        channelName: String(channel.name || ''),
        target: target?.key || null,
        permissions: unexpected,
        grantSources: Object.fromEntries(unexpected.map((permission) => [permission, permissionGrantSources(channel, permission, context)]))
      });
    }
  }
  return findings;
}

async function discord(endpoint) {
  if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');
  const response = await fetch(`${DISCORD_API}${endpoint}`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'User-Agent': 'Kings Logistics Discord Permission Audit/3.0' },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
function mergeIntoHealth(result) {
  if (!fs.existsSync(HEALTH_FILE)) return false;
  let health;
  try { health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8')); } catch { return false; }
  const merged = new Map((Array.isArray(health.issues) ? health.issues : []).filter((x) => x?.id).map((x) => [String(x.id), x]));
  for (const id of [...merged.keys()]) if (id.startsWith('discord-permission-')) merged.delete(id);
  for (const item of result.issues) merged.set(item.id, item);
  health.issues = [...merged.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  health.status = statusFromIssues(health.issues);
  health.healthy = health.status === 'HEALTHY';
  health.summary = health.summary || {};
  health.summary.discordPermissionChecks = result.summary.checks;
  health.summary.discordPermissionHealthy = result.summary.healthyChecks;
  health.summary.criticalIssues = health.issues.filter((x) => x.severity === 'critical').length;
  health.summary.warnings = health.issues.filter((x) => x.severity === 'warning').length;
  health.data = health.data || {};
  health.data.discordPermissionAudit = {
    checkedAt: result.checkedAt,
    status: result.status,
    summary: result.summary,
    bot: result.bot,
    permissions: result.permissions,
    roleMentionPolicy: result.roleMentionPolicy,
    channels: result.channels
  };
  writeJson(HEALTH_FILE, health);
  return true;
}
function writeSummary(result, merged) {
  if (!STEP_SUMMARY) return;
  const lines = [
    '', '## 🔑 Kings Discord Permission Audit v3', '',
    `**Status: ${result.status}**`,
    `- Checks: **${result.summary.healthyChecks}/${result.summary.checks}**`,
    `- Target channels: **${result.summary.healthyTargets}/${result.summary.targetChannels}**`,
    `- Critical: **${result.summary.criticalIssues}**`,
    `- Warnings: **${result.summary.warnings}**`,
    `- Unexpected scoped permission grants: **${result.summary.scopedHighRiskFindings} channel(s)**`,
    `- Merged into health: **${merged ? 'Yes' : 'No'}**`, ''
  ];
  if (result.scopedHighRiskFindings.length) {
    lines.push('### Least-Privilege Findings', '');
    for (const finding of result.scopedHighRiskFindings) {
      lines.push(`- **#${finding.channelName}** (${finding.channelId}): ${finding.permissions.join(', ')}`);
    }
    lines.push('');
  }
  lines.push('GET-only audit; no Discord role or permission changes are performed.', '');
  fs.appendFileSync(STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const issues = [];
  const checks = [];
  const [me, roles, channels] = await Promise.all([
    discord('/users/@me'),
    discord(`/guilds/${DISCORD_GUILD_ID}/roles`),
    discord(`/guilds/${DISCORD_GUILD_ID}/channels`)
  ]);
  const member = await discord(`/guilds/${DISCORD_GUILD_ID}/members/${me.id}`);
  const memberRoleIds = Array.isArray(member?.roles) ? member.roles.map(String) : [];
  const roleNames = new Map((roles || []).map((role) => [String(role.id), String(role.name || 'Unnamed Role')]));
  const base = basePermissions(DISCORD_GUILD_ID, memberRoleIds, roles);
  const baseNames = permissionNames(base);
  const globalCritical = baseNames.filter((name) => CRITICAL.has(name));
  const globalWarnings = baseNames.filter((name) => GLOBAL_WARNING.has(name));
  checks.push({ check: 'bot-resolved', ok: Boolean(me?.id && member) });
  checks.push({ check: 'no-global-critical', ok: !globalCritical.length, details: globalCritical });
  checks.push({ check: 'no-global-high-risk', ok: !globalWarnings.length, details: globalWarnings });
  if (globalCritical.length) issues.push({ id: 'discord-permission-global-critical', severity: 'critical', system: 'Discord Permission Security', message: `Prohibited server-wide permissions: ${globalCritical.join(', ')}`, details: globalCritical });
  if (globalWarnings.length) issues.push({ id: 'discord-permission-global-warning', severity: 'warning', system: 'Discord Permission Security', message: `High-risk server-wide permissions should be channel-scoped: ${globalWarnings.join(', ')}`, details: globalWarnings });

  const { targets, roleMentionPolicy } = targetsForGuild(roles);
  const context = { guildId: DISCORD_GUILD_ID, memberId: String(me.id), memberRoleIds, base, roleNames };
  const channelResults = [];
  const targetById = new Map();
  for (const target of targets) {
    const resolved = resolveTarget(target, channels, context);
    const selected = resolved.selected;
    channelResults.push({
      key: target.key,
      status: resolved.status,
      required: target.required,
      allowedRisk: target.allowedRisk || [],
      candidateCount: resolved.candidates.length,
      satisfyingCandidates: resolved.candidates.filter((x) => x.satisfies).length,
      channel: selected ? {
        id: String(selected.channel.id),
        name: String(selected.channel.name || ''),
        type: Number(selected.channel.type),
        missing: selected.missing,
        effectivePermissions: permissionNames(selected.effective)
      } : null
    });
    checks.push({ check: `target-${target.key}`, ok: resolved.status === 'resolved' });
    if (resolved.status === 'resolved') {
      targetById.set(String(selected.channel.id), target);
    } else if (resolved.status === 'ambiguous') {
      issues.push({ id: `discord-permission-${target.key}-ambiguous`, severity: 'critical', system: 'Discord Permission Security', message: `${target.key} has multiple valid channel targets.`, details: resolved.candidates.map((x) => ({ id: String(x.channel.id), name: x.channel.name, satisfies: x.satisfies })) });
    } else if (resolved.status === 'missing') {
      issues.push({ id: `discord-permission-${target.key}-missing`, severity: 'critical', system: 'Discord Permission Security', message: `${target.key} channel is missing.`, details: target.id || target.name });
    } else {
      issues.push({ id: `discord-permission-${target.key}-insufficient`, severity: 'critical', system: 'Discord Permission Security', message: `${target.key} is missing effective permissions: ${selected.missing.join(', ')}`, details: { id: String(selected.channel.id), name: selected.channel.name, missing: selected.missing } });
    }
  }

  const scoped = scopedHighRiskFindings(channels, targetById, context);
  checks.push({ check: 'scoped-high-risk-only-where-required', ok: !scoped.length, details: scoped });
  if (scoped.length) issues.push({
    id: 'discord-permission-scoped-high-risk',
    severity: 'warning',
    system: 'Discord Permission Security',
    message: `High-risk Discord permissions exceed the verified Kings Automation scope in ${scoped.length} channel(s).`,
    details: scoped
  });

  const result = {
    version: 3,
    mode: 'read-only-discord-least-privilege-audit',
    checkedAt: nowISO(),
    status: statusFromIssues(issues),
    healthy: !issues.length,
    summary: {
      checks: checks.length,
      healthyChecks: checks.filter((x) => x.ok).length,
      failedChecks: checks.filter((x) => !x.ok).length,
      criticalIssues: issues.filter((x) => x.severity === 'critical').length,
      warnings: issues.filter((x) => x.severity === 'warning').length,
      guildChannelsInspected: Array.isArray(channels) ? channels.length : 0,
      targetChannels: targets.length,
      healthyTargets: channelResults.filter((x) => x.status === 'resolved').length,
      scopedHighRiskFindings: scoped.length
    },
    issues,
    checks,
    bot: { id: String(me.id), username: String(me.username || '') },
    permissions: { globalCritical, globalWarnings },
    roleMentionPolicy,
    channels: channelResults,
    scopedHighRiskFindings: scoped,
    note: 'GET-only least-privilege audit. Verified exceptions are restricted to operations present in the Kings Automation code. No Discord roles or permissions are changed.'
  };
  writeJson(OUTPUT_FILE, result);
  const merged = mergeIntoHealth(result);
  writeSummary(result, merged);
  console.log(`Kings Discord Permission Audit v3: ${result.status}`);
  console.log(`Checks: ${result.summary.healthyChecks}/${result.summary.checks}`);
  console.log(`Targets: ${result.summary.healthyTargets}/${result.summary.targetChannels}`);
  console.log(`Guild channels inspected: ${result.summary.guildChannelsInspected}`);
  console.log(`Global critical: ${globalCritical.length}; global warnings: ${globalWarnings.length}; unexpected scoped: ${scoped.length}`);
  console.log(`Role mention policy: ${JSON.stringify(roleMentionPolicy)}`);
  for (const target of channelResults) console.log(`- ${target.key}: ${target.status}${target.channel ? ` | #${target.channel.name} (${target.channel.id})${target.channel.missing.length ? ` | missing ${target.channel.missing.join(', ')}` : ''}` : ''}`);
  for (const finding of scoped) console.log(`[LEAST-PRIVILEGE] #${finding.channelName} (${finding.channelId}): ${finding.permissions.join(', ')}`);
  for (const finding of issues.filter((x) => x.id !== 'discord-permission-scoped-high-risk')) console.log(`[${finding.severity.toUpperCase()}] ${finding.message}`);
}

if (require.main === module) main().catch((error) => { console.error('Kings Discord Permission Audit failed:', error.message); process.exit(1); });
module.exports = {
  PERMISSIONS,
  BASE_TARGETS,
  normalizeChannelName,
  permissionNames,
  hasPermission,
  basePermissions,
  effectiveChannelPermissions,
  missingPermissions,
  resolveTarget,
  roleMentionRequiresPermission,
  targetsForGuild,
  permissionGrantSources,
  scopedHighRiskFindings
};
