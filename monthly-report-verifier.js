const fs = require('fs');
const path = require('path');

const WEBHOOK_URL = process.env.MONTHLY_REPORT_DISCORD_WEBHOOK_URL || null;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_API = 'https://discord.com/api/v10';
const TIMEOUT_MS = 15000;
const DATA = path.join(__dirname, 'data');
const OUTPUT = path.join(__dirname, 'output', 'monthly-report-verification.json');

if (!WEBHOOK_URL) throw new Error('MONTHLY_REPORT_DISCORD_WEBHOOK_URL is missing.');
if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');

function readJson(name, fallback = null) {
  const file = path.join(DATA, name);
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function monthName(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function periodForVerification(now = new Date()) {
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (now.getUTCDate() === 1) {
    const start = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1));
    return { start, end: currentStart, key: monthKey(start), label: monthName(start), phase: 'post-publish' };
  }
  const nextStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() + 1, 1));
  return { start: currentStart, end: nextStart, key: monthKey(currentStart), label: monthName(currentStart), phase: 'readiness' };
}

function expectedDates(period, now, fullMonth) {
  const limit = fullMonth ? period.end.getTime() : Math.min(period.end.getTime(), Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const dates = [];
  for (let t = period.start.getTime(); t < limit; t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

function loadHistory() {
  const raw = readJson('statistics.json', null);
  if (!raw) throw new Error('statistics.json is missing.');
  return (Array.isArray(raw) ? raw : Array.isArray(raw.history) ? raw.history : Array.isArray(raw.days) ? raw.days : [])
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day?.date || '')));
}

async function requestJson(url, headers = {}) {
  const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} on GET ${url}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function getWebhookTarget() {
  const base = new URL(WEBHOOK_URL);
  base.searchParams.delete('wait');
  const metadata = await requestJson(base, { 'User-Agent': 'Kings Logistics Monthly Report Verifier/1.0' });
  const configured = new URL(WEBHOOK_URL);
  const channelId = configured.searchParams.get('thread_id') || metadata?.channel_id;
  if (!metadata?.id || !channelId) throw new Error('Webhook metadata does not expose a usable webhook/channel ID.');
  return { webhookId: String(metadata.id), channelId: String(channelId) };
}

async function getMessages(channelId) {
  const messages = await requestJson(`${DISCORD_API}/channels/${channelId}/messages?limit=100`, {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Monthly Report Verifier/1.0'
  });
  return Array.isArray(messages) ? messages : [];
}

async function main() {
  const now = new Date();
  const period = periodForVerification(now);
  const fullMonthExpected = period.phase === 'post-publish';
  const history = loadHistory();
  const observed = new Set(history.map((day) => String(day.date)));
  const expected = expectedDates(period, now, fullMonthExpected);
  const missingDates = expected.filter((date) => !observed.has(date));

  const driverHistory = readJson('driver-history.json', null);
  const driverInitialized = driverHistory?.initializedAt ? new Date(driverHistory.initializedAt) : null;
  const driverHistoryComplete = Boolean(driverInitialized && !Number.isNaN(driverInitialized.getTime()) && driverInitialized <= period.start);

  const state = readJson('monthly-report-state.json', { publishedMonths: [] });
  const stateEntry = (state?.publishedMonths || []).find((item) => item.key === period.key) || null;

  const target = await getWebhookTarget();
  const messages = await getMessages(target.channelId);
  const marker = `Kings Logistics — ${period.label} Monthly Report`;
  const matchingMessages = messages.filter((message) =>
    String(message.webhook_id || '') === target.webhookId &&
    String(message.content || '').includes(marker) &&
    !String(message.content || '').includes('PREVIEW')
  );

  const issues = [];
  if (missingDates.length) issues.push(`Statistics dates missing: ${missingDates.join(', ')}`);

  if (period.phase === 'post-publish') {
    if (!stateEntry) issues.push(`Monthly Report state missing ${period.key}.`);
    if (matchingMessages.length !== 1) issues.push(`Expected exactly one Discord Monthly Report for ${period.key}, found ${matchingMessages.length}.`);
    if (stateEntry?.discordMessageId && matchingMessages[0]?.id && String(stateEntry.discordMessageId) !== String(matchingMessages[0].id)) {
      issues.push('Monthly Report state Discord message ID does not match live Discord history.');
    }
  } else {
    if (stateEntry) issues.push(`Monthly Report state already contains future/current month ${period.key}.`);
    if (matchingMessages.length) issues.push(`Official Monthly Report already exists before month close for ${period.key}.`);
  }

  const report = {
    version: 1,
    checkedAt: now.toISOString(),
    mode: 'read-only',
    phase: period.phase,
    targetMonth: { key: period.key, label: period.label, start: period.start.toISOString(), end: period.end.toISOString() },
    statistics: {
      expectedDatesChecked: expected.length,
      missingDates,
      coverageHealthy: missingDates.length === 0,
      monthClosed: now >= period.end
    },
    driverHistory: {
      initializedAt: driverInitialized && !Number.isNaN(driverInitialized.getTime()) ? driverInitialized.toISOString() : null,
      completeForTargetMonth: driverHistoryComplete,
      note: driverHistoryComplete ? 'Monthly Driver Movement can be reported.' : 'Driver Movement must be omitted because full-month history is unavailable.'
    },
    discord: {
      webhookId: target.webhookId,
      channelId: target.channelId,
      officialReportMatches: matchingMessages.length,
      messageId: matchingMessages[0]?.id || null
    },
    state: {
      published: Boolean(stateEntry),
      entry: stateEntry
    },
    readyForScheduledPublish: period.phase === 'readiness' && missingDates.length === 0 && !stateEntry && matchingMessages.length === 0,
    healthy: issues.length === 0,
    issues
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Monthly Report Verification — ${period.label} (${period.phase})`);
  console.log(`Statistics coverage: ${expected.length - missingDates.length}/${expected.length}`);
  console.log(`Driver History complete: ${driverHistoryComplete}`);
  console.log(`Discord official matches: ${matchingMessages.length}`);
  console.log(`State published: ${Boolean(stateEntry)}`);
  console.log(`Ready for scheduled publish: ${report.readyForScheduledPublish}`);
  console.log(`Issues: ${issues.length}`);
  for (const issue of issues) console.error(`- ${issue}`);
  if (issues.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Monthly Report Verification failed:', error.message);
  process.exit(1);
});
