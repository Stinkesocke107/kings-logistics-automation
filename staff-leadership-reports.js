require('./kings-branding').installDiscordBranding();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { syncTextMessage } = require('./leadership-message-sync');

const STATE_KEY = process.env.STAFF_STATE_KEY || process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const STAFF_CHANNEL_ID = process.env.STAFF_LEADERSHIP_CHANNEL_ID || null;
const STAFF_CHANNEL_NAME = process.env.STAFF_LEADERSHIP_CHANNEL_NAME || 'staff-leadership';
const REPORT_MODE = String(process.env.STAFF_LEADERSHIP_REPORT_MODE || 'daily').trim().toLowerCase();
const PREVIEW = /^(?:1|true|yes|on)$/i.test(process.env.STAFF_LEADERSHIP_REPORT_PREVIEW || '');

const STAFF_FILE = path.join(__dirname, 'data', 'staff-management.json');
const REPORT_STATE_FILE = path.join(__dirname, 'data', 'staff-leadership-report-state.json');
const STATE_DOMAIN = 'kings-staff-management-v1';
const DAY_MS = 86400000;
const DISCORD_API = 'https://discord.com/api/v10';

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

function deriveKey() {
  return crypto
    .createHash('sha256')
    .update(`${STATE_DOMAIN}\0`)
    .update(String(STATE_KEY))
    .digest();
}

function decryptState(container) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error('Staff Management state is not encrypted as expected.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(),
    Buffer.from(container.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));

  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}

function readStaffState() {
  const container = readJson(STAFF_FILE, null);
  if (!container) throw new Error('Staff Management state is missing.');
  return decryptState(container);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inPeriod(value, period) {
  const date = normalizeDate(value);
  if (!date) return false;
  const time = date.getTime();
  return time >= period.start.getTime() && time < period.end.getTime();
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function personLink(item) {
  return `[${escapeMarkdown(item?.username || `TMP ${item?.tmpId}`)}](${profileUrl(item?.tmpId)})`;
}

function roleText(roles) {
  return Array.isArray(roles) && roles.length ? roles.join(', ') : 'None';
}

function eventLine(event) {
  const person = personLink(event);
  if (event.type === 'staff_joined') return `➕ ${person} — ${roleText(event.newRoles)}`;
  if (event.type === 'staff_left') return `➖ ${person} — left Staff roster`;
  return `🔄 ${person} — ${roleText(event.previousRoles)} → ${roleText(event.newRoles)}`;
}

function compactEvents(events, limit = 6) {
  if (!events.length) return ['• None'];
  const lines = events.slice(0, limit).map((event) => `• ${eventLine(event)}`);
  if (events.length > limit) lines.push(`• +${events.length - limit} more`);
  return lines;
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
}

function currentSnapshot(state) {
  const current = (state.staff || []).filter((person) => person.currentStaff);
  return {
    current,
    roleCounts: countBy(current.flatMap((person) => person.roleNames || [])),
    departmentCounts: countBy(current.flatMap((person) => person.departments || []))
  };
}

function departmentLine(departmentCounts, limit = 6) {
  const entries = Object.entries(departmentCounts || {}).slice(0, limit);
  if (!entries.length) return 'No departments detected.';
  return entries.map(([name, count]) => `${name} **${count}**`).join(' · ');
}

function defaultReportState() {
  return {
    version: 1,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    publishedDailyKeys: [],
    publishedWeeklyKeys: [],
    publishedMonthlyKeys: [],
    weeklyReports: [],
    monthlyReports: [],
    messageIds: { daily: null, weekly: null, monthly: null }
  };
}

function readReportState() {
  const state = readJson(REPORT_STATE_FILE, null);
  if (!state) return defaultReportState();
  const base = defaultReportState();
  return {
    ...base,
    ...state,
    publishedDailyKeys: Array.isArray(state.publishedDailyKeys) ? state.publishedDailyKeys : [],
    publishedWeeklyKeys: Array.isArray(state.publishedWeeklyKeys) ? state.publishedWeeklyKeys : [],
    publishedMonthlyKeys: Array.isArray(state.publishedMonthlyKeys) ? state.publishedMonthlyKeys : [],
    weeklyReports: Array.isArray(state.weeklyReports) ? state.weeklyReports : [],
    monthlyReports: Array.isArray(state.monthlyReports) ? state.monthlyReports : [],
    messageIds: {
      daily: state?.messageIds?.daily || null,
      weekly: state?.messageIds?.weekly || null,
      monthly: state?.messageIds?.monthly || null
    }
  };
}

function saveReportState(state) {
  state.updatedAt = nowISO();
  state.publishedDailyKeys = state.publishedDailyKeys.slice(-60);
  state.publishedWeeklyKeys = state.publishedWeeklyKeys.slice(-104);
  state.publishedMonthlyKeys = state.publishedMonthlyKeys.slice(-36);
  state.weeklyReports = state.weeklyReports.slice(-104);
  state.monthlyReports = state.monthlyReports.slice(-24);
  writeJson(REPORT_STATE_FILE, state);
}

function last24Hours(now = new Date()) {
  return {
    start: new Date(now.getTime() - DAY_MS),
    end: now,
    key: now.toISOString().slice(0, 10),
    label: 'Last 24 Hours'
  };
}

function previousCompletedWeek(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(today.getTime() - daysSinceMonday * DAY_MS);
  const start = new Date(currentWeekStart.getTime() - 7 * DAY_MS);
  const end = currentWeekStart;
  return {
    start,
    end,
    key: start.toISOString().slice(0, 10),
    label: `${start.toISOString().slice(0, 10)} – ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}`
  };
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

function buildPeriodData(state, period, now = new Date()) {
  const history = Array.isArray(state.history) ? state.history : [];
  const events = history
    .filter((event) => inPeriod(event.at, period))
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  const joined = events.filter((event) => event.type === 'staff_joined');
  const left = events.filter((event) => event.type === 'staff_left');
  const roleChanges = events.filter((event) => event.type === 'role_changed');
  const snapshot = currentSnapshot(state);

  const afterPeriod = history.filter((event) => {
    const date = normalizeDate(event.at);
    return date && date.getTime() >= period.end.getTime() && date.getTime() < now.getTime();
  });

  const afterJoined = afterPeriod.filter((event) => event.type === 'staff_joined').length;
  const afterLeft = afterPeriod.filter((event) => event.type === 'staff_left').length;

  const endStaff = Math.max(0, snapshot.current.length - afterJoined + afterLeft);
  const startStaff = Math.max(0, endStaff - joined.length + left.length);
  const netGrowth = joined.length - left.length;

  const initializedAt = normalizeDate(state.initializedAt);
  const completeCoverage = Boolean(initializedAt && initializedAt.getTime() <= period.start.getTime());

  return {
    period,
    events,
    joined,
    left,
    roleChanges,
    snapshot,
    startStaff,
    endStaff,
    netGrowth,
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

function buildDailyMessage(data) {
  const timestamp = Math.floor(data.period.end.getTime() / 1000);
  return [
    '🟢 **Kings Staff Leadership — Daily Changes**',
    `**Window:** last 24 hours · ending <t:${timestamp}:f>`,
    '',
    `➕ Staff joined: **${data.joined.length}**`,
    `➖ Staff left: **${data.left.length}**`,
    `🔄 Role changes: **${data.roleChanges.length}**`,
    '',
    '### Changes',
    ...compactEvents(data.events),
    '',
    '### 📊 Current Staff Snapshot',
    `Current Staff: **${data.snapshot.current.length}**`,
    `Departments: ${departmentLine(data.snapshot.departmentCounts)}`,
    '',
    '🛡️ **Advisory only:** Kings Systems observes Staff structure only. Leadership decides every Staff or personnel action.'
  ].join('\n');
}

function buildWeeklyMessage(data, previous = null) {
  const coverage = data.completeCoverage
    ? '✅ Complete Staff tracking coverage for this week.'
    : data.initializedAt
      ? `⚠️ Partial coverage: Staff tracking started <t:${Math.floor(data.initializedAt.getTime() / 1000)}:D>.`
      : '⚠️ Staff tracking coverage start is unknown.';

  const comparison = previous
    ? [
        '',
        '### 📈 Compared with Previous Week',
        `End Staff: **${delta(data.endStaff, previous.endStaff)}** · Joined: **${delta(data.joined.length, previous.joined)}** · Role Changes: **${delta(data.roleChanges.length, previous.roleChanges)}**`
      ]
    : [];

  return [
    '🟣 **Kings Staff Leadership — Weekly Review**',
    `**Period:** ${data.period.label}`,
    coverage,
    '',
    '### 👥 Staff Movement',
    `Start: **${data.startStaff}** · End: **${data.endStaff}** · Net: **${signed(data.netGrowth)}**`,
    `Joined: **${data.joined.length}** · Left: **${data.left.length}** · Role Changes: **${data.roleChanges.length}**`,
    '',
    '### 🏢 Current Department Snapshot',
    departmentLine(data.snapshot.departmentCounts),
    '',
    '### 🔄 Changes This Week',
    ...compactEvents(data.events),
    ...comparison,
    '',
    '🛡️ **Advisory only:** This review contains Staff information only and performs no automatic Staff role or personnel actions.'
  ].join('\n');
}

function buildMonthlyMessage(data, previous = null) {
  const coverage = data.completeCoverage
    ? '✅ Complete Staff tracking coverage for the month.'
    : data.initializedAt
      ? `⚠️ Partial coverage: Staff tracking started <t:${Math.floor(data.initializedAt.getTime() / 1000)}:D>.`
      : '⚠️ Staff tracking coverage start is unknown.';

  const comparison = previous
    ? [
        '',
        '### 📈 Compared with Previous Report',
        `End Staff: **${delta(data.endStaff, previous.endStaff)}** · Net Growth: **${delta(data.netGrowth, previous.netGrowth)}** · Role Changes: **${delta(data.roleChanges.length, previous.roleChanges)}**`
      ]
    : [];

  return [
    '👑 **Kings Staff Leadership — Monthly Report**',
    `**Month:** ${data.period.label}`,
    coverage,
    '',
    '### 👥 Staff Development',
    `Start: **${data.startStaff}** · End: **${data.endStaff}** · Net: **${signed(data.netGrowth)}**`,
    `Joined: **${data.joined.length}** · Left: **${data.left.length}** · Role Changes: **${data.roleChanges.length}**`,
    '',
    '### 🏢 Current Department Structure',
    departmentLine(data.snapshot.departmentCounts, 10),
    '',
    '### 🛡️ Current Staff Roles',
    departmentLine(data.snapshot.roleCounts, 10),
    '',
    '### 🔄 Notable Changes',
    ...compactEvents(data.events, 8),
    ...comparison,
    '',
    '🛡️ **Advisory only:** Kings Systems never promotes, demotes, removes, assigns roles, or makes Staff/personnel decisions automatically.'
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
    'User-Agent': 'Kings Logistics Staff Leadership Reports/1.0'
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
  if (STAFF_CHANNEL_ID) {
    const channel = await discord(`/channels/${STAFF_CHANNEL_ID}`);
    if (channel.guild_id && String(channel.guild_id) !== String(DISCORD_GUILD_ID)) {
      throw new Error('Configured Staff Leadership channel is not in the configured guild.');
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const text = (channels || []).filter((channel) => [0, 5].includes(Number(channel.type)));
  const wanted = normalizeChannelName(STAFF_CHANNEL_NAME);
  const exact = text.find((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact) return exact;
  const fuzzy = text.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('staff') && name.includes('leadership');
  });
  if (fuzzy.length === 1) return fuzzy[0];
  throw new Error(`Could not uniquely find Staff Leadership channel "${STAFF_CHANNEL_NAME}".`);
}

async function post(channel, content) {
  if (content.length > 1950) throw new Error(`Staff Leadership report exceeds safe Discord length: ${content.length}`);
  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: { content, flags: 4, allowed_mentions: { parse: [] } }
  });
}

async function runDaily(state, reportState) {
  const period = last24Hours();
  const data = buildPeriodData(state, period);
  const channel = await resolveChannel();
  const content = buildDailyMessage(data);

  if (PREVIEW) {
    console.log(`PREVIEW Staff Daily Changes for #${channel.name}:\n${content}`);
    return;
  }

  const result = await syncTextMessage({
    token: DISCORD_BOT_TOKEN,
    channelId: channel.id,
    marker: '🟢 **Kings Staff Leadership — Daily Changes**',
    content,
    userAgent: 'Kings Logistics Staff Leadership Reports/2.1',
    messageId: reportState.messageIds.daily,
    createWithoutDiscovery: true
  });
  reportState.messageIds.daily = result.messageId || reportState.messageIds.daily;

  if (!reportState.publishedDailyKeys.includes(period.key)) reportState.publishedDailyKeys.push(period.key);
  saveReportState(reportState);
  console.log(`Staff Daily dashboard ${result.action} in #${channel.name}; changes: ${data.events.length}.`);
}

async function runWeekly(state, reportState) {
  const period = previousCompletedWeek();
  const data = buildPeriodData(state, period);
  const previous = reportState.weeklyReports.filter((item) => item.key !== period.key).at(-1) || null;
  const content = buildWeeklyMessage(data, previous);
  const channel = await resolveChannel();

  if (PREVIEW) {
    console.log(`PREVIEW Staff Weekly Review for #${channel.name}:\n${content}`);
    return;
  }

  const result = await syncTextMessage({
    token: DISCORD_BOT_TOKEN,
    channelId: channel.id,
    marker: '🟣 **Kings Staff Leadership — Weekly Review**',
    content,
    userAgent: 'Kings Logistics Staff Leadership Reports/2.1',
    messageId: reportState.messageIds.weekly,
    createWithoutDiscovery: true
  });
  reportState.messageIds.weekly = result.messageId || reportState.messageIds.weekly;

  const record = {
    key: period.key,
    publishedAt: nowISO(),
    completeCoverage: data.completeCoverage,
    startStaff: data.startStaff,
    endStaff: data.endStaff,
    joined: data.joined.length,
    left: data.left.length,
    roleChanges: data.roleChanges.length,
    netGrowth: data.netGrowth
  };
  const index = reportState.weeklyReports.findIndex((item) => item.key === period.key);
  if (index >= 0) reportState.weeklyReports[index] = record;
  else reportState.weeklyReports.push(record);
  if (!reportState.publishedWeeklyKeys.includes(period.key)) reportState.publishedWeeklyKeys.push(period.key);
  saveReportState(reportState);

  console.log(`Staff Weekly dashboard ${result.action} for ${period.key} in #${channel.name}.`);
}

async function runMonthly(state, reportState) {
  const period = previousCompletedMonth();
  const data = buildPeriodData(state, period);
  const previous = reportState.monthlyReports.filter((item) => item.key !== period.key).at(-1) || null;
  const content = buildMonthlyMessage(data, previous);
  const channel = await resolveChannel();

  if (PREVIEW) {
    console.log(`PREVIEW Staff Monthly Report for #${channel.name}:\n${content}`);
    return;
  }

  const result = await syncTextMessage({
    token: DISCORD_BOT_TOKEN,
    channelId: channel.id,
    marker: '👑 **Kings Staff Leadership — Monthly Report**',
    content,
    userAgent: 'Kings Logistics Staff Leadership Reports/2.1',
    messageId: reportState.messageIds.monthly,
    createWithoutDiscovery: true
  });
  reportState.messageIds.monthly = result.messageId || reportState.messageIds.monthly;

  const record = {
    key: period.key,
    publishedAt: nowISO(),
    completeCoverage: data.completeCoverage,
    startStaff: data.startStaff,
    endStaff: data.endStaff,
    joined: data.joined.length,
    left: data.left.length,
    roleChanges: data.roleChanges.length,
    netGrowth: data.netGrowth
  };
  const index = reportState.monthlyReports.findIndex((item) => item.key === period.key);
  if (index >= 0) reportState.monthlyReports[index] = record;
  else reportState.monthlyReports.push(record);
  if (!reportState.publishedMonthlyKeys.includes(period.key)) reportState.publishedMonthlyKeys.push(period.key);
  saveReportState(reportState);

  console.log(`Staff Monthly dashboard ${result.action} for ${period.key} in #${channel.name}.`);
}
async function main() {
  const state = readStaffState();
  const reportState = readReportState();

  if (REPORT_MODE === 'daily') return runDaily(state, reportState);
  if (REPORT_MODE === 'weekly') return runWeekly(state, reportState);
  if (REPORT_MODE === 'monthly') return runMonthly(state, reportState);

  throw new Error(`Unsupported STAFF_LEADERSHIP_REPORT_MODE: ${REPORT_MODE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Kings Staff Leadership Reports failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  buildPeriodData,
  buildDailyMessage,
  buildWeeklyMessage,
  buildMonthlyMessage,
  previousCompletedWeek,
  previousCompletedMonth,
  currentSnapshot
};
