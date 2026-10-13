require('./kings-branding').installDiscordBranding();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { syncTextMessage } = require('./leadership-message-sync');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const HR_CHANNEL_ID = process.env.HR_LEADERSHIP_CHANNEL_ID || null;
const HR_CHANNEL_NAME = process.env.HR_LEADERSHIP_CHANNEL_NAME || 'hr-leadership';
const REPORT_MODE = String(process.env.HR_LEADERSHIP_REPORT_MODE || 'daily').trim().toLowerCase();
const PREVIEW = /^(?:1|true|yes|on)$/i.test(process.env.HR_LEADERSHIP_REPORT_PREVIEW || '');

const DRIVER_FILE = path.join(__dirname, 'data', 'driver-management.json');
const HR_PROBATION_FILE = path.join(__dirname, 'data', 'hr-probation.json');
const LOA_FILE = path.join(__dirname, 'data', 'driver-loa.json');
const STATE_FILE = path.join(__dirname, 'data', 'hr-leadership-report-state.json');

const DAY_MS = 86400000;
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
  } catch (error) {
    throw new Error(`Invalid state ${path.basename(file)}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
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

  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8'));
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

function inWindow(value, start, end) {
  const date = normalizeDate(value);
  if (!date) return false;
  const time = date.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function ageDays(value, now = Date.now()) {
  const date = normalizeDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now - date.getTime()) / DAY_MS));
}

function leaveStatus(leave, now = Date.now()) {
  const start = normalizeDate(leave?.startAt)?.getTime();
  const plannedEnd = normalizeDate(leave?.endAt)?.getTime();
  const closed = normalizeDate(leave?.closedAt)?.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(plannedEnd)) return 'invalid';
  const end = Number.isFinite(closed) ? Math.min(plannedEnd, closed) : plannedEnd;
  if (now < start) return 'scheduled';
  if (now <= end) return 'active';
  return 'ended';
}

function effectiveReviewStatus(review, now = Date.now()) {
  if (review?.status === 'completed') return 'completed';
  if (review?.status === 'extended') {
    const due = normalizeDate(review.dueAt)?.getTime();
    if (Number.isFinite(due) && due > now) return 'extended';
    return 'open';
  }
  return 'open';
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function link(item) {
  return `[${escapeMarkdown(item?.username || `TMP ${item?.tmpId}`)}](${profileUrl(item?.tmpId)})`;
}

function compact(items, formatter = link, limit = 4) {
  if (!items.length) return 'None';
  const shown = items.slice(0, limit).map(formatter);
  if (items.length > limit) shown.push(`+${items.length - limit} more`);
  return shown.join(', ');
}

function stateDefault() {
  return {
    version: 1,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    publishedDailyKeys: [],
    publishedMonthlyKeys: [],
    monthlyReports: []
  };
}

function readReportState() {
  const state = readJson(STATE_FILE, null);
  if (!state) return stateDefault();
  return {
    ...stateDefault(),
    ...state,
    publishedDailyKeys: Array.isArray(state.publishedDailyKeys) ? state.publishedDailyKeys : [],
    publishedMonthlyKeys: Array.isArray(state.publishedMonthlyKeys) ? state.publishedMonthlyKeys : [],
    monthlyReports: Array.isArray(state.monthlyReports) ? state.monthlyReports : []
  };
}

function saveReportState(state) {
  state.updatedAt = nowISO();
  state.publishedDailyKeys = state.publishedDailyKeys.slice(-60);
  state.publishedMonthlyKeys = state.publishedMonthlyKeys.slice(-36);
  state.monthlyReports = state.monthlyReports.slice(-24);
  writeJson(STATE_FILE, state);
}

function currentSnapshot(driverState, hrState, loaState, now = Date.now()) {
  const drivers = Array.isArray(driverState?.drivers) ? driverState.drivers : [];
  const current = drivers.filter((driver) => driver.current);
  const reviews = Array.isArray(hrState?.reviews) ? hrState.reviews : [];
  const leaves = Array.isArray(loaState?.leaves) ? loaState.leaves : [];

  const probation = current.filter((driver) => {
    const age = ageDays(driver.joinDate || driver.firstObservedAt, now);
    return age !== null && age < 7;
  });

  const openProbation = reviews.filter((review) => effectiveReviewStatus(review, now) === 'open');
  const extendedProbation = reviews.filter((review) => effectiveReviewStatus(review, now) === 'extended');
  const hrReviews = current.filter((driver) => driver.activityLevel === 'HR Review');
  const activeLoa = leaves.filter((leave) => leaveStatus(leave, now) === 'active');
  const scheduledLoa = leaves.filter((leave) => leaveStatus(leave, now) === 'scheduled');

  return {
    current,
    probation,
    openProbation,
    extendedProbation,
    hrReviews,
    activeLoa,
    scheduledLoa
  };
}

function buildDailyData(driverState, hrState, loaState, end = new Date()) {
  const start = new Date(end.getTime() - DAY_MS);
  const drivers = Array.isArray(driverState?.drivers) ? driverState.drivers : [];
  const reviews = Array.isArray(hrState?.reviews) ? hrState.reviews : [];
  const leaves = Array.isArray(loaState?.leaves) ? loaState.leaves : [];

  const joined = drivers.filter((driver) => inWindow(driver.joinDate || driver.firstObservedAt, start, end));
  const left = drivers.filter((driver) => inWindow(driver.leftAt, start, end));

  const probationOpened = reviews.filter((review) => inWindow(review.openedAt, start, end));
  const probationCompleted = reviews.filter((review) => inWindow(review.completedAt, start, end));
  const probationStatusChanged = reviews.filter((review) =>
    inWindow(review.updatedAt, start, end) &&
    !inWindow(review.openedAt, start, end) &&
    !inWindow(review.completedAt, start, end)
  );

  const hrReviewStarted = drivers.filter((driver) =>
    driver.current &&
    driver.activityLevel === 'HR Review' &&
    inWindow(driver.activityLevelSince, start, end)
  );

  const restored = drivers.filter((driver) =>
    driver.current &&
    driver.lastActivityAlertLevel === 'Active' &&
    inWindow(driver.lastActivityAlertAt, start, end)
  );

  const loaApproved = leaves.filter((leave) => inWindow(leave.createdAt, start, end));
  const loaEnded = leaves.filter((leave) => {
    if (inWindow(leave.closedAt, start, end)) return true;
    return !leave.closedAt && inWindow(leave.endAt, start, end) && normalizeDate(leave.endAt).getTime() <= end.getTime();
  });

  const snapshot = currentSnapshot(driverState, hrState, loaState, end.getTime());

  return {
    start,
    end,
    joined,
    left,
    probationOpened,
    probationCompleted,
    probationStatusChanged,
    hrReviewStarted,
    restored,
    loaApproved,
    loaEnded,
    snapshot,
    changed:
      joined.length +
      left.length +
      probationOpened.length +
      probationCompleted.length +
      probationStatusChanged.length +
      hrReviewStarted.length +
      restored.length +
      loaApproved.length +
      loaEnded.length
  };
}

function reviewLabel(review) {
  const status = effectiveReviewStatus(review);
  if (status === 'extended') return `${link(review)} → extended`;
  if (status === 'completed') return `${link(review)} → completed`;
  return `${link(review)} → open`;
}

function buildDailyMessage(data) {
  const timestamp = Math.floor(data.end.getTime() / 1000);
  const s = data.snapshot;

  return [
    '🟢 **Kings HR Leadership — Daily Changes**',
    `**Window:** last 24 hours · ending <t:${timestamp}:f>`,
    '',
    '### 👥 Membership',
    `Joined: **${data.joined.length}** — ${compact(data.joined)}`,
    `Left: **${data.left.length}** — ${compact(data.left)}`,
    '',
    '### 📋 Probation',
    `Opened: **${data.probationOpened.length}** — ${compact(data.probationOpened, reviewLabel)}`,
    `Completed: **${data.probationCompleted.length}** — ${compact(data.probationCompleted, reviewLabel)}`,
    `Other status changes: **${data.probationStatusChanged.length}** — ${compact(data.probationStatusChanged, reviewLabel)}`,
    '',
    '### 🏖️ Leave & Activity',
    `LOA approved: **${data.loaApproved.length}** — ${compact(data.loaApproved)}`,
    `LOA ended: **${data.loaEnded.length}** — ${compact(data.loaEnded)}`,
    `New 30d HR reviews: **${data.hrReviewStarted.length}** — ${compact(data.hrReviewStarted)}`,
    `Activity restored: **${data.restored.length}** — ${compact(data.restored)}`,
    '',
    '### 📊 Current HR Snapshot',
    `Drivers: **${s.current.length}** · In Probation: **${s.probation.length}** · Open/Extended: **${s.openProbation.length}/${s.extendedProbation.length}**`,
    `30d HR Reviews: **${s.hrReviews.length}** · Active/Scheduled LOA: **${s.activeLoa.length}/${s.scheduledLoa.length}**`,
    '',
    '🛡️ **Advisory only:** Kings Systems records and summarizes HR signals only. Human HR/Leadership makes every personnel decision.'
  ].join('\n');
}

function previousCompletedMonth(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  return {
    start,
    end,
    key: start.toISOString().slice(0, 7),
    label: new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(start)
  };
}

function buildMonthlyData(driverState, hrState, loaState, period, now = new Date()) {
  const drivers = Array.isArray(driverState?.drivers) ? driverState.drivers : [];
  const reviews = Array.isArray(hrState?.reviews) ? hrState.reviews : [];
  const leaves = Array.isArray(loaState?.leaves) ? loaState.leaves : [];

  const joined = drivers.filter((driver) => inWindow(driver.joinDate || driver.firstObservedAt, period.start, period.end));
  const left = drivers.filter((driver) => inWindow(driver.leftAt, period.start, period.end));
  const probationOpened = reviews.filter((review) => inWindow(review.openedAt, period.start, period.end));
  const probationCompleted = reviews.filter((review) => inWindow(review.completedAt, period.start, period.end));
  const probationTouched = reviews.filter((review) => inWindow(review.updatedAt, period.start, period.end));
  const loaApproved = leaves.filter((leave) => inWindow(leave.createdAt, period.start, period.end));
  const hrReviewStarted = drivers.filter((driver) =>
    driver.activityLevel === 'HR Review' &&
    inWindow(driver.activityLevelSince, period.start, period.end)
  );
  const restored = drivers.filter((driver) =>
    driver.lastActivityAlertLevel === 'Active' &&
    inWindow(driver.lastActivityAlertAt, period.start, period.end)
  );

  const snapshot = currentSnapshot(driverState, hrState, loaState, now.getTime());
  const currentCount = snapshot.current.length;

  const afterEndJoined = drivers.filter((driver) =>
    inWindow(driver.joinDate || driver.firstObservedAt, period.end, now)
  ).length;
  const afterEndLeft = drivers.filter((driver) => inWindow(driver.leftAt, period.end, now)).length;

  const endDrivers = Math.max(0, currentCount - afterEndJoined + afterEndLeft);
  const startDrivers = Math.max(0, endDrivers - joined.length + left.length);
  const netGrowth = joined.length - left.length;
  const retention = startDrivers > 0
    ? Math.max(0, Math.min(100, ((startDrivers - left.length) / startDrivers) * 100))
    : null;

  const initializedAt = normalizeDate(driverState?.initializedAt);
  const completeCoverage = Boolean(initializedAt && initializedAt.getTime() <= period.start.getTime());

  return {
    period,
    startDrivers,
    endDrivers,
    joined,
    left,
    netGrowth,
    retention,
    probationOpened,
    probationCompleted,
    probationTouched,
    loaApproved,
    hrReviewStarted,
    restored,
    snapshot,
    completeCoverage,
    initializedAt
  };
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function delta(value, previous) {
  if (!Number.isFinite(Number(previous))) return 'n/a';
  return signed(value - Number(previous));
}

function buildMonthlyMessage(data, previous = null) {
  const s = data.snapshot;
  const retention = data.retention === null ? 'n/a' : `${data.retention.toFixed(1)}%`;
  const coverage = data.completeCoverage
    ? '✅ Full HR tracking coverage for the month.'
    : data.initializedAt
      ? `⚠️ Partial coverage: tracking started <t:${Math.floor(data.initializedAt.getTime() / 1000)}:D>.`
      : '⚠️ Tracking coverage start is unknown.';

  const comparison = previous
    ? [
        '',
        '### 📈 Compared with Previous Report',
        `End Drivers: **${delta(data.endDrivers, previous.endDrivers)}** · Open Probation: **${delta(s.openProbation.length, previous.openProbation)}** · HR Reviews: **${delta(s.hrReviews.length, previous.hrReviews)}**`
      ]
    : [];

  return [
    '👑 **Kings HR Leadership — Monthly Report**',
    `**Month:** ${data.period.label}`,
    coverage,
    '',
    '### 👥 Driver & Retention',
    `Start: **${data.startDrivers}** · End: **${data.endDrivers}** · Net: **${signed(data.netGrowth)}**`,
    `Joined: **${data.joined.length}** · Left: **${data.left.length}** · Retention: **${retention}**`,
    '',
    '### 📋 Probation',
    `Reviews opened: **${data.probationOpened.length}** · Completed: **${data.probationCompleted.length}** · Updated: **${data.probationTouched.length}**`,
    `Current Open: **${s.openProbation.length}** · Extended: **${s.extendedProbation.length}** · Drivers in first 7 days: **${s.probation.length}**`,
    '',
    '### 🏖️ Leave & HR Review',
    `LOAs approved: **${data.loaApproved.length}** · Activity restored: **${data.restored.length}**`,
    `New 30d HR reviews: **${data.hrReviewStarted.length}** · Current 30d HR reviews: **${s.hrReviews.length}**`,
    `Active/Scheduled LOA now: **${s.activeLoa.length}/${s.scheduledLoa.length}**`,
    ...comparison,
    '',
    '🛡️ **Advisory only:** This report supports human HR review. It never performs personnel, role, kick, ban, or disciplinary actions.'
  ].join('\n');
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    const allowed = /^\/channels\/\d+\/messages$/.test(pathname) && method === 'POST';
    if (!allowed) throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics HR Leadership Reports/1.0'
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
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-');
}

async function resolveChannel() {
  if (HR_CHANNEL_ID) {
    const channel = await discord(`/channels/${HR_CHANNEL_ID}`);
    if (channel.guild_id && String(channel.guild_id) !== String(DISCORD_GUILD_ID)) {
      throw new Error('Configured HR Leadership channel is not in the configured guild.');
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const text = (channels || []).filter((channel) => [0, 5].includes(Number(channel.type)));
  const wanted = normalizeChannelName(HR_CHANNEL_NAME).replace(/^-+|-+$/g, '');
  const exact = text.find((channel) =>
    normalizeChannelName(channel.name).replace(/^-+|-+$/g, '') === wanted
  );
  if (exact) return exact;

  const fuzzy = text.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('hr') && name.includes('leadership');
  });
  if (fuzzy.length === 1) return fuzzy[0];
  throw new Error(`Could not uniquely find HR Leadership channel "${HR_CHANNEL_NAME}".`);
}

async function post(channel, content) {
  if (content.length > 1950) {
    throw new Error(`HR Leadership report exceeds safe Discord length: ${content.length}`);
  }

  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: {
      content,
      flags: 4,
      allowed_mentions: { parse: [] }
    }
  });
}

async function runDaily(driverState, hrState, loaState, reportState) {
  const end = new Date();
  const key = end.toISOString().slice(0, 10);
  const data = buildDailyData(driverState, hrState, loaState, end);
  const channel = await resolveChannel();
  const content = buildDailyMessage(data);

  if (PREVIEW) {
    console.log(`PREVIEW HR Daily Changes for #${channel.name}:\n${content}`);
    return;
  }

  const result = await syncTextMessage({
    token: DISCORD_BOT_TOKEN,
    channelId: channel.id,
    marker: '🟢 **Kings HR Leadership — Daily Changes**',
    content,
    userAgent: 'Kings Logistics HR Leadership Reports/2.0'
  });

  if (!reportState.publishedDailyKeys.includes(key)) reportState.publishedDailyKeys.push(key);
  saveReportState(reportState);
  console.log(`HR Daily dashboard ${result.action} in #${channel.name}; changes in last 24h: ${data.changed}.`);
}

async function runMonthly(driverState, hrState, loaState, reportState) {
  const period = previousCompletedMonth();
  const data = buildMonthlyData(driverState, hrState, loaState, period);
  const previous = reportState.monthlyReports.filter((item) => item.key !== period.key).at(-1) || null;
  const content = buildMonthlyMessage(data, previous);
  const channel = await resolveChannel();

  if (PREVIEW) {
    console.log(`PREVIEW HR Monthly Report for #${channel.name}:\n${content}`);
    return;
  }

  const result = await syncTextMessage({
    token: DISCORD_BOT_TOKEN,
    channelId: channel.id,
    marker: '👑 **Kings HR Leadership — Monthly Report**',
    content,
    userAgent: 'Kings Logistics HR Leadership Reports/2.0'
  });

  const record = {
    key: period.key,
    publishedAt: nowISO(),
    completeCoverage: data.completeCoverage,
    startDrivers: data.startDrivers,
    endDrivers: data.endDrivers,
    joined: data.joined.length,
    left: data.left.length,
    netGrowth: data.netGrowth,
    retention: data.retention,
    probationOpened: data.probationOpened.length,
    probationCompleted: data.probationCompleted.length,
    openProbation: data.snapshot.openProbation.length,
    extendedProbation: data.snapshot.extendedProbation.length,
    hrReviews: data.snapshot.hrReviews.length,
    activeLoa: data.snapshot.activeLoa.length
  };

  const index = reportState.monthlyReports.findIndex((item) => item.key === period.key);
  if (index >= 0) reportState.monthlyReports[index] = record;
  else reportState.monthlyReports.push(record);
  if (!reportState.publishedMonthlyKeys.includes(period.key)) reportState.publishedMonthlyKeys.push(period.key);
  saveReportState(reportState);

  console.log(`HR Monthly dashboard ${result.action} for ${period.key} in #${channel.name}.`);
}
async function main() {
  const driverState = loadEncrypted(DRIVER_FILE, 'kings-driver-management-v1', null);
  if (!driverState) throw new Error('Driver Management state is missing.');

  const hrState = loadEncrypted(HR_PROBATION_FILE, 'kings-hr-probation-v1', { reviews: [] });
  const loaState = loadEncrypted(LOA_FILE, 'kings-driver-loa-v1', { leaves: [] });
  const reportState = readReportState();

  if (REPORT_MODE === 'daily') {
    await runDaily(driverState, hrState, loaState, reportState);
    return;
  }
  if (REPORT_MODE === 'monthly') {
    await runMonthly(driverState, hrState, loaState, reportState);
    return;
  }

  throw new Error(`Unsupported HR_LEADERSHIP_REPORT_MODE: ${REPORT_MODE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Kings HR Leadership Reports failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  buildDailyData,
  buildDailyMessage,
  previousCompletedMonth,
  buildMonthlyData,
  buildMonthlyMessage,
  currentSnapshot,
  effectiveReviewStatus,
  leaveStatus
};
