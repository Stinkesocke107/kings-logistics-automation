require('./kings-branding').installDiscordBranding();

const fs = require('fs');
const path = require('path');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_ID = process.env.DISCORD_EVENT_LEADERSHIP_CHANNEL_ID || null;
const CHANNEL_NAME = process.env.DISCORD_EVENT_LEADERSHIP_CHANNEL_NAME || 'event-leadership';
const REPORT_MODE = String(process.env.EVENT_LEADERSHIP_REPORT_MODE || 'daily').trim().toLowerCase();
const PREVIEW = /^(?:1|true|yes|on)$/i.test(process.env.EVENT_LEADERSHIP_REPORT_PREVIEW || '');

const REPORT_PATH = 'output/convoy-check-results.json';
const OVERVIEW_PATH = 'output/convoy-overview.json';
const STATE_PATH = path.join(__dirname, 'data', 'event-leadership-report-state.json');
const DISCORD_API = 'https://discord.com/api/v10';
const DAY_MS = 86400000;

if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Invalid JSON in ${file}: ${error.message}`); }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function isTestThread(item) {
  if (typeof item?.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item?.name || '');
}

function realThreads(report) {
  return (report?.threads || []).filter((item) =>
    !item.ignored && !item.error && !isTestThread(item)
  );
}

function snapshotOf(report) {
  return realThreads(report)
    .map((item) => ({
      threadId: String(item.threadId || ''),
      name: String(item.name || 'Unknown Event'),
      eventId: item.eventId ? String(item.eventId) : null,
      status: item.status || 'Unknown',
      eventDate: item.validation?.parsed?.eventDate || null,
      meetupTime: item.validation?.parsed?.meetupTime || null,
      responsibleStaff: item.validation?.parsed?.responsibleStaff || null,
      kingsSlot: item.validation?.parsed?.kingsSlot || null,
      missing: [...(item.validation?.missing || [])].sort(),
      duplicateEventId: Boolean(item.duplicateEventId),
      archived: Boolean(item.archived),
      eventUnix: Number(item.eventUnix || 0) || null
    }))
    .filter((item) => item.threadId)
    .sort((a, b) => a.threadId.localeCompare(b.threadId));
}

function sameArray(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  return aa.length === bb.length && aa.every((value, index) => value === bb[index]);
}

function diffSnapshots(previous, current, at = nowISO()) {
  const oldMap = new Map((previous || []).map((item) => [String(item.threadId), item]));
  const newMap = new Map((current || []).map((item) => [String(item.threadId), item]));
  const changes = [];

  for (const item of current || []) {
    const old = oldMap.get(String(item.threadId));
    if (!old) {
      changes.push({ type: 'event_added', at, threadId: item.threadId, name: item.name, current: item });
      continue;
    }

    const fields = [];
    if (old.status !== item.status) fields.push('status');
    if (old.eventDate !== item.eventDate) fields.push('eventDate');
    if (old.meetupTime !== item.meetupTime) fields.push('meetupTime');
    if (old.responsibleStaff !== item.responsibleStaff) fields.push('responsibleStaff');
    if (old.kingsSlot !== item.kingsSlot) fields.push('kingsSlot');
    if (old.eventId !== item.eventId) fields.push('eventId');
    if (old.duplicateEventId !== item.duplicateEventId) fields.push('duplicateEventId');
    if (!sameArray(old.missing, item.missing)) fields.push('missingInformation');

    if (fields.length) {
      changes.push({
        type: 'event_changed',
        at,
        threadId: item.threadId,
        name: item.name,
        fields,
        previous: old,
        current: item
      });
    }
  }

  for (const old of previous || []) {
    if (!newMap.has(String(old.threadId))) {
      changes.push({ type: 'event_removed', at, threadId: old.threadId, name: old.name, previous: old });
    }
  }

  return changes;
}

function defaultState() {
  return {
    version: 1,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    lastSnapshot: null,
    changeLog: [],
    publishedDailyKeys: [],
    publishedWeeklyKeys: [],
    publishedMonthlyKeys: [],
    weeklyReports: [],
    monthlyReports: []
  };
}

function loadState() {
  const state = readJson(STATE_PATH, null);
  if (!state) return defaultState();
  const base = defaultState();
  return {
    ...base,
    ...state,
    changeLog: Array.isArray(state.changeLog) ? state.changeLog : [],
    publishedDailyKeys: Array.isArray(state.publishedDailyKeys) ? state.publishedDailyKeys : [],
    publishedWeeklyKeys: Array.isArray(state.publishedWeeklyKeys) ? state.publishedWeeklyKeys : [],
    publishedMonthlyKeys: Array.isArray(state.publishedMonthlyKeys) ? state.publishedMonthlyKeys : [],
    weeklyReports: Array.isArray(state.weeklyReports) ? state.weeklyReports : [],
    monthlyReports: Array.isArray(state.monthlyReports) ? state.monthlyReports : []
  };
}

function saveState(state) {
  const cutoff = Date.now() - 400 * DAY_MS;
  state.updatedAt = nowISO();
  state.changeLog = (state.changeLog || []).filter((item) => {
    const time = new Date(item.at || 0).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
  state.publishedDailyKeys = state.publishedDailyKeys.slice(-60);
  state.publishedWeeklyKeys = state.publishedWeeklyKeys.slice(-104);
  state.publishedMonthlyKeys = state.publishedMonthlyKeys.slice(-36);
  state.weeklyReports = state.weeklyReports.slice(-104);
  state.monthlyReports = state.monthlyReports.slice(-24);
  writeJson(STATE_PATH, state);
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function truncate(value, max = 48) {
  const text = String(value || 'Unknown Event');
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

function changeLine(change) {
  const name = `**${escapeMarkdown(truncate(change.name))}**`;
  if (change.type === 'event_added') {
    return `➕ ${name} — added · ${change.current?.status || 'Unknown'}`;
  }
  if (change.type === 'event_removed') {
    return `➖ ${name} — removed from tracked Event Center snapshot`;
  }
  const fields = (change.fields || []).join(', ');
  return `🔄 ${name} — changed: ${fields || 'event data'}`;
}

function compactChanges(changes, limit = 8) {
  if (!changes.length) return ['• None'];
  const lines = changes.slice(0, limit).map((change) => `• ${changeLine(change)}`);
  if (changes.length > limit) lines.push(`• +${changes.length - limit} more`);
  return lines;
}

function operationalSnapshot(report, overview) {
  const real = realThreads(report);
  const count = (status) => real.filter((item) => item.status === status).length;
  const now = Math.floor(Date.now() / 1000);
  const overdue = real.filter((item) =>
    item.status === 'Scheduled' &&
    Number(item.eventUnix || 0) > 0 &&
    Number(item.eventUnix) < now - 3 * 60 * 60
  ).length;

  return {
    realConvoys: real.length,
    scheduled: count('Scheduled'),
    ready: count('Ready for Approval'),
    needsInfo: count('Needs Information'),
    submitted: count('Submitted'),
    duplicateEventIds: Number(report?.summary?.duplicateEventIds || 0),
    overdueFinalStatus: overdue,
    upcoming: Array.isArray(overview?.upcomingConvoys) ? overview.upcomingConvoys : []
  };
}

function buildDailyMessage(changes, snapshot, end = new Date()) {
  const added = changes.filter((item) => item.type === 'event_added').length;
  const updated = changes.filter((item) => item.type === 'event_changed').length;
  const removed = changes.filter((item) => item.type === 'event_removed').length;
  const unix = Math.floor(end.getTime() / 1000);

  return [
    '🟢 **Kings Event Leadership — Daily Changes**',
    `**Window:** since previous Event snapshot · updated <t:${unix}:f>`,
    '',
    `➕ Added: **${added}** · 🔄 Updated: **${updated}** · ➖ Removed: **${removed}**`,
    '',
    '### Event Changes',
    ...compactChanges(changes),
    '',
    '### 📊 Current Event Snapshot',
    `Real Convoys: **${snapshot.realConvoys}** · Scheduled: **${snapshot.scheduled}** · Ready: **${snapshot.ready}** · Needs Info: **${snapshot.needsInfo}**`,
    `Duplicate IDs: **${snapshot.duplicateEventIds}** · Awaiting Final Status: **${snapshot.overdueFinalStatus}** · Upcoming Scheduled: **${snapshot.upcoming.length}**`,
    '',
    '🛡️ **Operational information only:** Event Leadership remains responsible for approvals and final decisions.'
  ].join('\n');
}

function previousCompletedWeek(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const end = new Date(today.getTime() - daysSinceMonday * DAY_MS);
  const start = new Date(end.getTime() - 7 * DAY_MS);
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

function changesInPeriod(state, period) {
  return (state.changeLog || []).filter((item) => {
    const time = new Date(item.at || 0).getTime();
    return Number.isFinite(time) && time >= period.start.getTime() && time < period.end.getTime();
  });
}

function nextWithin(snapshot, days = 14, now = Date.now()) {
  const limit = now + days * DAY_MS;
  return (snapshot.upcoming || [])
    .filter((item) => {
      const time = Number(item.eventUnix || 0) * 1000;
      return Number.isFinite(time) && time >= now && time <= limit;
    })
    .slice(0, 6);
}

function buildWeeklyMessage(period, changes, snapshot, previous = null) {
  const upcoming = nextWithin(snapshot, 14);
  const comparison = previous
    ? [
        '',
        '### 📈 Compared with Previous Week',
        `Tracked Convoys: **${snapshot.realConvoys - Number(previous.realConvoys || 0) >= 0 ? '+' : ''}${snapshot.realConvoys - Number(previous.realConvoys || 0)}** · Needs Info: **${snapshot.needsInfo - Number(previous.needsInfo || 0) >= 0 ? '+' : ''}${snapshot.needsInfo - Number(previous.needsInfo || 0)}**`
      ]
    : [];

  return [
    '🟣 **Kings Event Leadership — Weekly Review**',
    `**Period:** ${period.label}`,
    '',
    '### 📊 Current Operations',
    `Real Convoys: **${snapshot.realConvoys}** · Scheduled: **${snapshot.scheduled}** · Ready: **${snapshot.ready}** · Needs Info: **${snapshot.needsInfo}**`,
    `Awaiting Final Status: **${snapshot.overdueFinalStatus}** · Duplicate Event IDs: **${snapshot.duplicateEventIds}**`,
    '',
    '### 🔄 Changes Recorded This Week',
    ...compactChanges(changes),
    '',
    '### 🗓️ Next 14 Days',
    ...(upcoming.length
      ? upcoming.map((event) => {
          const unix = Number(event.eventUnix || 0);
          return `• <t:${unix}:d> · **${escapeMarkdown(truncate(event.name))}** · ${event.kingsSlot || 'No slot'}`;
        })
      : ['• No confirmed scheduled convoy in the next 14 days.']),
    ...comparison,
    '',
    '🛡️ **Operational information only:** No Event approval or personnel action is performed automatically.'
  ].join('\n');
}

function monthStats(overview, key) {
  const value = overview?.months?.[key] || {};
  return {
    counted: Number(value.countedConvoys || 0),
    scheduled: Number(value.scheduled || 0),
    completed: Number(value.completed || 0),
    cancelled: Number(value.cancelled || 0),
    needsInfo: Number(value.needsInformation || 0),
    ready: Number(value.readyForApproval || 0)
  };
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function buildMonthlyMessage(period, stats, changes, snapshot, previous = null) {
  const comparison = previous
    ? [
        '',
        '### 📈 Compared with Previous Report',
        `Tracked/Counted: **${signed(stats.counted - Number(previous.counted || 0))}** · Completed: **${signed(stats.completed - Number(previous.completed || 0))}** · Cancelled: **${signed(stats.cancelled - Number(previous.cancelled || 0))}**`
      ]
    : [];

  return [
    '👑 **Kings Event Leadership — Monthly Report**',
    `**Month:** ${period.label}`,
    '',
    '### 🚚 Event Operations',
    `Counted Convoys: **${stats.counted}** · Completed: **${stats.completed}** · Cancelled: **${stats.cancelled}**`,
    `Scheduled: **${stats.scheduled}** · Ready for Approval: **${stats.ready}** · Needs Information: **${stats.needsInfo}**`,
    '',
    '### 🔄 Recorded Event Changes',
    `Changes recorded by Leadership reporting: **${changes.length}**`,
    ...compactChanges(changes, 6),
    '',
    '### 📊 Current Pipeline',
    `Real Convoys: **${snapshot.realConvoys}** · Upcoming Scheduled: **${snapshot.upcoming.length}** · Awaiting Final Status: **${snapshot.overdueFinalStatus}**`,
    ...comparison,
    '',
    'ℹ️ This is the **internal Event Operations report**. Verified Kings convoy attendance statistics remain a separate Convoy History dataset.',
    '🛡️ No approvals or Event decisions are made automatically.'
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
    'User-Agent': 'Kings Logistics Event Leadership Reports/1.0'
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
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-');
}

async function resolveChannel() {
  if (CHANNEL_ID) {
    const channel = await discord(`/channels/${CHANNEL_ID}`);
    if (channel.guild_id && String(channel.guild_id) !== String(DISCORD_GUILD_ID)) {
      throw new Error('Configured Event Leadership channel is not in the configured guild.');
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const text = (channels || []).filter((channel) => [0, 5].includes(Number(channel.type)));
  const wanted = normalizeChannelName(CHANNEL_NAME);
  const exact = text.find((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact) return exact;
  const fuzzy = text.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('event') && name.includes('leadership');
  });
  if (fuzzy.length === 1) return fuzzy[0];
  throw new Error(`Could not uniquely find Event Leadership channel "${CHANNEL_NAME}".`);
}

async function post(channel, content) {
  if (content.length > 1950) throw new Error(`Event Leadership report exceeds safe Discord length: ${content.length}`);
  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: { content, flags: 4, allowed_mentions: { parse: [] } }
  });
}

async function runDaily(report, overview, state) {
  const key = new Date().toISOString().slice(0, 10);
  if (!PREVIEW && state.publishedDailyKeys.includes(key)) {
    console.log(`Event Daily Changes ${key} already processed.`);
    return;
  }

  const current = snapshotOf(report);
  if (!Array.isArray(state.lastSnapshot)) {
    console.log('Event Daily Changes baseline initialized; no historical changes were posted.');
    if (!PREVIEW) {
      state.lastSnapshot = current;
      state.publishedDailyKeys.push(key);
      saveState(state);
    }
    return;
  }

  const changes = diffSnapshots(state.lastSnapshot, current);
  const snapshot = operationalSnapshot(report, overview);

  if (!PREVIEW) {
    state.lastSnapshot = current;
    state.changeLog.push(...changes);
    state.publishedDailyKeys.push(key);
  }

  if (!changes.length) {
    console.log('Event Daily Changes: no meaningful changes; no Discord message sent.');
    if (!PREVIEW) saveState(state);
    return;
  }

  const channel = await resolveChannel();
  const content = buildDailyMessage(changes, snapshot);
  if (PREVIEW) {
    console.log(`PREVIEW Event Daily Changes for #${channel.name}:\n${content}`);
    return;
  }

  await post(channel, content);
  saveState(state);
  console.log(`Event Daily Changes ${key} published to #${channel.name}.`);
}

async function runWeekly(report, overview, state) {
  const period = previousCompletedWeek();
  if (!PREVIEW && state.publishedWeeklyKeys.includes(period.key)) {
    console.log(`Event Weekly Review ${period.key} already published.`);
    return;
  }

  const changes = changesInPeriod(state, period);
  const snapshot = operationalSnapshot(report, overview);
  const previous = state.weeklyReports.at(-1) || null;
  const content = buildWeeklyMessage(period, changes, snapshot, previous);
  const channel = await resolveChannel();

  if (PREVIEW) {
    console.log(`PREVIEW Event Weekly Review for #${channel.name}:\n${content}`);
    return;
  }

  await post(channel, content);
  state.publishedWeeklyKeys.push(period.key);
  state.weeklyReports.push({
    key: period.key,
    publishedAt: nowISO(),
    realConvoys: snapshot.realConvoys,
    scheduled: snapshot.scheduled,
    ready: snapshot.ready,
    needsInfo: snapshot.needsInfo,
    changes: changes.length
  });
  saveState(state);
  console.log(`Event Weekly Review ${period.key} published to #${channel.name}.`);
}

async function runMonthly(report, overview, state) {
  const period = previousCompletedMonth();
  if (!PREVIEW && state.publishedMonthlyKeys.includes(period.key)) {
    console.log(`Event Monthly Report ${period.key} already published.`);
    return;
  }

  const stats = monthStats(overview, period.key);
  const changes = changesInPeriod(state, period);
  const snapshot = operationalSnapshot(report, overview);
  const previous = state.monthlyReports.at(-1) || null;
  const content = buildMonthlyMessage(period, stats, changes, snapshot, previous);
  const channel = await resolveChannel();

  if (PREVIEW) {
    console.log(`PREVIEW Event Monthly Report for #${channel.name}:\n${content}`);
    return;
  }

  await post(channel, content);
  state.publishedMonthlyKeys.push(period.key);
  state.monthlyReports.push({
    key: period.key,
    publishedAt: nowISO(),
    ...stats,
    changes: changes.length,
    realConvoys: snapshot.realConvoys
  });
  saveState(state);
  console.log(`Event Monthly Report ${period.key} published to #${channel.name}.`);
}

async function main() {
  const report = readJson(REPORT_PATH, null);
  const overview = readJson(OVERVIEW_PATH, null);
  if (!report || !overview) throw new Error('Fresh convoy report/overview is missing.');

  const state = loadState();

  if (REPORT_MODE === 'daily') return runDaily(report, overview, state);
  if (REPORT_MODE === 'weekly') return runWeekly(report, overview, state);
  if (REPORT_MODE === 'monthly') return runMonthly(report, overview, state);

  throw new Error(`Unsupported EVENT_LEADERSHIP_REPORT_MODE: ${REPORT_MODE}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Kings Event Leadership Reports failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  snapshotOf,
  diffSnapshots,
  operationalSnapshot,
  previousCompletedWeek,
  previousCompletedMonth,
  monthStats,
  buildDailyMessage,
  buildWeeklyMessage,
  buildMonthlyMessage
};
