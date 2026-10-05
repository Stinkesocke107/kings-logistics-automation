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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDiscordRetryMs(response, text, attempt) {
  let bodyRetryMs = 0;
  try {
    const parsed = text ? JSON.parse(text) : null;
    const seconds = Number(parsed?.retry_after);
    if (Number.isFinite(seconds) && seconds > 0) bodyRetryMs = Math.ceil(seconds * 1000);
  } catch {}
  const headerSeconds = Number(response?.headers?.get?.('retry-after'));
  const headerRetryMs = Number.isFinite(headerSeconds) && headerSeconds > 0 ? Math.ceil(headerSeconds * 1000) : 0;
  return Math.min(30_000, Math.max(bodyRetryMs, headerRetryMs, 750 * (2 ** attempt)));
}

async function discord(endpoint) {
  if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');
  const maxAttempts = 4;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${DISCORD_API}${endpoint}`, {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'User-Agent': 'Kings Logistics Discord Permission Audit/3.2' },
        signal: AbortSignal.timeout(15000)
      });
      const text = await response.text();
      if (response.ok) return text ? JSON.parse(text) : null;

      const retryable = response.status === 429 || response.status === 408 || response.status >= 500;
      lastError = new Error(`Discord API ${response.status}: ${text.slice(0, 300)}`);
      if (!retryable || attempt >= maxAttempts - 1) throw lastError;

      const delayMs = parseDiscordRetryMs(response, text, attempt);
      console.warn(`Discord permission audit GET ${response.status}; retry ${attempt + 1}/${maxAttempts - 1} in ${delayMs}ms.`);
      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      const retryableNetwork = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /fetch failed|socket|network|timeout/i.test(String(error?.message || error));
      if (!retryableNetwork || attempt >= maxAttempts - 1) throw error;
      const delayMs = Math.min(15_000, 750 * (2 ** attempt));
      console.warn(`Discord permission audit network error; retry ${attempt + 1}/${maxAttempts - 1} in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('Discord permission audit request failed.');
}
function mergeIntoHealth(result) {
  if (!fs.existsSync(HEALTH_FILE)) return false;
  let health;
  try { health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8')); } catch { return false; }
  const merged = new Map((Array.isArray(health.issues) ? health.issues : []).filter((x) => x?.id).map((x) => [String(x.id), x]));
  for (const [id] of [...merged]) if (id.startsWith('discord-permission:')) merged.delete(id);
  for (const issue of result.issues || []) merged.set(issue.id, issue);
  const issues = [...merged.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || String(a.id).localeCompare(String(b.id)));
  health.issues = issues;
  health.summary = health.summary || {};
  health.summary.criticalIssues = issues.filter((x) => x.severity === 'critical').length;
  health.summary.warnings = issues.filter((x) => x.severity === 'warning').length;
  health.summary.discordPermissionChecks = Number(result.summary?.checks || 0);
  health.summary.discordPermissionHealthy = Number(result.summary?.healthyChecks || 0);
  health.status = statusFromIssues(issues);
  health.discordPermissionAudit = result.summary;
  writeJson(HEALTH_FILE, health);
  return true;
}

async function main() {
  if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');

  const [me, guild, roles, channels] = await Promise.all([
    discord('/users/@me'),
    discord(`/guilds/${DISCORD_GUILD_ID}`),
    discord(`/guilds/${DISCORD_GUILD_ID}/roles`),
    discord(`/guilds/${DISCORD_GUILD_ID}/channels`)
  ]);
  const botMember = await discord(`/guilds/${DISCORD_GUILD_ID}/members/${me.id}`);
  const memberRoleIds = Array.isArray(botMember.roles) ? botMember.roles.map(String) : [];
  const base = basePermissions(DISCORD_GUILD_ID, memberRoleIds, roles);
  const roleNames = new Map((roles || []).map((role) => [String(role.id), String(role.name || '')]));
  const context = { guildId: DISCORD_GUILD_ID, memberId: String(me.id), memberRoleIds, base, roleNames };
  const { targets, roleMentionPolicy } = targetsForGuild(roles);

  const checks = [];
  const issues = [];
  const targetById = new Map();

  for (const target of targets) {
    const resolution = resolveTarget(target, channels, context);
    const selected = resolution.selected;
    if (selected?.channel) targetById.set(String(selected.channel.id), target);
    const details = {
      key: target.key,
      requestedId: target.id || null,
      requestedName: target.name || null,
      status: resolution.status,
      candidates: resolution.candidates.map((item) => ({
        id: String(item.channel.id),
        name: String(item.channel.name || ''),
        type: Number(item.channel.type),
        visible: item.visible,
        satisfies: item.satisfies,
        missing: item.missing,
        effectivePermissions: permissionNames(item.effective)
      })),
      selected: selected ? {
        id: String(selected.channel.id),
        name: String(selected.channel.name || ''),
        type: Number(selected.channel.type),
        effectivePermissions: permissionNames(selected.effective),
        missing: selected.missing
      } : null
    };
    const healthy = resolution.status === 'resolved';
    checks.push({ name: `target:${target.key}`, healthy, details });
    if (!healthy) {
      issues.push({
        id: `discord-permission:target:${target.key}`,
        severity: 'critical',
        system: 'Discord Permission Audit',
        message: `${target.key} target is ${resolution.status}.`
      });
    }
  }

  const globalBasePermissions = permissionNames(base).filter((name) => GLOBAL_WARNING.has(name));
  checks.push({ name: 'global-base-high-risk', healthy: globalBasePermissions.length === 0, details: { permissions: globalBasePermissions } });
  for (const permission of globalBasePermissions) {
    issues.push({
      id: `discord-permission:global:${permission.toLowerCase()}`,
      severity: CRITICAL.has(permission) ? 'critical' : 'warning',
      system: 'Discord Permission Audit',
      message: `Bot has ${permission} in guild-level base permissions.`
    });
  }

  const scopedFindings = scopedHighRiskFindings(channels, targetById, context);
  checks.push({ name: 'scoped-high-risk-advisories', healthy: true, advisoryOnly: true, details: { count: scopedFindings.length } });

  const summary = {
    status: statusFromIssues(issues),
    checkedAt: nowISO(),
    checks: checks.length,
    healthyChecks: checks.filter((x) => x.healthy).length,
    targets: targets.length,
    resolvedTargets: checks.filter((x) => x.name.startsWith('target:') && x.healthy).length,
    guildChannelsInspected: Array.isArray(channels) ? channels.length : 0,
    globalCritical: issues.filter((x) => x.severity === 'critical').length,
    globalWarnings: issues.filter((x) => x.severity === 'warning').length,
    acceptedScopedAdvisories: scopedFindings.length,
    roleMentionPolicy
  };
  const result = { version: 3, generatedAt: nowISO(), summary, checks, issues, scopedFindings };
  writeJson(OUTPUT_FILE, result);
  const merged = mergeIntoHealth(result);

  console.log(`Kings Discord Permission Audit v3.2: ${summary.status}`);
  console.log(`Checks: ${summary.healthyChecks}/${summary.checks}`);
  console.log(`Targets: ${summary.resolvedTargets}/${summary.targets}`);
  console.log(`Guild channels inspected: ${summary.guildChannelsInspected}`);
  console.log(`Global critical: ${summary.globalCritical}; global warnings: ${summary.globalWarnings}; accepted scoped advisories: ${summary.acceptedScopedAdvisories}`);
  console.log(`Role mention policy: ${JSON.stringify(roleMentionPolicy)}`);
  console.log(`Merged into System Health: ${merged ? 'yes' : 'no'}`);

  if (STEP_SUMMARY) {
    fs.appendFileSync(STEP_SUMMARY, `\n### Kings Discord Permission Audit v3.2\n- Status: **${summary.status}**\n- Checks: **${summary.healthyChecks}/${summary.checks}**\n- Targets: **${summary.resolvedTargets}/${summary.targets}**\n- Global critical: **${summary.globalCritical}**\n- Global warnings: **${summary.globalWarnings}**\n- Accepted scoped advisories: **${summary.acceptedScopedAdvisories}**\n`);
  }

  if (summary.status !== 'HEALTHY') process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Kings Discord Permission Audit failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  PERMISSIONS,
  basePermissions,
  effectiveChannelPermissions,
  resolveTarget,
  targetsForGuild,
  roleMentionRequiresPermission,
  scopedHighRiskFindings,
  parseDiscordRetryMs
};
