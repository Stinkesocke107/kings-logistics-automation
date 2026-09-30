require('./kings-branding').installDiscordBranding();
const fs = require('fs');
const path = require('path');

const WEBHOOK_URL = process.env.MONTHLY_REPORT_DISCORD_WEBHOOK_URL || null;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const NEWS_ROLE_ID = process.env.NEWS_NOTIFICATIONS_ROLE_ID || null;
const PREVIEW_MODE = String(process.env.MONTHLY_REPORT_PREVIEW || '').toLowerCase() === 'true';

const DATA_DIR = path.join(__dirname, 'data');
const STATISTICS_FILE = path.join(DATA_DIR, 'statistics.json');
const DRIVER_HISTORY_FILE = path.join(DATA_DIR, 'driver-history.json');
const CHANGELOG_QUEUE_FILE = path.join(DATA_DIR, 'changelog-queue.json');
const CHANGELOG_HISTORY_FILE = path.join(DATA_DIR, 'changelog-history.json');
const STATE_FILE = path.join(DATA_DIR, 'monthly-report-state.json');

const DISCORD_API = 'https://discord.com/api/v10';
const REQUEST_TIMEOUT_MS = 15000;

function nowISO() {
  return new Date().toISOString();
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.warn(`Could not read ${path.basename(file)}: ${error.message}`);
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSigned(value) {
  const parsed = number(value);
  return parsed > 0 ? `+${parsed}` : String(parsed);
}

function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function monthName(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonth() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  return { start, end, key: monthKey(start), label: monthName(start) };
}

function getPreviewMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end: now, key: 'preview', label: `${monthName(start)} • Preview` };
}

function eachUtcDate(period) {
  const dates = [];
  for (let t = period.start.getTime(); t < period.end.getTime(); t += 86400000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

function loadStatistics() {
  const raw = readJson(STATISTICS_FILE, null);
  if (!raw) throw new Error('Statistics data does not exist.');
  const history = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.history)
      ? raw.history
      : Array.isArray(raw.days)
        ? raw.days
        : [];
  return history
    .filter((day) => day && /^\d{4}-\d{2}-\d{2}$/.test(String(day.date || '')))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getMonthStatistics(history, period) {
  return history.filter((day) => {
    const date = normalizeDate(`${day.date}T00:00:00.000Z`);
    return Boolean(date && date >= period.start && date < period.end);
  });
}

function verifyCalendarCoverage(days, period) {
  const expectedDates = eachUtcDate(period);
  const observedDates = new Set(days.map((day) => String(day.date)));
  const missingDates = expectedDates.filter((date) => !observedDates.has(date));
  return {
    complete: missingDates.length === 0 && observedDates.size >= expectedDates.length,
    expectedDays: expectedDates.length,
    recordedDays: observedDates.size,
    missingDates
  };
}

function buildStatistics(days) {
  if (!days.length) return null;
  const first = days[0];
  const last = days[days.length - 1];
  const startMembers = number(first.startMembers, first.members);
  const endMembers = number(last.members, startMembers);
  return {
    recordedDays: days.length,
    firstRecordedDate: first.date,
    lastRecordedDate: last.date,
    startMembers,
    endMembers,
    growth: endMembers - startMembers,
    peakOnline: Math.max(0, ...days.map((day) => number(day.peakOnline))),
    peakETS2: Math.max(0, ...days.map((day) => number(day.peakETS2))),
    peakATS: Math.max(0, ...days.map((day) => number(day.peakATS)))
  };
}

function buildActivityAnalytics(days) {
  let ets2Samples = 0;
  let atsSamples = 0;
  let sampleCount = 0;
  const serverSamples = {};

  for (const day of days) {
    ets2Samples += number(day.ets2PlayerSamples);
    atsSamples += number(day.atsPlayerSamples);
    sampleCount += number(day.activitySamples);
    const servers = day.serverPlayerSamples && typeof day.serverPlayerSamples === 'object'
      ? day.serverPlayerSamples
      : {};
    for (const [server, count] of Object.entries(servers)) {
      serverSamples[server] = number(serverSamples[server]) + number(count);
    }
  }

  const totalActivity = ets2Samples + atsSamples;
  const ranking = Object.entries(serverSamples)
    .map(([server, count]) => ({ server, count: number(count) }))
    .sort((a, b) => b.count - a.count || a.server.localeCompare(b.server));
  const mostUsed = ranking[0] || null;

  return {
    sampleCount,
    totalActivity,
    ets2Samples,
    atsSamples,
    ets2Percent: percent(ets2Samples, totalActivity),
    atsPercent: percent(atsSamples, totalActivity),
    mostUsedServer: mostUsed?.server || null,
    mostUsedPercent: mostUsed ? percent(mostUsed.count, totalActivity) : 0
  };
}

function loadDriverHistory() {
  const history = readJson(DRIVER_HISTORY_FILE, null);
  return history && Array.isArray(history.events) ? history : null;
}

function getDriverMovement(history, period) {
  const initializedAt = normalizeDate(history?.initializedAt);
  const complete = Boolean(initializedAt && initializedAt <= period.start);
  if (!complete) {
    return {
      complete: false,
      initializedAt: initializedAt?.toISOString() || null,
      joined: null,
      left: null,
      net: null,
      nameChanges: null
    };
  }

  let joined = 0;
  let left = 0;
  let nameChanges = 0;
  for (const event of history.events) {
    const date = normalizeDate(event.occurredAt || event.detectedAt);
    if (!date || date < period.start || date >= period.end) continue;
    if (event.type === 'join') joined++;
    if (event.type === 'leave') left++;
    if (event.type === 'name_change') nameChanges++;
  }
  return { complete: true, initializedAt: initializedAt.toISOString(), joined, left, net: joined - left, nameChanges };
}

function collectMilestoneObjects(value, results = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectMilestoneObjects(item, results);
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  if (typeof value.source === 'string' && /^milestone-\d+$/.test(value.source)) results.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectMilestoneObjects(child, results);
  }
  return results;
}

function getMilestones(period) {
  const queue = readJson(CHANGELOG_QUEUE_FILE, []);
  const history = readJson(CHANGELOG_HISTORY_FILE, []);
  const unique = new Map();
  for (const item of [
    ...collectMilestoneObjects(queue),
    ...collectMilestoneObjects(history)
  ]) {
    const date = normalizeDate(item.addedAt);
    if (!date || date < period.start || date >= period.end) continue;
    const match = String(item.source).match(/^milestone-(\d+)$/);
    if (match) unique.set(item.source, Number(match[1]));
  }
  return [...unique.values()].sort((a, b) => a - b);
}

function loadReportState() {
  const state = readJson(STATE_FILE, null);
  if (!state || !Array.isArray(state.publishedMonths)) {
    return { version: 2, createdAt: nowISO(), updatedAt: nowISO(), publishedMonths: [] };
  }
  state.version = 2;
  return state;
}

function saveReportState(state) {
  state.version = 2;
  state.updatedAt = nowISO();
  if (state.publishedMonths.length > 60) state.publishedMonths = state.publishedMonths.slice(-60);
  writeJson(STATE_FILE, state);
}

function reportMarker(period) {
  return `Kings Logistics — ${period.label} Monthly Report`;
}

function buildReport(period, statistics, activity, movement, milestones) {
  const lines = [];
  if (!PREVIEW_MODE && NEWS_ROLE_ID) lines.push(`<@&${NEWS_ROLE_ID}>`, '');
  lines.push(`👑📊 **${reportMarker(period)}**`, '');
  if (PREVIEW_MODE) lines.push('**PREVIEW — this is not an official monthly publication.**', '');
  lines.push('Another month of Kings Logistics activity, growth and community is behind us. Here is the monthly overview.', '');
  lines.push('**Members**');
  lines.push(`Start of Month: **${statistics.startMembers}**`);
  lines.push(`End of Month: **${statistics.endMembers}**`);
  lines.push(`Monthly Growth: **${formatSigned(statistics.growth)}**`, '');
  lines.push('**Driver Movement**');
  if (movement.complete) {
    lines.push(`Joined: **${movement.joined}**`);
    lines.push(`Left: **${movement.left}**`);
    lines.push(`Net Growth: **${formatSigned(movement.net)}**`);
    lines.push(`Name Changes: **${movement.nameChanges}**`);
  } else {
    lines.push('*Driver History did not cover the complete month, so monthly movement totals are intentionally omitted.*');
  }
  lines.push('', '**TruckersMP Activity**');
  lines.push(`Highest Online: **${statistics.peakOnline}**`);
  lines.push(`ETS2 Peak: **${statistics.peakETS2}**`);
  lines.push(`ATS Peak: **${statistics.peakATS}**`);
  if (activity.totalActivity > 0) {
    lines.push(`Activity Distribution: **ETS2 ${activity.ets2Percent}% • ATS ${activity.atsPercent}%**`);
    if (activity.mostUsedServer) lines.push(`Most Used Server: **${activity.mostUsedServer}** (${activity.mostUsedPercent}%)`);
  }
  lines.push('', '**Milestones**');
  if (!milestones.length) lines.push('No new 50-member milestone was reached this month.');
  else for (const milestone of milestones) lines.push(`👑 **${milestone} TruckersMP Members reached**`);
  lines.push('', 'Thank you to everyone who continues to be part of the Kings Family and contributes to Kings Logistics.', '');
  lines.push('*Kings Logistics — Connecting the world, creating friendships.*');
  return lines.join('\n');
}

function webhookBaseUrl() {
  if (!WEBHOOK_URL) return null;
  const url = new URL(WEBHOOK_URL);
  url.searchParams.delete('wait');
  return url;
}

async function fetchWebhookMetadata() {
  if (!WEBHOOK_URL) throw new Error('MONTHLY_REPORT_DISCORD_WEBHOOK_URL is missing.');
  const url = webhookBaseUrl();
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'Kings Logistics Monthly Report/2.0' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Monthly Report webhook metadata failed: HTTP ${response.status} - ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function discordGet(pathname) {
  if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing for Monthly Report duplicate protection.');
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'User-Agent': 'Kings Logistics Monthly Report/2.0'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status} on GET ${pathname}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function findExistingDiscordReport(period) {
  const webhook = await fetchWebhookMetadata();
  if (!webhook?.id) throw new Error('Monthly Report webhook metadata did not include a webhook ID.');
  const configured = new URL(WEBHOOK_URL);
  const targetChannelId = configured.searchParams.get('thread_id') || webhook.channel_id;
  if (!targetChannelId) throw new Error('Monthly Report webhook target channel could not be resolved.');

  const messages = await discordGet(`/channels/${targetChannelId}/messages?limit=100`);
  const marker = reportMarker(period);
  const existing = (Array.isArray(messages) ? messages : []).find((message) =>
    String(message.webhook_id || '') === String(webhook.id) &&
    String(message.content || '').includes(marker) &&
    !String(message.content || '').includes('PREVIEW')
  ) || null;

  return { webhook, targetChannelId: String(targetChannelId), existing };
}

async function sendReport(content) {
  if (!WEBHOOK_URL) throw new Error('MONTHLY_REPORT_DISCORD_WEBHOOK_URL is missing.');
  if (content.length > 2000) throw new Error(`Monthly Report is too long for Discord: ${content.length} characters.`);

  const url = new URL(WEBHOOK_URL);
  url.searchParams.set('wait', 'true');
  const payload = {
    content,
    allowed_mentions: !PREVIEW_MODE && NEWS_ROLE_ID
      ? { parse: [], roles: [NEWS_ROLE_ID] }
      : { parse: [] }
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Monthly Report Discord webhook failed: HTTP ${response.status} - ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function makeStateEntry(period, statistics, activity, movement, milestones, discord, extra = {}) {
  return {
    key: period.key,
    month: period.label,
    publishedAt: nowISO(),
    startMembers: statistics.startMembers,
    endMembers: statistics.endMembers,
    growth: statistics.growth,
    joined: movement.complete ? movement.joined : null,
    left: movement.complete ? movement.left : null,
    netDriverGrowth: movement.complete ? movement.net : null,
    nameChanges: movement.complete ? movement.nameChanges : null,
    driverHistoryComplete: movement.complete,
    driverHistoryInitializedAt: movement.initializedAt,
    peakOnline: statistics.peakOnline,
    peakETS2: statistics.peakETS2,
    peakATS: statistics.peakATS,
    mostUsedServer: activity.mostUsedServer,
    milestones,
    discordMessageId: discord?.id || null,
    discordChannelId: discord?.channel_id || null,
    ...extra
  };
}

async function createMonthlyReport() {
  const period = PREVIEW_MODE ? getPreviewMonth() : getPreviousMonth();
  console.log(`Preparing Monthly Report for ${period.label}...`);
  if (PREVIEW_MODE) console.log('Preview mode enabled.');

  const history = loadStatistics();
  const monthDays = getMonthStatistics(history, period);
  if (!monthDays.length) {
    console.log(`No Statistics data exists for ${period.label}. No Monthly Report will be posted.`);
    return;
  }

  if (!PREVIEW_MODE) {
    const coverage = verifyCalendarCoverage(monthDays, period);
    console.log(`Calendar coverage: ${coverage.recordedDays}/${coverage.expectedDays} days.`);
    if (!coverage.complete) {
      console.log(`Missing dates: ${coverage.missingDates.join(', ') || 'unknown'}`);
      console.log('No Monthly Report will be posted.');
      return;
    }
  }

  const reportState = loadReportState();
  if (!PREVIEW_MODE && reportState.publishedMonths.some((item) => item.key === period.key)) {
    console.log(`${period.label} Monthly Report was already published. No duplicate Monthly Report will be posted.`);
    return;
  }

  const statistics = buildStatistics(monthDays);
  const activity = buildActivityAnalytics(monthDays);
  const movement = getDriverMovement(loadDriverHistory(), period);
  const milestones = getMilestones(period);
  const content = buildReport(period, statistics, activity, movement, milestones);
  if (content.length > 2000) throw new Error(`Monthly Report is too long for Discord: ${content.length} characters.`);

  console.log(`Recorded days: ${statistics.recordedDays}`);
  console.log(`Members: ${statistics.startMembers} -> ${statistics.endMembers}`);
  console.log(`Growth: ${formatSigned(statistics.growth)}`);
  console.log(`Peak Online: ${statistics.peakOnline}`);
  console.log(`Driver Movement complete: ${movement.complete}`);
  console.log(`Milestones: ${milestones.length ? milestones.join(', ') : 'none'}`);

  if (!PREVIEW_MODE) {
    const discordState = await findExistingDiscordReport(period);
    if (discordState.existing) {
      console.log(`Existing Discord Monthly Report found (${discordState.existing.id}). Reconstructing missing publication state without reposting.`);
      reportState.publishedMonths.push(makeStateEntry(
        period,
        statistics,
        activity,
        movement,
        milestones,
        discordState.existing,
        { recoveredFromDiscord: true }
      ));
      saveReportState(reportState);
      console.log('Monthly Report state recovered successfully.');
      return;
    }
  }

  const sent = await sendReport(content);
  if (PREVIEW_MODE) {
    console.log('Monthly Report PREVIEW sent successfully. No publication state was changed.');
    return;
  }

  reportState.publishedMonths.push(makeStateEntry(period, statistics, activity, movement, milestones, sent));
  saveReportState(reportState);
  console.log(`${period.label} Monthly Report published successfully.`);
}

createMonthlyReport().then(() => {
  console.log('Kings Monthly Report process completed successfully.');
}).catch((error) => {
  console.error('Kings Monthly Report failed:', error.message);
  process.exit(1);
});
