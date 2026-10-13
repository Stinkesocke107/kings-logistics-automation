require('./kings-branding').installDiscordBranding();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { syncTextMessage } = require('./leadership-message-sync');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const LEADERSHIP_CHANNEL_ID = process.env.DRIVER_LEADERSHIP_CHANNEL_ID || null;
const LEADERSHIP_CHANNEL_NAME = process.env.DRIVER_LEADERSHIP_CHANNEL_NAME || '🚛｜driver-leadership';
const REPORT_MODE = String(process.env.DRIVER_LEADERSHIP_REPORT_MODE || 'daily').trim().toLowerCase();
const PREVIEW = /^(?:1|true|yes|on)$/i.test(process.env.DRIVER_LEADERSHIP_REPORT_PREVIEW || '');

const MANAGEMENT_FILE = path.join(__dirname, 'data', 'driver-management.json');
const LOA_FILE = path.join(__dirname, 'data', 'driver-loa.json');
const REPORT_STATE_FILE = path.join(__dirname, 'data', 'driver-leadership-report-state.json');

const DISCORD_API = 'https://discord.com/api/v10';
const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_LEVELS = new Set(['Info', 'Attention', 'HR Review']);

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

function emptyReportState() {
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
  const state = readJson(REPORT_STATE_FILE, null);
  if (!state) return emptyReportState();

  return {
    ...emptyReportState(),
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
  writeJson(REPORT_STATE_FILE, state);
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

function formatDate(value) {
  const date = value instanceof Date ? value : normalizeDate(value);
  if (!date) return 'unknown';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
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

function compactDrivers(drivers, limit = 4) {
  if (!drivers.length) return 'None';
  const shown = drivers.slice(0, limit).map(driverLink);
  if (drivers.length > limit) shown.push(`+${drivers.length - limit} more`);
  return shown.join(', ');
}

function membershipDays(driver, now = Date.now()) {
  const source = driver?.joinDate || driver?.firstObservedAt;
  const time = normalizeDate(source)?.getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / DAY_MS));
}

function buildTenureSummary(drivers, now = Date.now()) {
  const buckets = {
    under1Month: 0,
    oneToThreeMonths: 0,
    threeToSixMonths: 0,
    sixToTwelveMonths: 0,
    oneToTwoYears: 0,
    twoToThreeYears: 0,
    threeYearsPlus: 0,
    unknown: 0
  };

  let totalDays = 0;
  let known = 0;

  for (const driver of drivers || []) {
    const days = membershipDays(driver, now);
    if (days === null) {
      buckets.unknown += 1;
      continue;
    }

    known += 1;
    totalDays += days;

    if (days < 30) buckets.under1Month += 1;
    else if (days < 90) buckets.oneToThreeMonths += 1;
    else if (days < 180) buckets.threeToSixMonths += 1;
    else if (days < 365) buckets.sixToTwelveMonths += 1;
    else if (days < 730) buckets.oneToTwoYears += 1;
    else if (days < 1095) buckets.twoToThreeYears += 1;
    else buckets.threeYearsPlus += 1;
  }

  return {
    ...buckets,
    known,
    averageDays: known ? Math.round(totalDays / known) : null
  };
}

function leaveStatus(leave, now = Date.now()) {
  const start = normalizeDate(leave?.startAt)?.getTime();
  const plannedEnd = normalizeDate(leave?.endAt)?.getTime();
  const closed = normalizeDate(leave?.closedAt)?.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(plannedEnd)) return 'invalid';

  const effectiveEnd = Number.isFinite(closed) ? Math.min(plannedEnd, closed) : plannedEnd;
  if (now < start) return 'scheduled';
  if (now <= effectiveEnd) return 'active';
  return 'ended';
}

function buildDailyData(managementState, loaState, end = new Date()) {
  const start = new Date(end.getTime() - DAY_MS);
  const drivers = Array.isArray(managementState.drivers) ? managementState.drivers : [];
  const leaves = Array.isArray(loaState.leaves) ? loaState.leaves : [];

  const joined = drivers
    .filter((driver) => inWindow(driver.joinDate || driver.firstObservedAt, start, end))
    .sort((a, b) => new Date(b.joinDate || b.firstObservedAt) - new Date(a.joinDate || a.firstObservedAt));

  const left = drivers
    .filter((driver) => inWindow(driver.leftAt, start, end))
    .sort((a, b) => new Date(b.leftAt) - new Date(a.leftAt));

  const restored = drivers
    .filter((driver) =>
      driver.current &&
      driver.lastActivityAlertLevel === 'Active' &&
      inWindow(driver.lastActivityAlertAt, start, end)
    );

  const reviewChanges = drivers
    .filter((driver) =>
      driver.current &&
      REVIEW_LEVELS.has(driver.activityLevel) &&
      inWindow(driver.activityLevelSince, start, end)
    );

  const loaApproved = leaves.filter((leave) => inWindow(leave.createdAt, start, end));
  const loaEnded = leaves.filter((leave) => {
    if (inWindow(leave.closedAt, start, end)) return true;
    return !leave.closedAt && inWindow(leave.endAt, start, end) && new Date(leave.endAt).getTime() <= end.getTime();
  });

  const current = drivers.filter((driver) => driver.current);
  const openReviews = current.filter((driver) => REVIEW_LEVELS.has(driver.activityLevel)).length;

  return {
    start,
    end,
    joined,
    left,
    restored,
    reviewChanges,
    loaApproved,
    loaEnded,
    currentDrivers: current.length,
    openReviews,
    changed:
      joined.length +
      left.length +
      restored.length +
      reviewChanges.length +
      loaApproved.length +
      loaEnded.length
  };
}

function leaveList(leaves, limit = 3) {
  if (!leaves.length) return 'None';
  const shown = leaves.slice(0, limit).map((leave) =>
    `[${escapeMarkdown(leave.username || `TMP ${leave.tmpId}`)}](${profileUrl(leave.tmpId)})`
  );
  if (leaves.length > limit) shown.push(`+${leaves.length - limit} more`);
  return shown.join(', ');
}

function buildDailyMessage(data) {
  const timestamp = Math.floor(data.end.getTime() / 1000);
  const reviewLines = ['Info', 'Attention', 'HR Review']
    .map((level) => {
      const list = data.reviewChanges.filter((driver) => driver.activityLevel === level);
      return list.length ? `• **${level}:** ${compactDrivers(list)}` : null;
    })
    .filter(Boolean);

  return [
    '🟢 **Kings Driver Leadership — Daily Changes**',
    `**Window:** last 24 hours · ending <t:${timestamp}:f>`,
    '',
    '### 🚛 Membership Changes',
    `Joined: **${data.joined.length}** — ${compactDrivers(data.joined)}`,
    `Left: **${data.left.length}** — ${compactDrivers(data.left)}`,
    '',
    '### 🛡️ Leave Changes',
    `LOA approved: **${data.loaApproved.length}** — ${leaveList(data.loaApproved)}`,
    `LOA ended: **${data.loaEnded.length}** — ${leaveList(data.loaEnded)}`,
    '',
    '### 📊 Activity Changes',
    ...(reviewLines.length ? reviewLines : ['• No new inactivity review level changes.']),
    `• **Restored:** ${data.restored.length} — ${compactDrivers(data.restored)}`,
    '',
    `**Current Drivers:** ${data.currentDrivers} · **Open Reviews:** ${data.openReviews}`,
    '',
    '🛡️ **Information only:** Kings Systems never performs personnel or disciplinary actions automatically.'
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

function buildMonthlyData(managementState, loaState, period) {
  const drivers = Array.isArray(managementState.drivers) ? managementState.drivers : [];
  const current = drivers.filter((driver) => driver.current);
  const leaves = Array.isArray(loaState.leaves) ? loaState.leaves : [];

  const joined = drivers.filter((driver) =>
    inWindow(driver.joinDate || driver.firstObservedAt, period.start, period.end)
  );
  const left = drivers.filter((driver) => inWindow(driver.leftAt, period.start, period.end));
  const restored = drivers.filter((driver) =>
    driver.lastActivityAlertLevel === 'Active' &&
    inWindow(driver.lastActivityAlertAt, period.start, period.end)
  );
  const loaCreated = leaves.filter((leave) => inWindow(leave.createdAt, period.start, period.end));

  const info = current.filter((driver) => driver.activityLevel === 'Info');
  const attention = current.filter((driver) => driver.activityLevel === 'Attention');
  const hrReview = current.filter((driver) => driver.activityLevel === 'HR Review');
  const activeLoa = leaves.filter((leave) => leaveStatus(leave) === 'active');

  const endDrivers = current.length;
  const startDrivers = Math.max(0, endDrivers - joined.length + left.length);
  const netGrowth = joined.length - left.length;
  const retention = startDrivers > 0
    ? Math.max(0, Math.min(100, ((startDrivers - left.length) / startDrivers) * 100))
    : null;

  const initializedAt = normalizeDate(managementState.initializedAt);
  const completeCoverage = Boolean(initializedAt && initializedAt.getTime() <= period.start.getTime());

  return {
    period,
    startDrivers,
    endDrivers,
    joined,
    left,
    netGrowth,
    retention,
    restored,
    loaCreated,
    activeLoa,
    info,
    attention,
    hrReview,
    openReviews: info.length + attention.length + hrReview.length,
    tenure: buildTenureSummary(current, period.end.getTime()),
    completeCoverage,
    initializedAt
  };
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function delta(value, previous) {
  if (!Number.isFinite(previous)) return null;
  const diff = value - previous;
  return signed(diff);
}

function buildMonthlyMessage(data, previousReport = null) {
  const t = data.tenure;
  const retentionText = data.retention === null ? 'n/a' : `${data.retention.toFixed(1)}%`;
  const averageTenure = Number.isFinite(t.averageDays) ? `${t.averageDays}d` : 'n/a';
  const coverageLine = data.completeCoverage
    ? '✅ Full Driver Management coverage for the month.'
    : data.initializedAt
      ? `⚠️ Partial coverage: tracking started <t:${Math.floor(data.initializedAt.getTime() / 1000)}:D>.`
      : '⚠️ Tracking coverage start is unknown.';

  const comparison = previousReport
    ? [
        '',
        '### 📈 Compared with Previous Report',
        `Drivers: **${delta(data.endDrivers, previousReport.endDrivers)}** · Net Growth: **${delta(data.netGrowth, previousReport.netGrowth)}** · Open Reviews: **${delta(data.openReviews, previousReport.openReviews)}**`
      ]
    : [];

  return [
    '👑 **Kings Driver Leadership — Monthly Report**',
    `**Month:** ${data.period.label}`,
    coverageLine,
    '',
    '### 🚛 Driver Development',
    `Start: **${data.startDrivers}** · End: **${data.endDrivers}** · Net: **${signed(data.netGrowth)}**`,
    `Joined: **${data.joined.length}** · Left: **${data.left.length}** · Retention: **${retentionText}**`,
    `Activity restored: **${data.restored.length}** · LOAs approved: **${data.loaCreated.length}**`,
    '',
    '### 🕒 Membership & Tenure',
    `<1m **${t.under1Month}** · 1–3m **${t.oneToThreeMonths}** · 3–6m **${t.threeToSixMonths}** · 6–12m **${t.sixToTwelveMonths}**`,
    `1–2y **${t.oneToTwoYears}** · 2–3y **${t.twoToThreeYears}** · 3y+ **${t.threeYearsPlus}** · Avg **${averageTenure}**`,
    '',
    '### 📊 Current Activity Snapshot',
    `ℹ️ Info: **${data.info.length}** · ⚠️ Attention: **${data.attention.length}** · 👥 HR Review: **${data.hrReview.length}**`,
    `Open Reviews: **${data.openReviews}** · Active LOAs: **${data.activeLoa.length}**`,
    '',
    `New Drivers: ${compactDrivers(data.joined)}`,
    `Left Kings: ${compactDrivers(data.left)}`,
    ...comparison,
    '',
    '🛡️ **Information only:** This report supports Leadership review and never triggers automatic personnel action.'
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
    'User-Agent': 'Kings Logistics Driver Leadership Reports/1.0'
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
    .replace(/[^a-z0-9]+/g, '-');
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
  const wanted = normalizeChannelName(LEADERSHIP_CHANNEL_NAME);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(Number(channel.type)));
  const exact = textChannels.find((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact) return exact;

  throw new Error(`Could not find Driver Leadership channel "${LEADERSHIP_CHANNEL_NAME}".`);
}

async function postMessage(channel, content) {
  if (content.length > 1950) {
    throw new Error(`Driver Leadership report exceeds safe Discord length: ${content.length}`);
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

async function runDaily(managementState, loaState, reportState) {
  const end = new Date();
  const key = end.toISOString().slice(0, 10);
  const data = buildDailyData(managementState, loaState, end);
  const content = buildDailyMessage(data);
  const channel = await resolveLeadershipChannel();

  if (PREVIEW) {
    console.log(`PREVIEW Driver Daily Changes for #${channel.name}:\n${content}`);
    return;
  }

  const result = await syncTextMessage({
    token: DISCORD_BOT_TOKEN,
    channelId: channel.id,
    marker: '🟢 **Kings Driver Leadership — Daily Changes**',
    content,
    userAgent: 'Kings Logistics Driver Leadership Reports/2.0'
  });

  if (!reportState.publishedDailyKeys.includes(key)) {
    reportState.publishedDailyKeys.push(key);
  }
  saveReportState(reportState);

  console.log(`Driver Daily dashboard ${result.action} in #${channel.name}; changes in last 24h: ${data.changed}.`);
}

async function runMonthly(managementState, loaState, reportState) {
  const period = previousCompletedMonth();
  const data = buildMonthlyData(managementState, loaState, period);
  const previousReport = reportState.monthlyReports
    .filter((item) => item.key !== period.key)
    .at(-1) || null;
  const content = buildMonthlyMessage(data, previousReport);
  const channel = await resolveLeadershipChannel();

  if (PREVIEW) {
    console.log(`PREVIEW Driver Monthly Report for #${channel.name}:\n${content}`);
    return;
  }

  const result = await syncTextMessage({
    token: DISCORD_BOT_TOKEN,
    channelId: channel.id,
    marker: '👑 **Kings Driver Leadership — Monthly Report**',
    content,
    userAgent: 'Kings Logistics Driver Leadership Reports/2.0'
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
    openReviews: data.openReviews,
    activeLoa: data.activeLoa.length,
    averageTenureDays: data.tenure.averageDays
  };

  const index = reportState.monthlyReports.findIndex((item) => item.key === period.key);
  if (index >= 0) reportState.monthlyReports[index] = record;
  else reportState.monthlyReports.push(record);

  if (!reportState.publishedMonthlyKeys.includes(period.key)) {
    reportState.publishedMonthlyKeys.push(period.key);
  }
  saveReportState(reportState);

  console.log(`Driver Monthly dashboard ${result.action} for ${period.key} in #${channel.name}.`);
}

async function main() {
  const managementState = readManagementState();
  const loaState = readLoaState();
  const reportState = readReportState();

  if (REPORT_MODE === 'daily') {
    await runDaily(managementState, loaState, reportState);
    return;
  }

  if (REPORT_MODE === 'monthly') {
    await runMonthly(managementState, loaState, reportState);
    return;
  }

  throw new Error(`Unsupported DRIVER_LEADERSHIP_REPORT_MODE: ${REPORT_MODE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Kings Driver Leadership Reports failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  buildDailyData,
  buildDailyMessage,
  previousCompletedMonth,
  buildMonthlyData,
  buildMonthlyMessage,
  buildTenureSummary,
  membershipDays,
  leaveStatus
};
