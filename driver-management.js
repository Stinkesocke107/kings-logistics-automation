const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KINGS_VTC_ID = 64284;
const RETENTION_DAYS = 730;
const MEMBERS_URL = `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;
const SERVERS_URL = 'https://api.truckersmp.com/v2/servers';

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const LEADERSHIP_CHANNEL_ID = process.env.DRIVER_LEADERSHIP_CHANNEL_ID || null;
const LEADERSHIP_CHANNEL_NAME = process.env.DRIVER_LEADERSHIP_CHANNEL_NAME || 'driver-leadership';

const STATE_FILE = path.join(__dirname, 'data', 'driver-management.json');
const SUMMARY_FILE = path.join(__dirname, 'data', 'driver-management-summary.json');

const INFO_DAYS = 7;
const ATTENTION_DAYS = 14;
const HR_REVIEW_DAYS = 30;
const NEW_DRIVER_GRACE_DAYS = 14;

const DISCORD_API = 'https://discord.com/api/v10';
const LEADERSHIP_MARKER = '👑 **Kings Driver Leadership Overview**';

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update('kings-driver-management-v1\0')
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function encryptState(state) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(state), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 2,
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptState(container) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') return null;

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
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
      'User-Agent': 'Kings Logistics Driver Management/2.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}

async function discord(pathname, options = {}) {
  if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');

  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD:
  // This Driver Management automation is advisory-only. It may read Discord
  // data and create/update its own channel message. It is not permitted to
  // modify members, roles, bans, kicks, permissions, or other personnel data.
  if (method !== 'GET') {
    const allowedWrite = /^\/channels\/\d+\/messages(?:\/\d+)?$/.test(pathname) &&
      (method === 'POST' || method === 'PATCH');

    if (!allowedWrite) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Driver Management/2.0'
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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getCurrentMembers() {
  const data = await fetchJson(MEMBERS_URL, 'TruckersMP VTC members');
  const members = data?.response?.members;
  if (!Array.isArray(members)) throw new Error('Invalid TruckersMP VTC members response.');

  return members
    .map((member) => ({
      tmpId: Number(member.user_id),
      vtcMemberId: Number(member.id),
      username: String(member.username || '').trim(),
      joinDate: safeISO(member.joinDate)
    }))
    .filter((member) => Number.isFinite(member.tmpId) && member.username);
}

async function getOnlineKingsDrivers() {
  const data = await fetchJson(SERVERS_URL, 'TruckersMP servers');
  const servers = Array.isArray(data?.response)
    ? data.response.filter((server) => server.online && Number.isFinite(Number(server.mapid)))
    : [];

  const online = new Map();

  for (const server of servers) {
    const mapId = Number(server.mapid);
    const url =
      'https://tracker.ets2map.com/v3/area' +
      `?x1=-1000000&y1=1000000&x2=1000000&y2=-1000000&server=${mapId}`;

    try {
      const players = await fetchJson(url, `${server.game} ${server.name}`);
      if (!players?.Success || !Array.isArray(players.Data)) continue;

      for (const player of players.Data) {
        if (Number(player.VtcId) !== KINGS_VTC_ID) continue;
        const tmpId = Number(player.MpId);
        if (!Number.isFinite(tmpId)) continue;

        online.set(tmpId, {
          game: String(server.game || ''),
          server: String(server.name || '')
        });
      }
    } catch (error) {
      console.warn(`Online lookup skipped for ${server.name}: ${error.message}`);
    }
  }

  return online;
}

function ageDays(value, now = Date.now()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 86400000));
}

function updateState(previous, currentMembers, onlineMap) {
  const now = nowISO();
  const previousDrivers = Array.isArray(previous?.drivers) ? previous.drivers : [];
  const byId = new Map(previousDrivers.map((driver) => [Number(driver.tmpId), { ...driver }]));
  const currentIds = new Set();

  for (const member of currentMembers) {
    currentIds.add(member.tmpId);
    let driver = byId.get(member.tmpId);

    if (!driver) {
      driver = {
        tmpId: member.tmpId,
        vtcMemberId: member.vtcMemberId,
        username: member.username,
        previousNames: [],
        joinDate: member.joinDate,
        firstObservedAt: now,
        lastRosterSeenAt: now,
        lastOnlineSeenAt: null,
        lastOnlineGame: null,
        lastOnlineServer: null,
        current: true,
        leftAt: null,
        lastRejoinedAt: null,
        activityLevel: 'Grace',
        activityLevelSince: now
      };
      byId.set(member.tmpId, driver);
    } else {
      if (driver.username && driver.username !== member.username) {
        driver.previousNames = Array.isArray(driver.previousNames) ? driver.previousNames : [];
        if (!driver.previousNames.includes(driver.username)) driver.previousNames.push(driver.username);
      }

      if (driver.current === false) {
        driver.lastRejoinedAt = now;
        driver.firstObservedAt = now;
        driver.activityLevel = 'Grace';
        driver.activityLevelSince = now;
      }

      driver.username = member.username;
      driver.vtcMemberId = member.vtcMemberId;
      driver.joinDate = member.joinDate || driver.joinDate || null;
      driver.lastRosterSeenAt = now;
      driver.current = true;
      driver.leftAt = null;
    }

    const online = onlineMap.get(member.tmpId);
    if (online) {
      driver.lastOnlineSeenAt = now;
      driver.lastOnlineGame = online.game || null;
      driver.lastOnlineServer = online.server || null;
    }
  }

  for (const driver of byId.values()) {
    if (!currentIds.has(Number(driver.tmpId)) && driver.current !== false) {
      driver.current = false;
      driver.leftAt = now;
      driver.activityLevel = 'Left';
      driver.activityLevelSince = now;
    }
  }

  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const drivers = [...byId.values()]
    .filter((driver) => driver.current || !driver.leftAt || new Date(driver.leftAt).getTime() >= cutoff)
    .sort((a, b) => Number(a.tmpId) - Number(b.tmpId));

  return {
    version: 2,
    mode: 'advisory-only',
    initializedAt: previous?.initializedAt || now,
    updatedAt: now,
    drivers
  };
}

function evaluateActivity(driver, now = Date.now()) {
  if (!driver.current) {
    return { level: 'Left', inactiveDays: null, basis: null };
  }

  const observedAge = ageDays(driver.firstObservedAt, now);
  const membershipAge = ageDays(driver.joinDate, now);
  const graceAge = observedAge === null
    ? membershipAge
    : membershipAge === null
      ? observedAge
      : Math.min(observedAge, membershipAge);

  if (graceAge !== null && graceAge < NEW_DRIVER_GRACE_DAYS) {
    return {
      level: 'Grace',
      inactiveDays: driver.lastOnlineSeenAt ? ageDays(driver.lastOnlineSeenAt, now) : null,
      basis: driver.lastOnlineSeenAt ? 'last-online' : 'tracking-grace'
    };
  }

  const activityBasis = driver.lastOnlineSeenAt || driver.firstObservedAt || driver.joinDate;
  const inactiveDays = ageDays(activityBasis, now);

  if (inactiveDays === null) {
    return { level: 'Unknown', inactiveDays: null, basis: null };
  }

  if (inactiveDays >= HR_REVIEW_DAYS) {
    return { level: 'HR Review', inactiveDays, basis: driver.lastOnlineSeenAt ? 'last-online' : 'tracking-start' };
  }

  if (inactiveDays >= ATTENTION_DAYS) {
    return { level: 'Attention', inactiveDays, basis: driver.lastOnlineSeenAt ? 'last-online' : 'tracking-start' };
  }

  if (inactiveDays >= INFO_DAYS) {
    return { level: 'Info', inactiveDays, basis: driver.lastOnlineSeenAt ? 'last-online' : 'tracking-start' };
  }

  return { level: 'Active', inactiveDays, basis: driver.lastOnlineSeenAt ? 'last-online' : 'tracking-start' };
}

function applyActivityLevels(state) {
  const now = Date.now();
  const changed = [];

  for (const driver of state.drivers) {
    const evaluation = evaluateActivity(driver, now);
    const previousLevel = driver.activityLevel || null;

    driver.inactiveDays = evaluation.inactiveDays;
    driver.activityBasis = evaluation.basis;

    if (previousLevel !== evaluation.level) {
      changed.push({
        tmpId: driver.tmpId,
        username: driver.username,
        from: previousLevel,
        to: evaluation.level,
        inactiveDays: evaluation.inactiveDays
      });
      driver.activityLevel = evaluation.level;
      driver.activityLevelSince = state.updatedAt;
    } else {
      driver.activityLevel = evaluation.level;
      driver.activityLevelSince = driver.activityLevelSince || state.updatedAt;
    }
  }

  return changed;
}

function buildSummary(state, onlineMap) {
  const now = Date.now();
  const current = state.drivers.filter((driver) => driver.current);
  const left = state.drivers.filter((driver) => !driver.current);

  const joinedWithin = (days) => current.filter((driver) => {
    const value = driver.joinDate || driver.firstObservedAt;
    const age = ageDays(value, now);
    return age !== null && age <= days;
  }).length;

  const leftWithin = (days) => left.filter((driver) => {
    const age = ageDays(driver.leftAt, now);
    return age !== null && age <= days;
  }).length;

  const levels = {
    Grace: 0,
    Active: 0,
    Info: 0,
    Attention: 0,
    'HR Review': 0,
    Unknown: 0
  };

  for (const driver of current) {
    const level = driver.activityLevel || 'Unknown';
    if (Object.prototype.hasOwnProperty.call(levels, level)) levels[level] += 1;
    else levels.Unknown += 1;
  }

  return {
    version: 2,
    mode: 'advisory-only',
    updatedAt: state.updatedAt,
    currentDrivers: current.length,
    onlineNow: [...onlineMap.keys()].filter((tmpId) => current.some((driver) => driver.tmpId === tmpId)).length,
    joinedLast7Days: joinedWithin(7),
    joinedLast30Days: joinedWithin(30),
    leftLast7Days: leftWithin(7),
    leftLast30Days: leftWithin(30),
    activity: {
      grace: levels.Grace,
      active: levels.Active,
      info7Days: levels.Info,
      attention14Days: levels.Attention,
      hrReview30Days: levels['HR Review'],
      unknown: levels.Unknown
    },
    rules: {
      infoDays: INFO_DAYS,
      attentionDays: ATTENTION_DAYS,
      hrReviewDays: HR_REVIEW_DAYS,
      newDriverGraceDays: NEW_DRIVER_GRACE_DAYS
    },
    note: 'Advisory only. The automation never kicks, bans, removes, disciplines, or changes roles for Drivers. Human Leadership/HR always decides any action.'
  };
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function driverLine(driver) {
  const days = Number.isFinite(driver.inactiveDays) ? `${driver.inactiveDays}d` : 'unknown';
  return `• [${escapeMarkdown(driver.username)}](${profileUrl(driver.tmpId)}) — ${days}`;
}

function sectionLines(drivers, limit = 15) {
  if (!drivers.length) return 'None ✅';
  const sorted = [...drivers].sort((a, b) => (b.inactiveDays || 0) - (a.inactiveDays || 0));
  const shown = sorted.slice(0, limit).map(driverLine);
  if (sorted.length > limit) shown.push(`• … and **${sorted.length - limit} more**`);
  return shown.join('\n');
}

function buildLeadershipMessage(state, summary, changes) {
  const current = state.drivers.filter((driver) => driver.current);
  const info = current.filter((driver) => driver.activityLevel === 'Info');
  const attention = current.filter((driver) => driver.activityLevel === 'Attention');
  const hrReview = current.filter((driver) => driver.activityLevel === 'HR Review');
  const grace = current.filter((driver) => driver.activityLevel === 'Grace');
  const timestamp = Math.floor(new Date(state.updatedAt).getTime() / 1000);

  const meaningfulChanges = changes.filter((change) =>
    ['Info', 'Attention', 'HR Review'].includes(change.to)
  );

  const changeText = meaningfulChanges.length
    ? meaningfulChanges.slice(0, 10).map((change) => {
        const days = Number.isFinite(change.inactiveDays) ? ` (${change.inactiveDays}d)` : '';
        return `• ${escapeMarkdown(change.username)}: ${change.from || 'New'} → **${change.to}**${days}`;
      }).join('\n') + (meaningfulChanges.length > 10 ? `\n• … and **${meaningfulChanges.length - 10} more**` : '')
    : 'No new inactivity level changes this run.';

  return [
    LEADERSHIP_MARKER,
    '',
    '# 🚛 Driver Management',
    '',
    `**Current Drivers:** ${summary.currentDrivers}`,
    `**Online now:** ${summary.onlineNow}`,
    `**Grace (<${NEW_DRIVER_GRACE_DAYS}d tracking):** ${grace.length}`,
    `**7d Info:** ${info.length}`,
    `**14d Attention:** ${attention.length}`,
    `**30d HR Review:** ${hrReview.length}`,
    '',
    '## ℹ️ 7 Days — Information',
    sectionLines(info),
    '',
    '## ⚠️ 14 Days — Attention',
    sectionLines(attention),
    '',
    '## 👥 30 Days — HR Review',
    sectionLines(hrReview),
    '',
    '## 🔄 New Status Changes',
    changeText,
    '',
    '🛡️ **Advisory only:** These are internal review signals. The bot never removes, kicks, bans, disciplines, or changes roles for any Driver. All decisions remain with Kings Leadership / HR.',
    '',
    `Last updated <t:${timestamp}:R>`
  ].join('\n');
}

function normalizeChannelName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-');
}

async function resolveLeadershipChannel() {
  if (!DISCORD_BOT_TOKEN) return null;

  if (LEADERSHIP_CHANNEL_ID) {
    const channel = await discord(`/channels/${LEADERSHIP_CHANNEL_ID}`);
    if (channel.guild_id && channel.guild_id !== DISCORD_GUILD_ID) {
      throw new Error(`Driver Leadership channel ${LEADERSHIP_CHANNEL_ID} is not in the configured guild.`);
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const wanted = normalizeChannelName(LEADERSHIP_CHANNEL_NAME);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));

  const exact = textChannels.find((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact) return exact;

  const fuzzy = textChannels.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('driver') && name.includes('leadership');
  });

  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(`Multiple Driver Leadership channels found: ${fuzzy.map((channel) => channel.name).join(', ')}`);
  }

  throw new Error(`Could not find Driver Leadership channel "${LEADERSHIP_CHANNEL_NAME}".`);
}

async function syncLeadershipMessage(state, summary, changes) {
  if (!DISCORD_BOT_TOKEN) {
    console.log('Discord leadership sync skipped: DISCORD_BOT_TOKEN not configured.');
    return;
  }

  const channel = await resolveLeadershipChannel();
  const bot = await discord('/users/@me');
  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const existing = (messages || []).find((message) =>
    message.author?.id === bot.id &&
    String(message.content || '').includes(LEADERSHIP_MARKER)
  );

  const content = buildLeadershipMessage(state, summary, changes);

  if (existing) {
    if (String(existing.content || '').trim() === content.trim()) {
      console.log(`Driver Leadership overview unchanged in #${channel.name}.`);
      return;
    }

    await discord(`/channels/${channel.id}/messages/${existing.id}`, {
      method: 'PATCH',
      body: { content, allowed_mentions: { parse: [] } }
    });
    console.log(`Driver Leadership overview updated in #${channel.name}.`);
    return;
  }

  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: { content, allowed_mentions: { parse: [] } }
  });
  console.log(`Driver Leadership overview created in #${channel.name}.`);
}

async function main() {
  const existingContainer = readJson(STATE_FILE, null);
  let previous = null;

  if (existingContainer) {
    try {
      previous = decryptState(existingContainer);
    } catch (error) {
      throw new Error(`Could not decrypt Driver Management state: ${error.message}`);
    }
  }

  const [members, onlineMap] = await Promise.all([
    getCurrentMembers(),
    getOnlineKingsDrivers()
  ]);

  const previousCurrentCount = previous?.drivers?.filter((driver) => driver.current).length || 0;
  if (previousCurrentCount >= 20 && members.length < previousCurrentCount * 0.5) {
    throw new Error('Safety stop: TruckersMP member count dropped by more than 50%.');
  }

  const state = updateState(previous, members, onlineMap);
  const changes = applyActivityLevels(state);
  const summary = buildSummary(state, onlineMap);

  writeJson(STATE_FILE, encryptState(state));
  writeJson(SUMMARY_FILE, summary);

  try {
    await syncLeadershipMessage(state, summary, changes);
  } catch (error) {
    console.warn(`Driver Leadership Discord sync failed: ${error.message}`);
  }

  console.log('Kings Driver Management updated successfully.');
  console.log(`Mode: ${summary.mode}`);
  console.log(`Current Drivers: ${summary.currentDrivers}`);
  console.log(`Online Now: ${summary.onlineNow}`);
  console.log(`Grace / Active / Info / Attention / HR Review: ${summary.activity.grace} / ${summary.activity.active} / ${summary.activity.info7Days} / ${summary.activity.attention14Days} / ${summary.activity.hrReview30Days}`);
  console.log('Safety: No automatic disciplinary or personnel actions are implemented.');
}

main().catch((error) => {
  console.error('Kings Driver Management failed:', error.message);
  process.exit(1);
});
