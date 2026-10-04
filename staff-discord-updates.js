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
const STATE_DOMAIN = 'kings-staff-discord-updates-v1';
const DISCORD_API = 'https://discord.com/api/v10';

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

function deriveKey() {
  return crypto
    .createHash('sha256')
    .update(`${STATE_DOMAIN}\0`)
    .update(String(STATE_KEY))
    .digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
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

function decrypt(container) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error('Staff Discord Updates state is not in the expected encrypted format.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(),
    Buffer.from(container.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

function loadState() {
  const container = readJson(STATE_FILE, null);
  if (!container) return null;
  return decrypt(container);
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

  return {
    discordUserId: String(member.user.id),
    username: String(member.user.global_name || member.user.username || member.user.id),
    hierarchyKey: highest.key,
    hierarchyLabel: highest.label,
    hierarchyLevel: highest.level,
    hierarchyRoleId: String(highest.role.id),
    hierarchyRoleIds: hierarchy.map((entry) => String(entry.role.id)),
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

function detectChanges(previous, currentStaff) {
  const previousMembers = new Map(
    (previous?.members || []).map((member) => [String(member.discordUserId), member])
  );
  const currentMembers = new Map(
    currentStaff.map((member) => [String(member.discordUserId), member])
  );
  const changes = [];

  for (const current of currentStaff) {
    const old = previousMembers.get(String(current.discordUserId));

    if (!old || old.currentStaff === false) {
      changes.push({
        type: 'staff_joined',
        discordUserId: current.discordUserId,
        username: current.username,
        oldHierarchyKey: null,
        oldRole: null,
        newHierarchyKey: current.hierarchyKey,
        newRole: current.hierarchyLabel
      });
      continue;
    }

    if (Number(current.hierarchyLevel || 0) > Number(old.hierarchyLevel || 0)) {
      changes.push({
        type: 'staff_promoted',
        discordUserId: current.discordUserId,
        username: current.username,
        oldHierarchyKey: old.hierarchyKey || null,
        oldRole: old.hierarchyLabel || 'Staff',
        newHierarchyKey: current.hierarchyKey,
        newRole: current.hierarchyLabel
      });
      continue;
    }

    if (!snapshotsEqual(old, current)) {
      console.log(
        `- ${current.username} | Staff role structure changed without upward hierarchy promotion: ` +
        `${old.hierarchyLabel || 'Unknown'} -> ${current.hierarchyLabel || 'Unknown'} | no public promotion post`
      );
    }
  }

  for (const old of previousMembers.values()) {
    if (old.currentStaff === false || currentMembers.has(String(old.discordUserId))) continue;

    changes.push({
      type: 'staff_left',
      discordUserId: String(old.discordUserId),
      username: old.username,
      oldHierarchyKey: old.hierarchyKey || null,
      oldRole: old.hierarchyLabel || 'Staff',
      newHierarchyKey: null,
      newRole: null
    });
  }

  return changes;
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

  if (String(channel.guild_id || '') !== String(DISCORD_GUILD_ID)) {
    throw new Error('Configured public Staff Updates channel does not belong to Kings Logistics.');
  }

  const hierarchyRoles = resolveHierarchyRoles(roles, members);
  const roleById = new Map((roles || []).map((role) => [String(role.id), role]));
  const currentStaff = members
    .map((member) => memberStaffSnapshot(member, hierarchyRoles, roleById))
    .filter(Boolean)
    .sort((a, b) => a.username.localeCompare(b.username));

  console.log(`Discord members inspected: ${members.length}`);
  console.log(
    'Staff hierarchy roles found: ' +
    [...hierarchyRoles.values()]
      .sort((a, b) => a.level - b.level)
      .map((entry) => `${entry.label} (${entry.role.id})`)
      .join(', ')
  );
  console.log(`Current Staff detected from Discord roles: ${currentStaff.length}`);
  for (const person of currentStaff) {
    console.log(
      `Staff member: ${person.username} | hierarchy: ${person.hierarchyLabel} | roles: ` +
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

  const changes = detectChanges(state, currentStaff);
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

  if (MODE === 'live') {
    state.members = currentStaff;
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
