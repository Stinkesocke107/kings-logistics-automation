// Kings Driver Loyalty — Discord tenure and Kings Driver role are authoritative.
// No TruckersMP account or nickname matching, and no Kings membership/role assignment.
require('./kings-branding').installDiscordBranding();
const fs = require('fs');
const path = require('path');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const SYNC_MODE = String(process.env.DRIVER_LOYALTY_ROLE_MODE || 'dry-run').trim().toLowerCase();
const SUMMARY_FILE = path.join(__dirname, 'data', 'driver-loyalty-roles-summary.json');
const DISCORD_API = 'https://discord.com/api/v10';
const MANAGE_ROLES = 1n << 28n;
const ADMINISTRATOR = 1n << 3n;
const FORBIDDEN_ROLE_PERMISSIONS = ADMINISTRATOR | MANAGE_ROLES;
const MAX_ROLE_REMOVALS_PER_RUN = 25;
const UMBRELLA_LABEL = 'Driver Loyalty';
const KINGS_DRIVER_LABEL = 'Kings Driver';
const TIERS = [
  { id: '1m', label: '1 Month with Kings', months: 1 },
  { id: '3m', label: '3 Months with Kings', months: 3 },
  { id: '6m', label: '6 Months with Kings', months: 6 },
  { id: '1y', label: '1 Year with Kings', years: 1 },
  { id: '2y', label: '2 Years with Kings', years: 2 },
  { id: '3y', label: '3 Years with Kings', years: 3 },
  { id: '4y', label: '4 Years with Kings', years: 4 },
  { id: '5y', label: '5 Years with Kings', years: 5 }
];

if (!['dry-run', 'live'].includes(SYNC_MODE)) {
  console.error('Invalid DRIVER_LOYALTY_ROLE_MODE: dry-run or live required.');
  process.exit(1);
}
if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() { return new Date().toISOString(); }
function normalizeRoleName(name = '') {
  return String(name).normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function safeDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}
function addMonthsUTC(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
function addYearsUTC(date, years) {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(),
    date.getUTCSeconds(), date.getUTCMilliseconds()));
}
function desiredTier(joinedAt, tiers, now = new Date()) {
  if (!joinedAt) return null;
  let selected = null;
  for (const tier of tiers) {
    const earned = tier.months ? addMonthsUTC(joinedAt, tier.months) : addYearsUTC(joinedAt, tier.years);
    if (earned <= now) selected = tier;
  }
  return selected;
}
function matchingRoles(roles, name) {
  const wanted = normalizeRoleName(name);
  return roles.filter((role) => normalizeRoleName(role.name) === wanted);
}
function uniqueRole(roles, name) {
  const candidates = matchingRoles(roles, name);
  if (candidates.length !== 1) throw new Error(
    'Expected exactly one Discord role for ' + name + ', found ' + candidates.length);
  return candidates[0];
}
function resolveManagedRoles(roles) {
  const driver = uniqueRole(roles, KINGS_DRIVER_LABEL);
  const umbrella = uniqueRole(roles, UMBRELLA_LABEL);
  const tiers = TIERS.map((def) => ({ ...def, role: uniqueRole(roles, def.label) }));
  const all = [umbrella, ...tiers.map((tier) => tier.role)];
  const ids = all.map((role) => String(role.id));
  if (new Set([...ids, String(driver.id)]).size !== ids.length + 1) {
    throw new Error('Managed Loyalty roles and Kings Driver role must have distinct IDs.');
  }
  // Loyalty roles are cosmetic. Never distribute roles with administrator / role-management rights.
  for (const role of all) {
    let permissions;
    try { permissions = BigInt(String(role.permissions || '0')); }
    catch { throw new Error('Unparseable permissions for Loyalty role ' + role.name); }
    if (permissions & FORBIDDEN_ROLE_PERMISSIONS) {
      throw new Error('Loyalty role has dangerous permissions: ' + role.name);
    }
  }
  return { driver, umbrella, tiers, all, ids };
}
function validJoinedAt(member, now) {
  const joinedAt = safeDate(member?.joined_at);
  if (!joinedAt || joinedAt > now || joinedAt.getUTCFullYear() < 2015) return null;
  return joinedAt;
}
function planDiscordLoyalty(members, managed, now = new Date()) {
  if (!Array.isArray(members) || !members.length) throw new Error('Discord member roster is missing or empty.');
  const ids = new Set();
  const managedIds = new Set(managed.ids);
  const driverId = String(managed.driver.id);
  const changes = [];
  const stats = {
    guildMembers: members.length, currentDrivers: 0, eligibleForLoyaltyTier: 0,
    missingJoinDate: 0, excludedNonDrivers: 0, nonDriverCleanupCandidates: 0,
    roleAdditions: 0, roleRemovals: 0, alreadyCorrect: 0
  };
  for (const member of members) {
    if (!member?.user?.id || !Array.isArray(member.roles)) {
      throw new Error('Incomplete Discord guild member response. Aborting role synchronization.');
    }
    const id = String(member.user.id);
    if (ids.has(id)) throw new Error('Duplicate Discord member ID in roster: ' + id);
    ids.add(id);
    if (member.user.bot) continue;

    const current = new Set(member.roles.map(String));
    const isDriver = current.has(driverId);
    const currentManaged = [...managedIds].filter((roleId) => current.has(roleId));
    let tier = null;
    let desired = [];

    if (!isDriver) {
      stats.excludedNonDrivers++;
      if (!currentManaged.length) continue;
      stats.nonDriverCleanupCandidates++;
      // Explicitly remove only Loyalty roles, never Driver/Staff/other Kings roles.
    } else {
      stats.currentDrivers++;
      const joinedAt = validJoinedAt(member, now);
      if (!joinedAt) {
        stats.missingJoinDate++;
        continue; // Never remove awards because Discord omitted a join date.
      }
      tier = desiredTier(joinedAt, managed.tiers, now);
      if (tier) {
        stats.eligibleForLoyaltyTier++;
        desired = [String(managed.umbrella.id), String(tier.role.id)];
      }
    }

    const desiredSet = new Set(desired);
    const add = desired.filter((roleId) => !current.has(roleId));
    const remove = currentManaged.filter((roleId) => !desiredSet.has(roleId));
    stats.roleAdditions += add.length;
    stats.roleRemovals += remove.length;
    if (!add.length && !remove.length) stats.alreadyCorrect++;
    else changes.push({
      member, userId: id, tier: tier?.id || null, isDriver, add, remove
    });
  }
  if (!stats.currentDrivers) throw new Error('Zero Kings Driver members found; refusing role changes.');
  if (stats.roleRemovals > MAX_ROLE_REMOVALS_PER_RUN) {
    throw new Error('Unusually large Loyalty role-removal plan (' +
      stats.roleRemovals + ' > ' + MAX_ROLE_REMOVALS_PER_RUN + '); manual review required.');
  }
  return { changes, stats };
}
async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (SYNC_MODE !== 'live' && method !== 'GET') {
    throw new Error('Dry-run cannot write Discord roles: ' + method);
  }
  const response = await fetch(DISCORD_API + pathname, {
    method,
    headers: { Authorization: 'Bot ' + DISCORD_BOT_TOKEN,
      'User-Agent': 'Kings Logistics Driver Loyalty Role Sync/2.0' },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error('Discord ' + method + ' ' + pathname + ' HTTP ' +
    response.status + ': ' + body.slice(0, 200));
  return body ? JSON.parse(body) : null;
}
async function listGuildMembers() {
  const members = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ limit: '1000' });
    if (after) query.set('after', after);
    const batch = await discord('/guilds/' + DISCORD_GUILD_ID + '/members?' + query);
    if (!Array.isArray(batch)) throw new Error('Discord guild member page is not an array.');
    members.push(...batch);
    if (batch.length < 1000) return members;
    if (page === 19) throw new Error('Guild roster exceeds safe pagination limit.');
    after = batch[batch.length - 1]?.user?.id;
    if (!after) throw new Error('Discord guild member pagination cursor missing.');
  }
  throw new Error('Discord guild member enumeration incomplete.');
}
async function getGuildMemberOrNull(userId) {
  try {
    return await discord('/guilds/' + DISCORD_GUILD_ID + '/members/' + encodeURIComponent(userId));
  } catch (error) {
    if (/\bHTTP 404\b/.test(error.message)) return null;
    throw error;
  }
}
function botCanManageRoles(botMember, roles, managed) {
  const ownIds = new Set([String(DISCORD_GUILD_ID), ...(botMember.roles || []).map(String)]);
  let permissions = 0n;
  let highestPosition = 0;
  for (const role of roles) {
    if (!ownIds.has(String(role.id))) continue;
    permissions |= BigInt(String(role.permissions || '0'));
    highestPosition = Math.max(highestPosition, Number(role.position || 0));
  }
  return {
    hasManageRoles: Boolean(permissions & (MANAGE_ROLES | ADMINISTRATOR)),
    blocked: managed.all.filter((role) => Number(role.position || 0) >= highestPosition)
      .map((role) => role.name)
  };
}
async function applyRolePlan(plan) {
  for (const roleId of plan.add) {
    await discord('/guilds/' + DISCORD_GUILD_ID + '/members/' +
      plan.userId + '/roles/' + roleId, { method: 'PUT' });
  }
  for (const roleId of plan.remove) {
    await discord('/guilds/' + DISCORD_GUILD_ID + '/members/' +
      plan.userId + '/roles/' + roleId, { method: 'DELETE' });
  }
}
function writeSummary(summary) {
  fs.mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2) + '\n', 'utf8');
}
async function main() {
  console.log('Kings Driver Loyalty — Discord joined_at + Kings Driver role');
  console.log('Mode: ' + SYNC_MODE);

  const [bot, roles, members] = await Promise.all([
    discord('/users/@me'),
    discord('/guilds/' + DISCORD_GUILD_ID + '/roles'),
    listGuildMembers()
  ]);
  if (!bot?.id || !Array.isArray(roles)) throw new Error('Discord bot or guild roles unavailable.');
  const botMember = await getGuildMemberOrNull(bot.id);
  if (!botMember) throw new Error('Kings Systems bot not found in Kings Discord.');
  const managed = resolveManagedRoles(roles);
  const plan = planDiscordLoyalty(members, managed);
  const hierarchy = botCanManageRoles(botMember, roles, managed);

  if (SYNC_MODE === 'live' && (!hierarchy.hasManageRoles || hierarchy.blocked.length)) {
    throw new Error('Discord role writes blocked: missing Manage Roles or bot hierarchy too low: ' +
      hierarchy.blocked.join(', '));
  }

  console.log('Discord Members: ' + plan.stats.guildMembers);
  console.log('Kings Driver members: ' + plan.stats.currentDrivers);
  console.log('Eligible for tier: ' + plan.stats.eligibleForLoyaltyTier);
  console.log('Role changes: add ' + plan.stats.roleAdditions +
    ', remove ' + plan.stats.roleRemovals);
  console.log('Non-Driver cleanup candidates: ' + plan.stats.nonDriverCleanupCandidates);
  console.log('Members missing joined_at: ' + plan.stats.missingJoinDate);

  if (SYNC_MODE === 'live') {
    for (const change of plan.changes) await applyRolePlan(change);
  } else {
    console.log('DRY RUN — No Discord roles changed.');
  }

  const summary = {
    version: 3,
    mode: SYNC_MODE,
    source: 'discord-guild-joined_at',
    eligibility: 'Kings Driver role only (not Trial, Staff-only, Partners or bots)',
    updatedAt: nowISO(),
    ...plan.stats,
    matchedCurrentDrivers: plan.stats.currentDrivers,
    alreadyCorrect: plan.stats.alreadyCorrect,
    newMappings: 0, nameFallbackMappings: 0, noLinkedDiscord: 0,
    linkedDiscordNotOnGuild: 0, truckersmpProfileErrors: 0,
    fullDiscordMemberListAvailable: true,
    formerDriverMappingsCleaned: 0,
    umbrellaRole: { id: String(managed.umbrella.id), name: managed.umbrella.name },
    kingsDriverRoleId: String(managed.driver.id),
    tiers: managed.tiers.map((tier) => ({
      id: tier.id, label: tier.label, discordRoleId: String(tier.role.id),
      discordRoleName: tier.role.name
    })),
    safety: {
      fullDiscordRosterRequired: true,
      safeJoinDateRequired: true,
      verifiedKingsDriverRoleRequired: true,
      dangerousRolePermissionsBlocked: true,
      managedRoleRemovalsCapped: MAX_ROLE_REMOVALS_PER_RUN,
      historicalTmpMappings: 'retained unchanged for compatibility with Staff systems',
      roleWritesEnabled: SYNC_MODE === 'live'
    }
  };
  writeSummary(summary);
  console.log(SYNC_MODE === 'live'
    ? 'LIVE SYNC COMPLETE — only managed Loyalty roles changed'
    : 'DRY RUN COMPLETE — no role changes');
}
main().catch((error) => {
  console.error('Kings Driver Loyalty Role Sync failed:', error.message);
  process.exit(1);
});
