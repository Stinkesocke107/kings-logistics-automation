const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const LEADERSHIP_CHANNEL_ID = process.env.DRIVER_LEADERSHIP_CHANNEL_ID || null;
const LEADERSHIP_CHANNEL_NAME = process.env.DRIVER_LEADERSHIP_CHANNEL_NAME || '🚛｜driver-leadership';

const STATE_FILE = path.join(__dirname, 'data', 'driver-management.json');
const DISCORD_API = 'https://discord.com/api/v10';
const SEVERITY_LEVELS = new Set(['Info', 'Attention', 'HR Review']);

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update('kings-driver-management-v1\0')
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing state file: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function decryptState(container) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error('Driver Management state is not encrypted as expected.');
  }

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

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(
    STATE_FILE,
    `${JSON.stringify(encryptState(state), null, 2)}\n`,
    'utf8'
  );
}

async function discord(pathname, options = {}) {
  if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');

  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD: this module may only read Discord data and POST
  // advisory messages. It cannot modify members, roles, kicks, bans,
  // permissions, or any other personnel settings.
  if (method !== 'GET') {
    const allowedWrite = /^\/channels\/\d+\/messages$/.test(pathname) && method === 'POST';
    if (!allowedWrite) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Driver Status Alerts/1.0'
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

async function resolveLeadershipChannel() {
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

  throw new Error(`Could not uniquely find Driver Leadership channel "${LEADERSHIP_CHANNEL_NAME}".`);
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function pendingType(driver) {
  const level = driver.activityLevel || null;
  const lastAlert = driver.lastActivityAlertLevel || null;

  if (!driver.current) return null;

  // A rejoined/newly tracked driver in Grace should not inherit an old
  // inactivity alert state from a previous membership period.
  if (level === 'Grace') {
    if (lastAlert && lastAlert !== 'Grace') {
      driver.lastActivityAlertLevel = null;
      driver.lastActivityAlertAt = null;
      return 'state-reset';
    }
    return null;
  }

  if (SEVERITY_LEVELS.has(level) && lastAlert !== level) {
    return level;
  }

  if (level === 'Active' && SEVERITY_LEVELS.has(lastAlert)) {
    return 'Restored';
  }

  return null;
}

function alertTitle(type) {
  if (type === 'Info') return 'ℹ️ **Driver Activity Info — 7 Days**';
  if (type === 'Attention') return '⚠️ **Driver Attention — 14 Days**';
  if (type === 'HR Review') return '👥 **Driver HR Review — 30 Days**';
  return '✅ **Driver Activity Restored**';
}

function alertDescription(type) {
  if (type === 'Info') {
    return 'The following Driver has not been detected on TruckersMP for at least **7 days**.';
  }
  if (type === 'Attention') {
    return 'The following Driver has reached the **14-day attention level** and should be reviewed by Driver Leadership.';
  }
  if (type === 'HR Review') {
    return 'The following Driver has reached the **30-day HR review level**. This is an internal review signal only.';
  }
  return 'The following Driver was detected on TruckersMP again after a previous inactivity alert.';
}

function driverLine(driver, type) {
  const username = escapeMarkdown(driver.username || `TMP ${driver.tmpId}`);
  const link = `[${username}](${profileUrl(driver.tmpId)})`;

  if (type === 'Restored') {
    return `• ${link} — activity detected again`;
  }

  const days = Number.isFinite(driver.inactiveDays) ? `${driver.inactiveDays} days` : 'threshold reached';
  return `• ${link} — ${days}`;
}

function buildAlertMessage(type, drivers) {
  return [
    alertTitle(type),
    '',
    alertDescription(type),
    '',
    ...drivers.map((driver) => driverLine(driver, type)),
    '',
    '🛡️ **Advisory only:** Kings Systems does not remove, kick, ban, discipline, or change roles. Any action must be decided and carried out by Kings Leadership / HR.'
  ].join('\n');
}

function chunks(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

async function postAlertsForType(channel, state, type, drivers) {
  let sent = 0;

  for (const group of chunks(drivers, 8)) {
    const content = buildAlertMessage(type, group);

    try {
      await discord(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: {
          content,
          allowed_mentions: { parse: [] }
        }
      });

      const now = new Date().toISOString();
      for (const driver of group) {
        driver.lastActivityAlertLevel = type === 'Restored' ? 'Active' : type;
        driver.lastActivityAlertAt = now;
      }
      writeState(state);
      sent += group.length;
      console.log(`Driver status alert sent: ${type} (${group.length} Driver${group.length === 1 ? '' : 's'}).`);
    } catch (error) {
      console.warn(`Driver status alert failed for ${type}: ${error.message}`);
      // Do not mark failed alerts as sent. They will be retried on the next run.
    }
  }

  return sent;
}

async function main() {
  if (!DISCORD_BOT_TOKEN) {
    console.log('Driver status alerts skipped: DISCORD_BOT_TOKEN not configured.');
    return;
  }

  const container = readJson(STATE_FILE);
  const state = decryptState(container);
  const drivers = Array.isArray(state?.drivers) ? state.drivers : [];

  let stateReset = false;
  const pending = {
    Info: [],
    Attention: [],
    'HR Review': [],
    Restored: []
  };

  for (const driver of drivers) {
    const type = pendingType(driver);
    if (type === 'state-reset') {
      stateReset = true;
      continue;
    }
    if (type && pending[type]) pending[type].push(driver);
  }

  if (stateReset) writeState(state);

  const totalPending = Object.values(pending).reduce((sum, list) => sum + list.length, 0);
  if (!totalPending) {
    console.log('Driver status alerts: no new alerts this run.');
    return;
  }

  const channel = await resolveLeadershipChannel();
  let totalSent = 0;

  for (const type of ['Info', 'Attention', 'HR Review', 'Restored']) {
    if (!pending[type].length) continue;
    totalSent += await postAlertsForType(channel, state, type, pending[type]);
  }

  console.log(`Driver status alerts completed: ${totalSent}/${totalPending} sent.`);
}

main().catch((error) => {
  // Advisory alerts must never block Driver Management data collection.
  // Failed alerts remain unmarked and will be retried automatically.
  console.warn('Kings Driver Status Alerts failed:', error.message);
  process.exitCode = 0;
});
