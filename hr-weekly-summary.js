const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const HR_LEADERSHIP_CHANNEL_ID = process.env.HR_LEADERSHIP_CHANNEL_ID || null;
const HR_LEADERSHIP_CHANNEL_NAME = process.env.HR_LEADERSHIP_CHANNEL_NAME || 'hr-leadership';
const PREVIEW_MODE = String(process.env.HR_WEEKLY_SUMMARY_PREVIEW || '').toLowerCase() === 'true';

const DRIVER_STATE_FILE = path.join(__dirname, 'data', 'driver-management.json');
const HR_PROBATION_FILE = path.join(__dirname, 'data', 'hr-probation.json');
const LOA_FILE = path.join(__dirname, 'data', 'driver-loa.json');
const SUMMARY_STATE_FILE = path.join(__dirname, 'data', 'hr-weekly-summary-state.json');

const DISCORD_API = 'https://discord.com/api/v10';
const DAY_MS = 24 * 60 * 60 * 1000;

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

function loadEncrypted(file, domain, fallback) {
  const container = readJson(file, null);
  if (!container) return fallback;
  return decrypt(container, domain);
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

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
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
  return Boolean(
    date &&
    date.getTime() >= period.start.getTime() &&
    date.getTime() < period.end.getTime()
  );
}

function loadSummaryState() {
  const state = readJson(SUMMARY_STATE_FILE, null);
  if (state && Array.isArray(state.publishedWeeks)) return state;

  return {
    version: 2,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    publishedWeeks: []
  };
}

function saveSummaryState(state) {
  state.version = 2;
  state.updatedAt = nowISO();
  if (state.publishedWeeks.length > 104) {
    state.publishedWeeks = state.publishedWeeks.slice(-104);
  }
  writeJson(SUMMARY_STATE_FILE, state);
}

function ageDays(value, now = Date.now()) {
  const date = normalizeDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now - date.getTime()) / DAY_MS));
}

function effectiveReviewStatus(review, now = Date.now()) {
  if (review.status === 'completed') return 'completed';
  if (review.status === 'extended') {
    const due = normalizeDate(review.dueAt);
    if (due && due.getTime() > now) return 'extended';
    return 'open';
  }
  return 'open';
}

function effectiveLeaveEnd(leave) {
  const planned = normalizeDate(leave.endAt)?.getTime();
  const closed = normalizeDate(leave.closedAt)?.getTime();
  if (!Number.isFinite(planned)) return null;
  return Number.isFinite(closed) ? Math.min(planned, closed) : planned;
}

function leaveStatus(leave, now = Date.now()) {
  const start = normalizeDate(leave.startAt)?.getTime();
  const end = effectiveLeaveEnd(leave);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
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
  return `[${escapeMarkdown(driver.username || `TMP ${driver.tmpId}`)}](${profileUrl(driver.tmpId)})`;
}

function compactList(items, formatter, limit = 8) {
  if (!items.length) return 'None ✅';
  const lines = items.slice(0, limit).map(formatter);
  if (items.length > limit) lines.push(`• … and **${items.length - limit} more**`);
  return lines.join('\n');
}

function buildWeeklyData(driverState, hrProbationState, loaState, period) {
  const now = Date.now();
  const drivers = Array.isArray(driverState.drivers) ? driverState.drivers : [];
  const current = drivers.filter((driver) => driver.current);

  const joined = drivers.filter((driver) => dateIsInPeriod(driver.joinDate, period));
  const left = drivers.filter((driver) => dateIsInPeriod(driver.leftAt, period));
  const netGrowth = joined.length - left.length;

  const reviews = Array.isArray(hrProbationState?.reviews) ? hrProbationState.reviews : [];
  const probationOpened = reviews.filter((review) => dateIsInPeriod(review.openedAt, period));
  const probationCompleted = reviews.filter((review) => dateIsInPeriod(review.completedAt, period));
  const openProbation = reviews.filter((review) => effectiveReviewStatus(review, now) === 'open');
  const extendedProbation = reviews.filter((review) => effectiveReviewStatus(review, now) === 'extended');

  const currentById = new Map(current.map((driver) => [Number(driver.tmpId), driver]));
  const openProbationDrivers = openProbation
    .map((review) => ({ review, driver: currentById.get(Number(review.tmpId)) }))
    .filter((item) => item.driver);
  const extendedProbationDrivers = extendedProbation
    .map((review) => ({ review, driver: currentById.get(Number(review.tmpId)) }))
    .filter((item) => item.driver);

  const hrReviews = current
    .filter((driver) => driver.activityLevel === 'HR Review')
    .sort((a, b) => (b.inactiveDays || 0) - (a.inactiveDays || 0));

  const probationActive = current.filter((driver) => {
    const age = ageDays(driver.joinDate, now);
    return age !== null && age < 7;
  });

  const leaves = Array.isArray(loaState?.leaves) ? loaState.leaves : [];
  const activeLeaves = leaves.filter((leave) => leaveStatus(leave, now) === 'active');
  const scheduledLeaves = leaves.filter((leave) => leaveStatus(leave, now) === 'scheduled');

  const initializedAt = normalizeDate(driverState.initializedAt);
  const coverageComplete = Boolean(initializedAt && initializedAt.getTime() <= period.start.getTime());

  return {
    currentDrivers: current.length,
    joined,
    left,
    netGrowth,
    probationOpened,
    probationCompleted,
    openProbationDrivers,
    extendedProbationDrivers,
    hrReviews,
    probationActive,
    activeLeaves,
    scheduledLeaves,
    coverageComplete
  };
}

function buildMessage(period, data) {
  const heading = PREVIEW_MODE
    ? '👥 **Kings HR Weekly Summary • TEST**'
    : '👥 **Kings HR Weekly Summary**';

  const openText = compactList(
    data.openProbationDrivers,
    ({ driver }) => `• ${driverLink(driver)} — open probation review`
  );

  const extendedText = compactList(
    data.extendedProbationDrivers,
    ({ driver, review }) => `• ${driverLink(driver)} — extended until **${formatDate(normalizeDate(review.dueAt))}**`
  );

  const hrReviewText = compactList(
    data.hrReviews,
    (driver) => `• ${driverLink(driver)} — **${Number.isFinite(driver.inactiveDays) ? `${driver.inactiveDays}d inactive` : 'review required'}**`
  );

  const coverage = data.coverageComplete
    ? 'Complete tracking coverage ✅'
    : 'Partial tracking coverage ⚠️';

  return [
    heading,
    '',
    `**Period:** ${period.label}`,
    `**Data Coverage:** ${coverage}`,
    '',
    '## 📊 HR Snapshot',
    `**Current Drivers:** ${data.currentDrivers}`,
    `**Drivers currently in first 7 days:** ${data.probationActive.length}`,
    `**Open Probation Reviews:** ${data.openProbationDrivers.length}`,
    `**Extended Probation Reviews:** ${data.extendedProbationDrivers.length}`,
    `**30d HR Reviews:** ${data.hrReviews.length}`,
    `**Active / Scheduled LOA:** ${data.activeLeaves.length} / ${data.scheduledLeaves.length}`,
    '',
    '## 🔄 Weekly Movement',
    `**Joined:** ${data.joined.length}`,
    `**Left:** ${data.left.length}`,
    `**Net Growth:** ${formatSigned(data.netGrowth)}`,
    `**Probation Reviews Opened:** ${data.probationOpened.length}`,
    `**Probation Reviews Completed:** ${data.probationCompleted.length}`,
    '',
    '## 📋 Open Probation Reviews',
    openText,
    '',
    '## 🗓️ Extended Probation Reviews',
    extendedText,
    '',
    '## ⚠️ 30-Day Driver HR Reviews',
    hrReviewText,
    '',
    '🛡️ **Advisory only:** This report supports human HR review. Kings Systems does not remove, kick, ban, discipline, change roles, or make personnel decisions.'
  ].join('\n');
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD: the weekly HR report may only read Discord and post
  // its report message. No member, role, kick, ban, permission, or personnel
  // endpoint is permitted.
  if (method !== 'GET') {
    const allowedWrite = /^\/channels\/\d+\/messages$/.test(pathname) && method === 'POST';
    if (!allowedWrite) throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics HR Weekly Summary/2.0'
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

async function sendSummary(period, data) {
  const channel = await resolveHrChannel();
  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: {
      content: buildMessage(period, data),
      allowed_mentions: { parse: [] }
    }
  });
  console.log(`${PREVIEW_MODE ? 'TEST ' : ''}HR Weekly Summary sent to #${channel.name}.`);
}

async function createWeeklySummary() {
  const driverState = loadEncrypted(
    DRIVER_STATE_FILE,
    'kings-driver-management-v1',
    null
  );
  if (!driverState) throw new Error('Driver Management state is missing.');

  const hrProbationState = loadEncrypted(
    HR_PROBATION_FILE,
    'kings-hr-probation-v1',
    { reviews: [] }
  );

  const loaState = loadEncrypted(
    LOA_FILE,
    'kings-driver-loa-v1',
    { leaves: [] }
  );

  const summaryState = loadSummaryState();
  const period = PREVIEW_MODE ? getPreviewPeriod() : getPreviousCompletedWeek();

  if (!PREVIEW_MODE) {
    const alreadyPublished = summaryState.publishedWeeks.some((item) => item.key === period.key);
    if (alreadyPublished) {
      console.log(`HR Weekly Summary ${period.key} was already published.`);
      return;
    }
  }

  const data = buildWeeklyData(driverState, hrProbationState, loaState, period);

  // A production weekly report must never present partial tracking as a
  // complete historical week. Preview mode may show partial coverage clearly.
  if (!PREVIEW_MODE && !data.coverageComplete) {
    console.log('Driver Management does not cover the complete reporting week.');
    console.log('No production HR Weekly Summary will be posted yet.');
    return;
  }

  await sendSummary(period, data);

  if (PREVIEW_MODE) return;

  summaryState.publishedWeeks.push({
    key: period.key,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    publishedAt: nowISO(),
    currentDrivers: data.currentDrivers,
    joined: data.joined.length,
    left: data.left.length,
    netGrowth: data.netGrowth,
    probationOpened: data.probationOpened.length,
    probationCompleted: data.probationCompleted.length,
    openProbation: data.openProbationDrivers.length,
    extendedProbation: data.extendedProbationDrivers.length,
    hrReviews30d: data.hrReviews.length,
    activeLoa: data.activeLeaves.length,
    scheduledLoa: data.scheduledLeaves.length
  });
  saveSummaryState(summaryState);

  console.log('HR Weekly Summary published successfully.');
}

createWeeklySummary().catch((error) => {
  console.error('Kings HR Weekly Summary failed:', error.message);
  process.exit(1);
});
