from pathlib import Path
import re

BRANDING = "require('./kings-branding').installDiscordBranding();\n"
IMPORT_JSON = "const { resilientFetchJson } = require('./api-resilience');\n"
IMPORT_BOTH = "const { resilientFetch, resilientFetchJson } = require('./api-resilience');\n"


def add_import(source: str, import_line: str, filename: str) -> str:
    if "require('./api-resilience')" in source:
        return source
    if BRANDING not in source:
        raise SystemExit(f'Branding anchor not found in {filename}')
    return source.replace(BRANDING, BRANDING + import_line, 1)


# ------------------------------------------------------
# CONVOY TRUCKERSMP SYNC
# ------------------------------------------------------
path = Path('convoy-truckersmp-sync.js')
source = add_import(path.read_text(encoding='utf-8'), IMPORT_JSON, path.name)

pattern = re.compile(
    r'async function fetchTruckersMpEvent\(eventId\) \{.*?\n\}\n\nfunction setAuthoritative',
    re.S
)
replacement = '''async function fetchTruckersMpEvent(eventId) {
  if (tmpEventCache.has(eventId)) return tmpEventCache.get(eventId);

  const promise = (async () => {
    const payload = await resilientFetchJson(
      `${TMP_API_BASE}/events/${encodeURIComponent(eventId)}`,
      {
        label: 'truckersmp-convoy-event-sync',
        retries: 3,
        timeoutMs: 12000,
        fetchOptions: {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Kings Logistics TruckersMP Convoy Sync/1.2'
          }
        },
        validateJson: (data) => Boolean(data && data.error !== true)
      }
    );

    const event = unwrapEventPayload(payload);
    if (!event || !cleanText(event.id || eventId)) {
      throw new Error(`TruckersMP Event ${eventId} returned no usable event object.`);
    }

    return event;
  })();

  // Cache only within this workflow run. A rejected request is removed again so
  // another entry with the same Event ID may retry later in the same run.
  tmpEventCache.set(eventId, promise);
  promise.catch(() => tmpEventCache.delete(eventId));
  return promise;
}

function setAuthoritative'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'convoy sync event fetch replacement count: {count}')

# Preserve the previous last-known-good sync timestamp/value and explicitly
# identify the current state as uncertain without clearing authoritative data.
old_catch = '''      item.truckersmpSync = {
        ok: false,
        authoritative: false,
        reason: 'api-error',
        error: error.message,
        syncedAt: new Date().toISOString()
      };
      // Never clear existing/manual values when the external API is unavailable.
      console.warn(`- ${item.name} | TruckersMP sync failed; existing values kept: ${error.message}`);'''
new_catch = '''      const previousSync = item.truckersmpSync || null;
      item.truckersmpSync = {
        ok: false,
        authoritative: false,
        uncertain: true,
        reason: 'api-error',
        error: error.message,
        lastKnownGoodAt: previousSync?.ok
          ? previousSync.syncedAt || null
          : previousSync?.lastKnownGoodAt || item.truckersmp?.updatedAtUtc || null,
        checkedAt: new Date().toISOString()
      };
      // Never clear existing/manual values or last-known-good TruckersMP data
      // when the external API is unavailable or returns an untrusted response.
      console.warn(`- ${item.name} | TruckersMP sync uncertain; last-known-good values kept: ${error.message}`);'''
if old_catch not in source:
    raise SystemExit('convoy sync API-error catch anchor not found')
source = source.replace(old_catch, new_catch, 1)
path.write_text(source, encoding='utf-8')


# ------------------------------------------------------
# KINGS PUBLIC CONVOY ANNOUNCEMENTS
# ------------------------------------------------------
path = Path('kings-convoy-announcements.js')
source = add_import(path.read_text(encoding='utf-8'), IMPORT_BOTH, path.name)

pattern = re.compile(
    r'async function fetchTruckersMpEvent\(eventId\) \{.*?\n\}\n\nfunction unixFromDate',
    re.S
)
replacement = '''async function fetchTruckersMpEvent(eventId) {
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

function unixFromDate'''
source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'Kings announcement event fetch replacement count: {count}')

old_image = '''  const imageResponse = await fetch(routeImage.url, { signal: AbortSignal.timeout(15000) });
  if (!imageResponse.ok) {
    throw new Error(`Route image download failed with HTTP ${imageResponse.status}.`);
  }
'''
new_image = '''  const imageResponse = await resilientFetch(
    routeImage.url,
    {
      label: 'kings-convoy-route-image',
      retries: 2,
      timeoutMs: 15000,
      fetchOptions: {
        headers: {
          'User-Agent': 'Kings Logistics Kings Convoy Announcements/1.2'
        }
      }
    }
  );
'''
if old_image not in source:
    raise SystemExit('Kings announcement route image anchor not found')
source = source.replace(old_image, new_image, 1)

# Clarify that a TruckersMP API failure means this event is skipped for this
# workflow run; there is no sent-state mutation and no fallback to stale timing.
old_warn = '''      console.warn(`- ${entry.name} | Kings convoy announcement failed: ${error.message}`);'''
new_warn = '''      console.warn(
        `- ${entry.name} | Kings convoy announcement safely deferred; no post/state change made: ${error.message}`
      );'''
if old_warn not in source:
    raise SystemExit('Kings announcement failure log anchor not found')
source = source.replace(old_warn, new_warn, 1)
path.write_text(source, encoding='utf-8')

print('Convoy API resilience wave two applied.')
