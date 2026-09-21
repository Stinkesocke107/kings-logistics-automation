const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const LEADERSHIP_CHANNEL_ID = process.env.DRIVER_LEADERSHIP_CHANNEL_ID || null;
const LEADERSHIP_CHANNEL_NAME = process.env.DRIVER_LEADERSHIP_CHANNEL_NAME || '🚛｜driver-leadership';

const DRIVER_STATE_FILE = path.join(__dirname, 'data', 'driver-management.json');
const ACHIEVEMENT_STATE_FILE = path.join(__dirname, 'data', 'driver-achievements.json');
const SUMMARY_FILE = path.join(__dirname, 'data', 'driver-achievements-summary.json');

const DISCORD_API = 'https://discord.com/api/v10';
const DAY_MS = 24 * 60 * 60 * 1000;

const ACHIEVEMENTS = [
  { id: '1m', label: '1 Month with Kings', months: 1 },
  { id: '3m', label: '3 Months with Kings', months: 3 },
  { id: '6m', label: '6 Months with Kings', months: 6 },
  { id: '1y', label: '1 Year with Kings', years: 1 },
  { id: '2y', label: '2 Years with Kings', years: 2 },
  { id: '3y', label: '3 Years with Kings', years: 3 },
  { id: '4y', label: '4 Years with Kings', years: 4 },
  { id: '5y', label: '5 Years with Kings', years: 5 }
];

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

function earnedDate(joinDate, achievement) {
  if (achievement.months) return addMonthsUTC(joinDate, achievement.months);
  if (achievement.years) return addYearsUTC(joinDate, achievement.years);
  return null;
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  if (method !== 'GET') {
    const messagePath = pathname.match(/^\/channels\/(\d+)\/messages$/);
    const allowed = method === 'POST' && messagePath;
    if (!allowed) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Driver Achievements/1.0'
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

function normalizeChannelName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function resolveLeadershipChannel() {
  if (LEADERSHIP_CHANNEL_ID) {
    const channel = await discord(`/channels/${LEADERSHIP_CHANNEL_ID}`);
    if (channel.guild_id && String(channel.guild_id) !== String(DISCORD_GUILD_ID)) {
      throw new Error('Configured Driver Leadership channel is not in the configured guild.');
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));
  const wanted = normalizeChannelName(LEADERSHIP_CHANNEL_NAME);

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

function loadDriverManagement() {
  const container = readJson(DRIVER_STATE_FILE, null);
  if (!container) throw new Error('Driver Management state is missing.');
  return decrypt(container, 'kings-driver-management-v1');
}

function loadAchievementState() {
  const container = readJson(ACHIEVEMENT_STATE_FILE, null);
  if (!container) return null;
  return decrypt(container, 'kings-driver-achievements-v1');
}

function emptyState() {
  return {
    version: 1,
    mode: 'recognition-only',
    initializedAt: nowISO(),
    updatedAt: nowISO(),
    drivers: []
  };
}

function reachedAchievements(joinDate, now = new Date()) {
  return ACHIEVEMENTS
    .map((achievement) => ({
      achievement,
      earnedAt: earnedDate(joinDate, achievement)
    }))
    .filter((entry) => entry.earnedAt && entry.earnedAt.getTime() <= now.getTime());
}

function currentRecordMap(state) {
  return new Map(
    (Array.isArray(state.drivers) ? state.drivers : [])
      .map((record) => [Number(record.tmpId), record])
      .filter(([tmpId]) => Number.isFinite(tmpId))
  );
}

function sameMembershipDate(a, b) {
  const da = safeDate(a);
  const db = safeDate(b);
  if (!da || !db) return false;
  return Math.abs(da.getTime() - db.getTime()) < DAY_MS;
}

function syncState(state, drivers, firstRun) {
  const now = new Date();
  const byId = currentRecordMap(state);
  const newAchievements = [];
  const currentIds = new Set();

  for (const driver of drivers.filter((item) => item.current)) {
    const tmpId = Number(driver.tmpId);
    const joinDate = safeDate(driver.joinDate);
    if (!Number.isFinite(tmpId) || !joinDate) continue;

    currentIds.add(tmpId);
    let record = byId.get(tmpId);

    if (!record || !sameMembershipDate(record.joinDate, joinDate)) {
      const reached = reachedAchievements(joinDate, now);
      record = {
        tmpId,
        joinDate: joinDate.toISOString(),
        baselineAt: nowISO(),
        current: true,
        achievements: reached.map((entry) => ({
          id: entry.achievement.id,
          earnedAt: entry.earnedAt.toISOString(),
          recognizedAt: nowISO(),
          retroactive: true
        }))
      };
      byId.set(tmpId, record);
      continue;
    }

    record.current = true;
    record.joinDate = joinDate.toISOString();
    record.achievements = Array.isArray(record.achievements) ? record.achievements : [];

    const recognized = new Set(record.achievements.map((item) => String(item.id)));
    for (const entry of reachedAchievements(joinDate, now)) {
      if (recognized.has(entry.achievement.id)) continue;

      const item = {
        id: entry.achievement.id,
        earnedAt: entry.earnedAt.toISOString(),
        recognizedAt: nowISO(),
        retroactive: Boolean(firstRun)
      };
      record.achievements.push(item);
      recognized.add(entry.achievement.id);

      if (!firstRun) {
        newAchievements.push({
          tmpId,
          username: String(driver.username || `TMP ${tmpId}`),
          id: entry.achievement.id,
          label: entry.achievement.label,
          earnedAt: item.earnedAt
        });
      }
    }
  }

  for (const record of byId.values()) {
    record.current = currentIds.has(Number(record.tmpId));
  }

  state.drivers = [...byId.values()].sort((a, b) => Number(a.tmpId) - Number(b.tmpId));
  state.updatedAt = nowISO();
  return newAchievements;
}

function buildSummary(state, currentDrivers) {
  const counts = Object.fromEntries(ACHIEVEMENTS.map((item) => [item.id, 0]));
  let upcoming30Days = 0;
  const now = new Date();
  const driverById = new Map(currentDrivers.map((driver) => [Number(driver.tmpId), driver]));

  for (const record of state.drivers.filter((item) => item.current)) {
    const current = driverById.get(Number(record.tmpId));
    if (!current) continue;

    const recognized = new Set((record.achievements || []).map((item) => String(item.id)));
    for (const id of recognized) {
      if (Object.prototype.hasOwnProperty.call(counts, id)) counts[id]++;
    }

    const joinDate = safeDate(record.joinDate);
    if (!joinDate) continue;

    const next = ACHIEVEMENTS
      .filter((item) => !recognized.has(item.id))
      .map((item) => ({ item, date: earnedDate(joinDate, item) }))
      .filter((entry) => entry.date && entry.date > now)
      .sort((a, b) => a.date - b.date)[0];

    if (next) {
      const days = Math.ceil((next.date.getTime() - now.getTime()) / DAY_MS);
      if (days >= 0 && days <= 30) upcoming30Days++;
    }
  }

  return {
    version: 1,
    mode: 'recognition-only',
    updatedAt: state.updatedAt,
    currentDrivers: currentDrivers.length,
    trackedCurrentDrivers: state.drivers.filter((item) => item.current).length,
    counts,
    upcoming30Days,
    achievements: ACHIEVEMENTS.map((item) => ({ id: item.id, label: item.label })),
    note: 'Recognition only. The automation never changes roles, grants permissions, disciplines members, or makes personnel decisions.'
  };
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function sendAchievementAlerts(channel, achievements) {
  if (!achievements.length) {
    console.log('No new Driver loyalty achievements this run.');
    return;
  }

  const grouped = new Map();
  for (const achievement of achievements) {
    const list = grouped.get(achievement.id) || [];
    list.push(achievement);
    grouped.set(achievement.id, list);
  }

  for (const definition of ACHIEVEMENTS) {
    const items = grouped.get(definition.id) || [];
    if (!items.length) continue;

    for (const group of chunks(items, 12)) {
      const lines = group.map((item) =>
        `• [${escapeMarkdown(item.username)}](${profileUrl(item.tmpId)})`
      );

      const content = [
        '🎖️ **Kings Driver Loyalty Achievement**',
        '',
        `**${definition.label}**`,
        ...lines,
        '',
        'Recognition only — no automatic role, asset, permission or personnel change is performed.'
      ].join('\n');

      if (content.length > 2000) {
        throw new Error(`Achievement alert exceeded Discord limit: ${content.length}`);
      }

      await discord(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: {
          content,
          allowed_mentions: { parse: [] }
        }
      });
    }
  }

  console.log(`${achievements.length} new Driver loyalty achievement(s) posted in #${channel.name}.`);
}

async function main() {
  console.log('=========================================');
  console.log('Kings Driver Loyalty Achievement System');
  console.log('=========================================');

  const driverState = loadDriverManagement();
  const currentDrivers = (Array.isArray(driverState.drivers) ? driverState.drivers : [])
    .filter((driver) => driver.current);

  let state = loadAchievementState();
  const firstRun = !state;
  if (!state) state = emptyState();

  const newAchievements = syncState(state, currentDrivers, firstRun);

  if (firstRun) {
    console.log('First run baseline created. Previous loyalty achievements will not be announced retroactively.');
  } else if (newAchievements.length) {
    const channel = await resolveLeadershipChannel();
    await sendAchievementAlerts(channel, newAchievements);
  } else {
    console.log('No new Driver loyalty achievements this run.');
  }

  writeJson(
    ACHIEVEMENT_STATE_FILE,
    encrypt(state, 'kings-driver-achievements-v1')
  );
  writeJson(SUMMARY_FILE, buildSummary(state, currentDrivers));

  console.log(`Current Drivers evaluated: ${currentDrivers.length}`);
  console.log(`New achievements: ${newAchievements.length}`);
  console.log('Safety: recognition-only; no automatic role, asset or personnel changes.');
}

main().catch((error) => {
  console.error('Kings Driver Achievement System failed:', error.message);
  process.exit(1);
});
