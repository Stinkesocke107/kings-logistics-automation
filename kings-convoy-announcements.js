require('./kings-branding').installDiscordBranding();
const { resilientFetch, resilientFetchJson } = require('./api-resilience');
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const SOURCE_FORUM_ID = process.env.DISCORD_KINGS_CONVOY_SOURCE_FORUM_ID || '1506133821693755502';
const ANNOUNCEMENT_CHANNEL_ID = process.env.DISCORD_KINGS_CONVOY_ANNOUNCEMENT_CHANNEL_ID || '1351613882791366838';
const INTERNAL_CHANNEL_ID = process.env.DISCORD_KINGS_CONVOY_INTERNAL_CHANNEL_ID || '1550997669596631200';
const DRIVER_ROLE_ID = process.env.DISCORD_DRIVER_ROLE_ID || '1476774746480709675';
const TMP_API_BASE = process.env.TRUCKERSMP_API_BASE || 'https://api.truckersmp.com/v2';

const MARKER_2H = '📣 **Kings Convoy Announcement — 2 Hours**';
const MARKER_NOW = '📣 **Kings Convoy Announcement — Starting Now**';
const MARKER_INTERNAL_2H = '🚛 **Kings Convoy Internal Announcement — 2 Hours**';
const MARKER_INTERNAL_NOW = '🚛 **Kings Convoy Internal Announcement — Starting Now**';
const WINDOW_2H = 2 * 60 * 60;
const RECOVERY_GRACE = 2 * 60 * 60;

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
    'User-Agent': 'Kings Logistics Kings Convoy Announcements/1.1'
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
  const sorted = [...(messages || [])].filter((message) => !message.author?.bot).sort(
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

  const sorted = [...(messages || [])].filter((message) => !message.author?.bot).sort(
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
    const payload = await resilientFetchJson(
      `${TMP_API_BASE}/events/${encodeURIComponent(eventId)}`,
      {
        label: 'truckersmp-kings-convoy-announcement',
        retries: 3,
        timeoutMs: 12000,
        fetchOptions: {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Kings Logistics Kings Convoy Announcements/1.2'
          }
        },
        validateJson: (data) => Boolean(data && data.error !== true)
      }
    );

    const event = unwrapEventPayload(payload);
    if (!event) {
      throw new Error(`TruckersMP Event ${eventId} returned no usable event object.`);
    }

    // meetup_at is required for the public 2-hour timing. Never infer a meeting
    // time from start_at when TruckersMP data is incomplete.
    if (!event.meetup_at) {
      throw new Error(`TruckersMP Event ${eventId} has no authoritative meetup_at.`);
    }

    return event;
  })();

  eventCache.set(eventId, promise);
  promise.catch(() => eventCache.delete(eventId));
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
    if (thread.thread_metadata?.archived || thread.thread_metadata?.locked ||
        /^\s*\[?test\]?(?:\s|[-_:])/i.test(thread.name || '') || /\btemplate\b/i.test(thread.name || '')) continue;
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
    if (message.author?.bot || /^\s*\[?test\]?(?:\s|[-_:])/i.test(message.content || '')) continue;
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
    meetingPoint: getFieldValue(messages, ['Meeting Point', 'Meetup', 'Meeting Location']) || departure,
    route: getFieldValue(messages, ['Route']) || route,
    kingsSlot: getFieldValue(messages, ['Kings Slot', 'Kings Parking', 'Our Slot']),
    routeLength: getFieldValue(messages, ['Route Length', 'Distance', 'Route Distance']),
    dlcs: getFieldValue(messages, ['Required DLCs', 'DLCs', 'Required DLC'])
  };
}

function eventIdMarker(eventId) {
  return `🔗 **Event ID:** \`${eventId}\``;
}

function eventMarker(marker, eventId) {
  return `${marker}\n${eventIdMarker(eventId)}`;
}

async function findExistingMessage(channelId, eventId, botId, internal = false) {
  const lookup = eventIdMarker(eventId);
  const label = internal ? 'Kings Convoy Internal Announcement' : 'Kings Convoy Announcement';
  let before = null;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const messages = await discord(`/channels/${channelId}/messages?${query.toString()}`);
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const found = messages.find((message) =>
      message.author?.id === botId &&
      (message.content || '').includes(lookup) &&
      (message.content || '').includes(label)
    );
    if (found) return found;

    if (messages.length < 100) return null;
    before = messages[messages.length - 1].id;
  }

  throw new Error('Announcement history limit reached; duplicate protection is inconclusive.');
}

function buildPublicContent({ eventId, name, details, startingNow, hasRouteImage }) {
  const eventUrl = `https://truckersmp.com/events/${eventId}`;
  const marker = startingNow ? MARKER_NOW : MARKER_2H;
  const intro = startingNow
    ? 'The Kings Logistics convoy Meeting Time has arrived. Join us now and get ready to hit the road! 👑🚛'
    : 'Our Kings Logistics convoy Meeting Time is now within 2 hours. Get ready to join us on the road! 👑🚛';

  return [
    eventMarker(marker, eventId),
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
    hasRouteImage ? '' : null,
    hasRouteImage ? '🗺️ **Route Map**' : null,
    '',
    '💙 **Kings Logistics — Connecting the world, creating friendships.**'
  ].filter((value) => value !== null && value !== undefined).join('\n');
}

function buildInternalContent({ eventId, name, details, startingNow }) {
  const eventUrl = `https://truckersmp.com/events/${eventId}`;
  const marker = startingNow ? MARKER_INTERNAL_NOW : MARKER_INTERNAL_2H;
  const title = startingNow ? '🚨 Convoy Reminder — Starting Now' : '⏰ Convoy Reminder — 2 Hours';
  const intro = startingNow
    ? 'The convoy Meeting Time has arrived. Please join the server now and be ready at the meeting point.'
    : 'The convoy Meeting Time is now within 2 hours. Please check the details below and make sure you are prepared.';

  return [
    eventMarker(marker, eventId),
    '',
    `<@&${DRIVER_ROLE_ID}>`,
    '',
    `# ${title}`,
    '',
    intro,
    '',
    `🚛 **Convoy:** ${name}`,
    details.meetingUnix ? `🕒 **Meeting Time:** <t:${details.meetingUnix}:F> · <t:${details.meetingUnix}:R>` : null,
    details.server ? `🎙️ **Server:** ${details.server}` : null,
    details.meetingPoint ? `📍 **Meeting Point:** ${details.meetingPoint}` : null,
    details.route ? `🗺️ **Route:** ${details.route}` : null,
    details.kingsSlot ? `🚚 **Kings Slot:** ${details.kingsSlot}` : null,
    `🔗 **TruckersMP Event:** ${eventUrl}`,
    '',
    'Please make sure you are ready and arrive before the meeting time. 💙'
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

async function sendPublicAnnouncement(content, routeImage) {
  if (!routeImage) {
    return discord(`/channels/${ANNOUNCEMENT_CHANNEL_ID}/messages`, {
      method: 'POST',
      body: {
        content,
        allowed_mentions: { parse: ['everyone'] }
      }
    });
  }

  const imageResponse = await resilientFetch(
    routeImage.url,
    {
      label: 'kings-convoy-route-image',
      retries: 2,
      timeoutMs: 15000,
      fetchOptions: {
        headers: {
          'User-Agent': 'Kings Logistics Kings Convoy Announcements/1.3'
        }
      }
    }
  );

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
      'User-Agent': 'Kings Logistics Kings Convoy Announcements/1.3'
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

async function sendInternalAnnouncement(content) {
  return discord(`/channels/${INTERNAL_CHANNEL_ID}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: {
        parse: [],
        roles: [DRIVER_ROLE_ID]
      }
    }
  });
}

async function updateInternalAnnouncement(messageId, content) {
  return discord(`/channels/${INTERNAL_CHANNEL_ID}/messages/${messageId}`, {
    method: 'PATCH',
    body: {
      content,
      allowed_mentions: {
        parse: [],
        roles: [DRIVER_ROLE_ID]
      }
    }
  });
}

async function main() {
  const bot = await discord('/users/@me');
  const sourceForum = await discord(`/channels/${SOURCE_FORUM_ID}`);
  const targetChannel = await discord(`/channels/${ANNOUNCEMENT_CHANNEL_ID}`);
  const internalChannel = await discord(`/channels/${INTERNAL_CHANNEL_ID}`);

  if (sourceForum.guild_id && sourceForum.guild_id !== GUILD_ID) {
    throw new Error(`Kings convoy source forum ${SOURCE_FORUM_ID} does not belong to guild ${GUILD_ID}.`);
  }
  if (targetChannel.guild_id && targetChannel.guild_id !== GUILD_ID) {
    throw new Error(`Kings convoy announcement channel ${ANNOUNCEMENT_CHANNEL_ID} does not belong to guild ${GUILD_ID}.`);
  }
  if (internalChannel.guild_id && internalChannel.guild_id !== GUILD_ID) {
    throw new Error(`Kings convoy internal channel ${INTERNAL_CHANNEL_ID} does not belong to guild ${GUILD_ID}.`);
  }

  const entries = await listSourceEntries(sourceForum);
  const nowUnix = Math.floor(Date.now() / 1000);
  let publicSent = 0;
  let internalSent = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Kings convoy source forum: ${sourceForum.name || SOURCE_FORUM_ID} (${SOURCE_FORUM_ID})`);
  console.log(`Kings convoy public channel: ${targetChannel.name || ANNOUNCEMENT_CHANNEL_ID} (${ANNOUNCEMENT_CHANNEL_ID})`);
  console.log(`Kings convoy internal channel: ${internalChannel.name || INTERNAL_CHANNEL_ID} (${INTERNAL_CHANNEL_ID})`);
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
      if (secondsUntilMeeting > WINDOW_2H || secondsUntilMeeting < -RECOVERY_GRACE) {
        skipped += 1;
        continue;
      }

      if (!details.departureUnix || details.departureUnix < details.meetingUnix ||
          !details.server || !locationLabel(event.departure) || !locationLabel(event.arrive)) {
        throw new Error('Convoy announcement requires a valid departure time, server, start and destination.');
      }

      const startingNow = secondsUntilMeeting <= 0;
      const routeImage = findRouteImage(messages);
      if (!routeImage) {
        console.log(`- ${entry.name} | no route image found; sending verified text-only announcement.`);
      }

      const existingPublic = await findExistingMessage(ANNOUNCEMENT_CHANNEL_ID, eventId, bot.id, false);
      const existingInternal = await findExistingMessage(INTERNAL_CHANNEL_ID, eventId, bot.id, true);
      const name = displayName(entry, event);

      if (!existingPublic) {
        const publicContent = buildPublicContent({ eventId, name, details, startingNow, hasRouteImage: Boolean(routeImage) });
        if (require('./kings-branding').brandMessageContent(publicContent).length > 2000) {
          throw new Error('Public convoy announcement exceeds Discord message length.');
        }
        const sent = await sendPublicAnnouncement(publicContent, routeImage);
        console.log(`- ${entry.name} | public announcement sent: ${sent?.id || 'unknown'}`);
        publicSent += 1;
      } else {
        console.log(`- ${entry.name} | public announcement: already-sent (${existingPublic.id})`);
      }

      if (!details.kingsSlot) {
        console.log(`- ${entry.name} | internal reminder deferred: Kings Slot is not available in the Kings source entry yet.`);
        skipped += 1;
        continue;
      }

      const internalContent = buildInternalContent({ eventId, name, details, startingNow });
      if (require('./kings-branding').brandMessageContent(internalContent).length > 2000) {
        throw new Error('Internal convoy announcement exceeds Discord message length.');
      }

      if (!existingInternal) {
        const sent = await sendInternalAnnouncement(internalContent);
        console.log(`- ${entry.name} | internal reminder sent: ${sent?.id || 'unknown'} | Kings Slot: ${details.kingsSlot}`);
        internalSent += 1;
      } else if (String(existingInternal.content || '').trim() !== require('./kings-branding').brandMessageContent(internalContent).trim()) {
        await updateInternalAnnouncement(existingInternal.id, internalContent);
        console.log(`- ${entry.name} | internal reminder updated: ${existingInternal.id} | Kings Slot: ${details.kingsSlot}`);
      } else {
        console.log(`- ${entry.name} | internal reminder: already-current (${existingInternal.id})`);
      }

      if (existingPublic && existingInternal) skipped += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `- ${entry.name} | Kings convoy announcement failed safely: ${error.message}`
      );
    }
  }

  console.log(
    `Kings Convoy Announcements finished. Public sent: ${publicSent}. Internal sent: ${internalSent}. Skipped: ${skipped}. Failed: ${failed}.`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Kings Convoy Announcements failed:', error.message);
  process.exit(1);
});