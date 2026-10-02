const fs = require('fs');
const path = require('path');
const { resilientFetchJson } = require('./api-resilience');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const SOURCE_FORUM_ID = process.env.DISCORD_KINGS_CONVOY_SOURCE_FORUM_ID || '1506133821693755502';
const ANNOUNCEMENT_CHANNEL_ID = process.env.DISCORD_KINGS_CONVOY_ANNOUNCEMENT_CHANNEL_ID || '1351613882791366838';
const TMP_API_BASE = process.env.TRUCKERSMP_API_BASE || 'https://api.truckersmp.com/v2';
const OUTPUT_FILE = path.join(__dirname, 'output', 'kings-convoy-announcement-verification.json');

const PUBLIC_LABEL = 'Kings Convoy Announcement';
// Recovery announcements are real production posts and are verified by Event ID + bot identity.
const WINDOW_2H = 2 * 60 * 60;
const DISCORD_API = 'https://discord.com/api/v10';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function discordGet(pathname) {
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Convoy Announcement Verifier/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on GET ${pathname}: ${text.slice(0, 500)}`);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function eventIdFromText(text = '') {
  const value = String(text);
  const urlMatch = value.match(/https?:\/\/(?:www\.)?truckersmp\.com\/events\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  const labeledMatch = value.match(/\b(?:TruckersMP\s+)?Event\s+ID\s*(?::|#|-)\s*(\d+)\b/i);
  return labeledMatch ? labeledMatch[1] : null;
}

function latestEventId(messages, threadName = '') {
  const sorted = [...(messages || [])]
    .filter((message) => !message.author?.bot)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  for (const message of sorted) {
    const id = eventIdFromText(message.content || '');
    if (id) return id;
  }
  return eventIdFromText(threadName);
}

function unwrapEventPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  let current = payload;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') break;
    if (current.id && (current.start_at || current.meetup_at || current.departure || current.arrive)) return current;
    if (current.response && typeof current.response === 'object') { current = current.response; continue; }
    if (current.data && typeof current.data === 'object') { current = current.data; continue; }
    if (current.event && typeof current.event === 'object') { current = current.event; continue; }
    break;
  }
  return current && typeof current === 'object' ? current : null;
}

async function fetchTruckersMpEvent(eventId) {
  const payload = await resilientFetchJson(`${TMP_API_BASE}/events/${encodeURIComponent(eventId)}`, {
    label: 'truckersmp-kings-convoy-announcement-verifier',
    retries: 3,
    timeoutMs: 12000,
    fetchOptions: {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics Convoy Announcement Verifier/1.0'
      }
    },
    validateJson: (data) => Boolean(data && data.error !== true)
  });

  const event = unwrapEventPayload(payload);
  if (!event) throw new Error(`TruckersMP Event ${eventId} returned no usable event object.`);
  if (!event.meetup_at) throw new Error(`TruckersMP Event ${eventId} has no authoritative meetup_at.`);
  return event;
}

async function listSourceEntries(sourceChannel) {
  if ([15, 16].includes(sourceChannel.type)) {
    const active = await discordGet(`/guilds/${GUILD_ID}/threads/active`);
    const entries = [];
    for (const thread of active?.threads || []) {
      if (thread.parent_id !== SOURCE_FORUM_ID) continue;
      if (thread.thread_metadata?.archived || thread.thread_metadata?.locked) continue;
      if (/^\s*\[?test\]?(?:\s|[-_:])/i.test(thread.name || '') || /\btemplate\b/i.test(thread.name || '')) continue;
      const messages = await discordGet(`/channels/${thread.id}/messages?limit=100`);
      entries.push({
        id: thread.id,
        name: thread.name || `Kings Convoy ${thread.id}`,
        messages: Array.isArray(messages) ? messages : []
      });
    }
    return entries;
  }

  if ([0, 5].includes(sourceChannel.type)) {
    const messages = await discordGet(`/channels/${SOURCE_FORUM_ID}/messages?limit=100`);
    return (Array.isArray(messages) ? messages : [])
      .filter((message) => !message.author?.bot && !/^\s*\[?test\]?(?:\s|[-_:])/i.test(message.content || ''))
      .map((message) => ({
        id: message.id,
        name: `Kings Convoy ${eventIdFromText(message.content || '') || message.id}`,
        messages: [message],
        eventId: eventIdFromText(message.content || '')
      }))
      .filter((entry) => entry.eventId);
  }

  throw new Error(`Unsupported Kings convoy source channel type ${sourceChannel.type}.`);
}

function eventIdMarker(eventId) {
  return `🔗 **Event ID:** \`${eventId}\``;
}

async function findAnnouncement(eventId, botId) {
  const lookup = eventIdMarker(eventId);
  let before = null;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const messages = await discordGet(`/channels/${ANNOUNCEMENT_CHANNEL_ID}/messages?${query.toString()}`);
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const found = messages.find((message) =>
      message.author?.id === botId &&
      (message.content || '').includes(lookup) &&
      (message.content || '').includes(PUBLIC_LABEL)
    );
    if (found) return found;
    if (messages.length < 100) return null;
    before = messages[messages.length - 1].id;
  }

  throw new Error('Announcement history limit reached; verification is inconclusive.');
}

async function main() {
  const checkedAt = nowISO();
  const nowUnix = Math.floor(Date.now() / 1000);
  const bot = await discordGet('/users/@me');
  const sourceChannel = await discordGet(`/channels/${SOURCE_FORUM_ID}`);
  const targetChannel = await discordGet(`/channels/${ANNOUNCEMENT_CHANNEL_ID}`);

  if (sourceChannel.guild_id && String(sourceChannel.guild_id) !== String(GUILD_ID)) {
    throw new Error('Configured Kings convoy source channel does not belong to the configured guild.');
  }
  if (targetChannel.guild_id && String(targetChannel.guild_id) !== String(GUILD_ID)) {
    throw new Error('Configured public convoy announcement channel does not belong to the configured guild.');
  }

  const sourceEntries = await listSourceEntries(sourceChannel);
  const results = [];

  for (const entry of sourceEntries) {
    const result = {
      sourceId: entry.id,
      name: entry.name,
      eventId: null,
      meetingAt: null,
      windowOpensAt: null,
      secondsUntilMeeting: null,
      state: 'unknown',
      announcementFound: false,
      announcementMessageId: null,
      verified: false,
      reason: null
    };

    try {
      const eventId = entry.eventId || latestEventId(entry.messages, entry.name);
      result.eventId = eventId;
      if (!eventId) {
        result.state = 'skipped';
        result.reason = 'no-event-id';
        results.push(result);
        continue;
      }

      const event = await fetchTruckersMpEvent(eventId);
      const meetingUnix = Math.floor(new Date(event.meetup_at).getTime() / 1000);
      if (!Number.isFinite(meetingUnix)) throw new Error('Invalid TruckersMP meetup_at.');

      const secondsUntilMeeting = meetingUnix - nowUnix;
      result.meetingAt = new Date(meetingUnix * 1000).toISOString();
      result.windowOpensAt = new Date((meetingUnix - WINDOW_2H) * 1000).toISOString();
      result.secondsUntilMeeting = secondsUntilMeeting;

      const announcement = await findAnnouncement(eventId, bot.id);
      if (announcement) {
        result.announcementFound = true;
        result.announcementMessageId = announcement.id;
      }

      if (secondsUntilMeeting <= 0) {
        result.state = 'past';
        result.verified = Boolean(announcement);
        result.reason = announcement ? 'historical-announcement-found' : 'event-past';
      } else if (secondsUntilMeeting <= WINDOW_2H) {
        result.state = 'in-window';
        result.verified = Boolean(announcement);
        result.reason = announcement ? 'required-announcement-present' : 'required-announcement-missing';
      } else {
        result.state = 'upcoming';
        result.verified = true;
        result.reason = announcement ? 'announcement-already-present-before-window' : 'not-yet-due';
      }
    } catch (error) {
      result.state = 'error';
      result.reason = String(error.message || error);
    }

    results.push(result);
  }

  const summary = {
    entries: results.length,
    upcoming: results.filter((item) => item.state === 'upcoming').length,
    inWindow: results.filter((item) => item.state === 'in-window').length,
    past: results.filter((item) => item.state === 'past').length,
    skipped: results.filter((item) => item.state === 'skipped').length,
    errors: results.filter((item) => item.state === 'error').length,
    announcementsFound: results.filter((item) => item.announcementFound).length,
    verifiedInWindow: results.filter((item) => item.state === 'in-window' && item.verified).length,
    missingInWindow: results.filter((item) => item.state === 'in-window' && !item.verified).length
  };

  const report = {
    version: 1,
    checkedAt,
    mode: 'read-only-verification',
    sourceChannel: { id: SOURCE_FORUM_ID, name: sourceChannel.name || null },
    announcementChannel: { id: ANNOUNCEMENT_CHANNEL_ID, name: targetChannel.name || null },
    bot: { id: bot.id, username: bot.username || null },
    announcementWindowSeconds: WINDOW_2H,
    summary,
    entries: results
  };

  writeReport(report);

  console.log(`Kings public convoy announcement verification: ${summary.entries} source entries.`);
  for (const item of results) {
    console.log(`- ${item.name} | Event ${item.eventId || 'none'} | ${item.state} | ${item.reason}${item.meetingAt ? ` | meeting ${item.meetingAt}` : ''}${item.windowOpensAt ? ` | window opens ${item.windowOpensAt}` : ''}${item.announcementMessageId ? ` | message ${item.announcementMessageId}` : ''}`);
  }
  console.log(`Verified in-window: ${summary.verifiedInWindow}. Missing in-window: ${summary.missingInWindow}. Errors: ${summary.errors}.`);

  if (summary.missingInWindow > 0 || summary.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const report = {
    version: 1,
    checkedAt: nowISO(),
    mode: 'read-only-verification',
    fatalError: String(error.message || error)
  };
  writeReport(report);
  console.error('Kings public convoy announcement verification failed:', error.message);
  process.exit(1);
});
