const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const HR_LEADERSHIP_CHANNEL_ID = process.env.HR_LEADERSHIP_CHANNEL_ID || null;
const HR_LEADERSHIP_CHANNEL_NAME = process.env.HR_LEADERSHIP_CHANNEL_NAME || 'hr-leadership';

const DRIVER_STATE_FILE = path.join(__dirname, 'data', 'driver-management.json');
const PROBATION_STATE_FILE = path.join(__dirname, 'data', 'probation-state.json');

const PROBATION_DAYS = 7;
const DISCORD_API = 'https://discord.com/api/v10';
const OVERVIEW_MARKER = '👥 **Kings HR Leadership Overview**';

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}

if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function deriveDriverKey() {
  return crypto
    .createHash('sha256')
    .update('kings-driver-management-v1\0')
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function decryptDriverState(container) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error('Driver Management state is not encrypted as expected.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveDriverKey(),
    Buffer.from(container.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

function probationSecret() {
  return crypto
    .createHash('sha256')
    .update('kings-probation-state-v1\\0')
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function probationKey(tmpId, joinedAt) {
  return crypto
    .createHmac('sha256', probationSecret())
    .update(`${tmpId}:${joinedAt}`)
    .digest('hex');
}

function ageDays(value, now = Date.now()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 86400000));
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function driverLink(driver) {
  return `[${escapeMarkdown(driver.username || `TMP ${driver.tmpId}`)}](${profileUrl(driver.tmpId)})`;
}

function compactList(items, formatter, limit = 12) {
  if (!items.length) return 'None ✅';
  const lines = items.slice(0, limit).map(formatter);
  if (items.length > limit) lines.push(`• … and **${items.length - limit} more**`);
  return lines.join('\n');
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD: HR Leadership may only read Discord and create/update
  // its own overview message. It cannot modify members, roles, kicks, bans,
  // permissions, or any other personnel setting.
  if (method !== 'GET') {
    const allowedWrite = /^\/channels\/\d+\/messages(?:\/\d+)?$/.test(pathname) &&
      (method === 'POST' || method === 'PATCH');
    if (!allowedWrite) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics HR Leadership/1.0'
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

function normalizeChannelName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-');
}

async function resolveHrChannel() {
  if (HR_LEADERSHIP_CHANNEL_ID) {
    const channel = await discord(`/channels/${HR_LEADERSHIP_CHANNEL_ID}`);
    if (channel.guild_id && channel.guild_id !== DISCORD_GUILD_ID) {
      throw new Error(`HR Leadership channel ${HR_LEADERSHIP_CHANNEL_ID} is not in the configured guild.`);
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));
  const wanted = normalizeChannelName(HR_LEADERSHIP_CHANNEL_NAME).replace(/^-+|-+$/g, '');

  const exact = textChannels.find((channel) =>
    normalizeChannelName(channel.name).replace(/^-+|-+$/g, '') === wanted
  );
  if (exact) return exact;

  const fuzzy = textChannels.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('hr') && name.includes('leadership');
  });

  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(`Multiple HR Leadership channels found: ${fuzzy.map((channel) => channel.name).join(', ')}`);
  }

  throw new Error(`Could not find HR Leadership channel "${HR_LEADERSHIP_CHANNEL_NAME}".`);
}

function buildData(driverState, probationState) {
  const now = Date.now();
  const current = (driverState.drivers || []).filter((driver) => driver.current);
  const notifiedByKey = new Map(
    (probationState?.notified || []).map((item) => [String(item.key || ''), item])
  );

  const probationActive = current
    .map((driver) => ({ driver, age: ageDays(driver.joinDate, now) }))
    .filter((item) => item.age !== null && item.age < PROBATION_DAYS)
    .sort((a, b) => a.age - b.age);

  const probationReviews = current
    .map((driver) => {
      if (!driver.joinDate) return null;
      const key = probationKey(driver.tmpId, driver.joinDate);
      const reminder = notifiedByKey.get(key);
      if (!reminder?.notifiedAt) return null;
      return {
        driver,
        age: ageDays(driver.joinDate, now),
        notifiedAt: reminder.notifiedAt
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.notifiedAt) - new Date(b.notifiedAt));

  const hrReviews = current
    .filter((driver) => driver.activityLevel === 'HR Review')
    .sort((a, b) => (b.inactiveDays || 0) - (a.inactiveDays || 0));

  const approvedLeave = current
    .filter((driver) => driver.activityLevel === 'Approved Leave')
    .sort((a, b) => String(a.username).localeCompare(String(b.username)));

  const joinedLast7Days = current.filter((driver) => {
    const age = ageDays(driver.joinDate || driver.firstObservedAt, now);
    return age !== null && age <= 7;
  });

  return {
    current,
    probationActive,
    probationReviews,
    hrReviews,
    approvedLeave,
    joinedLast7Days
  };
}

function buildMessage(driverState, data) {
  const timestamp = Math.floor(new Date(driverState.updatedAt || Date.now()).getTime() / 1000);

  const probationActiveText = compactList(
    data.probationActive,
    (item) => `• ${driverLink(item.driver)} — Day **${item.age + 1}/${PROBATION_DAYS}**`
  );

  const probationReviewText = compactList(
    data.probationReviews,
    (item) => `• ${driverLink(item.driver)} — **${item.age ?? PROBATION_DAYS}d** member — review reminder sent`
  );

  const hrReviewText = compactList(
    data.hrReviews,
    (driver) => `• ${driverLink(driver)} — **${Number.isFinite(driver.inactiveDays) ? `${driver.inactiveDays}d inactive` : 'review required'}**`
  );

  const leaveText = compactList(
    data.approvedLeave,
    (driver) => `• ${driverLink(driver)} — approved inactivity`
  );

  return [
    OVERVIEW_MARKER,
    '',
    '# 👥 HR & Probation',
    '',
    `**Current Drivers:** ${data.current.length}`,
    `**Joined last 7 days:** ${data.joinedLast7Days.length}`,
    `**In Probation:** ${data.probationActive.length}`,
    `**Probation Reviews:** ${data.probationReviews.length}`,
    `**30d HR Reviews:** ${data.hrReviews.length}`,
    `**Approved Leave:** ${data.approvedLeave.length}`,
    '',
    `## 🕒 Driver Probation — First ${PROBATION_DAYS} Days`,
    probationActiveText,
    '',
    '## 📋 Probation Reviews',
    probationReviewText,
    '',
    '## ⚠️ Driver Activity — HR Review',
    hrReviewText,
    '',
    '## 🏖️ Approved Leave',
    leaveText,
    '',
    '🛡️ **Advisory only:** This overview identifies cases for human HR/Leadership review. Kings Systems never removes, kicks, bans, disciplines, changes roles, or makes personnel decisions.',
    '',
    `Driver data updated <t:${timestamp}:R>`
  ].join('\n');
}

async function syncOverview(driverState, data) {
  const channel = await resolveHrChannel();
  const bot = await discord('/users/@me');
  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const existing = (messages || []).find((message) =>
    message.author?.id === bot.id &&
    String(message.content || '').includes(OVERVIEW_MARKER)
  );

  const content = buildMessage(driverState, data);

  if (existing) {
    if (String(existing.content || '').trim() === content.trim()) {
      console.log(`HR Leadership overview unchanged in #${channel.name}.`);
      return;
    }

    await discord(`/channels/${channel.id}/messages/${existing.id}`, {
      method: 'PATCH',
      body: { content, allowed_mentions: { parse: [] } }
    });
    console.log(`HR Leadership overview updated in #${channel.name}.`);
    return;
  }

  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: { content, allowed_mentions: { parse: [] } }
  });
  console.log(`HR Leadership overview created in #${channel.name}.`);
}

async function main() {
  const driverContainer = readJson(DRIVER_STATE_FILE, null);
  if (!driverContainer) throw new Error('Driver Management state is missing.');

  const driverState = decryptDriverState(driverContainer);
  const probationState = readJson(PROBATION_STATE_FILE, { notified: [] });
  const data = buildData(driverState, probationState);

  await syncOverview(driverState, data);

  console.log('Kings HR Leadership overview updated successfully.');
  console.log(`Current Drivers: ${data.current.length}`);
  console.log(`Probation: ${data.probationActive.length}`);
  console.log(`Probation Reviews: ${data.probationReviews.length}`);
  console.log(`30d HR Reviews: ${data.hrReviews.length}`);
  console.log(`Approved Leave: ${data.approvedLeave.length}`);
  console.log('Safety: No automatic personnel actions are implemented.');
}

main().catch((error) => {
  console.error('Kings HR Leadership failed:', error.message);
  process.exit(1);
});
