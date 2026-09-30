require('./kings-branding').installDiscordBranding();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KINGS_BLUE = 0x182dff;
const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const MANAGEMENT_CHANNEL_ID = process.env.MANAGEMENT_OVERVIEW_CHANNEL_ID || null;
const MANAGEMENT_CHANNEL_NAME = process.env.MANAGEMENT_OVERVIEW_CHANNEL_NAME || 'management-overview';
const CONVOY_FORUM_ID = process.env.CONVOY_MANAGEMENT_FORUM_ID || '1550619824005062697';
const PREVIEW_MODE = String(process.env.MANAGEMENT_WEEKLY_PREVIEW || '').toLowerCase() === 'true';

const DATA = path.join(__dirname, 'data');
const STATISTICS_FILE = path.join(DATA, 'statistics.json');
const DRIVER_HISTORY_FILE = path.join(DATA, 'driver-history.json');
const DRIVER_SUMMARY_FILE = path.join(DATA, 'driver-management-summary.json');
const STAFF_SUMMARY_FILE = path.join(DATA, 'staff-management-summary.json');
const PROBATION_FILE = path.join(DATA, 'probation-state.json');
const HR_FILE = path.join(DATA, 'hr-probation.json');
const STATE_FILE = path.join(DATA, 'management-weekly-overview-state.json');

const DAY_MS = 86400000;
const DISCORD_API = 'https://discord.com/api/v10';
let resolvedWriteChannelId = null;

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}
if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() { return new Date().toISOString(); }
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function normalizeDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}
function formatSigned(value) { return number(value) > 0 ? `+${number(value)}` : String(number(value)); }
function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(date);
}
function inPeriod(value, period) {
  const date = normalizeDate(value);
  return Boolean(date && date >= period.start && date < period.end);
}
function getPreviousCompletedWeek() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(today.getTime() - daysSinceMonday * DAY_MS);
  const start = new Date(currentWeekStart.getTime() - 7 * DAY_MS);
  return {
    start,
    end: currentWeekStart,
    key: start.toISOString().slice(0, 10),
    label: `${formatDate(start)} – ${formatDate(new Date(currentWeekStart.getTime() - 1))}`
  };
}
function getPreviewPeriod() {
  const end = new Date();
  return { start: new Date(end.getTime() - 7 * DAY_MS), end, key: 'preview', label: 'Preview • Last 7 Days' };
}
function deriveKey(domain) {
  return crypto.createHash('sha256').update(`${domain}\0`).update(String(DRIVER_STATE_KEY)).digest();
}
function decrypt(container, domain) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error(`Encrypted state for ${domain} is not in the expected format.`);
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(domain), Buffer.from(container.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}
function loadStatistics() {
  const raw = readJson(STATISTICS_FILE, null);
  if (!raw) throw new Error('Statistics data does not exist.');
  const history = (Array.isArray(raw.history) ? raw.history : Array.isArray(raw.days) ? raw.days : Array.isArray(raw) ? raw : [])
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day?.date || '')))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { history, allTime: raw.allTime || {} };
}
function getPeriodStatistics(statistics, period) {
  const days = statistics.history.filter((day) => inPeriod(`${day.date}T00:00:00.000Z`, period));
  const latest = statistics.history.at(-1) || {};
  return {
    days,
    currentMembers: number(latest.members),
    weeklyPeak: Math.max(0, ...days.map((day) => number(day.peakOnline))),
    peakETS2: Math.max(0, ...days.map((day) => number(day.peakETS2))),
    peakATS: Math.max(0, ...days.map((day) => number(day.peakATS))),
    allTimePeak: number(statistics.allTime.peakOnline)
  };
}
function statisticsCoverPeriod(periodStats, period) {
  if (!periodStats.days.length) return false;
  const first = normalizeDate(`${periodStats.days[0].date}T00:00:00.000Z`);
  const last = normalizeDate(`${periodStats.days.at(-1).date}T00:00:00.000Z`);
  return Boolean(first && last && first <= period.start && last >= new Date(period.end.getTime() - DAY_MS));
}
function loadDriverHistory() {
  const history = readJson(DRIVER_HISTORY_FILE, null);
  if (!history || !Array.isArray(history.events)) throw new Error('Driver History does not exist or is invalid.');
  return history;
}
function driverHistoryCoversPeriod(history, period) {
  const initialized = normalizeDate(history.initializedAt);
  return Boolean(initialized && initialized <= period.start);
}
function getDriverMovement(history, period) {
  const events = history.events.filter((event) => inPeriod(event.occurredAt || event.detectedAt, period));
  const joined = events.filter((event) => event.type === 'join').length;
  const left = events.filter((event) => event.type === 'leave').length;
  return {
    joined,
    left,
    net: joined - left,
    nameChanges: events.filter((event) => event.type === 'name_change').length
  };
}
function getProbationTriggered(period) {
  const state = readJson(PROBATION_FILE, { notified: [] });
  return (state.notified || []).filter((item) => item.notifiedAt && inPeriod(item.notifiedAt, period)).length;
}
function loadHrState() {
  const container = readJson(HR_FILE, null);
  return container ? decrypt(container, 'kings-hr-probation-v1') : { reviews: [] };
}
function loadState() {
  const state = readJson(STATE_FILE, null);
  if (!state || !Array.isArray(state.publishedWeeks)) {
    return { version: 3, createdAt: nowISO(), updatedAt: nowISO(), publishedWeeks: [] };
  }
  state.version = 3;
  return state;
}
function saveState(state) {
  state.updatedAt = nowISO();
  if (state.publishedWeeks.length > 104) state.publishedWeeks = state.publishedWeeks.slice(-104);
  writeJson(STATE_FILE, state);
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    const match = pathname.match(/^\/channels\/(\d+)\/messages$/);
    if (!(method === 'POST' && match && resolvedWriteChannelId && match[1] === String(resolvedWriteChannelId))) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }
  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Management Weekly/3.0'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status} on ${method} ${pathname}: ${text.slice(0, 500)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
function normalizeChannelName(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
async function resolveManagementChannel() {
  if (MANAGEMENT_CHANNEL_ID) {
    const channel = await discord(`/channels/${MANAGEMENT_CHANNEL_ID}`);
    if (channel.guild_id && channel.guild_id !== DISCORD_GUILD_ID) throw new Error('Configured Management channel is in the wrong guild.');
    resolvedWriteChannelId = String(channel.id);
    return channel;
  }
  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));
  const wanted = normalizeChannelName(MANAGEMENT_CHANNEL_NAME);
  const exact = textChannels.find((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact) {
    resolvedWriteChannelId = String(exact.id);
    return exact;
  }
  const fuzzy = textChannels.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('management') && name.includes('overview');
  });
  if (fuzzy.length !== 1) throw new Error(`Could not uniquely resolve Management Overview channel "${MANAGEMENT_CHANNEL_NAME}".`);
  resolvedWriteChannelId = String(fuzzy[0].id);
  return fuzzy[0];
}
async function getEventStatus() {
  const forum = await discord(`/channels/${CONVOY_FORUM_ID}`);
  const tagsById = new Map((forum.available_tags || []).map((tag) => [String(tag.id), String(tag.name || '').toLowerCase()]));
  const active = await discord(`/guilds/${DISCORD_GUILD_ID}/threads/active`);
  const threads = (active?.threads || []).filter((thread) => String(thread.parent_id) === String(CONVOY_FORUM_ID));
  const counts = { active: threads.length, submitted: 0, needsInformation: 0, readyForApproval: 0, scheduled: 0, other: 0 };
  for (const thread of threads) {
    const names = (thread.applied_tags || []).map((id) => tagsById.get(String(id)) || '');
    if (names.some((name) => name.includes('needs') && name.includes('information'))) counts.needsInformation++;
    else if (names.some((name) => name.includes('ready') && name.includes('approval'))) counts.readyForApproval++;
    else if (names.some((name) => name.includes('scheduled'))) counts.scheduled++;
    else if (names.some((name) => name.includes('submitted'))) counts.submitted++;
    else counts.other++;
  }
  return counts;
}
function staffField(staff) {
  const changes = staff?.changesLast30Days || {};
  return [
    `Current Staff: **${number(staff?.currentStaff)}** • Tracked Records: **${number(staff?.trackedStaffRecords)}**`,
    `30d Joined Staff: **${number(changes.joinedStaff)}** • Role Changes: **${number(changes.roleChanges)}** • Left Staff: **${number(changes.leftStaff)}**`,
    `Staff data updated: **${staff?.updatedAt ? new Date(staff.updatedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown'}**`
  ].join('\n');
}
function buildEmbed(period, periodStats, movement, probationTriggered, driver, hr, events, staff) {
  const activity = driver?.activity || {};
  const reviews = Array.isArray(hr?.reviews) ? hr.reviews : [];
  const open = reviews.filter((review) => review.status === 'open').length;
  const extended = reviews.filter((review) => review.status === 'extended').length;
  return {
    title: PREVIEW_MODE ? '👑 Kings Weekly Management Overview • TEST' : '👑 Kings Weekly Management Overview',
    description: `${PREVIEW_MODE ? 'Preview using' : 'Management summary for'} **${period.label}**.\nCurrent pipeline figures are live snapshots; movement/activity peaks cover the reporting period.`,
    color: KINGS_BLUE,
    fields: [
      {
        name: '🚛 Drivers',
        value: `Current: **${number(driver?.currentDrivers, periodStats.currentMembers)}**\n` +
          `Joined: **${movement.joined}** • Left: **${movement.left}** • Net: **${formatSigned(movement.net)}**\n` +
          `Current Attention 14d: **${number(activity.attention14Days)}** • Current HR Review 30d: **${number(activity.hrReview30Days)}** • Approved Leave: **${number(activity.approvedLeave)}**`,
        inline: false
      },
      {
        name: '👥 HR & Probation',
        value: `Probation Reviews Triggered This Period: **${probationTriggered}**\n` +
          `Current Open: **${open}** • Current Extended: **${extended}** • Name Changes This Period: **${movement.nameChanges}**`,
        inline: false
      },
      {
        name: '🛡️ Staff Management',
        value: staffField(staff),
        inline: false
      },
      {
        name: '📅 Events / Convoys — Current Pipeline',
        value: `Active Threads: **${events.active}**\n` +
          `Submitted: **${events.submitted}** • Needs Information: **${events.needsInformation}** • Ready for Approval: **${events.readyForApproval}** • Scheduled: **${events.scheduled}**` +
          (events.other ? ` • Other: **${events.other}**` : ''),
        inline: false
      },
      {
        name: '📊 TruckersMP Activity',
        value: `Weekly Peak: **${periodStats.weeklyPeak}** • ETS2 Peak: **${periodStats.peakETS2}** • ATS Peak: **${periodStats.peakATS}**\n` +
          `All-Time Tracked Peak: **${periodStats.allTimePeak}**`,
        inline: false
      }
    ],
    footer: { text: PREVIEW_MODE ? 'Kings Logistics • Management Control • TEST' : 'Kings Logistics • Management Control' },
    timestamp: nowISO()
  };
}

async function createOverview() {
  const period = PREVIEW_MODE ? getPreviewPeriod() : getPreviousCompletedWeek();
  const statistics = loadStatistics();
  const periodStats = getPeriodStatistics(statistics, period);
  const driverHistory = loadDriverHistory();

  if (!PREVIEW_MODE && !statisticsCoverPeriod(periodStats, period)) {
    console.log('Statistics do not cover the complete reporting week. No report posted.');
    return;
  }
  if (!PREVIEW_MODE && !driverHistoryCoversPeriod(driverHistory, period)) {
    console.log('Driver History does not cover the complete reporting week. No report posted.');
    return;
  }

  const state = loadState();
  if (!PREVIEW_MODE && state.publishedWeeks.some((item) => item.key === period.key)) {
    console.log(`Management Overview ${period.key} was already published.`);
    return;
  }

  const movement = getDriverMovement(driverHistory, period);
  const probationTriggered = getProbationTriggered(period);
  const driver = readJson(DRIVER_SUMMARY_FILE, {});
  const staff = readJson(STAFF_SUMMARY_FILE, null);
  if (!staff || !Number.isFinite(Number(staff.currentStaff))) {
    throw new Error('Staff Management summary is missing or invalid.');
  }
  const hr = loadHrState();
  const channel = await resolveManagementChannel();
  const events = await getEventStatus();
  const embed = buildEmbed(period, periodStats, movement, probationTriggered, driver, hr, events, staff);

  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: { embeds: [embed], allowed_mentions: { parse: [] } }
  });

  if (PREVIEW_MODE) {
    console.log(`Management Weekly Overview TEST sent to #${channel.name}.`);
    return;
  }

  state.publishedWeeks.push({
    key: period.key,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    publishedAt: nowISO(),
    members: number(driver.currentDrivers, periodStats.currentMembers),
    joined: movement.joined,
    left: movement.left,
    netGrowth: movement.net,
    nameChanges: movement.nameChanges,
    probationReviewsTriggered: probationTriggered,
    currentOpenProbationReviews: (hr.reviews || []).filter((r) => r.status === 'open').length,
    currentExtendedProbationReviews: (hr.reviews || []).filter((r) => r.status === 'extended').length,
    currentAttention14Days: number(driver.activity?.attention14Days),
    currentHrReview30Days: number(driver.activity?.hrReview30Days),
    currentStaff: number(staff.currentStaff),
    staffJoined30d: number(staff.changesLast30Days?.joinedStaff),
    staffRoleChanges30d: number(staff.changesLast30Days?.roleChanges),
    staffLeft30d: number(staff.changesLast30Days?.leftStaff),
    activeEventThreads: events.active,
    scheduledEvents: events.scheduled,
    weeklyPeak: periodStats.weeklyPeak
  });
  saveState(state);
  console.log(`Management Weekly Overview ${period.key} published to #${channel.name}.`);
}

createOverview().then(() => {
  console.log('Kings Management Weekly Overview completed successfully.');
  console.log('Safety: Reporting only. No personnel actions are implemented.');
}).catch((error) => {
  console.error('Kings Management Weekly Overview failed:', error.message);
  process.exit(1);
});
