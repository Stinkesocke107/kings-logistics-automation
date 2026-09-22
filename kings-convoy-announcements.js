const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const SOURCE_FORUM_ID = process.env.DISCORD_KINGS_CONVOY_SOURCE_FORUM_ID || '1506133821693755502';
const ANNOUNCEMENT_CHANNEL_ID = process.env.DISCORD_KINGS_CONVOY_ANNOUNCEMENT_CHANNEL_ID || '1351613882791366838';
const TMP_API_BASE = process.env.TRUCKERSMP_API_BASE || 'https://api.truckersmp.com/v2';

const MARKER_24H = '📣 **Kings Convoy Announcement — 24 Hours**';
const MARKER_1H = '🚨 **Kings Convoy Final Reminder — 1 Hour**';
const WINDOW_24H = 24 * 60 * 60;
const WINDOW_1H = 60 * 60;

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

const DISCORD_API = 'https://discord.com/api/v10';
const eventCache = new Map();

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Kings Convoy Announcements/1.0'
  };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${path}: ${text.slice(0, 500)}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalize(text = '') {
  return String(text).replace(/\r/g, '').trim();
}

function stripMarkdown(text = '') {
  return normalize(text).replace(/[*_`~]/g, '');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function eventIdFromText(text = '') {
  const value = String(text);
  const urlMatch = value.match(/https?:\/\/(?:www\.)?truckersmp\.com\/events\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  const labeledMatch = value.match(/\b(?:TruckersMP\s+)?Event\s+ID\s*(?::|#|-)\s*(\d+)\b/i);
  return labeledMatch ? labeledMatch[1] : null;
}

function latestEventId(messages, threadName = '') {
  const sorted = [...(messages || [])].sort(
    (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
  );

  for (const message of sorted) {
    const id = eventIdFromText(message.content || '');
    if (id) return id;
  }

  return eventIdFromText(threadName);
}

function getFieldValue(messages, labels) {
  const names = labels.map(escapeRegex).join('|');
  const regex = new RegExp(
    `(?:^|\\n)\\s*(?:[-#>]+\\s*)?(?:${names})\\s*(?::|-)\\s*([^\\n]+)`,
    'i'
  );

  const sorted = [...(messages || [])].sort(
    (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
  );

  for (const message of sorted) {
    const match = stripMarkdown(message.content || '').match(regex);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function locationLabel(location) {
  if (!location) return null;
  if (typeof location === 'string') return clean(location);
  if (typeof location !== 'object') return null;

  const city = clean(location.city);
  const place = clean(location.location || location.name);
  if (city && place && city.toLowerCase() !== place.toLowerCase()) {
    return `${city} — ${place}`;
  }
  return city || place || null;
}

function eventServer(event) {
  if (!event) return null;
  if (typeof event.server === 'string') return clean(event.server);
  if (event.server && typeof event.server === 'object') {
    return clean(event.server.name || event.server.server || event.server.id);
  }
  return clean(event.event_server || event.game_server);
}

function unwrapEventPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  let current = payload;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') break;
    if (current.id && (current.start_at || current.meetup_at || current.departure || current.arrive)) {
      return current;
    }
    if (current.response && typeof current.response === 'object') {
      current = current.response;
      continue;
    }
    if (current.data && typeof current.data === 'object') {
      current = current.data;
      continue;
    }
    if (current.event && typeof current.event === 'object') {
      current = current.event;
      continue;
    }
    break;
  }

  return current && typeof current === 'object' ? current : null;
}

async function fetchTruckersMpEvent(eventId) {
  if (eventCache.has(eventId)) return eventCache.get(eventId);

  const promise = (async () => {
    const response = await fetch(`${TMP_API_BASE}/events/${encodeURIComponent(eventId)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics Kings Convoy Announcements/1.0'
      },
      signal: AbortSignal.timeout(12000)
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`TruckersMP API returned invalid JSON (${response.status}).`);
    }

    if (!response.ok || payload?.error === true) {
      const descriptor = payload?.descriptor || payload?.message || `HTTP ${response.status}`;
      throw new Error(`TruckersMP Event ${eventId} could not be loaded: ${String(descriptor).slice(0, 300)}`);
    }

    const event = unwrapEventPayload(payload);
    if (!event) throw new Error(`TruckersMP Event ${eventId} returned no usable event object.`);
    return event;
  })();

  eventCache.set(eventId, promise);
  return promise;
}

function unixFromDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
}

function imageAttachment(message, attachment) {
  const filename = clean(attachment?.filename) || 'route.png';
  const contentType = clean(attachment?.content_type) || '';
  const url = clean(attachment?.url || attachment?.proxy_url);
  if (!url) return null;

  const imageByType = contentType.toLowerCase().startsWith('image/');
  const imageByName = /\.(?:png|jpe?g|webp|gif)$/i.test(filename);
  if (!imageByType && !imageByName) return null;

  const context = `${message?.content || ''} ${filename}`.toLowerCase();
  if (/\b(slot|booking|parking)\b/.test(context)) return null;

  let score = 0;
  if (/\b(route|map|strecke|route map|route-map)\b/.test(context)) score += 10;
  if (/route|map|strecke/i.test(filename)) score += 5;

  return { url, filename, contentType, score, timestamp: message?.timestamp || '' };
}

function findRouteImage(messages) {
  const candidates = [];
  for (const message of messages || []) {
    for (const attachment of message.attachments || []) {
      const candidate = imageAttachment(message, attachment);
      if (candidate) candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
  });

  const route = candidates.find((item) => item.score > 0);
  return route || null;
}

async function listForumEntries() {
  const all = new Map();

  const active = await discord(`/guilds/${GUILD_ID}/threads/active`);
  for (const thread of active?.threads || []) {
    if (thread.parent_id === SOURCE_FORUM_ID) all.set(thread.id, thread);
  }

  let before = null;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const archived = await discord(`/channels/${SOURCE_FORUM_ID}/threads/archived/public?${query.toString()}`);
    const threads = archived?.threads || [];
    for (const thread of threads) all.set(thread.id, thread);

    if (!archived?.has_more || threads.length === 0) break;
    before = threads[threads.length - 1]?.thread_metadata?.archive_timestamp || null;
    if (!before) break;
  }

  const entries = [];
  for (const thread of all.values()) {
    const messages = await discord(`/channels/${thread.id}/messages?limit=100`);
    entries.push({
      id: thread.id,
      name: thread.name || `Kings Convoy ${thread.id}`,
      messages: Array.isArray(messages) ? messages : []
    });
  }
  return entries;
}

async function listTextChannelEntries() {
  const messages = [];
  let before = null;

  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const pageMessages = await discord(`/channels/${SOURCE_FORUM_ID}/messages?${query.toString()}`);
    if (!Array.isArray(pageMessages) || pageMessages.length === 0) break;
    messages.push(...pageMessages);
    if (pageMessages.length < 100) break;
    before = pageMessages[pageMessages.length - 1].id;
  }

  const entries = [];
  for (const message of messages) {
    const eventId = eventIdFromText(message.content || '');
    if (!eventId) continue;
    entries.push({
      id: message.id,
      name: getFieldValue([message], ['Title', 'Event', 'Convoy']) || `Kings Convoy ${eventId}`,
      messages: [message],
      eventId
    });
  }
  return entries;
}

async function listSourceEntries(sourceChannel) {
  if ([15, 16].includes(sourceChannel.type)) return listForumEntries();
  if ([0, 5].includes(sourceChannel.type)) return listTextChannelEntries();
  throw new Error(`Unsupported Kings convoy source channel type ${sourceChannel.type}.`);
}

function displayName(thread, event) {
  const raw = clean(thread?.name) || clean(event?.name || event?.title) || 'Kings Convoy';
  return raw
    .replace(/^\s*(?:👑\s*)?KINGS\s+LOGISTICS\s*[|:\-–—]\s*/i, '')
    .trim() || 'Kings Convoy';
}

function detailsFrom(event, messages) {
  const departure = locationLabel(event?.departure);
  const arrival = locationLabel(event?.arrive);
  const route = departure && arrival ? `${departure} → ${arrival}` : departure || arrival || null;

  return {
    meetingUnix: unixFromDate(event?.meetup_at),
    departureUnix: unixFromDate(event?.start_at),
    server: eventServer(event) || getFieldValue(messages, ['Server', 'Event Server']),
    route: route || getFieldValue(messages, ['Route']),
    routeLength: getFieldValue(messages, ['Route Length', 'Distance', 'Route Distance']),
    dlcs: getFieldValue(messages, ['Required DLCs', 'DLCs', 'Required DLC'])
  };
}

function eventMarker(eventId, phaseMarker) {
  return `${phaseMarker}\n🔗 **Event ID:** \`${eventId}\``;
}

async function findExistingAnnouncement(eventId, phaseMarker, botId) {
  const lookup = eventMarker(eventId, phaseMarker);
  let before = null;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const messages = await discord(`/channels/${ANNOUNCEMENT_CHANNEL_ID}/messages?${query.toString()}`);
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const found = messages.find((message) =>
      message.author?.id === botId && (message.content || '').includes(lookup)
    );
    if (found) return found;

    if (messages.length < 100) return null;
    before = messages[messages.length - 1].id;
  }

  return null;
}

function buildContent({ eventId, phaseMarker, phase, name, details }) {
  const eventUrl = `https://truckersmp.com/events/${eventId}`;
  const intro = phase === '1h'
    ? 'Our Kings Logistics convoy Meeting Time is now within 1 hour. Please get ready and make sure you arrive on time. 👑🚛'
    : 'A Kings Logistics convoy is coming up within 24 hours. Get ready to join us on the road! 👑🚛';

  return [
    eventMarker(eventId, phaseMarker),
    '',
    '@everyone',
    '',
    `# 👑 KINGS LOGISTICS | ${name}`,
    '',
    intro,
    '',
    details.meetingUnix ? `📅 **Date:** <t:${details.meetingUnix}:D>` : null,
    details.meetingUnix ? `🕒 **Meeting Time:** <t:${details.meetingUnix}:t> · <t:${details.meetingUnix}:R>` : null,
    details.departureUnix ? `🕘 **Departure Time:** <t:${details.departureUnix}:t>` : null,
    '',
    details.server ? `🎙️ **Server:** ${details.server}` : null,
    details.route ? `📍 **Route:** ${details.route}` : null,
    details.routeLength ? `🛣️ **Route Length:** ${details.routeLength}` : null,
    details.dlcs ? `🧩 **Required DLCs:** ${details.dlcs}` : null,
    '',
    `🔗 **TruckersMP Event:** ${eventUrl}`,
    '',
    '🗺️ **Route Map**',
    '',
    '💙 **Kings Logistics — Connecting the world, creating friendships.**'
  ].filter((value) => value !== null && value !== undefined).join('\n');
}

function safeRouteFilename(filename, contentType) {
  const base = String(filename || 'route.png').replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (/\.(?:png|jpe?g|webp|gif)$/i.test(base)) return base;
  if (contentType === 'image/jpeg') return `${base}.jpg`;
  if (contentType === 'image/webp') return `${base}.webp`;
  if (contentType === 'image/gif') return `${base}.gif`;
  return `${base}.png`;
}

async function sendAnnouncement(content, routeImage) {
  const imageResponse = await fetch(routeImage.url, { signal: AbortSignal.timeout(15000) });
  if (!imageResponse.ok) {
    throw new Error(`Route image download failed with HTTP ${imageResponse.status}.`);
  }

  const bytes = await imageResponse.arrayBuffer();
  const contentType = routeImage.contentType || imageResponse.headers.get('content-type') || 'image/png';
  const filename = safeRouteFilename(routeImage.filename, contentType);

  const form = new FormData();
  form.append('payload_json', JSON.stringify({
    content,
    allowed_mentions: { parse: ['everyone'] }
  }));
  form.append('files[0]', new Blob([bytes], { type: contentType }), filename);

  const response = await fetch(`${DISCORD_API}/channels/${ANNOUNCEMENT_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Kings Convoy Announcements/1.0'
    },
    body: form,
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} while sending Kings convoy announcement: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const bot = await discord('/users/@me');
  const sourceForum = await discord(`/channels/${SOURCE_FORUM_ID}`);
  const targetChannel = await discord(`/channels/${ANNOUNCEMENT_CHANNEL_ID}`);

  if (sourceForum.guild_id && sourceForum.guild_id !== GUILD_ID) {
    throw new Error(`Kings convoy source forum ${SOURCE_FORUM_ID} does not belong to guild ${GUILD_ID}.`);
  }
  if (targetChannel.guild_id && targetChannel.guild_id !== GUILD_ID) {
    throw new Error(`Kings convoy announcement channel ${ANNOUNCEMENT_CHANNEL_ID} does not belong to guild ${GUILD_ID}.`);
  }

  const entries = await listSourceEntries(sourceForum);
  const nowUnix = Math.floor(Date.now() / 1000);
  let sent24h = 0;
  let sent1h = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Kings convoy source forum: ${sourceForum.name || SOURCE_FORUM_ID} (${SOURCE_FORUM_ID})`);
  console.log(`Kings convoy announcement channel: ${targetChannel.name || ANNOUNCEMENT_CHANNEL_ID} (${ANNOUNCEMENT_CHANNEL_ID})`);
  console.log(`Kings convoy source entries found: ${entries.length}`);

  for (const entry of entries) {
    try {
      const messages = entry.messages || [];
      const eventId = entry.eventId || latestEventId(messages, entry.name || '');
      if (!eventId) {
        console.log(`- ${entry.name} | skipped: no TruckersMP Event ID/link found`);
        skipped += 1;
        continue;
      }

      const event = await fetchTruckersMpEvent(eventId);
      const details = detailsFrom(event, messages);
      if (!details.meetingUnix) {
        console.log(`- ${entry.name} | skipped: TruckersMP event has no valid meetup_at`);
        skipped += 1;
        continue;
      }

      const secondsUntilMeeting = details.meetingUnix - nowUnix;
      if (secondsUntilMeeting <= 0 || secondsUntilMeeting > WINDOW_24H) {
        skipped += 1;
        continue;
      }

      const routeImage = findRouteImage(messages);
      if (!routeImage) {
        console.log(`- ${entry.name} | waiting: route image required (slot/booking images are ignored)`);
        skipped += 1;
        continue;
      }

      const name = displayName(entry, event);
      const phase = secondsUntilMeeting <= WINDOW_1H ? '1h' : '24h';
      const phaseMarker = phase === '1h' ? MARKER_1H : MARKER_24H;
      const existing = await findExistingAnnouncement(eventId, phaseMarker, bot.id);
      if (existing) {
        console.log(`- ${entry.name} | ${phase} Kings announcement: already-sent`);
        skipped += 1;
        continue;
      }

      const content = buildContent({ eventId, phaseMarker, phase, name, details });
      const sent = await sendAnnouncement(content, routeImage);
      console.log(`- ${entry.name} | ${phase} Kings announcement sent: ${sent?.id || 'unknown'}`);
      if (phase === '1h') sent1h += 1;
      else sent24h += 1;
    } catch (error) {
      failed += 1;
      console.warn(`- ${entry.name} | Kings convoy announcement failed: ${error.message}`);
    }
  }

  console.log(
    `Kings Convoy Announcements finished. 24h sent: ${sent24h}. 1h sent: ${sent1h}. Skipped: ${skipped}. Failed: ${failed}.`
  );
}

main().catch((error) => {
  console.error('Kings Convoy Announcements failed:', error.message);
  process.exit(1);
});
