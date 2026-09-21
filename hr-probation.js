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
const HR_PROBATION_FILE = path.join(__dirname, 'data', 'hr-probation.json');

const DISCORD_API = 'https://discord.com/api/v10';

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
    throw new Error('Encrypted state is not in the expected format.');
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

function encrypt(value, domain, version) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(domain), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version,
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function readDriverState() {
  const container = readJson(DRIVER_STATE_FILE, null);
  if (!container) throw new Error('Driver Management state is missing.');
  return decrypt(container, 'kings-driver-management-v1');
}

function readHrState() {
  const container = readJson(HR_PROBATION_FILE, null);
  if (!container) {
    const now = nowISO();
    return {
      version: 1,
      initializedAt: now,
      updatedAt: now,
      lastProcessedMessageId: null,
      reviews: []
    };
  }
  return decrypt(container, 'kings-hr-probation-v1');
}

function writeHrState(state) {
  state.updatedAt = nowISO();
  writeJson(HR_PROBATION_FILE, encrypt(state, 'kings-hr-probation-v1', 1));
}

function probationSecret() {
  return crypto
    .createHash('sha256')
    .update('kings-probation-state-v1\\0')
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function membershipKey(tmpId, joinedAt) {
  return crypto
    .createHmac('sha256', probationSecret())
    .update(`${tmpId}:${joinedAt}`)
    .digest('hex');
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

function endOfDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString().slice(0, 10);
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD: this module may read Discord and post command replies
  // only. It cannot modify members, roles, kicks, bans, permissions, or any
  // other personnel setting.
  if (method !== 'GET') {
    const allowedWrite = /^\/channels\/\d+\/messages$/.test(pathname) && method === 'POST';
    if (!allowedWrite) throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics HR Probation/1.0'
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
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-');
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
  if (fuzzy.length > 1) throw new Error(`Multiple HR Leadership channels found: ${fuzzy.map((c) => c.name).join(', ')}`);
  throw new Error(`Could not find HR Leadership channel "${HR_LEADERSHIP_CHANNEL_NAME}".`);
}

function snowflakeGreater(a, b) {
  try {
    return BigInt(a) > BigInt(b || '0');
  } catch {
    return false;
  }
}

function maxSnowflake(messages) {
  let max = null;
  for (const message of messages || []) {
    if (!max || snowflakeGreater(message.id, max)) max = message.id;
  }
  return max;
}

async function post(channelId, content) {
  await discord(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: { content, allowed_mentions: { parse: [] } }
  });
}

function syncReviews(driverState, probationState, hrState) {
  const current = (driverState.drivers || []).filter((driver) => driver.current && driver.joinDate);
  const notified = new Map((probationState?.notified || []).map((item) => [String(item.key || ''), item]));
  const byKey = new Map((hrState.reviews || []).map((review) => [String(review.key || ''), review]));
  let changed = false;

  for (const driver of current) {
    const key = membershipKey(driver.tmpId, driver.joinDate);
    const reminder = notified.get(key);
    if (!reminder?.notifiedAt) continue;

    if (!byKey.has(key)) {
      const review = {
        key,
        tmpId: driver.tmpId,
        username: driver.username,
        joinedAt: driver.joinDate,
        openedAt: reminder.notifiedAt,
        status: 'open',
        dueAt: null,
        completedAt: null,
        completedByDiscordUserId: null,
        updatedAt: nowISO(),
        updatedByDiscordUserId: null
      };
      hrState.reviews.push(review);
      byKey.set(key, review);
      changed = true;
    } else {
      const review = byKey.get(key);
      if (review.username !== driver.username) {
        review.username = driver.username;
        review.updatedAt = nowISO();
        changed = true;
      }
    }
  }

  return changed;
}

function currentDriverByTmpId(driverState, tmpId) {
  return (driverState.drivers || []).find((driver) =>
    driver.current && Number(driver.tmpId) === Number(tmpId)
  ) || null;
}

function reviewForDriver(hrState, driver) {
  if (!driver?.joinDate) return null;
  const key = membershipKey(driver.tmpId, driver.joinDate);
  return (hrState.reviews || []).find((review) => review.key === key) || null;
}

function helpText() {
  return [
    '👥 **HR Probation Commands**',
    '',
    '`!probation complete TMP-ID` — mark the current probation review as completed',
    '`!probation extend TMP-ID YYYY-MM-DD` — extend the review until a new date',
    '`!probation reopen TMP-ID` — reopen a completed/extended review',
    '`!probation list` — show open and extended probation reviews',
    '`!probation help` — show this help',
    '',
    '🛡️ These commands only manage internal review status. They do not change Discord roles, remove Drivers, or carry out personnel decisions.'
  ].join('\n');
}

async function handleComplete(channel, message, parts, driverState, hrState) {
  if (parts.length !== 3) return post(channel.id, '❌ Usage: `!probation complete TMP-ID`.');
  const tmpId = Number(parts[2]);
  const driver = currentDriverByTmpId(driverState, tmpId);
  if (!driver) return post(channel.id, `❌ TMP ID **${parts[2]}** is not a current Kings Driver.`);

  const review = reviewForDriver(hrState, driver);
  if (!review) return post(channel.id, `ℹ️ ${driverLink(driver)} has no tracked probation review to complete.`);

  review.status = 'completed';
  review.dueAt = null;
  review.completedAt = nowISO();
  review.completedByDiscordUserId = String(message.author?.id || '');
  review.updatedAt = nowISO();
  review.updatedByDiscordUserId = String(message.author?.id || '');

  await post(channel.id, `✅ **Probation Review Completed**\n${driverLink(driver)} — the internal review has been marked as completed.\nNo personnel action was performed by Kings Systems.`);
}

async function handleExtend(channel, message, parts, driverState, hrState) {
  if (parts.length !== 4) return post(channel.id, '❌ Usage: `!probation extend TMP-ID YYYY-MM-DD`.');
  const tmpId = Number(parts[2]);
  const driver = currentDriverByTmpId(driverState, tmpId);
  if (!driver) return post(channel.id, `❌ TMP ID **${parts[2]}** is not a current Kings Driver.`);

  const due = endOfDate(parts[3]);
  if (!due || due.getTime() <= Date.now()) return post(channel.id, '❌ Extension date must be a future date in `YYYY-MM-DD` format.');

  const review = reviewForDriver(hrState, driver);
  if (!review) return post(channel.id, `ℹ️ ${driverLink(driver)} has no tracked probation review to extend.`);

  review.status = 'extended';
  review.dueAt = due.toISOString();
  review.completedAt = null;
  review.completedByDiscordUserId = null;
  review.updatedAt = nowISO();
  review.updatedByDiscordUserId = String(message.author?.id || '');

  await post(channel.id, `🗓️ **Probation Review Extended**\n${driverLink(driver)} — internal review extended until **${formatDate(review.dueAt)}**.\nKings Systems only records the HR review status.`);
}

async function handleReopen(channel, message, parts, driverState, hrState) {
  if (parts.length !== 3) return post(channel.id, '❌ Usage: `!probation reopen TMP-ID`.');
  const tmpId = Number(parts[2]);
  const driver = currentDriverByTmpId(driverState, tmpId);
  if (!driver) return post(channel.id, `❌ TMP ID **${parts[2]}** is not a current Kings Driver.`);

  const review = reviewForDriver(hrState, driver);
  if (!review) return post(channel.id, `ℹ️ ${driverLink(driver)} has no tracked probation review to reopen.`);

  review.status = 'open';
  review.dueAt = null;
  review.completedAt = null;
  review.completedByDiscordUserId = null;
  review.updatedAt = nowISO();
  review.updatedByDiscordUserId = String(message.author?.id || '');

  await post(channel.id, `🔄 **Probation Review Reopened**\n${driverLink(driver)} — the internal review is open again.`);
}

async function handleList(channel, hrState) {
  const visible = (hrState.reviews || [])
    .filter((review) => review.status === 'open' || review.status === 'extended')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return new Date(a.dueAt || a.openedAt || 0) - new Date(b.dueAt || b.openedAt || 0);
    });

  if (!visible.length) return post(channel.id, '📋 **Probation Reviews**\nNo open or extended probation reviews.');

  const lines = visible.slice(0, 20).map((review) => {
    const link = `[${escapeMarkdown(review.username || `TMP ${review.tmpId}`)}](${profileUrl(review.tmpId)})`;
    if (review.status === 'extended') return `• ${link} — 🗓️ Extended until **${formatDate(review.dueAt)}**`;
    return `• ${link} — ⚠️ Open Review`;
  });
  if (visible.length > 20) lines.push(`• … and **${visible.length - 20} more**`);

  await post(channel.id, ['📋 **Probation Reviews**', '', ...lines].join('\n'));
}

async function processCommands(channel, driverState, hrState) {
  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const maxId = maxSnowflake(messages || []);

  if (!hrState.lastProcessedMessageId) {
    hrState.lastProcessedMessageId = maxId;
    writeHrState(hrState);
    console.log('HR probation command baseline initialized. Historical messages were not processed.');
    return 0;
  }

  const fresh = (messages || [])
    .filter((message) => snowflakeGreater(message.id, hrState.lastProcessedMessageId))
    .sort((a, b) => (snowflakeGreater(a.id, b.id) ? 1 : -1));

  let processed = 0;
  for (const message of fresh) {
    if (message.author?.bot || message.webhook_id) continue;
    const content = String(message.content || '').trim();
    if (!content.toLowerCase().startsWith('!probation')) continue;

    const parts = content.split(/\s+/);
    const action = String(parts[1] || 'help').toLowerCase();
    processed += 1;

    if (action === 'complete') await handleComplete(channel, message, parts, driverState, hrState);
    else if (action === 'extend') await handleExtend(channel, message, parts, driverState, hrState);
    else if (action === 'reopen') await handleReopen(channel, message, parts, driverState, hrState);
    else if (action === 'list') await handleList(channel, hrState);
    else await post(channel.id, helpText());
  }

  if (maxId && snowflakeGreater(maxId, hrState.lastProcessedMessageId)) {
    hrState.lastProcessedMessageId = maxId;
  }

  writeHrState(hrState);
  return processed;
}

async function main() {
  const driverState = readDriverState();
  const probationState = readJson(PROBATION_STATE_FILE, { notified: [] });
  const hrState = readHrState();

  const synced = syncReviews(driverState, probationState, hrState);
  if (synced) writeHrState(hrState);

  const channel = await resolveHrChannel();
  const processed = await processCommands(channel, driverState, hrState);

  const open = hrState.reviews.filter((review) => review.status === 'open').length;
  const extended = hrState.reviews.filter((review) => review.status === 'extended').length;
  const completed = hrState.reviews.filter((review) => review.status === 'completed').length;

  console.log(`Kings HR Probation updated successfully. Commands processed: ${processed}.`);
  console.log(`Reviews — Open: ${open}, Extended: ${extended}, Completed: ${completed}`);
  console.log('Safety: No automatic personnel actions are implemented.');
}

main().catch((error) => {
  console.error('Kings HR Probation failed:', error.message);
  process.exit(1);
});
