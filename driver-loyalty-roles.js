// Driver Loyalty role synchronization: TruckersMP tenure -> verified Discord member -> managed loyalty roles.
require('./kings-branding').installDiscordBranding();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const SYNC_MODE = String(process.env.DRIVER_LOYALTY_ROLE_MODE || 'dry-run').trim().toLowerCase();

const DRIVER_STATE_FILE = path.join(__dirname, 'data', 'driver-management.json');
const ROLE_STATE_FILE = path.join(__dirname, 'data', 'driver-loyalty-roles.json');
const SUMMARY_FILE = path.join(__dirname, 'data', 'driver-loyalty-roles-summary.json');

const DISCORD_API = 'https://discord.com/api/v10';
const TMP_API = 'https://api.truckersmp.com/v2';
const MANAGE_ROLES = 1n << 28n;
const ADMINISTRATOR = 1n << 3n;
let ROLE_WRITES_ENABLED = SYNC_MODE === 'live';
let ROLE_WRITE_BLOCK_REASON = null;

const UMBRELLA_LABEL = 'Driver Loyalty';
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
  console.error('DRIVER_LOYALTY_ROLE_MODE must be dry-run or live.');
  process.exit(1);
}
if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}
if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function deriveKey(domain) {
  return crypto
    .createHash('sha256')
    .update(`${domain}\0`)
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function decrypt(container, domain) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error(`Encrypted state for ${domain} is not in the expected format.`);
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(domain),
    Buffer.from(container.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

function encrypt(value, domain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(domain), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    version: 1,
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonthsUTC(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function addYearsUTC(date, years) {
  const result = new Date(date.getTime());
  const month = result.getUTCMonth();
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  result.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), month + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function earnedDate(joinDate, tier) {
  if (tier.months) return addMonthsUTC(joinDate, tier.months);
  if (tier.years) return addYearsUTC(joinDate, tier.years);
  return null;
}

function normalizeRoleName(value = '') {
  return String(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeIdentity(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function memberIdentityValues(member) {
  return [
    member?.nick,
    member?.user?.global_name,
    member?.user?.username
  ]
    .map(normalizeIdentity)
    .filter(Boolean);
}

function buildIdentityIndex(members) {
  const index = new Map();

  for (const member of members || []) {
    if (!member?.user?.id || member.user.bot) continue;
    for (const value of new Set(memberIdentityValues(member))) {
      const ids = index.get(value) || new Set();
      ids.add(String(member.user.id));
      index.set(value, ids);
    }
  }

  return index;
}

function validSnowflake(value) {
  return /^\d{15,22}$/.test(String(value || '').trim());
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  if (!ROLE_WRITES_ENABLED && method !== 'GET') {
    throw new Error(`Role-write safety guard blocked Discord write: ${method} ${pathname}`);
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Driver Loyalty Roles/1.3'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${pathname}: ${text.slice(0, 500)}`);
  }

  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function listGuildMembersOptional() {
  const members = [];
  let after = null;

  try {
    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({ limit: '1000' });
      if (after) query.set('after', after);

      const response = await fetch(
        `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members?${query.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            'User-Agent': 'Kings Logistics Driver Loyalty Roles/1.3'
          },
          signal: AbortSignal.timeout(15000)
        }
      );

      const text = await response.text();
      if (response.status === 403) {
        console.log(
          'Discord full member list unavailable; exact-name fallback disabled. ' +
          'Enable Server Members Intent to cover Drivers without public TruckersMP Discord links.'
        );
        return { available: false, members: [] };
      }
      if (!response.ok) {
        throw new Error(
          `Discord API ${response.status} while listing guild members: ${text.slice(0, 500)}`
        );
      }

      const batch = text ? JSON.parse(text) : [];
      if (!Array.isArray(batch)) throw new Error('Discord guild members response is invalid.');

      members.push(...batch);
      if (batch.length < 1000) break;

      after = batch[batch.length - 1]?.user?.id || null;
      if (!after) throw new Error('Discord member pagination cursor is missing.');
    }

    return {
      available: true,
      members: members.filter((member) => member?.user?.id && !member.user.bot)
    };
  } catch (error) {
    throw new Error(`Discord member-list fallback failed: ${error.message}`);
  }
}

async function getGuildMemberOrNull(userId) {
  const response = await fetch(
    `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${encodeURIComponent(userId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'User-Agent': 'Kings Logistics Driver Loyalty Roles/1.3'
      },
      signal: AbortSignal.timeout(15000)
    }
  );

  const text = await response.text();
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Discord API ${response.status} while resolving guild member ${userId}: ${text.slice(0, 500)}`
    );
  }

  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function fetchPlayerProfile(tmpId) {
  let lastError = null;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(`${TMP_API}/player/${encodeURIComponent(tmpId)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Kings Logistics Driver Loyalty Roles/1.3'
        },
        signal: AbortSignal.timeout(12000)
      });

      const text = await response.text();

      if (response.status === 429) {
        const retryAfter = Number.parseFloat(response.headers.get('retry-after') || '');
        const resetAfter = Number.parseFloat(response.headers.get('x-ratelimit-reset-after') || '');
        const seconds = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : Number.isFinite(resetAfter) && resetAfter > 0
            ? resetAfter
            : 65;

        const waitMs = Math.ceil(Math.min(Math.max(seconds, 1), 90) * 1000);
        console.warn(
          `TruckersMP player API rate limited at TMP ${tmpId}; waiting ${Math.ceil(waitMs / 1000)}s before retry.`
        );
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      }

      const payload = text ? JSON.parse(text) : null;
      if (!payload || payload.error === true || !payload.response) {
        throw new Error(`TruckersMP returned no usable player profile for TMP ${tmpId}.`);
      }

      return payload.response;
    } catch (error) {
      lastError = error;
      if (attempt < 6) await sleep(500 * attempt);
    }
  }

  throw lastError || new Error(`TruckersMP player lookup failed for TMP ${tmpId}.`);
}

function loadDriverState() {
  const container = readJson(DRIVER_STATE_FILE, null);
  if (!container) throw new Error('Driver Management state is missing.');
  return decrypt(container, 'kings-driver-management-v1');
}

function loadRoleState() {
  const container = readJson(ROLE_STATE_FILE, null);
  if (!container) {
    return {
      version: 1,
      initializedAt: nowISO(),
      updatedAt: nowISO(),
      mappings: []
    };
  }
  return decrypt(container, 'kings-driver-loyalty-roles-v1');
}

function roleMatches(roles, label) {
  const wanted = normalizeRoleName(label);
  return (roles || []).filter((role) => normalizeRoleName(role.name) === wanted);
}

function resolveManagedRoles(roles) {
  const umbrellaMatches = roleMatches(roles, UMBRELLA_LABEL);
  if (umbrellaMatches.length !== 1) {
    throw new Error(
      `Expected exactly one Discord role matching "${UMBRELLA_LABEL}", found ${umbrellaMatches.length}.`
    );
  }

  const tiers = [];
  for (const definition of TIERS) {
    const matches = roleMatches(roles, definition.label);
    if (matches.length > 1) {
      throw new Error(`Multiple Discord roles match loyalty tier "${definition.label}".`);
    }
    if (matches.length === 1) tiers.push({ ...definition, role: matches[0] });
  }

  if (!tiers.length) throw new Error('No Driver Loyalty tier roles were found on Discord.');
  return { umbrella: umbrellaMatches[0], tiers };
}

function botCanManageRoles(botMember, roles, managedRoles) {
  const ids = new Set([String(DISCORD_GUILD_ID), ...(botMember.roles || []).map(String)]);
  let permissions = 0n;
  let highestPosition = 0;

  for (const role of roles || []) {
    if (!ids.has(String(role.id))) continue;
    try { permissions |= BigInt(String(role.permissions || '0')); } catch {}
    highestPosition = Math.max(highestPosition, Number(role.position || 0));
  }

  const hasManageRoles = Boolean(permissions & ADMINISTRATOR) || Boolean(permissions & MANAGE_ROLES);
  const blocked = managedRoles
    .filter((role) => Number(role.position || 0) >= highestPosition)
    .map((role) => role.name);

  return { hasManageRoles, highestPosition, blocked };
}

function desiredTier(joinDate, availableTiers, now = new Date()) {
  if (!joinDate) return null;
  let selected = null;

  for (const tier of availableTiers) {
    const date = earnedDate(joinDate, tier);
    if (date && date.getTime() <= now.getTime()) selected = tier;
  }

  return selected;
}

function mappingMap(state) {
  return new Map(
    (Array.isArray(state.mappings) ? state.mappings : [])
      .filter((item) => Number.isFinite(Number(item.tmpId)))
      .map((item) => [Number(item.tmpId), { ...item }])
  );
}

async function addRole(userId, roleId) {
  if (!ROLE_WRITES_ENABLED) return;
  await discord(
    `/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`,
    { method: 'PUT' }
  );
}

async function removeRole(userId, roleId) {
  if (!ROLE_WRITES_ENABLED) return;
  await discord(
    `/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`,
    { method: 'DELETE' }
  );
}

async function applyDesiredRoles(member, desiredRoleIds, managedRoleIds) {
  const current = new Set((member.roles || []).map(String));
  const desired = new Set(desiredRoleIds.map(String));
  const managed = new Set(managedRoleIds.map(String));

  const remove = [...managed].filter((roleId) => current.has(roleId) && !desired.has(roleId));
  const add = [...desired].filter((roleId) => !current.has(roleId));

  for (const roleId of remove) await removeRole(member.user.id, roleId);
  for (const roleId of add) await addRole(member.user.id, roleId);

  return { add, remove };
}

async function main() {
  console.log('======================================');
  console.log('Kings Driver Loyalty Role Sync');
  console.log('======================================');
  console.log(`Mode: ${SYNC_MODE}`);

  const driverState = loadDriverState();
  const currentDrivers = (Array.isArray(driverState.drivers) ? driverState.drivers : [])
    .filter((driver) => driver.current && Number.isFinite(Number(driver.tmpId)));

  const [bot, roles] = await Promise.all([
    discord('/users/@me'),
    discord(`/guilds/${DISCORD_GUILD_ID}/roles`)
  ]);
  const botMember = await getGuildMemberOrNull(bot.id);
  if (!botMember) throw new Error('Could not resolve the Kings Systems bot as a guild member.');

  const managed = resolveManagedRoles(roles);
  const allManagedRoles = [managed.umbrella, ...managed.tiers.map((tier) => tier.role)];
  const hierarchy = botCanManageRoles(botMember, roles, allManagedRoles);

  console.log(`Current TruckersMP Drivers: ${currentDrivers.length}`);
  console.log(`Driver Loyalty umbrella: ${managed.umbrella.name} (${managed.umbrella.id})`);
  console.log(`Loyalty tiers found: ${managed.tiers.map((tier) => tier.label).join(', ')}`);
  console.log(
    `Bot Manage Roles: ${hierarchy.hasManageRoles ? 'yes' : 'no'} | ` +
    `highest bot role position: ${hierarchy.highestPosition}`
  );
  if (hierarchy.blocked.length) {
    console.log(`Role hierarchy blocked: ${hierarchy.blocked.join(', ')}`);
  }

  if (SYNC_MODE === 'live') {
    if (!hierarchy.hasManageRoles) {
      ROLE_WRITES_ENABLED = false;
      ROLE_WRITE_BLOCK_REASON = 'missing-manage-roles';
      console.warn(
        'LIVE role writes blocked: Kings Systems bot is missing Manage Roles. ' +
        'The run will remain read-only and keep verified mappings only.'
      );
    } else if (hierarchy.blocked.length) {
      ROLE_WRITES_ENABLED = false;
      ROLE_WRITE_BLOCK_REASON = 'role-hierarchy-blocked';
      console.warn(
        `LIVE role writes blocked by role hierarchy: ${hierarchy.blocked.join(', ')}`
      );
    }
  }

  const guildMemberList = await listGuildMembersOptional();
  const memberById = new Map(
    guildMemberList.members.map((member) => [String(member.user.id), member])
  );
  const identityIndex = buildIdentityIndex(guildMemberList.members);
  console.log(
    `Discord exact-name fallback: ${guildMemberList.available
      ? `available (${guildMemberList.members.length} members)`
      : 'unavailable'}`
  );

  let state = loadRoleState();
  const byTmpId = mappingMap(state);
  const currentIds = new Set(currentDrivers.map((driver) => Number(driver.tmpId)));
  const claimedDiscordIds = new Set();

  let matched = 0;
  let newMappings = 0;
  let nameFallbackMappings = 0;
  let noLinkedDiscord = 0;
  let notOnGuild = 0;
  let profileErrors = 0;
  let eligible = 0;
  let additions = 0;
  let removals = 0;
  let unchanged = 0;
  let formerCleaned = 0;

  const unresolved = [];

  for (const driver of currentDrivers) {
    const tmpId = Number(driver.tmpId);
    const joinDate = safeDate(driver.joinDate);
    let record = byTmpId.get(tmpId) || null;
    let profile = null;
    let publicLinkedId = null;

    const storedVerifiedId = record?.discordUserId && validSnowflake(record.discordUserId)
      ? String(record.discordUserId)
      : null;

    if (!storedVerifiedId) {
      try {
        profile = await fetchPlayerProfile(tmpId);
        publicLinkedId = validSnowflake(profile?.discordSnowflake)
          ? String(profile.discordSnowflake)
          : null;

        // Keep first-time population comfortably below the public Player API
        // request rate. Future runs reuse the verified Discord snowflake.
        await sleep(1100);
      } catch (error) {
        profileErrors += 1;
        unresolved.push({
          tmpId,
          username: String(driver.username || ''),
          reason: 'truckersmp-profile-error'
        });
        console.warn(`- ${driver.username} | TMP ${tmpId} | profile lookup failed: ${error.message}`);
        continue;
      }
    }

    let discordUserId = publicLinkedId || storedVerifiedId;
    let mappingSource = publicLinkedId
      ? 'truckersmp-discordSnowflake'
      : storedVerifiedId
        ? 'stored-verified-mapping'
        : null;

    if (!discordUserId && guildMemberList.available) {
      const candidates = [...(identityIndex.get(normalizeIdentity(driver.username)) || [])]
        .filter((id) => !claimedDiscordIds.has(String(id)));

      if (candidates.length === 1) {
        discordUserId = String(candidates[0]);
        mappingSource = 'exact-discord-name-fallback';
        nameFallbackMappings += 1;
      } else if (candidates.length > 1) {
        unresolved.push({
          tmpId,
          username: String(driver.username || ''),
          reason: 'ambiguous-exact-discord-name-match'
        });
        continue;
      }
    }

    if (!discordUserId) {
      noLinkedDiscord += 1;
      unresolved.push({
        tmpId,
        username: String(driver.username || ''),
        reason: guildMemberList.available
          ? 'no-public-discord-link-and-no-exact-name-match'
          : 'truckersmp-discord-not-linked-or-private'
      });
      continue;
    }

    if (claimedDiscordIds.has(discordUserId)) {
      unresolved.push({
        tmpId,
        username: String(driver.username || ''),
        reason: 'discord-account-already-mapped'
      });
      continue;
    }

    let member = memberById.get(String(discordUserId)) || null;
    try {
      if (!member) member = await getGuildMemberOrNull(discordUserId);
    } catch (error) {
      throw new Error(
        `Could not verify Discord member for TMP ${tmpId} / Discord ${discordUserId}: ${error.message}`
      );
    }

    if (!member) {
      notOnGuild += 1;
      unresolved.push({
        tmpId,
        username: String(driver.username || ''),
        reason: 'linked-discord-account-not-in-kings-server'
      });
      continue;
    }

    claimedDiscordIds.add(discordUserId);
    matched += 1;

    if (!record || String(record.discordUserId || '') !== discordUserId) newMappings += 1;

    record = {
      ...(record || {}),
      tmpId,
      discordUserId,
      username: String(driver.username || ''),
      joinDate: joinDate ? joinDate.toISOString() : null,
      current: true,
      source: mappingSource || 'stored-verified-mapping',
      firstMatchedAt: record?.firstMatchedAt || nowISO(),
      lastVerifiedAt: nowISO(),
      updatedAt: nowISO()
    };
    byTmpId.set(tmpId, record);

    const tier = joinDate ? desiredTier(joinDate, managed.tiers) : null;
    record.expectedTier = tier?.id || null;
    record.expectedTierLabel = tier?.label || null;

    const desiredIds = tier
      ? [String(managed.umbrella.id), String(tier.role.id)]
      : [];
    const managedIds = allManagedRoles.map((role) => String(role.id));
    const changes = await applyDesiredRoles(member, desiredIds, managedIds);

    if (tier) eligible += 1;
    additions += changes.add.length;
    removals += changes.remove.length;
    if (!changes.add.length && !changes.remove.length) unchanged += 1;

    const action = changes.add.length || changes.remove.length
      ? `add [${changes.add.join(', ') || 'none'}], remove [${changes.remove.join(', ') || 'none'}]`
      : 'already correct';

    console.log(
      `- ${driver.username} | TMP ${tmpId} | Discord ${discordUserId} | ` +
      `Tier: ${tier?.label || 'under 1 month'} | ` +
      `${ROLE_WRITES_ENABLED ? action : `would ${action}`}`
    );
  }

  for (const [tmpId, record] of byTmpId.entries()) {
    if (currentIds.has(Number(tmpId))) continue;

    record.current = false;
    record.updatedAt = nowISO();

    if (!record.discordUserId || !validSnowflake(record.discordUserId)) continue;

    const member = await getGuildMemberOrNull(String(record.discordUserId));
    if (!member) continue;

    const managedIds = allManagedRoles.map((role) => String(role.id));
    const changes = await applyDesiredRoles(member, [], managedIds);
    additions += changes.add.length;
    removals += changes.remove.length;
    if (changes.remove.length) formerCleaned += 1;
  }

  state.version = 2;
  state.mode = 'automatic-loyalty-role-sync';
  state.updatedAt = nowISO();
  state.mappings = [...byTmpId.values()].sort((a, b) => Number(a.tmpId) - Number(b.tmpId));

  const summary = {
    version: 2,
    mode: SYNC_MODE,
    updatedAt: state.updatedAt,
    currentDrivers: currentDrivers.length,
    matchedCurrentDrivers: matched,
    newMappings,
    nameFallbackMappings,
    fullDiscordMemberListAvailable: guildMemberList.available,
    noLinkedDiscord,
    linkedDiscordNotOnGuild: notOnGuild,
    truckersmpProfileErrors: profileErrors,
    eligibleForLoyaltyTier: eligible,
    roleAdditions: additions,
    roleRemovals: removals,
    alreadyCorrect: unchanged,
    formerDriverMappingsCleaned: formerCleaned,
    umbrellaRole: {
      id: String(managed.umbrella.id),
      name: managed.umbrella.name
    },
    tiers: managed.tiers.map((tier) => ({
      id: tier.id,
      label: tier.label,
      discordRoleId: String(tier.role.id),
      discordRoleName: tier.role.name
    })),
    unresolved,
    safety: {
      mappingSource: 'TruckersMP player.discordSnowflake, stored verified mapping, or unique exact Discord name fallback',
      fullDiscordMemberListRequired: false,
      exactNameFallbackRequiresServerMembersIntent: true,
      privateOrMissingDiscordLinksSkipped: true,
      usersNotInKingsServerSkipped: true,
      persistedDiscordIdUsedAfterFirstVerifiedMatch: true,
      roleWritesEnabled: ROLE_WRITES_ENABLED,
      roleWriteBlockReason: ROLE_WRITE_BLOCK_REASON
    }
  };

  writeJson(ROLE_STATE_FILE, encrypt(state, 'kings-driver-loyalty-roles-v1'));
  writeJson(SUMMARY_FILE, summary);

  console.log('--------------------------------------');
  console.log(`Matched current Drivers: ${matched}/${currentDrivers.length}`);
  console.log(`Eligible for a loyalty tier: ${eligible}`);
  console.log(`Exact-name fallback mappings: ${nameFallbackMappings}`);
  console.log(`No linked/public Discord or exact fallback: ${noLinkedDiscord}`);
  console.log(`Linked Discord not on Kings server: ${notOnGuild}`);
  console.log(`TruckersMP profile errors: ${profileErrors}`);
  console.log(`Role additions: ${additions} | Role removals: ${removals}`);
  console.log(`Former mapped Drivers cleaned: ${formerCleaned}`);
  console.log(
    `Result: ${ROLE_WRITES_ENABLED
      ? 'LIVE SYNC COMPLETE'
      : SYNC_MODE === 'live'
        ? `LIVE SYNC BLOCKED (${ROLE_WRITE_BLOCK_REASON || 'safety-precondition'}) — NO DISCORD ROLES CHANGED`
        : 'DRY-RUN ONLY — NO DISCORD ROLES CHANGED'}`
  );
}

main().catch((error) => {
  console.error('Kings Driver Loyalty Role Sync failed:', error.message);
  process.exit(1);
});
