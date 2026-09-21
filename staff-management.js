const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KINGS_VTC_ID = 64284;
const MEMBERS_URL = `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;
const ROLES_URL = `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/roles`;
const DISCORD_API = 'https://discord.com/api/v10';

// Reuse the existing private state key with strict domain separation so no new
// repository secret is required. Personal Staff history remains encrypted.
const STATE_KEY = process.env.STAFF_STATE_KEY || process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const STAFF_CHANNEL_ID = process.env.STAFF_LEADERSHIP_CHANNEL_ID || null;
const STAFF_CHANNEL_NAME = process.env.STAFF_LEADERSHIP_CHANNEL_NAME || 'staff-leadership';
const INCLUDE_ROLE_IDS = parseIdSet(process.env.STAFF_VTC_ROLE_IDS || '');
const EXCLUDE_ROLE_IDS = parseIdSet(process.env.STAFF_VTC_ROLE_EXCLUDE_IDS || '');

const STATE_FILE = path.join(__dirname, 'data', 'staff-management.json');
const SUMMARY_FILE = path.join(__dirname, 'data', 'staff-management-summary.json');
const STATE_DOMAIN = 'kings-staff-management-v1';
const HISTORY_RETENTION_DAYS = 365;
const OVERVIEW_TITLE = '🛡️ Kings Staff Leadership Overview';
let resolvedWriteChannelId = null;

if (!STATE_KEY || String(STATE_KEY).length < 32) {
  console.error('STAFF_STATE_KEY / DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}
if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
}

function safeISO(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseIdSet(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter(Number.isFinite)
  );
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

function encryptState(state) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(state), 'utf8');
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

function decryptState(container) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') return null;

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

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Kings Logistics Staff Management/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(`${label}: API returned an error.`);
  return data;
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD:
  // Staff Management may only read Discord and create/update messages in the
  // resolved Staff Leadership channel. It can never modify members, roles,
  // permissions, bans, kicks or any other personnel data.
  if (method !== 'GET') {
    const messagePath = pathname.match(/^\/channels\/(\d+)\/messages(?:\/(\d+))?$/);
    const allowed =
      messagePath &&
      resolvedWriteChannelId &&
      messagePath[1] === String(resolvedWriteChannelId) &&
      (method === 'POST' || method === 'PATCH');

    if (!allowed) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Staff Management/1.0'
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

function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeChannelName(value = '') {
  return normalizeName(value).replace(/\s+/g, '-');
}

function isAutomaticStaffRole(role) {
  const id = Number(role?.id);
  if (EXCLUDE_ROLE_IDS.has(id)) return false;
  if (INCLUDE_ROLE_IDS.size) return INCLUDE_ROLE_IDS.has(id);
  if (role?.owner === true) return true;

  const name = normalizeName(role?.name);
  if (!name) return false;

  const patterns = [
    /\bowner\b/,
    /\bfounder\b/,
    /\bceo\b/,
    /\bcoo\b/,
    /\bchief\b/,
    /\bdirector\b/,
    /\bmanagement\b/,
    /\bmanager\b/,
    /\bhead\b/,
    /\bleader\b/,
    /\blead\b/,
    /\bstaff\b/,
    /\badmin\b/,
    /\bmoderator\b/,
    /\bmoderation\b/,
    /\bhuman resources\b/,
    /\bhr\b/,
    /\brecruit/,
    /\bevent/,
    /\bmedia\b/,
    /\bdeveloper\b/,
    /\bdevelopment\b/,
    /\btrainer\b/,
    /\btraining\b/,
    /\bsupport\b/,
    /\boperations\b/,
    /\bconvoy control\b/
  ];

  return patterns.some((pattern) => pattern.test(name));
}

function departmentForRole(roleName) {
  const name = normalizeName(roleName);
  if (/\bhuman resources\b|\bhr\b|\brecruit/.test(name)) return 'HR & Recruitment';
  if (/\bevent|\bconvoy control\b/.test(name)) return 'Events';
  if (/\bmedia\b/.test(name)) return 'Media';
  if (/\bdeveloper\b|\bdevelopment\b/.test(name)) return 'Development';
  if (/\bmoderator\b|\bmoderation\b/.test(name)) return 'Moderation';
  if (/\btrainer\b|\btraining\b/.test(name)) return 'Training';
  if (/\bsupport\b/.test(name)) return 'Support';
  if (/\bowner\b|\bfounder\b|\bceo\b|\bcoo\b|\bchief\b|\bdirector\b|\bmanagement\b|\bmanager\b|\bhead\b/.test(name)) {
    return 'Management';
  }
  return 'General Staff';
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function resolveStaffChannel() {
  if (STAFF_CHANNEL_ID) {
    const channel = await discord(`/channels/${STAFF_CHANNEL_ID}`);
    if (channel.guild_id && String(channel.guild_id) !== String(DISCORD_GUILD_ID)) {
      throw new Error('Configured Staff Leadership channel is not in the configured guild.');
    }
    resolvedWriteChannelId = String(channel.id);
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));
  const wanted = normalizeChannelName(STAFF_CHANNEL_NAME);

  const exact = textChannels.filter((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact.length === 1) {
    resolvedWriteChannelId = String(exact[0].id);
    return exact[0];
  }
  if (exact.length > 1) {
    throw new Error(`Multiple exact Staff Leadership channels found: ${exact.map((c) => c.name).join(', ')}`);
  }

  const fuzzy = textChannels.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('staff') && name.includes('leadership');
  });
  if (fuzzy.length === 1) {
    resolvedWriteChannelId = String(fuzzy[0].id);
    return fuzzy[0];
  }
  if (fuzzy.length > 1) {
    throw new Error(`Multiple Staff Leadership channels found: ${fuzzy.map((c) => c.name).join(', ')}`);
  }

  throw new Error(`Could not find Staff Leadership channel "${STAFF_CHANNEL_NAME}".`);
}

async function getVtcRoles() {
  const data = await fetchJson(ROLES_URL, 'TruckersMP VTC roles');
  const roles = data?.response?.roles;
  if (!Array.isArray(roles)) throw new Error('Invalid TruckersMP VTC roles response.');

  return roles
    .map((role) => ({
      id: Number(role.id),
      name: String(role.name || '').trim(),
      order: Number(role.order),
      owner: Boolean(role.owner)
    }))
    .filter((role) => Number.isFinite(role.id) && role.name)
    .sort((a, b) => Number(a.order) - Number(b.order));
}

async function getVtcMembers() {
  const data = await fetchJson(MEMBERS_URL, 'TruckersMP VTC members');
  const members = data?.response?.members;
  if (!Array.isArray(members)) throw new Error('Invalid TruckersMP VTC members response.');

  return members
    .map((member) => ({
      tmpId: Number(member.user_id),
      vtcMemberId: Number(member.id),
      username: String(member.username || '').trim(),
      joinDate: safeISO(member.joinDate),
      roleId: Number(member.role_id),
      roleName: String(member.role || '').trim(),
      roles: Array.isArray(member.roles)
        ? member.roles
            .map((role) => ({ id: Number(role.id), name: String(role.name || '').trim() }))
            .filter((role) => Number.isFinite(role.id) && role.name)
        : []
    }))
    .filter((member) => Number.isFinite(member.tmpId) && member.username);
}

function currentStaffRoster(members, staffRoles) {
  const staffRoleIds = new Set(staffRoles.map((role) => Number(role.id)));
  const roleNameById = new Map(staffRoles.map((role) => [Number(role.id), role.name]));

  return members
    .map((member) => {
      const memberRoles = member.roles.length
        ? member.roles
        : Number.isFinite(member.roleId) && member.roleName
          ? [{ id: member.roleId, name: member.roleName }]
          : [];

      const matched = memberRoles.filter((role) => staffRoleIds.has(Number(role.id)));
      if (!matched.length && staffRoleIds.has(Number(member.roleId))) {
        matched.push({ id: Number(member.roleId), name: roleNameById.get(Number(member.roleId)) || member.roleName });
      }
      if (!matched.length) return null;

      const roleIds = uniqueSorted(matched.map((role) => String(role.id))).map(Number);
      const roleNames = uniqueSorted(matched.map((role) => roleNameById.get(Number(role.id)) || role.name));
      const departments = uniqueSorted(roleNames.map(departmentForRole));

      return {
        tmpId: member.tmpId,
        vtcMemberId: member.vtcMemberId,
        username: member.username,
        joinDate: member.joinDate,
        roleIds,
        roleNames,
        departments
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.username.localeCompare(b.username));
}

function loadState() {
  const container = readJson(STATE_FILE, null);
  if (!container) return null;
  return decryptState(container);
}

function sameStringArray(a, b) {
  const aa = uniqueSorted(Array.isArray(a) ? a.map(String) : []);
  const bb = uniqueSorted(Array.isArray(b) ? b.map(String) : []);
  return aa.length === bb.length && aa.every((value, index) => value === bb[index]);
}

function buildInitialState(roster) {
  const now = nowISO();
  return {
    version: 1,
    mode: 'advisory-only',
    initializedAt: now,
    updatedAt: now,
    staff: roster.map((person) => ({
      ...person,
      currentStaff: true,
      firstObservedAt: now,
      lastChangedAt: now,
      leftStaffAt: null
    })),
    history: []
  };
}

function updateState(previous, roster) {
  const now = nowISO();
  const previousStaff = Array.isArray(previous.staff) ? previous.staff : [];
  const byId = new Map(previousStaff.map((person) => [Number(person.tmpId), { ...person }]));
  const currentIds = new Set();
  const changes = [];
  let logicalChanged = false;

  for (const current of roster) {
    currentIds.add(Number(current.tmpId));
    const old = byId.get(Number(current.tmpId));

    if (!old) {
      const record = {
        ...current,
        currentStaff: true,
        firstObservedAt: now,
        lastChangedAt: now,
        leftStaffAt: null
      };
      byId.set(Number(current.tmpId), record);
      changes.push({
        type: 'staff_joined',
        at: now,
        tmpId: current.tmpId,
        username: current.username,
        previousRoles: [],
        newRoles: current.roleNames
      });
      logicalChanged = true;
      continue;
    }

    if (old.currentStaff === false) {
      changes.push({
        type: 'staff_joined',
        at: now,
        tmpId: current.tmpId,
        username: current.username,
        previousRoles: old.roleNames || [],
        newRoles: current.roleNames
      });
      old.firstObservedAt = now;
      old.lastChangedAt = now;
      old.leftStaffAt = null;
      logicalChanged = true;
    } else if (!sameStringArray(old.roleNames, current.roleNames)) {
      changes.push({
        type: 'role_changed',
        at: now,
        tmpId: current.tmpId,
        username: current.username,
        previousRoles: old.roleNames || [],
        newRoles: current.roleNames
      });
      old.lastChangedAt = now;
      logicalChanged = true;
    }

    if (old.username !== current.username) logicalChanged = true;
    if (!sameStringArray(old.departments, current.departments)) logicalChanged = true;

    Object.assign(old, current, {
      currentStaff: true,
      leftStaffAt: null
    });
  }

  for (const old of byId.values()) {
    if (!old.currentStaff || currentIds.has(Number(old.tmpId))) continue;

    old.currentStaff = false;
    old.leftStaffAt = now;
    old.lastChangedAt = now;
    changes.push({
      type: 'staff_left',
      at: now,
      tmpId: old.tmpId,
      username: old.username,
      previousRoles: old.roleNames || [],
      newRoles: []
    });
    logicalChanged = true;
  }

  const cutoff = Date.now() - HISTORY_RETENTION_DAYS * 86400000;
  const oldHistory = Array.isArray(previous.history) ? previous.history : [];
  const history = [...oldHistory, ...changes].filter((event) => {
    const time = new Date(event?.at || 0).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });

  if (history.length !== oldHistory.length) logicalChanged = true;

  const state = {
    version: 1,
    mode: 'advisory-only',
    initializedAt: previous.initializedAt || now,
    updatedAt: logicalChanged ? now : previous.updatedAt || previous.initializedAt || now,
    staff: [...byId.values()].sort((a, b) => Number(a.tmpId) - Number(b.tmpId)),
    history
  };

  return { state, changes, logicalChanged };
}

function countBy(items) {
  const result = {};
  for (const item of items) result[item] = (result[item] || 0) + 1;
  return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function buildSummary(state, staffRoles) {
  const current = (state.staff || []).filter((person) => person.currentStaff);
  const roleCounts = countBy(current.flatMap((person) => person.roleNames || []));
  const departmentCounts = countBy(current.flatMap((person) => person.departments || []));
  const cutoff30 = Date.now() - 30 * 86400000;
  const recent = (state.history || []).filter((event) => new Date(event.at || 0).getTime() >= cutoff30);

  return {
    version: 1,
    mode: 'advisory-only',
    updatedAt: state.updatedAt,
    currentStaff: current.length,
    trackedStaffRecords: (state.staff || []).length,
    staffRoles: staffRoles.map((role) => ({ id: role.id, name: role.name, order: role.order })),
    roleCounts,
    departmentCounts,
    changesLast30Days: {
      joinedStaff: recent.filter((event) => event.type === 'staff_joined').length,
      roleChanges: recent.filter((event) => event.type === 'role_changed').length,
      leftStaff: recent.filter((event) => event.type === 'staff_left').length
    },
    note: 'Advisory/read-only. Kings Systems never changes Staff roles, permissions, employment status, or makes promotion/demotion/personnel decisions.'
  };
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function roleText(roles) {
  return Array.isArray(roles) && roles.length ? roles.join(', ') : 'None';
}

function buildOverviewEmbed(summary, state) {
  const roleLines = Object.entries(summary.roleCounts || {})
    .slice(0, 15)
    .map(([name, count]) => `• ${name}: **${count}**`);
  const departmentLines = Object.entries(summary.departmentCounts || {})
    .slice(0, 10)
    .map(([name, count]) => `• ${name}: **${count}**`);

  const recent = (state.history || [])
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 6)
    .map((event) => {
      const person = `[${escapeMarkdown(event.username || `TMP ${event.tmpId}`)}](${profileUrl(event.tmpId)})`;
      if (event.type === 'staff_joined') return `➕ ${person} — ${roleText(event.newRoles)}`;
      if (event.type === 'staff_left') return `➖ ${person} — left Staff roster`;
      return `🔄 ${person} — ${roleText(event.previousRoles)} → ${roleText(event.newRoles)}`;
    });

  return {
    title: OVERVIEW_TITLE,
    description: 'Read-only Staff roster monitoring based on Kings Logistics TruckersMP VTC roles.',
    color: 0x182dff,
    fields: [
      {
        name: '👥 Staff Overview',
        value:
          `Current Staff: **${summary.currentStaff}**\n` +
          `Staff Roles tracked: **${summary.staffRoles.length}**\n` +
          `30d Changes: **${summary.changesLast30Days.joinedStaff} joined • ${summary.changesLast30Days.roleChanges} role changes • ${summary.changesLast30Days.leftStaff} left**`,
        inline: false
      },
      {
        name: '🏢 Departments',
        value: departmentLines.length ? departmentLines.join('\n') : 'No Staff departments detected.',
        inline: true
      },
      {
        name: '🛡️ VTC Staff Roles',
        value: roleLines.length ? roleLines.join('\n') : 'No Staff roles detected.',
        inline: true
      },
      {
        name: '🕘 Recent Staff Changes',
        value: recent.length ? recent.join('\n') : 'No Staff changes recorded since the baseline was created.',
        inline: false
      },
      {
        name: '🔒 Safety',
        value: 'Kings Systems only observes and informs. No automatic role changes, promotions, demotions, removals, kicks, bans, permissions or personnel actions are implemented.',
        inline: false
      }
    ],
    footer: { text: 'Kings Logistics • Staff Management • Advisory only' },
    timestamp: new Date().toISOString()
  };
}

async function syncOverview(channel, embed) {
  const bot = await discord('/users/@me');
  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const existing = (messages || []).find((message) =>
    message.author?.id === bot.id &&
    (message.embeds || []).some((item) => item.title === OVERVIEW_TITLE)
  );

  const body = { embeds: [embed], allowed_mentions: { parse: [] } };
  if (existing) {
    await discord(`/channels/${channel.id}/messages/${existing.id}`, { method: 'PATCH', body });
    console.log(`Staff Leadership overview updated in #${channel.name}.`);
  } else {
    await discord(`/channels/${channel.id}/messages`, { method: 'POST', body });
    console.log(`Staff Leadership overview created in #${channel.name}.`);
  }
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function sendChangeAlerts(channel, changes) {
  if (!changes.length) {
    console.log('Staff Management: no new Staff changes this run.');
    return;
  }

  for (const group of chunk(changes, 8)) {
    const lines = group.map((event) => {
      const person = `[${escapeMarkdown(event.username || `TMP ${event.tmpId}`)}](${profileUrl(event.tmpId)})`;
      if (event.type === 'staff_joined') return `➕ ${person}\nNew Staff role(s): **${roleText(event.newRoles)}**`;
      if (event.type === 'staff_left') return `➖ ${person}\nPrevious Staff role(s): **${roleText(event.previousRoles)}**`;
      return `🔄 ${person}\n**${roleText(event.previousRoles)}** → **${roleText(event.newRoles)}**`;
    });

    const content = [
      '🛡️ **Kings Staff Management — Staff Change Detected**',
      '',
      ...lines,
      '',
      'Advisory only — Leadership decides and carries out any personnel action. Kings Systems changes no roles or permissions.'
    ].join('\n');

    if (content.length > 2000) throw new Error(`Staff change alert exceeded Discord limit: ${content.length}`);

    await discord(`/channels/${channel.id}/messages`, {
      method: 'POST',
      body: { content, allowed_mentions: { parse: [] } }
    });
  }

  console.log(`${changes.length} Staff change(s) posted in #${channel.name}.`);
}

async function main() {
  console.log('=================================');
  console.log('Kings Staff Management');
  console.log('=================================');

  const [roles, members] = await Promise.all([getVtcRoles(), getVtcMembers()]);
  const staffRoles = roles.filter(isAutomaticStaffRole);
  const nonStaffRoles = roles.filter((role) => !staffRoles.some((staffRole) => staffRole.id === role.id));

  console.log(`VTC roles discovered: ${roles.length}`);
  for (const role of roles) {
    const marker = staffRoles.some((staffRole) => staffRole.id === role.id) ? 'STAFF' : 'OTHER';
    console.log(`[${marker}] role ${role.id}: ${role.name} (order ${role.order}${role.owner ? ', owner' : ''})`);
  }

  if (!staffRoles.length) {
    throw new Error('No Staff roles were detected. Configure STAFF_VTC_ROLE_IDS before enabling Staff monitoring.');
  }

  const roster = currentStaffRoster(members, staffRoles);
  const previous = loadState();
  const firstRun = !previous;

  let state;
  let changes = [];
  let logicalChanged = false;

  if (firstRun) {
    state = buildInitialState(roster);
    logicalChanged = true;
    console.log('Initial Staff baseline created. Existing Staff will not generate historical change alerts.');
  } else {
    const result = updateState(previous, roster);
    state = result.state;
    changes = result.changes;
    logicalChanged = result.logicalChanged;
  }

  const summary = buildSummary(state, staffRoles);
  const channel = await resolveStaffChannel();
  const embed = buildOverviewEmbed(summary, state);
  await syncOverview(channel, embed);

  if (!firstRun) await sendChangeAlerts(channel, changes);

  const existingSummary = readJson(SUMMARY_FILE, null);
  const summaryChanged = JSON.stringify(existingSummary) !== JSON.stringify(summary);

  if (logicalChanged || !fs.existsSync(STATE_FILE)) writeJson(STATE_FILE, encryptState(state));
  if (summaryChanged) writeJson(SUMMARY_FILE, summary);

  console.log(`Current Staff detected: ${summary.currentStaff}`);
  console.log(`Staff roles detected: ${staffRoles.length}`);
  console.log(`Other VTC roles: ${nonStaffRoles.map((role) => role.name).join(', ') || 'none'}`);
  console.log(`New Staff changes: ${changes.length}`);
  console.log(`Repository state changed: ${logicalChanged || summaryChanged ? 'yes' : 'no'}`);
  console.log('Safety: read-only/advisory. No automatic personnel or Discord role actions are implemented.');
}

main().catch((error) => {
  console.error('Kings Staff Management failed:', error.message);
  process.exit(1);
});
