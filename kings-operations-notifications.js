'use strict';
// A staff-only, non-technical notification feed. Separate from System Alerts.
// v1 intentionally supports ONLY verified aggregate Convoy Center statuses.
// It never reads HR/Driver case data, approves Events or changes Discord roles.
const fs = require('node:fs');
const crypto = require('node:crypto');

const DEFAULT_GUILD = '1114967437788577792';
const ID = /^\d{17,22}$/;
const STATUS_KEYS = Object.freeze([
  'Submitted', 'Needs Information', 'Ready for Approval',
  'Scheduled', 'Completed', 'Cancelled'
]);
const MARKER = 'KINGS_OPS_EVENT:';

function eventSnapshot(report, nowMs = Date.now()) {
  const age = nowMs - Date.parse(report?.generatedAt || '');
  if (!report || !Array.isArray(report.threads) ||
      !['READ_ONLY', 'DISCORD_MESSAGE_AND_TAG_WRITE'].includes(report.mode) ||
      !Number.isFinite(age) || age < -300000 || age > 7200000 ||
      !report.summary || !Number.isSafeInteger(report.summary.errors) ||
      report.summary.errors !== 0) {
    throw Error('Event source is missing, stale or incomplete');
  }
  const counts = Object.fromEntries(STATUS_KEYS.map(status => [status, 0]));
  let total = 0;
  const seen = new Set();
  for (const row of report.threads) {
    if (!row || typeof row !== 'object') throw Error('Invalid Event source row');
    if (row.ignored || row.testThread) continue;
    if (row.error || !ID.test(String(row.threadId || '')) ||
        seen.has(row.threadId) || !Object.hasOwn(counts, row.status)) {
      throw Error('Event source contains unverified rows');
    }
    seen.add(row.threadId);
    counts[row.status]++;
    total++;
  }
  // Source completeness is checked before calculating any actionable totals.
  const expected = report.summary.actualConvoys - report.summary.testThreads;
  if (!Number.isSafeInteger(expected) || expected !== total || total < 0) {
    throw Error('Event source totals are not reconciled');
  }
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify({total, counts, eventIds: [...seen].sort()}))
    .digest('hex').slice(0, 24);
  return Object.freeze({total, counts: Object.freeze(counts), digest, sourceAt: report.generatedAt});
}

function eventEmbed(snapshot) {
  return {
    title: '📬 Kings Operations — Event Overview',
    description: [
      '**Confirmed source:** current Convoy Center snapshot',
      '**Convoy records:** ' + snapshot.total,
      '',
      '⏳ Awaiting Staff review: **' + snapshot.counts['Ready for Approval'] + '**',
      '⚠️ Needs information: **' + snapshot.counts['Needs Information'] + '**',
      '📝 Submitted: **' + snapshot.counts.Submitted + '**',
      '📅 Scheduled: **' + snapshot.counts.Scheduled + '**',
      '✅ Completed: **' + snapshot.counts.Completed + '**',
      '🚫 Cancelled: **' + snapshot.counts.Cancelled + '**',
      '',
      'Status counts are advisory. No bookings, approvals or free slots are certified.'
    ].join('\n'),
    color: 0x182dff,
    footer: {text: MARKER + snapshot.digest},
    timestamp: snapshot.sourceAt
  };
}

async function publishEventSnapshot({
  report, enabled, token, channelId, guildId = DEFAULT_GUILD,
  systemAlertsChannelId = null, transport = fetch, nowMs = Date.now()
} = {}) {
  if (enabled !== 'ENABLED') return Object.freeze({status:'DISABLED',writes:0});
  if (!ID.test(String(channelId || '')) || !ID.test(String(guildId || '')) ||
      !token || channelId === systemAlertsChannelId ||
      typeof transport !== 'function') {
    throw Error('Operations channel configuration is unavailable');
  }
  const snapshot = eventSnapshot(report, nowMs);
  async function get(route) {
    const response = await transport('https://discord.com/api/v10' + route, {
      method:'GET', headers:{Authorization:'Bot ' + token},
      signal:AbortSignal.timeout(15000)
    });
    if (!response?.ok) throw Error('Discord operation read unavailable');
    return response.json();
  }
  const channel = await get('/channels/' + channelId);
  if (String(channel?.id) !== channelId ||
      String(channel?.guild_id) !== guildId || channel?.type !== 0 ||
      !Array.isArray(channel.permission_overwrites)) {
    throw Error('Operations channel is not the approved private text channel');
  }
  const everyone = channel.permission_overwrites.find(o =>
    o?.type === 0 && String(o.id) === guildId);
  // Deny @everyone "View Channel" (bit 1<<10) in this private staff feed.
  if (!everyone || (BigInt(String(everyone.deny || '0')) & 1024n) === 0n ||
      (BigInt(String(everyone.allow || '0')) & 1024n) !== 0n) {
    throw Error('Operations channel privacy not verified');
  }
  const bot = await get('/users/@me');
  if (!ID.test(String(bot?.id || '')) || bot.bot !== true) {
    throw Error('Bot identity unavailable');
  }
  const history = await get('/channels/' + channelId + '/messages?limit=100');
  if (!Array.isArray(history) || history.length > 100) {
    throw Error('Operations message history unavailable');
  }
  const unchanged = history.some(message =>
    String(message?.author?.id) === String(bot.id) &&
    Array.isArray(message.embeds) &&
    message.embeds.some(embed => embed.footer?.text === MARKER + snapshot.digest));
  if (unchanged) return Object.freeze({status:'UNCHANGED',writes:0});
  const route = '/channels/' + channelId + '/messages';
  // Only this exact allowlisted POST can be performed. Never patch/delete or
  // write to System Alerts, event/HR/Driver channels or staff case files.
  const response = await transport('https://discord.com/api/v10' + route, {
    method:'POST',
    headers:{Authorization:'Bot ' + token, 'Content-Type':'application/json'},
    body:JSON.stringify({embeds:[eventEmbed(snapshot)],allowed_mentions:{parse:[]}}),
    signal:AbortSignal.timeout(15000)
  });
  if (!response?.ok) throw Error('Operations notice delivery unconfirmed');
  const posted = await response.json();
  if (!ID.test(String(posted?.id || ''))) {
    throw Error('Operations notice delivery acknowledgment invalid');
  }
  return Object.freeze({status:'SENT',writes:1});
}

async function main() {
  if (process.env.KINGS_OPERATIONS_NOTIFICATIONS_ENABLED !== 'ENABLED') {
    console.log('Kings Operations Notices: DISABLED');
    return;
  }
  try {
    const report = JSON.parse(fs.readFileSync('output/convoy-check-results.json','utf8'));
    const result = await publishEventSnapshot({
      report,
      enabled:process.env.KINGS_OPERATIONS_NOTIFICATIONS_ENABLED,
      token:process.env.DISCORD_BOT_TOKEN,
      channelId:process.env.KINGS_OPERATIONS_CHANNEL_ID,
      guildId:process.env.DISCORD_GUILD_ID || DEFAULT_GUILD,
      systemAlertsChannelId:process.env.SYSTEM_ALERTS_CHANNEL_ID
    });
    console.log('Kings Operations Notices: ' + result.status);
  } catch {
    // Public CI never prints Discord IDs, tokens, names or source contents.
    console.error('Kings Operations Notices: SOURCE_OR_DELIVERY_UNAVAILABLE');
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = {eventSnapshot, eventEmbed, publishEventSnapshot, STATUS_KEYS};
