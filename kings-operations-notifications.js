'use strict';
// A staff-only, non-technical notification feed. Separate from System Alerts.
// v1 intentionally supports ONLY verified aggregate Convoy Center statuses.
// It never reads HR/Driver case data, approves Events or changes Discord roles.
const fs = require('node:fs');
const crypto = require('node:crypto');
const {roleList,validatePrivateOperationsChannel} = require('./kings-operations-privacy');

const DEFAULT_GUILD = '1114967437788577792';
const ID = /^\d{17,22}$/;
const STATUS_KEYS = Object.freeze([
  'Submitted', 'Needs Information', 'Ready for Approval',
  'Scheduled', 'Completed', 'Cancelled'
]);
const MARKER = 'KINGS_OPS_EVENT:';

function eventSnapshot(report, nowMs = Date.now()) {
  const age = nowMs - Date.parse(report?.generatedAt || '');
  const finalizedAt = Date.parse(report?.finalization?.finalizedAt || '');
  if (!report || !Array.isArray(report.threads) ||
      !['TRUCKERSMP_FIRST_WITH_KINGS_OVERRIDES',
        'READ_ONLY_TRUCKERSMP_FIRST_WITH_KINGS_OVERRIDES'].includes(report.finalization?.mode) ||
      !Number.isFinite(finalizedAt) || finalizedAt < Date.parse(report.generatedAt || '') ||
      nowMs - finalizedAt < -300000 || nowMs - finalizedAt > 7200000 ||
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
    .update(JSON.stringify({total, counts,
      statuses: report.threads.filter(row => !row.ignored && !row.testThread)
        .map(row => [row.threadId,row.status]).sort((a,b) => a[0].localeCompare(b[0]))}))
    .digest('hex').slice(0, 24);
  return Object.freeze({total, counts: Object.freeze(counts), digest, sourceAt: report.generatedAt});
}

function eventEmbed(snapshot) {
  return {
    title: '📬 Kings Operations — Event Overview',
    description: [
      '**Source:** recent Convoy Center report (read-only; approvals unverified)',
      '**Convoy records:** ' + snapshot.total,
      '',
      '⏳ Flagged for Staff review: **' + snapshot.counts['Ready for Approval'] + '**',
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

// Compare the complete visible notice, not just its footer fingerprint.
// A matching digest does not prove a Discord message still shows the
// intended content; edited/corrupt embeds must be repaired or rejected.
function sameEventEmbed(embeds,snapshot) {
  if (!Array.isArray(embeds) || embeds.length !== 1 ||
      !embeds[0] || typeof embeds[0] !== 'object') return false;
  const actual=embeds[0],expected=eventEmbed(snapshot);
  if (['fields','image','thumbnail','url','author','provider','video']
    .some(field=>Object.hasOwn(actual,field))) return false;
  const actualTime=Date.parse(actual.timestamp || '');
  const expectedTime=Date.parse(expected.timestamp || '');
  return actual.title===expected.title &&
    actual.description===expected.description &&
    actual.color===expected.color &&
    actual.footer?.text===expected.footer.text &&
    Number.isFinite(actualTime) && actualTime===expectedTime;
}

async function publishEventSnapshot({
  report, enabled, token, channelId, guildId = DEFAULT_GUILD,
  systemAlertsChannelId = null, approvedRoleIds = null,
  transport = fetch, nowMs = Date.now()
} = {}) {
  if (enabled !== 'ENABLED') return Object.freeze({status:'DISABLED',writes:0});
  if (!ID.test(String(channelId || '')) || !ID.test(String(guildId || '')) ||
      !ID.test(String(systemAlertsChannelId || '')) ||
      !token || channelId === systemAlertsChannelId ||
      !Array.isArray(approvedRoleIds) || !approvedRoleIds.length ||
      typeof transport !== 'function') {
    throw Error('Operations channel configuration is unavailable');
  }
  const snapshot = eventSnapshot(report, nowMs);
  async function get(route) {
    const response = await transport('https://discord.com/api/v10' + route, {
      method:'GET', redirect:'error', headers:{Authorization:'Bot ' + token},
      signal:AbortSignal.timeout(15000)
    });
    if (!response?.ok) throw Error('Discord operation read unavailable');
    return response.json();
  }
  const channel = await get('/channels/' + channelId);
  const bot = await get('/users/@me');
  if (!ID.test(String(bot?.id || '')) || bot.bot !== true)
    throw Error('Bot identity unavailable');
  const [guildRoles,botMember] = await Promise.all([
    get('/guilds/' + guildId + '/roles'),
    get('/guilds/' + guildId + '/members/' + bot.id)
  ]);
  validatePrivateOperationsChannel({
    channel,channelId,guildId,bot,botMember,guildRoles,approvedRoleIds
  });

  const history = await get('/channels/' + channelId + '/messages?limit=100');
  // Full pages are ambiguous: an older canonical bot notice may be beyond
  // the first 100 items. Stop rather than silently post another duplicate.
  if (!Array.isArray(history) || history.length >= 100)
    throw Error('Operations history unavailable or not exhaustive');

  const previous = history.filter(message =>
    String(message?.author?.id) === String(bot.id) &&
    ID.test(String(message?.id || '')) &&
    Array.isArray(message.embeds) &&
    message.embeds.some(embed => /^KINGS_OPS_EVENT:[a-f0-9]{24}$/.test(
      String(embed?.footer?.text || ''))));
  if (previous.length > 1)
    throw Error('Multiple original Operations messages require manual review');
  if (previous[0] && sameEventEmbed(previous[0].embeds,snapshot))
    return Object.freeze({status:'UNCHANGED',writes:0});

  // The write allowlist is a single validated channel and either a new
  // notice POST or a PATCH of the exact existing bot-owned notice.
  const existingId = previous[0]?.id || null;
  const route = '/channels/' + channelId + '/messages' +
    (existingId ? '/' + existingId : '');
  const method = existingId ? 'PATCH' : 'POST';
  const response = await transport('https://discord.com/api/v10' + route, {
    method,redirect:'error',
    headers:{Authorization:'Bot ' + token, 'Content-Type':'application/json'},
    body:JSON.stringify({embeds:[eventEmbed(snapshot)],allowed_mentions:{parse:[]}}),
    signal:AbortSignal.timeout(15000)
  });
  if (!response?.ok) throw Error('Operations notice delivery unconfirmed');
  const posted = await response.json();
  if (!ID.test(String(posted?.id || '')) ||
      (existingId && String(posted.id) !== existingId))
    throw Error('Operations notice delivery acknowledgment invalid');

  // Never claim delivery based solely on an HTTP success or uncertain write.
  const saved = await get('/channels/' + channelId + '/messages/' + posted.id);
  if (String(saved?.id) !== String(posted.id) ||
      String(saved?.channel_id) !== String(channelId) ||
      String(saved?.author?.id) !== String(bot.id) ||
      !sameEventEmbed(saved.embeds,snapshot))
    throw Error('Operations notice Discord readback failed');

  return Object.freeze({status:existingId?'UPDATED':'SENT',writes:1});
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
      systemAlertsChannelId:process.env.SYSTEM_ALERTS_CHANNEL_ID,
      approvedRoleIds:roleList(process.env.KINGS_OPERATIONS_ALLOWED_ROLE_IDS)
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
