const fs = require('fs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const REPORT_PATH = 'output/convoy-check-results.json';
const TMP_API_BASE = process.env.TRUCKERSMP_API_BASE || 'https://api.truckersmp.com/v2';
const KINGS_VTC_NAME = process.env.KINGS_VTC_NAME || 'Kings Logistics';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Missing ${REPORT_PATH}. Run convoy-checker.js first.`);
  process.exit(1);
}

const DISCORD_API = 'https://discord.com/api/v10';
const tmpEventCache = new Map();

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics TruckersMP Convoy Sync/1.1'
  };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
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

function isTestThread(item) {
  if (typeof item.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item.name || '');
}

function eventIdFromText(text = '') {
  const value = String(text);

  const urlMatch = value.match(/https?:\/\/(?:www\.)?truckersmp\.com\/events\/(\d+)/i);
  if (urlMatch) return urlMatch[1];

  const labeledMatch = value.match(/\b(?:TruckersMP\s+)?Event\s+ID\s*(?::|#|-)\s*(\d+)\b/i);
  return labeledMatch ? labeledMatch[1] : null;
}

function latestHumanEventId(messages, fallback = null) {
  const sorted = [...(messages || [])]
    .filter((message) => !message.author?.bot)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  for (const message of sorted) {
    const eventId = eventIdFromText(message.content || '');
    if (eventId) return eventId;
  }

  return fallback || null;
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function locationLabel(location) {
  if (!location) return null;
  if (typeof location === 'string') return cleanText(location);
  if (typeof location !== 'object') return null;

  const city = cleanText(location.city);
  const place = cleanText(location.location || location.name);

  if (city && place && city.toLowerCase() !== place.toLowerCase()) {
    return `${city} — ${place}`;
  }

  return city || place || null;
}

function utcDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function utcTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function internalEventType(event) {
  const hostVtc = cleanText(
    typeof event?.vtc === 'string'
      ? event.vtc
      : event?.vtc?.name || event?.vtc?.company_name || event?.host_vtc?.name
  );

  if (hostVtc && hostVtc.toLowerCase() === KINGS_VTC_NAME.toLowerCase()) {
    return 'Kings-hosted';
  }

  return 'External';
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
  if (tmpEventCache.has(eventId)) return tmpEventCache.get(eventId);

  const promise = (async () => {
    const response = await fetch(`${TMP_API_BASE}/events/${encodeURIComponent(eventId)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics TruckersMP Convoy Sync/1.1'
      },
      signal: AbortSignal.timeout(12000)
    });

    const text = await response.text();
    let payload = null;

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
    if (!event || !cleanText(event.id || eventId)) {
      throw new Error(`TruckersMP Event ${eventId} returned no usable event object.`);
    }

    return event;
  })();

  tmpEventCache.set(eventId, promise);
  return promise;
}

function setAuthoritative(parsed, key, value, applied) {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  parsed[key] = value;
  applied.push(key);
  return true;
}

function buildAuthoritativeFields(event) {
  const departure = locationLabel(event.departure);
  const arrival = locationLabel(event.arrive);
  const route = departure && arrival
    ? `${departure} → ${arrival}`
    : departure || arrival || null;

  // Event date is based on meetup time where available. Meeting Time must never
  // silently fall back to start_at because reminders need the real meetup time.
  const eventDate = utcDate(event.meetup_at) || utcDate(event.start_at);
  const meetingTime = utcTime(event.meetup_at);

  return {
    eventType: internalEventType(event),
    eventDate,
    route,
    start: departure,
    destination: arrival,
    meetup: departure,
    meetupTime: meetingTime
  };
}

function applyTruckersMpAuthoritative(item, event) {
  item.validation = item.validation || {};
  item.validation.parsed = item.validation.parsed || {};
  const parsed = item.validation.parsed;
  const applied = [];
  const authoritative = buildAuthoritativeFields(event);

  setAuthoritative(parsed, 'eventType', authoritative.eventType, applied);

  if (authoritative.eventDate) {
    parsed.eventDate = authoritative.eventDate;
    parsed.eventDateRaw = authoritative.eventDate;
    applied.push('eventDate');
  }

  setAuthoritative(parsed, 'route', authoritative.route, applied);
  setAuthoritative(parsed, 'start', authoritative.start, applied);
  setAuthoritative(parsed, 'destination', authoritative.destination, applied);
  setAuthoritative(parsed, 'meetup', authoritative.meetup, applied);
  setAuthoritative(parsed, 'meetupTime', authoritative.meetupTime, applied);

  return { authoritative, applied };
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  let changed = false;
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of report.threads || []) {
    if (item.ignored || item.error || isTestThread(item)) {
      skipped += 1;
      continue;
    }

    try {
      const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);
      const eventId = latestHumanEventId(messages, item.eventId || null);

      if (!eventId) {
        item.truckersmpSync = {
          ok: false,
          authoritative: false,
          reason: 'missing-event-id',
          syncedAt: new Date().toISOString()
        };
        skipped += 1;
        continue;
      }

      const before = JSON.stringify({
        eventId: item.eventId || null,
        parsed: item.validation?.parsed || {},
        truckersmp: item.truckersmp || null
      });

      // Keep the Event ID even if the TruckersMP API is temporarily unavailable.
      item.eventId = String(eventId);
      const event = await fetchTruckersMpEvent(eventId);
      item.eventId = String(event.id || eventId);
      const { authoritative, applied } = applyTruckersMpAuthoritative(item, event);

      const eventType = typeof event.event_type === 'string'
        ? cleanText(event.event_type)
        : cleanText(event.event_type?.name || event.event_type?.key);
      const server = typeof event.server === 'string'
        ? cleanText(event.server)
        : cleanText(event.server?.name);
      const game = typeof event.game === 'string'
        ? cleanText(event.game)
        : cleanText(event.game?.name || event.game?.short_name);
      const hostVtc = cleanText(
        typeof event.vtc === 'string'
          ? event.vtc
          : event.vtc?.name || event.vtc?.company_name || event.host_vtc?.name
      );

      item.truckersmp = {
        id: Number(event.id || eventId),
        name: cleanText(event.name || event.title),
        publicEventType: eventType,
        game,
        server,
        language: cleanText(typeof event.language === 'string' ? event.language : event.language?.name),
        departure: event.departure || null,
        arrive: event.arrive || null,
        meetupAtUtc: cleanText(event.meetup_at),
        startAtUtc: cleanText(event.start_at),
        hostVtc,
        url: cleanText(event.url) || `https://truckersmp.com/events/${eventId}`,
        updatedAtUtc: cleanText(event.updated_at),
        authoritative
      };

      item.truckersmpSync = {
        ok: true,
        authoritative: true,
        source: 'TruckersMP API v2',
        applied,
        meetingTimeSource: event.meetup_at ? 'meetup_at' : 'manual-required',
        syncedAt: new Date().toISOString()
      };

      const after = JSON.stringify({
        eventId: item.eventId || null,
        parsed: item.validation?.parsed || {},
        truckersmp: item.truckersmp || null
      });

      if (before !== after) changed = true;
      synced += 1;

      console.log(
        `- ${item.name} | TruckersMP ${item.eventId} authoritative sync | Applied: ${applied.join(', ') || 'none'} | Meeting Time: ${event.meetup_at ? 'API meetup_at' : 'manual required'}`
      );
    } catch (error) {
      failed += 1;
      item.truckersmpSync = {
        ok: false,
        authoritative: false,
        reason: 'api-error',
        error: error.message,
        syncedAt: new Date().toISOString()
      };
      // Never clear existing/manual values when the external API is unavailable.
      console.warn(`- ${item.name} | TruckersMP sync failed; existing values kept: ${error.message}`);
    }
  }

  // Recalculate duplicate Event IDs after IDs from plain `Event ID:` messages have been resolved.
  const eventMap = new Map();
  for (const item of report.threads || []) {
    if (item.ignored || item.error || isTestThread(item) || !item.eventId) continue;
    const eventId = String(item.eventId);
    if (!eventMap.has(eventId)) eventMap.set(eventId, []);
    eventMap.get(eventId).push(item.threadId);
  }

  const duplicateEventIds = [...eventMap.entries()]
    .filter(([, threadIds]) => threadIds.length > 1)
    .map(([eventId, threadIds]) => ({ eventId, threadIds }));

  const duplicateThreadIds = new Set(duplicateEventIds.flatMap((entry) => entry.threadIds));
  for (const item of report.threads || []) {
    if (item.ignored || item.error || isTestThread(item)) continue;
    item.duplicateEventId = duplicateThreadIds.has(item.threadId);
  }

  report.duplicateEventIds = duplicateEventIds;
  report.summary = report.summary || {};
  report.summary.duplicateEventIds = duplicateEventIds.length;

  if (changed || synced > 0 || failed > 0 || duplicateEventIds.length > 0) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  }

  console.log(
    `Kings TruckersMP Convoy Sync finished. Synced: ${synced}. Skipped: ${skipped}. Failed: ${failed}. Report changed: ${changed ? 'yes' : 'no'}.`
  );
}

main().catch((error) => {
  console.error('Kings TruckersMP Convoy Sync failed:', error.message);
  process.exit(1);
});
