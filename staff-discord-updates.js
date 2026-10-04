require('./kings-branding').installDiscordBranding();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const STATE_KEY = process.env.STAFF_STATE_KEY || process.env.DRIVER_STATE_KEY;
const PUBLIC_CHANNEL_ID = process.env.STAFF_PUBLIC_UPDATES_CHANNEL_ID || '1494095653096128604';
const MODE = String(process.env.STAFF_PUBLIC_UPDATES_MODE || 'dry-run').trim().toLowerCase();

const STATE_FILE = path.join(__dirname, 'data', 'staff-discord-updates.json');
const SUMMARY_FILE = path.join(__dirname, 'data', 'staff-discord-updates-summary.json');
const STAFF_MANAGEMENT_FILE = path.join(__dirname, 'data', 'staff-management.json');
const LOYALTY_MAPPING_FILE = path.join(__dirname, 'data', 'driver-loyalty-roles.json');
const STATE_DOMAIN = 'kings-staff-discord-updates-v1';
const STAFF_MANAGEMENT_DOMAIN = 'kings-staff-management-v1';
const LOYALTY_MAPPING_DOMAIN = 'kings-driver-loyalty-roles-v1';
const DISCORD_API = 'https://discord.com/api/v10';
const TMP_API = 'https://api.truckersmp.com/v2';

const HIERARCHY = [
  { key: 'staff', label: 'Staff', level: 1 },
  { key: 'team lead', label: 'Team Lead', level: 2 },
  { key: 'director', label: 'Director', level: 3 },
  { key: 'management', label: 'Management', level: 4 },
  { key: 'head management', label: 'Head Management', level: 5 }
];

if (!['dry-run', 'live'].includes(MODE)) {
  console.error('STAFF_PUBLIC_UPDATES_MODE must be dry-run or live.');
  process.exit(1);
}
if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}
if (!STATE_KEY || String(STATE_KEY).length < 32) {
  console.error('STAFF_STATE_KEY / DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
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

function deriveKey(domain = STATE_DOMAIN) {
  return crypto
    .createHash('sha256')
    .update(`${domain}\0`)
    .update(String(STATE_KEY))
    .digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(STATE_DOMAIN), iv);
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

function decryptDomain(container, domain, label) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error(`${label} is not in the expected encrypted format.`);
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

function decrypt(container) {
  return decryptDomain(container, STATE_DOMAIN, 'Staff Discord Updates state');
}

function loadState() {
  const container = readJson(STATE_FILE, null);
  if (!container) return null;
  return decrypt(container);
}

function loadStaffManagementState() {
  const container = readJson(STAFF_MANAGEMENT_FILE, null);
  if (!container) throw new Error('TruckersMP Staff Management state is missing.');
  return decryptDomain(container, STAFF_MANAGEMENT_DOMAIN, 'TruckersMP Staff Management state');
}

function loadLoyaltyMappings() {
  const container = readJson(LOYALTY_MAPPING_FILE, null);
  if (!container) return [];
  const state = decryptDomain(container, LOYALTY_MAPPING_DOMAIN, 'Driver Loyalty mapping state');
  return Array.isArray(state.mappings) ? state.mappings : [];
}

function normalize(value = '') {
  return String(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  if (MODE !== 'live' && method !== 'GET') {
    throw new Error(`Dry-run safety guard blocked Discord write: ${method} ${pathname}`);
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Staff Public Updates/1.0'
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

async function listGuildMembers() {
  const members = [];
  let after = null;

  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: '1000' });
    if (after) query.set('after', after);

    const batch = await discord(`/guilds/${DISCORD_GUILD_ID}/members?${query.toString()}`);
    if (!Array.isArray(batch)) throw new Error('Discord guild member response is invalid.');

    members.push(...batch);
    if (batch.length < 1000) break;

    after = batch[batch.length - 1]?.user?.id || null;
    if (!after) throw new Error('Discord guild member pagination cursor is missing.');
  }

  return members.filter((member) => member?.user?.id && !member.user.bot);
}

function memberIdentityValues(member) {
  return [
    member?.nick,
    member?.user?.global_name,
    member?.user?.username
  ]
    .map(normalize)
    .filter(Boolean);
}

function buildDiscordIdentityIndex(members) {
  const index = new Map();

  for (const member of members || []) {
    if (!member?.user?.id || member.user.bot) continue;
    for (const identity of new Set(memberIdentityValues(member))) {
      const ids = index.get(identity) || new Set();
      ids.add(String(member.user.id));
      index.set(identity, ids);
    }
  }

  return index;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function truckersMpDiscordSnowflake(tmpId) {
  let lastError = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${TMP_API}/player/${encodeURIComponent(tmpId)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Kings Logistics Staff Public Updates/1.1'
        },
        signal: AbortSignal.timeout(12000)
      });

      const text = await response.text();

      if (response.status === 429) {
        const retryAfter = Number.parseFloat(response.headers.get('retry-after') || '');
        const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15;
        const waitMs = Math.ceil(Math.min(Math.max(seconds, 1), 60) * 1000);
        console.warn(
          `TruckersMP player API rate limited at TMP ${tmpId}; waiting ${Math.ceil(waitMs / 1000)}s.`
        );
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      }

      const payload = text ? JSON.parse(text) : null;
      const snowflake = String(payload?.response?.discordSnowflake || '').trim();
      return /^\d{15,22}$/.test(snowflake) ? snowflake : null;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(500 * attempt);
    }
  }

  throw lastError || new Error(`TruckersMP player lookup failed for TMP ${tmpId}.`);
}

async function buildTruckersMpCrossCheck(staffState, loyaltyMappings, guildMembers) {
  const currentTmpStaff = (Array.isArray(staffState?.staff) ? staffState.staff : [])
    .filter((person) => person.currentStaff && Number.isFinite(Number(person.tmpId)));

  const currentTmpIds = new Set(currentTmpStaff.map((person) => Number(person.tmpId)));
  const guildMemberIds = new Set(
    (guildMembers || []).map((member) => String(member?.user?.id || '')).filter(Boolean)
  );
  const identityIndex = buildDiscordIdentityIndex(guildMembers);

  const verifiedDiscordByTmp = new Map();
  for (const mapping of loyaltyMappings || []) {
    const tmpId = Number(mapping?.tmpId);
    const discordUserId = String(mapping?.discordUserId || '');
    if (!Number.isFinite(tmpId) || !/^\d{15,22}$/.test(discordUserId)) continue;
    if (!guildMemberIds.has(discordUserId)) continue;
    verifiedDiscordByTmp.set(tmpId, discordUserId);
  }

  const byDiscord = new Map();
  const unresolved = [];
  const sourceCounts = {
    truckersmpDiscordSnowflake: 0,
    verifiedDriverMapping: 0,
    uniqueExactNameMatch: 0
  };

  for (const person of currentTmpStaff) {
    const tmpId = Number(person.tmpId);
    let discordUserId = verifiedDiscordByTmp.get(tmpId) || null;
    let source = discordUserId ? 'verified-driver-mapping' : null;

    if (discordUserId) {
      sourceCounts.verifiedDriverMapping += 1;
    }

    if (!discordUserId) {
      try {
        const snowflake = await truckersMpDiscordSnowflake(tmpId);
        if (snowflake && guildMemberIds.has(snowflake)) {
          discordUserId = snowflake;
          source = 'truckersmp-discordSnowflake';
          sourceCounts.truckersmpDiscordSnowflake += 1;
        } else if (snowflake && !guildMemberIds.has(snowflake)) {
          unresolved.push({
            tmpId,
            username: String(person.username || ''),
            reason: 'truckersmp-linked-discord-not-on-kings-server'
          });
          await sleep(1100);
          continue;
        }

        await sleep(1100);
      } catch (error) {
        console.warn(
          `TruckersMP Discord verification failed for ${person.username} (TMP ${tmpId}): ${error.message}`
        );
      }
    }

    if (!discordUserId) {
      const candidates = [...(identityIndex.get(normalize(person.username)) || [])];
      if (candidates.length === 1) {
        discordUserId = String(candidates[0]);
        source = 'unique-exact-name-match';
        sourceCounts.uniqueExactNameMatch += 1;
      } else {
        unresolved.push({
          tmpId,
          username: String(person.username || ''),
          reason: candidates.length > 1 ? 'ambiguous-discord-name' : 'no-discord-match'
        });
        continue;
      }
    }

    if (byDiscord.has(discordUserId)) {
      unresolved.push({
        tmpId,
        username: String(person.username || ''),
        reason: 'discord-account-already-linked-to-current-tmp-staff'
      });
      continue;
    }

    byDiscord.set(discordUserId, {
      tmpId,
      truckersmpUsername: String(person.username || ''),
      truckersmpRoles: Array.isArray(person.roleNames) ? person.roleNames : [],
      source
    });
  }

  return {
    currentTmpStaff,
    currentTmpIds,
    byDiscord,
    unresolved,
    sourceCounts
  };
}

function enrichDiscordStaffWithTruckersMp(currentStaff, crossCheck) {
  return currentStaff.map((person) => {
    const match = crossCheck.byDiscord.get(String(person.discordUserId)) || null;
    return {
      ...person,
      tmpId: match?.tmpId ?? person.tmpId ?? null,
      truckersmpVerified: Boolean(match),
      truckersmpUsername: match?.truckersmpUsername || person.truckersmpUsername || null,
      truckersmpRoles: match?.truckersmpRoles || person.truckersmpRoles || [],
      truckersmpMatchSource: match?.source || person.truckersmpMatchSource || null
    };
  });
}

function roleAssignmentCount(roleId, members) {
  const wanted = String(roleId);
  return (members || []).filter((member) =>
    (member.roles || []).map(String).includes(wanted)
  ).length;
}

function hierarchyCandidateScore(role, members) {
  const name = String(role.name || '');
  let score = roleAssignmentCount(role.id, members) * 100;

  if (/^\s*\|/.test(name)) score += 25;
  if (/[━─═]{2,}/.test(name)) score -= 25;

  return score;
}

function resolveHierarchyRoles(roles, members) {
  const found = new Map();

  for (const definition of HIERARCHY) {
    const matches = (roles || []).filter((role) => normalize(role.name) === definition.key);
    if (!matches.length) continue;

    const ranked = matches
      .map((role) => ({
        role,
        assignments: roleAssignmentCount(role.id, members),
        score: hierarchyCandidateScore(role, members)
      }))
      .sort((a, b) => b.score - a.score || Number(b.role.position || 0) - Number(a.role.position || 0));

    if (ranked.length > 1 && ranked[0].score === ranked[1].score && ranked[0].assignments === ranked[1].assignments) {
      throw new Error(
        `Ambiguous Discord Staff hierarchy role "${definition.label}": ` +
        ranked.map((item) =>
          `${item.role.name} (${item.role.id}, assignments ${item.assignments})`
        ).join(', ')
      );
    }

    const selected = ranked[0];
    console.log(
      `Hierarchy role ${definition.label}: selected "${selected.role.name}" ` +
      `(${selected.role.id}) with ${selected.assignments} member assignment(s).`
    );

    if (ranked.length > 1) {
      console.log(
        '  Ignored same-name candidate(s): ' +
        ranked.slice(1).map((item) =>
          `"${item.role.name}" (${item.role.id}, assignments ${item.assignments})`
        ).join(', ')
      );
    }

    found.set(String(selected.role.id), { ...definition, role: selected.role });
  }

  if (![...found.values()].some((entry) => entry.key === 'staff')) {
    throw new Error('Discord Staff hierarchy role "Staff" was not found.');
  }

  return found;
}

function isDecorativeOrNonStaffRole(roleName) {
  const raw = String(roleName || '');
  const name = normalize(raw);

  if (!name) return true;
  if (/[━─═]{2,}/.test(raw)) return true;
  if (/^\s*\|\s*(staff|team lead|director|management|head management)\s*$/i.test(raw)) return true;

  return [
    'kings drivers',
    'kings driver',
    'kings trial',
    'ets2 driver',
    'ats driver',
    'trucky driver',
    'promods driver',
    'convoy driver',
    'community member',
    'rules accepted',
    'kings booster',
    'kings supporter',
    'head staff of the month',
    'high staff of the month',
    'staff of the month',
    'all notifications',
    'event notifications',
    'news notifications',
    'update notifications'
  ].includes(name) ||
    /with kings$/.test(name) ||
    /^(english|german|dutch|polish|arabic|french|spanish|portuguese|russian|danish)$/.test(name);
}

function isStaffPositionRole(roleName) {
  if (isDecorativeOrNonStaffRole(roleName)) return false;
  const name = normalize(roleName);

  return /\b(ceo|coo|recruiter|moderator|planner|coordinator|designer|specialist|developer|lead|director|management)\b/.test(name);
}

function cleanRoleDisplay(value = '') {
  return String(value)
    .replace(/^\s*[|｜]\s*/, '')
    .replace(/\s*[|｜]\s*$/, '')
    .trim();
}

function primaryStaffPosition(allRoles, highestHierarchy) {
  const candidate = (allRoles || []).find((role) => isStaffPositionRole(role.name));
  return candidate ? cleanRoleDisplay(candidate.name) : highestHierarchy.label;
}
function memberStaffSnapshot(member, hierarchyRoles, roleById) {
  const hierarchy = (member.roles || [])
    .map(String)
    .map((roleId) => hierarchyRoles.get(roleId))
    .filter(Boolean)
    .sort((a, b) => b.level - a.level);

  if (!hierarchy.length) return null;

  const highest = hierarchy[0];
  const allRoles = (member.roles || [])
    .map((roleId) => roleById.get(String(roleId)))
    .filter(Boolean)
    .sort((a, b) => Number(b.position || 0) - Number(a.position || 0));

  const primaryRole = primaryStaffPosition(allRoles, highest);

  return {
    discordUserId: String(member.user.id),
    username: String(member.user.global_name || member.user.username || member.user.id),
    hierarchyKey: highest.key,
    hierarchyLabel: highest.label,
    hierarchyLevel: highest.level,
    hierarchyRoleId: String(highest.role.id),
    hierarchyRoleIds: hierarchy.map((entry) => String(entry.role.id)),
    primaryRole,
    roleIds: allRoles.map((role) => String(role.id)),
    roleNames: allRoles.map((role) => String(role.name || '')).filter(Boolean),
    currentStaff: true
  };
}

function snapshotsEqual(a, b) {
  return JSON.stringify({
    hierarchyKey: a?.hierarchyKey || null,
    hierarchyLevel: Number(a?.hierarchyLevel || 0),
    hierarchyRoleIds: a?.hierarchyRoleIds || []
  }) === JSON.stringify({
    hierarchyKey: b?.hierarchyKey || null,
    hierarchyLevel: Number(b?.hierarchyLevel || 0),
    hierarchyRoleIds: b?.hierarchyRoleIds || []
  });
}

function eventKey(event) {
  return [
    event.type,
    event.discordUserId,
    event.oldHierarchyKey || 'none',
    event.newHierarchyKey || 'none'
  ].join(':');
}

function detectChanges(previous, currentStaff, currentTmpIds) {
  const previousMembers = new Map(
    (previous?.members || []).map((member) => [String(member.discordUserId), member])
  );
  const currentMembers = new Map(
    currentStaff.map((member) => [String(member.discordUserId), member])
  );
  const changes = [];
  const mismatches = [];

  for (const current of currentStaff) {
    const id = String(current.discordUserId);
    const old = previousMembers.get(id);

    if (!old || old.currentStaff === false) {
      if (!current.truckersmpVerified) {
        mismatches.push({
          type: 'staff_joined',
          discordUserId: id,
          username: current.username,
          reason: 'discord-authoritative-join-not-confirmed-by-truckersmp'
        });
      }

      changes.push({
        type: 'staff_joined',
        discordUserId: id,
        username: current.username,
        tmpId: current.tmpId ?? null,
        oldHierarchyKey: null,
        oldRole: null,
        newHierarchyKey: current.hierarchyKey,
        newRole: current.primaryRole || current.hierarchyLabel
      });
      continue;
    }

    if (Number(current.hierarchyLevel || 0) > Number(old.hierarchyLevel || 0)) {
      if (!current.truckersmpVerified) {
        mismatches.push({
          type: 'staff_promoted',
          discordUserId: id,
          username: current.username,
          reason: 'discord-authoritative-promotion-not-confirmed-by-truckersmp'
        });
      }

      changes.push({
        type: 'staff_promoted',
        discordUserId: id,
        username: current.username,
        tmpId: current.tmpId ?? old.tmpId ?? null,
        oldHierarchyKey: old.hierarchyKey || null,
        oldRole: old.primaryRole || old.hierarchyLabel || 'Staff',
        newHierarchyKey: current.hierarchyKey,
        newRole: current.primaryRole || current.hierarchyLabel
      });
      continue;
    }

    if (!snapshotsEqual(old, current)) {
      console.log(
        `- ${current.username} | Staff role structure changed without upward hierarchy promotion: ` +
        `${old.hierarchyLabel || 'Unknown'} -> ${current.hierarchyLabel || 'Unknown'} | no public promotion post`
      );
    }

    if (!current.truckersmpVerified) {
      mismatches.push({
        type: 'staff_present',
        discordUserId: id,
        username: current.username,
        reason: 'discord-authoritative-staff-not-confirmed-by-truckersmp'
      });
    }
  }

  for (const old of previousMembers.values()) {
    const id = String(old.discordUserId);
    if (old.currentStaff === false || currentMembers.has(id)) continue;

    const tmpId = Number(old.tmpId);
    if (!Number.isFinite(tmpId)) {
      mismatches.push({
        type: 'staff_left',
        discordUserId: id,
        username: old.username,
        reason: 'discord-authoritative-leave-without-truckersmp-link'
      });
    } else if (currentTmpIds.has(tmpId)) {
      mismatches.push({
        type: 'staff_left',
        discordUserId: id,
        username: old.username,
        tmpId,
        reason: 'discord-authoritative-leave-while-truckersmp-still-shows-current-staff'
      });
    }

    changes.push({
      type: 'staff_left',
      discordUserId: id,
      username: old.username,
      tmpId: Number.isFinite(tmpId) ? tmpId : null,
      oldHierarchyKey: old.hierarchyKey || null,
      oldRole: old.primaryRole || old.hierarchyLabel || 'Staff',
      newHierarchyKey: null,
      newRole: null
    });
  }

  return {
    changes,
    mismatches,
    nextMembers: currentStaff
      .map((member) => ({ ...member, currentStaff: true }))
      .sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')))
  };
}

function buildPublicMessage(event) {
  const mention = `<@${event.discordUserId}>`;

  if (event.type === 'staff_joined') {
    return [
      `Please welcome ${mention} to the <:Kings_Logistics_Logo:1545254529648431124> **Kings Staff** as **${event.newRole}**!`,
      '',
      'We’re happy to have you on the team. Thank you for your interest, motivation, and willingness to support Kings Logistics.',
      '',
      'Welcome to the **Kings Staff**! :kings_heart:'
    ].join('\n');
  }

  if (event.type === 'staff_promoted') {
    const highResponsibility = ['team lead', 'director', 'management', 'head management']
      .includes(String(event.newHierarchyKey || ''));

    if (highResponsibility) {
      return [
        `🎉 **Big promotion!** ${mention} has been promoted from **${event.oldRole}** to **${event.newRole}**!`,
        '',
        'This is a role with responsibility — and we trust you fully.',
        'Thank you for your work, reliability, and commitment.',
        '',
        'Welcome to the next chapter in the <:Kings_Logistics_Logo:1545254529648431124> **Kings Staff**! :kings_heart:'
      ].join('\n');
    }

    return [
      `🎉 ${mention} has been promoted from **${event.oldRole}** to **${event.newRole}**!`,
      '',
      'Well deserved — thank you for your work, reliability, and commitment.',
      '',
      'Welcome to the next level of the <:Kings_Logistics_Logo:1545254529648431124> **Kings Staff**! :kings_heart:'
    ].join('\n');
  }

  if (event.type === 'staff_left') {
    return [
      `Please note that ${mention} is no longer part of the <:Kings_Logistics_Logo:1545254529648431124> **Kings Staff**.`,
      '',
      'Thank you for your time, effort, and support as part of the staff.',
      'We truly appreciate what you have done for Kings Logistics and wish you all the best going forward. :kings_heart:'
    ].join('\n');
  }

  throw new Error(`Unsupported public Staff update type: ${event.type}`);
}

async function findExistingPublicPost(channelId, botId, event) {
  const messages = await discord(`/channels/${channelId}/messages?limit=100`);
  const mention = `<@${event.discordUserId}>`;

  return (messages || []).find((message) => {
    if (String(message.author?.id || '') !== String(botId)) return false;
    const content = String(message.content || '');
    if (!content.includes(mention)) return false;

    if (event.type === 'staff_joined') {
      return content.includes('Please welcome') && content.includes('Kings Staff');
    }
    if (event.type === 'staff_promoted') {
      return content.includes('has been promoted from') &&
        content.includes(`**${event.oldRole}**`) &&
        content.includes(`**${event.newRole}**`);
    }
    if (event.type === 'staff_left') {
      return content.includes('is no longer part of') && content.includes('Kings Staff');
    }
    return false;
  }) || null;
}

async function publishEvent(channel, botId, event) {
  const content = buildPublicMessage(event);
  if (content.length > 2000) {
    throw new Error(`Public Staff update exceeds Discord limit: ${content.length}`);
  }

  const existing = await findExistingPublicPost(channel.id, botId, event);
  if (existing) {
    console.log(
      `- ${event.type} | ${event.username} | duplicate suppressed by existing message ${existing.id}`
    );
    return { action: 'already-published', messageId: existing.id };
  }

  if (MODE !== 'live') {
    console.log(
      `- ${event.type} | ${event.username} | DRY-RUN would publish in #${channel.name}`
    );
    return { action: 'dry-run', messageId: null };
  }

  const sent = await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: {
        parse: [],
        users: [String(event.discordUserId)]
      }
    }
  });

  console.log(
    `- ${event.type} | ${event.username} | published message ${sent?.id || 'unknown'} in #${channel.name}`
  );
  return { action: 'published', messageId: sent?.id || null };
}

async function main() {
  console.log('=====================================');
  console.log('Kings Public Staff Updates');
  console.log('=====================================');
  console.log(`Mode: ${MODE}`);

  const [roles, members, channel, bot] = await Promise.all([
    discord(`/guilds/${DISCORD_GUILD_ID}/roles`),
    listGuildMembers(),
    discord(`/channels/${PUBLIC_CHANNEL_ID}`),
    discord('/users/@me')
  ]);
  const staffManagementState = loadStaffManagementState();
  const loyaltyMappings = loadLoyaltyMappings();

  if (String(channel.guild_id || '') !== String(DISCORD_GUILD_ID)) {
    throw new Error('Configured public Staff Updates channel does not belong to Kings Logistics.');
  }

  const hierarchyRoles = resolveHierarchyRoles(roles, members);
  const roleById = new Map((roles || []).map((role) => [String(role.id), role]));
  const discordStaff = members
    .map((member) => memberStaffSnapshot(member, hierarchyRoles, roleById))
    .filter(Boolean)
    .sort((a, b) => a.username.localeCompare(b.username));
  const crossCheck = await buildTruckersMpCrossCheck(staffManagementState, loyaltyMappings, members);
  const currentStaff = enrichDiscordStaffWithTruckersMp(discordStaff, crossCheck);

  console.log(`Discord members inspected: ${members.length}`);
  console.log(
    'Staff hierarchy roles found: ' +
    [...hierarchyRoles.values()]
      .sort((a, b) => a.level - b.level)
      .map((entry) => `${entry.label} (${entry.role.id})`)
      .join(', ')
  );
  console.log(`Current Staff detected from Discord roles: ${currentStaff.length}`);
  console.log(`Current Staff confirmed by TruckersMP: ${crossCheck.currentTmpStaff.length}`);
  console.log(`Discord Staff cross-confirmed with TruckersMP: ${currentStaff.filter((person) => person.truckersmpVerified).length}/${currentStaff.length}`);
  console.log(
    `Cross-check sources: TruckersMP Discord link ${crossCheck.sourceCounts.truckersmpDiscordSnowflake} | ` +
    `verified Driver mapping ${crossCheck.sourceCounts.verifiedDriverMapping} | ` +
    `exact-name fallback ${crossCheck.sourceCounts.uniqueExactNameMatch}`
  );
  if (crossCheck.unresolved.length) console.log(`TruckersMP Staff without a safe Discord match: ${crossCheck.unresolved.length}`);
  for (const person of currentStaff) {
    console.log(
      `Staff member: ${person.username} | hierarchy: ${person.hierarchyLabel} | primary: ${person.primaryRole} | TMP: ${person.truckersmpVerified ? `verified ${person.tmpId}` : 'not verified'} | roles: ` +
      person.roleNames.join(' || ')
    );
  }
  console.log(`Public Staff Updates channel: #${channel.name} (${channel.id})`);

  let state = loadState();
  const firstRun = !state;

  if (!state) {
    state = {
      version: 1,
      initializedAt: nowISO(),
      updatedAt: nowISO(),
      members: currentStaff,
      delivered: []
    };

    writeJson(STATE_FILE, encrypt(state));
    writeJson(SUMMARY_FILE, {
      version: 1,
      mode: MODE,
      updatedAt: state.updatedAt,
      currentStaff: currentStaff.length,
      truckersmpCurrentStaff: crossCheck.currentTmpStaff.length,
      crossConfirmedStaff: currentStaff.filter((person) => person.truckersmpVerified).length,
      sourceMismatches: crossCheck.unresolved.length,
      authority: 'discord',
      truckersmpCrossCheckMode: 'advisory-only',
      crossCheckSources: crossCheck.sourceCounts,
      joined: 0,
      promotions: 0,
      left: 0,
      baselineCreated: true,
      publicChannelId: String(channel.id),
      hierarchyRoles: [...hierarchyRoles.values()]
        .sort((a, b) => a.level - b.level)
        .map((entry) => ({ key: entry.key, label: entry.label, roleId: String(entry.role.id) }))
    });

    console.log(
      'Initial Discord Staff baseline created. Existing Staff were NOT announced retroactively.'
    );
    return;
  }

  const detection = detectChanges(state, currentStaff, crossCheck.currentTmpIds);
  const changes = detection.changes;
  const sourceMismatches = detection.mismatches;
  const delivered = new Set(Array.isArray(state.delivered) ? state.delivered.map(String) : []);
  let published = 0;
  let duplicate = 0;
  let dryRun = 0;

  for (const event of changes) {
    const key = eventKey(event);
    if (delivered.has(key)) {
      duplicate += 1;
      continue;
    }

    const result = await publishEvent(channel, bot.id, event);
    if (result.action === 'published') published += 1;
    if (result.action === 'already-published') duplicate += 1;
    if (result.action === 'dry-run') dryRun += 1;

    if (MODE === 'live' && ['published', 'already-published'].includes(result.action)) {
      delivered.add(key);
      state.delivered = [...delivered].slice(-500);
      state.updatedAt = nowISO();
      writeJson(STATE_FILE, encrypt(state));
    }
  }

  if (sourceMismatches.length) {
    for (const mismatch of sourceMismatches) {
      console.warn(
        `ADVISORY SOURCE MISMATCH: ${mismatch.type} | ${mismatch.username} | ${mismatch.reason}`
      );
    }
  }

  if (MODE === 'live') {
    state.members = detection.nextMembers;
    state.updatedAt = nowISO();
    state.delivered = [...delivered].slice(-500);
    writeJson(STATE_FILE, encrypt(state));
  }

  const counts = {
    joined: changes.filter((event) => event.type === 'staff_joined').length,
    promotions: changes.filter((event) => event.type === 'staff_promoted').length,
    left: changes.filter((event) => event.type === 'staff_left').length
  };

  writeJson(SUMMARY_FILE, {
    version: 1,
    mode: MODE,
    updatedAt: nowISO(),
    currentStaff: currentStaff.length,
    truckersmpCurrentStaff: crossCheck.currentTmpStaff.length,
    crossConfirmedStaff: currentStaff.filter((person) => person.truckersmpVerified).length,
    sourceMismatches: sourceMismatches.length + crossCheck.unresolved.length,
    authority: 'discord',
    truckersmpCrossCheckMode: 'advisory-only',
    crossCheckSources: crossCheck.sourceCounts,
    mismatchDetails: [...sourceMismatches, ...crossCheck.unresolved].slice(0, 50),
    ...counts,
    published,
    duplicatesSuppressed: duplicate,
    dryRunPosts: dryRun,
    baselineCreated: false,
    publicChannelId: String(channel.id),
    hierarchyRoles: [...hierarchyRoles.values()]
      .sort((a, b) => a.level - b.level)
      .map((entry) => ({ key: entry.key, label: entry.label, roleId: String(entry.role.id) }))
  });

  console.log(
    `Changes: joined ${counts.joined}, promotions ${counts.promotions}, left ${counts.left}.`
  );
  console.log(
    `Staff authority: Discord. TruckersMP is advisory-only. Discord ${currentStaff.length} Staff | ` +
    `TruckersMP ${crossCheck.currentTmpStaff.length} Staff | cross-confirmed ` +
    `${currentStaff.filter((person) => person.truckersmpVerified).length}.`
  );
  console.log(`Advisory TruckersMP mismatches: ${sourceMismatches.length + crossCheck.unresolved.length}.`);
  console.log(
    `Published: ${published}. Duplicate-suppressed: ${duplicate}. Dry-run posts: ${dryRun}.`
  );
  console.log(
    MODE === 'live'
      ? 'Public Staff Updates synchronization completed.'
      : 'DRY-RUN ONLY — no public Staff update messages were sent.'
  );
}

main().catch((error) => {
  console.error('Kings Public Staff Updates failed:', error.message);
  process.exit(1);
});
