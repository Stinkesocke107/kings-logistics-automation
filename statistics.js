const fs = require('fs');
const path = require('path');

const KINGS_BLUE = 0x182dff;
const HISTORY_RETENTION_DAYS = 730;
const MAX_SNAPSHOT_AGE_MINUTES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const STATS_DISCORD_WEBHOOK_URL = process.env.STATS_DISCORD_WEBHOOK_URL || null;
const STATE_FILE = path.join(__dirname, 'data', 'statistics.json');
const LIVE_SNAPSHOT_FILE = path.join(__dirname, 'data', 'live-tracker-snapshot.json');
const DRIVER_HISTORY_FILE = path.join(__dirname, 'data', 'driver-history.json');

if (!STATS_DISCORD_WEBHOOK_URL) {
  console.error('STATS_DISCORD_WEBHOOK_URL is missing.');
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
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function dateKey(date) { return date.toISOString().slice(0, 10); }
function startOfDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function startOfWeek(date = new Date()) {
  const day = startOfDay(date);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * DAY_MS);
}
function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function hourKey(date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()
  )).toISOString();
}
function formatSigned(value) {
  const parsed = number(value);
  return parsed > 0 ? `+${parsed}` : String(parsed);
}
function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
function progressBar(value) {
  const safe = Math.max(0, Math.min(100, value));
  const filled = Math.round(safe / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

function loadLiveSnapshot() {
  const snapshot = readJson(LIVE_SNAPSHOT_FILE, null);
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Kings Live Tracker snapshot does not exist.');

  const updatedAt = normalizeDate(snapshot.updatedAt);
  if (!updatedAt) throw new Error('Kings Live Tracker snapshot has no valid updatedAt timestamp.');

  const ageMs = Date.now() - updatedAt.getTime();
  if (ageMs > MAX_SNAPSHOT_AGE_MINUTES * 60 * 1000) {
    throw new Error(`Kings Live Tracker snapshot is too old (${Math.floor(ageMs / 60000)} minutes).`);
  }

  const serverCounts = (Array.isArray(snapshot.activeServers) ? snapshot.activeServers : [])
    .map((server) => ({
      key: `${String(server.game || 'Unknown').toUpperCase()} — ${String(server.name || 'Unknown Server')}`,
      count: number(server.online)
    }))
    .filter((server) => server.count > 0);

  return {
    updatedAt,
    members: number(snapshot.members),
    activity: {
      totalOnline: number(snapshot.online),
      ets2Count: number(snapshot.ets2Online),
      atsCount: number(snapshot.atsOnline),
      serverCounts
    }
  };
}

function normalizeDay(entry = {}) {
  return {
    date: String(entry.date || ''),
    startMembers: number(entry.startMembers, number(entry.members)),
    members: number(entry.members),
    peakOnline: number(entry.peakOnline),
    peakETS2: number(entry.peakETS2),
    peakATS: number(entry.peakATS),
    activitySamples: number(entry.activitySamples),
    ets2PlayerSamples: number(entry.ets2PlayerSamples),
    atsPlayerSamples: number(entry.atsPlayerSamples),
    serverPlayerSamples:
      entry.serverPlayerSamples && typeof entry.serverPlayerSamples === 'object'
        ? { ...entry.serverPlayerSamples }
        : {},
    sampledHours: Array.isArray(entry.sampledHours)
      ? [...new Set(entry.sampledHours.map(String))]
      : []
  };
}

function loadStatistics() {
  const raw = readJson(STATE_FILE, {});
  const historySource = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.history)
      ? raw.history
      : Array.isArray(raw.days)
        ? raw.days
        : [];

  const history = historySource
    .map(normalizeDay)
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    version: 3,
    createdAt: raw.createdAt || nowISO(),
    updatedAt: raw.updatedAt || nowISO(),
    messageId: raw.messageId || raw.discordMessageId || null,
    allTime: {
      peakOnline: Math.max(number(raw?.allTime?.peakOnline), ...history.map((d) => d.peakOnline), 0),
      peakETS2: Math.max(number(raw?.allTime?.peakETS2), ...history.map((d) => d.peakETS2), 0),
      peakATS: Math.max(number(raw?.allTime?.peakATS), ...history.map((d) => d.peakATS), 0)
    },
    history
  };
}

function loadDriverHistory() {
  const history = readJson(DRIVER_HISTORY_FILE, null);
  return history && Array.isArray(history.events) ? history : null;
}
function historyCovers(driverHistory, start) {
  const initialized = normalizeDate(driverHistory?.initializedAt);
  return Boolean(initialized && initialized.getTime() <= start.getTime());
}
function movement(driverHistory, start, end) {
  if (!historyCovers(driverHistory, start)) return { complete: false, joined: 0, left: 0, net: 0 };

  let joined = 0;
  let left = 0;
  for (const event of driverHistory.events) {
    const date = normalizeDate(event.occurredAt || event.detectedAt);
    if (!date || date < start || date >= end) continue;
    if (event.type === 'join') joined++;
    if (event.type === 'leave') left++;
  }
  return { complete: true, joined, left, net: joined - left };
}

function updateState(state, members, activity, sampleTime) {
  let changed = false;
  const today = dateKey(sampleTime);
  let entry = state.history.find((day) => day.date === today);

  if (!entry) {
    entry = normalizeDay({
      date: today,
      startMembers: members,
      members,
      peakOnline: activity.totalOnline,
      peakETS2: activity.ets2Count,
      peakATS: activity.atsCount
    });
    state.history.push(entry);
    changed = true;
  }

  if (entry.members !== members) { entry.members = members; changed = true; }
  if (activity.totalOnline > entry.peakOnline) { entry.peakOnline = activity.totalOnline; changed = true; }
  if (activity.ets2Count > entry.peakETS2) { entry.peakETS2 = activity.ets2Count; changed = true; }
  if (activity.atsCount > entry.peakATS) { entry.peakATS = activity.atsCount; changed = true; }

  const hour = hourKey(sampleTime);
  if (!entry.sampledHours.includes(hour)) {
    entry.sampledHours.push(hour);
    entry.activitySamples++;
    entry.ets2PlayerSamples += activity.ets2Count;
    entry.atsPlayerSamples += activity.atsCount;
    for (const server of activity.serverCounts) {
      entry.serverPlayerSamples[server.key] = number(entry.serverPlayerSamples[server.key]) + server.count;
    }
    changed = true;
  }

  if (activity.totalOnline > state.allTime.peakOnline) { state.allTime.peakOnline = activity.totalOnline; changed = true; }
  if (activity.ets2Count > state.allTime.peakETS2) { state.allTime.peakETS2 = activity.ets2Count; changed = true; }
  if (activity.atsCount > state.allTime.peakATS) { state.allTime.peakATS = activity.atsCount; changed = true; }

  const cutoff = dateKey(new Date(sampleTime.getTime() - HISTORY_RETENTION_DAYS * DAY_MS));
  const before = state.history.length;
  state.history = state.history.filter((day) => day.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
  if (before !== state.history.length) changed = true;
  return changed;
}

function entriesFrom(state, start) {
  const key = dateKey(start);
  return state.history.filter((day) => day.date >= key);
}
function memberGrowth(state, start, currentMembers) {
  const entries = entriesFrom(state, start);
  return entries.length ? currentMembers - number(entries[0].startMembers, currentMembers) : 0;
}
function peakFrom(state, start, field) {
  return Math.max(0, ...entriesFrom(state, start).map((entry) => number(entry[field])));
}
function monthlyActivity(state, start) {
  const entries = entriesFrom(state, start);
  let ets2 = 0;
  let ats = 0;
  const servers = {};
  for (const day of entries) {
    ets2 += number(day.ets2PlayerSamples);
    ats += number(day.atsPlayerSamples);
    for (const [server, count] of Object.entries(day.serverPlayerSamples || {})) {
      servers[server] = number(servers[server]) + number(count);
    }
  }
  const total = ets2 + ats;
  const ranking = Object.entries(servers).sort((a, b) => number(b[1]) - number(a[1]) || a[0].localeCompare(b[0]));
  const best = ranking[0] || null;
  return {
    total,
    ets2Percent: percent(ets2, total),
    atsPercent: percent(ats, total),
    mostUsed: best ? { server: best[0], percent: percent(number(best[1]), total) } : null
  };
}
function nextMilestone(members) {
  for (let milestone = 150; milestone <= 1000; milestone += 50) {
    if (members < milestone) {
      const completion = Math.min(100, Math.floor((members / milestone) * 100));
      return { milestone, remaining: milestone - members, completion };
    }
  }
  return null;
}
function movementLine(label, data) {
  if (!data.complete) return `${label}: *collecting data*`;
  return `${label}: **${data.joined} joined** • **${data.left} left** • **${formatSigned(data.net)} net**`;
}

function buildEmbed(state, live, driverHistory) {
  const sampleTime = live.updatedAt;
  const dayStart = startOfDay(sampleTime);
  const weekStart = startOfWeek(sampleTime);
  const monthStart = startOfMonth(sampleTime);
  const activity = monthlyActivity(state, monthStart);
  const milestone = nextMilestone(live.members);
  const updatedUnix = Math.floor(sampleTime.getTime() / 1000);

  let activityText = 'No Kings activity recorded yet.';
  if (activity.total > 0) {
    activityText = `ETS2: **${activity.ets2Percent}%** • ATS: **${activity.atsPercent}%**`;
    if (activity.mostUsed) activityText += `\nMost Used: **${activity.mostUsed.server}** (${activity.mostUsed.percent}%)`;
  }

  let milestoneText = 'All configured milestones up to **1,000 members** reached. 👑';
  if (milestone) {
    milestoneText = `**${live.members} / ${milestone.milestone}** members\n${progressBar(milestone.completion)} **${milestone.completion}%**\n**${milestone.remaining}** remaining`;
  }

  return {
    title: '👑 Kings Logistics Statistics',
    description: 'Live and historical TruckersMP statistics for **Kings Logistics**.',
    color: KINGS_BLUE,
    fields: [
      {
        name: 'Members',
        value: `**${live.members} TruckersMP Members**\nToday: **${formatSigned(memberGrowth(state, dayStart, live.members))}** • This Week: **${formatSigned(memberGrowth(state, weekStart, live.members))}** • This Month: **${formatSigned(memberGrowth(state, monthStart, live.members))}**`,
        inline: false
      },
      {
        name: 'Current Activity',
        value: `**${live.activity.totalOnline} Currently Online**\nETS2: **${live.activity.ets2Count}** • ATS: **${live.activity.atsCount}**`,
        inline: false
      },
      {
        name: 'Online Peaks',
        value: `Today: **${peakFrom(state, dayStart, 'peakOnline')}** • This Week: **${peakFrom(state, weekStart, 'peakOnline')}** • This Month: **${peakFrom(state, monthStart, 'peakOnline')}**\nAll-Time Tracked: **${state.allTime.peakOnline}**`,
        inline: false
      },
      {
        name: 'Driver Movement',
        value: [
          movementLine('Today', movement(driverHistory, dayStart, sampleTime)),
          movementLine('This Week', movement(driverHistory, weekStart, sampleTime)),
          movementLine('This Month', movement(driverHistory, monthStart, sampleTime))
        ].join('\n'),
        inline: false
      },
      { name: 'Activity This Month', value: activityText, inline: false },
      { name: 'Next Milestone', value: `${milestoneText}\n\nLast updated <t:${updatedUnix}:R>`, inline: false }
    ],
    footer: { text: 'Kings Logistics • Advanced Statistics' }
  };
}

function webhookBase() {
  return STATS_DISCORD_WEBHOOK_URL.split('?')[0].replace(/\/$/, '');
}

async function createMessage(embed) {
  const url = new URL(STATS_DISCORD_WEBHOOK_URL);
  url.searchParams.set('wait', 'true');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Statistics Discord create failed: HTTP ${response.status} - ${await response.text()}`);
  const message = await response.json();
  if (!message?.id) throw new Error('Discord did not return a Statistics message ID.');
  return String(message.id);
}

async function updateMessage(messageId, embed) {
  const response = await fetch(`${webhookBase()}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(15000)
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Statistics Discord update failed: HTTP ${response.status} - ${await response.text()}`);
  return true;
}

async function syncDiscord(state, embed) {
  if (state.messageId && await updateMessage(state.messageId, embed)) {
    console.log('Existing Kings Statistics message updated.');
    return false;
  }

  state.messageId = await createMessage(embed);
  console.log(`New Kings Statistics message created: ${state.messageId}`);
  return true;
}

async function main() {
  console.log('====================================');
  console.log('Kings Logistics Advanced Statistics');
  console.log('====================================');

  const live = loadLiveSnapshot();
  const state = loadStatistics();
  const driverHistory = loadDriverHistory();

  let changed = updateState(state, live.members, live.activity, live.updatedAt);
  const embed = buildEmbed(state, live, driverHistory);
  if (await syncDiscord(state, embed)) changed = true;

  if (changed) {
    state.updatedAt = nowISO();
    writeJson(STATE_FILE, state);
    console.log('Statistics data saved.');
  } else {
    console.log('No persistent Statistics data changes to save.');
  }

  console.log(`Members: ${live.members}`);
  console.log(`Online: ${live.activity.totalOnline}`);
  console.log(`ETS2: ${live.activity.ets2Count}`);
  console.log(`ATS: ${live.activity.atsCount}`);
  console.log(`All-Time Tracked Peak: ${state.allTime.peakOnline}`);
  console.log('Kings Advanced Statistics completed successfully.');
}

main().catch((error) => {
  console.error('Kings Advanced Statistics failed:');
  console.error(error);
  process.exit(1);
});
