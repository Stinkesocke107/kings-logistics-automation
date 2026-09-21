const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const MANAGEMENT_CHANNEL_ID = process.env.MANAGEMENT_OVERVIEW_CHANNEL_ID || null;
const MANAGEMENT_CHANNEL_NAME = process.env.MANAGEMENT_OVERVIEW_CHANNEL_NAME || 'management-overview';
const CONVOY_FORUM_ID = process.env.CONVOY_MANAGEMENT_FORUM_ID || '1550619824005062697';

const DRIVER_SUMMARY_FILE = path.join(__dirname, 'data', 'driver-management-summary.json');
const LIVE_FILE = path.join(__dirname, 'data', 'live-tracker-snapshot.json');
const STATISTICS_FILE = path.join(__dirname, 'data', 'statistics.json');
const HR_FILE = path.join(__dirname, 'data', 'hr-probation.json');
const MONTHLY_REPORT_STATE_FILE = path.join(__dirname, 'data', 'monthly-report-state.json');
const MILESTONE_FILE = path.join(__dirname, 'data', 'milestones.json');
const ACHIEVEMENT_SUMMARY_FILE = path.join(__dirname, 'data', 'driver-achievements-summary.json');
const AWARDS_CATALOG_FILE = path.join(__dirname, 'data', 'awards-catalog.json');

const DISCORD_API = 'https://discord.com/api/v10';
const OVERVIEW_TITLE = '👑 Kings Management Overview';
let resolvedWriteChannelId = null;

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

function deriveKey(domain) {
  return crypto.createHash('sha256').update(`${domain}\0`).update(String(DRIVER_STATE_KEY)).digest();
}

function decrypt(container, domain) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error('Encrypted state is not in the expected format.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(domain), Buffer.from(container.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ageMinutes(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return Infinity;
  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}

function freshness(value, limitMinutes) {
  const age = ageMinutes(value);
  if (!Number.isFinite(age)) return { ok: false, text: '❌ missing' };
  if (age <= limitMinutes) return { ok: true, text: `✅ ${age}m ago` };
  return { ok: false, text: `⚠️ ${age}m ago` };
}

function discordTimestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0 ? `<t:${Math.floor(time / 1000)}:R>` : 'unknown';
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function reportingStatus(statistics, monthlyReportState) {
  const history = Array.isArray(statistics?.history) ? statistics.history : [];
  const month = currentMonthKey();
  const monthDays = history.filter((day) => String(day?.date || '').startsWith(month));
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = history.find((day) => day?.date === today) || null;
  const hourlySamplesToday = Array.isArray(todayEntry?.sampledHours)
    ? todayEntry.sampledHours.length
    : number(todayEntry?.activitySamples);
  const latestPublished = Array.isArray(monthlyReportState?.publishedMonths) && monthlyReportState.publishedMonths.length
    ? monthlyReportState.publishedMonths[monthlyReportState.publishedMonths.length - 1]
    : null;

  return {
    retainedDays: history.length,
    currentMonthDays: monthDays.length,
    hourlySamplesToday,
    allTimePeak: number(statistics?.allTime?.peakOnline),
    latestPublishedMonth: latestPublished?.key || latestPublished?.month || null
  };
}

function recognitionStatus(milestones, achievements, awardsCatalog, fallbackMembers) {
  const members = number(milestones?.memberCountAtLastUpdate, fallbackMembers);
  let nextMilestone = null;
  for (let milestone = 150; milestone <= 1000; milestone += 50) {
    if (members < milestone) {
      nextMilestone = milestone;
      break;
    }
  }

  const counts = achievements?.counts && typeof achievements.counts === 'object'
    ? achievements.counts
    : {};
  const awardTypes = Array.isArray(awardsCatalog?.awards) ? awardsCatalog.awards.length : 0;

  return {
    members,
    reachedMilestones: Array.isArray(milestones?.reachedMilestones) ? milestones.reachedMilestones.length : 0,
    nextMilestone,
    remaining: nextMilestone ? Math.max(0, nextMilestone - members) : 0,
    trackedDrivers: number(achievements?.trackedCurrentDrivers),
    upcoming30Days: number(achievements?.upcoming30Days),
    counts: {
      oneMonth: number(counts['1m']),
      threeMonths: number(counts['3m']),
      sixMonths: number(counts['6m']),
      oneYear: number(counts['1y']),
      twoYears: number(counts['2y']),
      threeYears: number(counts['3y']),
      fourYears: number(counts['4y']),
      fiveYears: number(counts['5y'])
    },
    awardTypes
  };
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  if (method !== 'GET') {
    const messagePath = pathname.match(/^\/channels\/(\d+)\/messages(?:\/(\d+))?$/);
    const allowed = messagePath && resolvedWriteChannelId && messagePath[1] === String(resolvedWriteChannelId) &&
      (method === 'POST' || method === 'PATCH');
    if (!allowed) throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Management Overview/1.2'
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
    if (channel.guild_id && channel.guild_id !== DISCORD_GUILD_ID) {
      throw new Error(`Management channel ${MANAGEMENT_CHANNEL_ID} is not in the configured guild.`);
    }
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
  if (fuzzy.length === 1) {
    resolvedWriteChannelId = String(fuzzy[0].id);
    return fuzzy[0];
  }
  if (fuzzy.length > 1) throw new Error(`Multiple Management Overview channels found: ${fuzzy.map((c) => c.name).join(', ')}`);
  throw new Error(`Could not find Management Overview channel "${MANAGEMENT_CHANNEL_NAME}".`);
}

function loadHrState() {
  const container = readJson(HR_FILE, null);
  if (!container) return { updatedAt: null, reviews: [] };
  return decrypt(container, 'kings-hr-probation-v1');
}

async function getEventStatus() {
  const forum = await discord(`/channels/${CONVOY_FORUM_ID}`);
  const tagsById = new Map((forum.available_tags || []).map((tag) => [String(tag.id), String(tag.name || '')]));
  const active = await discord(`/guilds/${DISCORD_GUILD_ID}/threads/active`);
  const threads = (active?.threads || []).filter((thread) => String(thread.parent_id) === String(CONVOY_FORUM_ID));

  const counts = {
    active: threads.length,
    submitted: 0,
    needsInformation: 0,
    readyForApproval: 0,
    scheduled: 0,
    other: 0
  };

  for (const thread of threads) {
    const names = (thread.applied_tags || []).map((id) => tagsById.get(String(id)) || '').map((name) => name.toLowerCase());
    if (names.some((name) => name.includes('needs') && name.includes('information'))) counts.needsInformation++;
    else if (names.some((name) => name.includes('ready') && name.includes('approval'))) counts.readyForApproval++;
    else if (names.some((name) => name.includes('scheduled'))) counts.scheduled++;
    else if (names.some((name) => name.includes('submitted'))) counts.submitted++;
    else counts.other++;
  }

  return counts;
}

function buildEmbed(driver, live, statistics, hr, events, reports, recognition) {
  const activity = driver?.activity || {};
  const reviews = Array.isArray(hr?.reviews) ? hr.reviews : [];
  const openProbation = reviews.filter((review) => review.status === 'open').length;
  const extendedProbation = reviews.filter((review) => review.status === 'extended').length;
  const completedProbation = reviews.filter((review) => review.status === 'completed').length;

  const currentDrivers = number(driver?.currentDrivers, number(live?.members));
  const online = number(live?.online, number(driver?.onlineNow));
  const info = number(activity.info7Days);
  const attention = number(activity.attention14Days);
  const hrReview = number(activity.hrReview30Days);
  const approvedLeave = number(activity.approvedLeave);
  const grace = number(activity.grace);

  const managementAttention = attention + hrReview + openProbation + extendedProbation + events.needsInformation + events.readyForApproval;

  const liveFresh = freshness(live?.updatedAt, 20);
  const driverFresh = freshness(driver?.updatedAt, 120);
  const statsFresh = freshness(statistics?.updatedAt, 120);
  const hrFresh = freshness(hr?.updatedAt, 45);
  const healthySources = [liveFresh, driverFresh, statsFresh, hrFresh].filter((item) => item.ok).length;

  let overall = '✅ No current management attention flags';
  if (managementAttention > 0) overall = `⚠️ **${managementAttention}** item${managementAttention === 1 ? '' : 's'} currently need management/leadership attention`;

  const nextMilestoneText = recognition.nextMilestone
    ? `Next VTC Milestone: **${recognition.members}/${recognition.nextMilestone}** • **${recognition.remaining} remaining**`
    : `VTC Milestones: **all configured milestones up to 1,000 reached**`;

  return {
    title: OVERVIEW_TITLE,
    description: `${overall}\nAggregate leadership view only — detailed cases remain in their department channels.`,
    color: managementAttention > 0 ? 0xf0a500 : 0x182dff,
    fields: [
      {
        name: '🚛 Driver Management',
        value:
          `Current Drivers: **${currentDrivers}** • Online: **${online}**\n` +
          `Grace: **${grace}** • Info 7d: **${info}** • Attention 14d: **${attention}** • HR Review 30d: **${hrReview}**\n` +
          `Approved Leave: **${approvedLeave}** • Joined 30d: **${number(driver?.joinedLast30Days)}** • Left 30d: **${number(driver?.leftLast30Days)}**`,
        inline: false
      },
      {
        name: '👥 HR & Probation',
        value:
          `Open Reviews: **${openProbation}** • Extended: **${extendedProbation}** • Completed tracked: **${completedProbation}**\n` +
          `Driver HR Reviews (30d): **${hrReview}** • Approved Leave: **${approvedLeave}**`,
        inline: false
      },
      {
        name: '📅 Events / Convoys',
        value:
          `Active Threads: **${events.active}**\n` +
          `Submitted: **${events.submitted}** • Needs Information: **${events.needsInformation}** • Ready for Approval: **${events.readyForApproval}** • Scheduled: **${events.scheduled}**` +
          (events.other ? ` • Other: **${events.other}**` : ''),
        inline: false
      },
      {
        name: '📈 Statistics & Reporting',
        value:
          `Statistics History: **${reports.retainedDays} days** • Current Month: **${reports.currentMonthDays} recorded days**\n` +
          `Hourly Samples Today: **${reports.hourlySamplesToday}** • All-Time Tracked Peak: **${reports.allTimePeak}**\n` +
          `Latest Published Monthly Report: **${reports.latestPublishedMonth || 'none tracked yet'}** • Schedule: **1st of each month, 10:00 UTC**`,
        inline: false
      },
      {
        name: '👑 Milestones & Recognition',
        value:
          `${nextMilestoneText}\n` +
          `Loyalty: **1m ${recognition.counts.oneMonth}** • **3m ${recognition.counts.threeMonths}** • **6m ${recognition.counts.sixMonths}** • **1y ${recognition.counts.oneYear}**\n` +
          `Long-Term: **2y ${recognition.counts.twoYears}** • **3y ${recognition.counts.threeYears}** • **4y ${recognition.counts.fourYears}** • **5y ${recognition.counts.fiveYears}**\n` +
          `Upcoming Loyalty Achievements (30d): **${recognition.upcoming30Days}** • Manual Award Types: **${recognition.awardTypes}**\n` +
          `Awards remain **human Leadership decisions** — no automatic winner, role or permission changes.`,
        inline: false
      },
      {
        name: '🛡️ Staff Management',
        value: 'Staff Management automation is **not connected yet**. This section will become live when the Staff Management system is built.',
        inline: false
      },
      {
        name: '⚙️ System Health',
        value:
          `Healthy data sources: **${healthySources}/4**\n` +
          `Live Tracker: ${liveFresh.text} • Driver Management: ${driverFresh.text}\n` +
          `Statistics: ${statsFresh.text} • HR: ${hrFresh.text}`,
        inline: false
      },
      {
        name: '🕒 Data Updates',
        value:
          `Live: ${discordTimestamp(live?.updatedAt)} • Driver: ${discordTimestamp(driver?.updatedAt)}\n` +
          `Statistics: ${discordTimestamp(statistics?.updatedAt)} • HR: ${discordTimestamp(hr?.updatedAt)}`,
        inline: false
      }
    ],
    footer: {
      text: 'Kings Logistics • Management Control • Advisory only'
    },
    timestamp: new Date().toISOString()
  };
}

async function syncOverview(channel, embed) {
  const bot = await discord('/users/@me');
  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const existing = (messages || []).find((message) =>
    message.author?.id === bot.id &&
    (message.embeds || []).some((item) => item.title === OVERVIEW_TITLE)
  );

  const body = { embeds: [embed], allowed_mentions: { parse: [] } };
  if (existing) {
    await discord(`/channels/${channel.id}/messages/${existing.id}`, { method: 'PATCH', body });
    console.log(`Management Overview updated in #${channel.name}.`);
  } else {
    await discord(`/channels/${channel.id}/messages`, { method: 'POST', body });
    console.log(`Management Overview created in #${channel.name}.`);
  }
}

async function main() {
  const driver = readJson(DRIVER_SUMMARY_FILE, null);
  const live = readJson(LIVE_FILE, null);
  const statistics = readJson(STATISTICS_FILE, null);
  if (!driver) throw new Error('Driver Management summary is missing.');
  if (!live) throw new Error('Live Tracker snapshot is missing.');
  if (!statistics) throw new Error('Statistics data is missing.');

  const hr = loadHrState();
  const monthlyReportState = readJson(MONTHLY_REPORT_STATE_FILE, { publishedMonths: [] });
  const milestones = readJson(MILESTONE_FILE, { reachedMilestones: [] });
  const achievementSummary = readJson(ACHIEVEMENT_SUMMARY_FILE, { counts: {} });
  const awardsCatalog = readJson(AWARDS_CATALOG_FILE, { awards: [] });
  const reports = reportingStatus(statistics, monthlyReportState);
  const recognition = recognitionStatus(milestones, achievementSummary, awardsCatalog, number(driver.currentDrivers, number(live.members)));
  const channel = await resolveManagementChannel();
  const events = await getEventStatus();
  const embed = buildEmbed(driver, live, statistics, hr, events, reports, recognition);
  await syncOverview(channel, embed);

  console.log('Kings Management Overview synchronized successfully.');
  console.log(`Drivers: ${number(driver.currentDrivers)}`);
  console.log(`Event Threads: ${events.active}`);
  console.log(`Open HR Reviews: ${(hr.reviews || []).filter((r) => r.status === 'open').length}`);
  console.log(`Statistics history days: ${reports.retainedDays}`);
  console.log(`Current month recorded days: ${reports.currentMonthDays}`);
  console.log(`Next member milestone: ${recognition.nextMilestone || 'all configured reached'} (${recognition.remaining} remaining)`);
  console.log(`Loyalty achievements upcoming in 30 days: ${recognition.upcoming30Days}`);
  console.log(`Manual award types configured: ${recognition.awardTypes}`);
  console.log('Safety: Aggregate/read-only management reporting. No personnel actions or automatic award decisions are implemented.');
}

main().catch((error) => {
  console.error('Kings Management Overview failed:', error.message);
  process.exit(1);
});
