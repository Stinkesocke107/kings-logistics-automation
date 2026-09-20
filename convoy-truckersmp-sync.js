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
    'User-Agent': 'Kings Logistics TruckersMP Convoy Sync/1.0'
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
  const text = String(value || '').trim();
  return text || null;
}

function locationLabel(location) {
  if (!location || typeof location !== 'object') return null;

  const city = cleanText(location.city);
  const place = cleanText(location.location);

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
  const hostVtc = cleanText(event?.vtc?.name);
  if (hostVtc && hostVtc.toLowerCase() === KINGS_VTC_NAME.toLowerCase()) {
    return 'Kings-hosted';
  }
  return 'External';
}

async function fetchTruckersMpEvent(eventId) {
  if (tmpEventCache.has(eventId)) return tmpEventCache.get(eventId);

  const promise = (async () => {
    const response = await fetch(`${TMP_API_BASE}/events/${encodeURIComponent(eventId)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics TruckersMP Convoy Sync/1.0'
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

    if (!response.ok || payload?.error || !payload?.response) {
      const descriptor = payload?.descriptor || payload?.response || `HTTP ${response.status}`;
      throw new Error(`TruckersMP Event ${eventId} could not be loaded: ${String(descriptor).slice(0, 300)}`);
    }

    return payload.response;
  })();

  tmpEventCache.set(eventId, promise);
  return promise;
}

function fillIfMissing(parsed, key, value, autoFilled) {
  if (parsed[key] !== null && parsed[key] !== undefined && String(parsed[key]).trim() !== '') {
    return false;
  }
  if (value === null || value === undefined || String(value).trim() === '') return false;

  parsed[key] = value;
  autoFilled.push(key);
  return true;
}

function applyTruckersMpDefaults(item, event) {
  item.validation = item.validation || {};
  item.validation.parsed = item.validation.parsed || {};
  const parsed = item.validation.parsed;
  const autoFilled = [];

  const departure = locationLabel(event.departure);
  const arrival = locationLabel(event.arrive);
  const route = departure && arrival ? `${departure} → ${arrival}` : null;

  // Event Date can fall back to start_at, but Meeting Time never does.
  // Reminders must always use the real meetup time, not the departure/start time.
  const eventDate = utcDate(event.meetup_at) || utcDate(event.start_at);
  const meetingTime = utcTime(event.meetup_at);

  fillIfMissing(parsed, 'eventType', internalEventType(event), autoFilled);

  if (!parsed.eventDate) {
    if (eventDate) {
      parsed.eventDate = eventDate;
      parsed.eventDateRaw = parsed.eventDateRaw || eventDate;
      autoFilled.push('eventDate');
    }
  }

  fillIfMissing(parsed, 'route', route, autoFilled);
  fillIfMissing(parsed, 'start', departure, autoFilled);
  fillIfMissing(parsed, 'destination', arrival, autoFilled);
  fillIfMissing(parsed, 'meetup', departure, autoFilled);
  fillIfMissing(parsed, 'meetupTime', meetingTime, autoFilled);

  return autoFilled;
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
      const autoFilled = applyTruckersMpDefaults(item, event);

      item.truckersmp = {
        id: Number(event.id || eventId),
        name: cleanText(event.name),
        publicEventType: cleanText(event.event_type?.name),
        game: cleanText(event.game),
        server: cleanText(event.server?.name),
        language: cleanText(event.language),
        departure: event.departure || null,
        arrive: event.arrive || null,
        meetupAtUtc: cleanText(event.meetup_at),
        startAtUtc: cleanText(event.start_at),
        hostVtc: cleanText(event.vtc?.name),
        url: cleanText(event.url) || `https://truckersmp.com/events/${eventId}`,
        updatedAtUtc: cleanText(event.updated_at)
      };

      item.truckersmpSync = {
        ok: true,
        source: 'TruckersMP API v2',
        autoFilled,
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
        `- ${item.name} | TruckersMP ${item.eventId} synced | Auto-filled: ${autoFilled.join(', ') || 'none'} | Meeting Time: ${event.meetup_at ? 'API meetup_at' : 'manual required'}`
      );
    } catch (error) {
      failed += 1;
      item.truckersmpSync = {
        ok: false,
        reason: 'api-error',
        error: error.message,
        syncedAt: new Date().toISOString()
      };
      console.warn(`- ${item.name} | TruckersMP sync failed: ${error.message}`);
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
