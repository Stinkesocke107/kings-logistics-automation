const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const LEADERSHIP_CHANNEL_ID = process.env.DRIVER_LEADERSHIP_CHANNEL_ID || null;
const LEADERSHIP_CHANNEL_NAME = process.env.DRIVER_LEADERSHIP_CHANNEL_NAME || '🚛｜driver-leadership';
const PREVIEW_MODE = String(process.env.DRIVER_WEEKLY_SUMMARY_PREVIEW || '').toLowerCase() === 'true';

const MANAGEMENT_FILE = path.join(__dirname, 'data', 'driver-management.json');
const LOA_FILE = path.join(__dirname, 'data', 'driver-loa.json');
const SUMMARY_STATE_FILE = path.join(__dirname, 'data', 'driver-weekly-summary-state.json');

const DISCORD_API = 'https://discord.com/api/v10';
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_LEVELS = new Set(['Info', 'Attention', 'HR Review']);

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

function readManagementState() {
  const container = readJson(MANAGEMENT_FILE, null);
  if (!container) throw new Error('Driver Management state is missing.');
  return decrypt(container, 'kings-driver-management-v1');
}

function readLoaState() {
  const container = readJson(LOA_FILE, null);
  if (!container) return { version: 1, leaves: [] };
  return decrypt(container, 'kings-driver-loa-v1');
}

function loadSummaryState() {
  const state = readJson(SUMMARY_STATE_FILE, null);
  if (!state || !Array.isArray(state.publishedWeeks)) {
    return {
      version: 1,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      publishedWeeks: []
    };
  }
  return state;
}

function saveSummaryState(state) {
  state.updatedAt = nowISO();
  if (state.publishedWeeks.length > 104) {
    state.publishedWeeks = state.publishedWeeks.slice(-104);
  }
  writeJson(SUMMARY_STATE_FILE, state);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function getPreviousCompletedWeek() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(today.getTime() - daysSinceMonday * DAY_MS);
  const start = new Date(currentWeekStart.getTime() - 7 * DAY_MS);
  const end = currentWeekStart;
  const endDisplay = new Date(end.getTime() - 1);

  return {
    start,
    end,
    key: start.toISOString().slice(0, 10),
    label: `${formatDate(start)} – ${formatDate(endDisplay)}`
  };
}

function getPreviewPeriod() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * DAY_MS);
  return {
    start,
    end,
    key: 'preview',
    label: 'Preview • Last 7 Days'
  };
}

function dateIsInPeriod(value, period) {
  const date = normalizeDate(value);
  if (!date) return false;
  return date.getTime() >= period.start.getTime() && date.getTime() < period.end.getTime();
}

function effectiveLeaveEnd(leave) {
  const planned = normalizeDate(leave.endAt)?.getTime();
  const closed = normalizeDate(leave.closedAt)?.getTime();
  if (!Number.isFinite(planned)) return null;
  if (Number.isFinite(closed)) return Math.min(planned, closed);
  return planned;
}

function leaveStatus(leave, now = Date.now()) {
  const start = normalizeDate(leave.startAt)?.getTime();
  const end = effectiveLeaveEnd(leave);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
  if (leave.closedAt && end <= now) return 'ended';
  if (now < start) return 'scheduled';
  if (now <= end) return 'active';
  return 'ended';
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function driverLink(driver) {
  const name = escapeMarkdown(driver.username || `TMP ${driver.tmpId}`);
  return `[${name}](${profileUrl(driver.tmpId)})`;
}

function compactList(drivers, limit = 3) {
  if (!drivers.length) return 'None ✅';
  const shown = drivers.slice(0, limit).map(driverLink);
  if (drivers.length > limit) shown.push(`+${drivers.length - limit} more`);
  return shown.join(', ');
}

function compactLoaList(leaves, limit = 3) {
  if (!leaves.length) return 'None ✅';
  const shown = leaves.slice(0, limit).map((leave) => {
    const name = escapeMarkdown(leave.username || `TMP ${leave.tmpId}`);
    const end = normalizeDate(leave.endAt);
    const endText = end ? end.toISOString().slice(0, 10) : 'unknown';
    return `[${name}](${profileUrl(leave.tmpId)}) → ${endText}`;
  });
  if (leaves.length > limit) shown.push(`+${leaves.length - limit} more`);
  return shown.join(', ');
}

function buildWeeklyData(managementState, loaState, period) {
  const drivers = Array.isArray(managementState.drivers) ? managementState.drivers : [];
  const current = drivers.filter((driver) => driver.current);

  const joined = drivers
    .filter((driver) => dateIsInPeriod(driver.joinDate || driver.firstObservedAt, period))
    .sort((a, b) => new Date(b.joinDate || b.firstObservedAt) - new Date(a.joinDate || a.firstObservedAt));

  const left = drivers
    .filter((driver) => dateIsInPeriod(driver.leftAt, period))
    .sort((a, b) => new Date(b.leftAt) - new Date(a.leftAt));

  const info = current.filter((driver) => driver.activityLevel === 'Info');
  const attention = current.filter((driver) => driver.activityLevel === 'Attention');
  const hrReview = current.filter((driver) => driver.activityLevel === 'HR Review');
  const approvedLeaveDrivers = current.filter((driver) => driver.activityLevel === 'Approved Leave');

  const restored = current
    .filter((driver) => driver.lastActivityAlertLevel === 'Active' && dateIsInPeriod(driver.lastActivityAlertAt, period))
    .sort((a, b) => new Date(b.lastActivityAlertAt) - new Date(a.lastActivityAlertAt));

  const now = Date.now();
  const leaves = Array.isArray(loaState.leaves) ? loaState.leaves : [];
  const activeLoa = leaves
    .filter((leave) => leaveStatus(leave, now) === 'active')
    .sort((a, b) => new Date(a.endAt) - new Date(b.endAt));
  const scheduledLoa = leaves
    .filter((leave) => leaveStatus(leave, now) === 'scheduled')
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

  const initializedAt = normalizeDate(managementState.initializedAt);
  const completeCoverage = Boolean(initializedAt && initializedAt.getTime() <= period.start.getTime());

  return {
    currentDrivers: current.length,
    joined,
    left,
    netGrowth: joined.length - left.length,
    info,
    attention,
    hrReview,
    approvedLeaveDrivers,
    restored,
    activeLoa,
    scheduledLoa,
    openReviews: info.length + attention.length + hrReview.length,
    completeCoverage,
    initializedAt
  };
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function buildMessage(period, data) {
  const coverageLine = data.completeCoverage
    ? '✅ Full tracking coverage for this reporting period.'
    : data.initializedAt
      ? `⚠️ Partial tracking coverage: Driver Management started <t:${Math.floor(data.initializedAt.getTime() / 1000)}:f>. Earlier activity in this period may be unavailable.`
      : '⚠️ Tracking coverage start is unknown.';

  const title = PREVIEW_MODE
    ? '🧪 **Kings Driver Leadership Weekly Summary — TEST**'
    : '👑 **Kings Driver Leadership Weekly Summary**';

  return [
    title,
    `**Period:** ${period.label}`,
    coverageLine,
    '',
    '### 🚛 Driver Overview',
    `Current Drivers: **${data.currentDrivers}**`,
    `Joined: **${data.joined.length}** | Left: **${data.left.length}** | Net: **${formatSigned(data.netGrowth)}**`,
    `Activity Restored: **${data.restored.length}**`,
    '',
    '### 🏖️ Approved Leave',
    `Active LOAs: **${data.activeLoa.length}** | Scheduled: **${data.scheduledLoa.length}**`,
    `Active: ${compactLoaList(data.activeLoa)}`,
    '',
    '### 📊 Activity Review',
    `ℹ️ 7d Info: **${data.info.length}** — ${compactList(data.info)}`,
    `⚠️ 14d Attention: **${data.attention.length}** — ${compactList(data.attention)}`,
    `👥 30d HR Review: **${data.hrReview.length}** — ${compactList(data.hrReview)}`,
    `Open review signals: **${data.openReviews}**`,
    '',
    '### 🔄 This Week',
    `New Drivers: ${compactList(data.joined)}`,
    `Left Kings: ${compactList(data.left)}`,
    `Activity Restored: ${compactList(data.restored)}`,
    '',
    '🛡️ **Advisory only:** Kings Systems provides information only. No member removal, kick, ban, role change, disciplinary action, or HR decision is performed automatically.'
  ].join('\n');
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD: this weekly summary may only read Discord and POST
  // advisory messages. It cannot alter members, roles, kicks, bans or permissions.
  if (method !== 'GET') {
    const allowedWrite = /^\/channels\/\d+\/messages$/.test(pathname) && method === 'POST';
    if (!allowedWrite) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Driver Weekly Summary/1.0'
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

async function main() {
  const managementState = readManagementState();
  const loaState = readLoaState();
  const summaryState = loadSummaryState();
  const period = PREVIEW_MODE ? getPreviewPeriod() : getPreviousCompletedWeek();

  if (!PREVIEW_MODE) {
    const alreadyPublished = summaryState.publishedWeeks.some((item) => item.key === period.key);
    if (alreadyPublished) {
      console.log(`Driver Weekly Summary ${period.key} was already published.`);
      return;
    }
  }

  const data = buildWeeklyData(managementState, loaState, period);
  const content = buildMessage(period, data);

  if (content.length > 1950) {
    throw new Error(`Weekly Summary is too long for Discord (${content.length} characters).`);
  }

  const channel = await resolveLeadershipChannel();
  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: { parse: [] }
    }
  });

  if (PREVIEW_MODE) {
    console.log(`TEST Driver Weekly Summary sent to #${channel.name}.`);
    return;
  }

  summaryState.publishedWeeks.push({
    key: period.key,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    publishedAt: nowISO(),
    completeCoverage: data.completeCoverage,
    currentDrivers: data.currentDrivers,
    joined: data.joined.length,
    left: data.left.length,
    netGrowth: data.netGrowth,
    activeLoa: data.activeLoa.length,
    scheduledLoa: data.scheduledLoa.length,
    info: data.info.length,
    attention: data.attention.length,
    hrReview: data.hrReview.length,
    restored: data.restored.length,
    openReviews: data.openReviews
  });
  saveSummaryState(summaryState);

  console.log(`Driver Weekly Summary ${period.key} published to #${channel.name}.`);
}

main().catch((error) => {
  console.error('Kings Driver Weekly Summary failed:', error.message);
  process.exit(1);
});
