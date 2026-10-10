const fs = require('fs');

const KINGS_VTC_ID = Number(process.env.KINGS_VTC_ID || '64284');
const START_ID = Number(process.env.KINGS_2023_SCAN_START_ID || '10000');
const END_ID = Number(process.env.KINGS_2023_SCAN_END_ID || '19999');
const FROM_DATE = process.env.KINGS_2023_FROM_DATE || '2023-07-09';
const TO_DATE = process.env.KINGS_2023_TO_DATE || '2023-12-31';
const OUTPUT = process.env.KINGS_2023_SCAN_OUTPUT || 'data/convoy-history-2023-scan.json';
const MIN_REQUEST_INTERVAL_MS = Number(process.env.KINGS_2023_SCAN_INTERVAL_MS || '75');
const WORKERS = Math.max(1, Math.min(8, Number(process.env.KINGS_2023_SCAN_WORKERS || '4')));

let nextRequestAt = 0;
let throttleChain = Promise.resolve();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isoDate(value) {
  const raw = clean(value);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function fullUrl(event) {
  const raw = clean(event?.url);
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  if (raw && raw.startsWith('/')) return 'https://truckersmp.com' + raw;
  return event?.id ? `https://truckersmp.com/events/${event.id}` : null;
}

function locationLabel(value) {
  if (!value) return null;
  if (typeof value === 'string') return clean(value);
  const city = clean(value.city);
  const location = clean(value.location || value.name);
  return city && location ? city + ' — ' + location : city || location;
}

function confirmedVtcs(event) {
  const list = event?.attendances?.confirmed_vtcs;
  return Array.isArray(list) ? list : [];
}

function kingsIsConfirmed(event) {
  return confirmedVtcs(event).some(vtc => Number(vtc?.id) === KINGS_VTC_ID);
}

function toHistoryRecord(event, observedAt) {
  const hostId = Number(event?.vtc?.id || 0);
  const own = hostId === KINGS_VTC_ID;
  const id = String(event.id);

  return {
    id: 'KCE-TRUCKERSMP-' + id,
    platform: 'truckersmp',
    platformEventId: id,
    name: clean(event.name) || 'Unknown TruckersMP Event',
    date: isoDate(event.meetup_at || event.start_at),
    type: own ? 'own' : 'external',
    organizer: own ? 'Kings Logistics' : clean(event?.vtc?.name) || clean(event?.user?.username),
    status: 'completed',
    participation: {
      status: 'attended',
      confidence: 'verified'
    },
    attendance: {
      known: false,
      count: null,
      driverIds: []
    },
    eventUrl: fullUrl(event),
    evidence: [
      {
        source: 'truckersmp-api-event-scan',
        kind: own ? 'truckersmp-vtc-hosted-event' : 'truckersmp-confirmed-vtc-attendance',
        url: fullUrl(event),
        note: own
          ? 'TruckersMP event is hosted by Kings Logistics.'
          : 'TruckersMP Event API confirmed_vtcs contains Kings Logistics (VTC 64284).',
        observedAt
      }
    ],
    sourceDetails: {
      scanEventId: Number(event.id),
      confirmedVtcCount: confirmedVtcs(event).length,
      start: locationLabel(event.departure),
      destination: locationLabel(event.arrive),
      meetupAt: clean(event.meetup_at),
      departureAt: clean(event.start_at)
    },
    createdAt: null,
    updatedAt: observedAt
  };
}

async function waitForTurn() {
  let release;
  const prior = throttleChain;
  throttleChain = new Promise(resolve => { release = resolve; });
  await prior;

  try {
    const now = Date.now();
    const wait = Math.max(0, nextRequestAt - now);
    if (wait) await sleep(wait);
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
}

async function fetchEvent(id) {
  const url = `https://api.truckersmp.com/v2/events/${id}`;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await waitForTurn();

    let response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Kings Logistics Historical Convoy Audit/1.0'
        },
        signal: AbortSignal.timeout(12000)
      });
    } catch (error) {
      if (attempt >= 4) return { state: 'network-error', error: error.message };
      await sleep(500 * attempt);
      continue;
    }

    if (response.status === 404) {
      await response.arrayBuffer().catch(() => {});
      return { state: 'not-found' };
    }

    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const seconds = Number(header);
      const wait = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 2000 * attempt;
      await response.arrayBuffer().catch(() => {});
      await sleep(Math.min(30000, Math.max(1000, wait)));
      continue;
    }

    if (!response.ok) {
      await response.arrayBuffer().catch(() => {});
      if (response.status >= 500 && attempt < 4) {
        await sleep(500 * attempt);
        continue;
      }
      return { state: 'http-error', status: response.status };
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      return { state: 'invalid-json', error: error.message };
    }

    if (payload?.error === true || !payload?.response?.id) {
      return { state: 'not-found' };
    }

    return { state: 'ok', event: payload.response };
  }

  return { state: 'retry-exhausted' };
}

function existingCompleteScan() {
  if (/^(?:1|true|yes)$/i.test(process.env.KINGS_RESCAN_2023 || '')) return null;
  if (!fs.existsSync(OUTPUT)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    if (
      data?.complete === true &&
      Number(data?.range?.startId) === START_ID &&
      Number(data?.range?.endId) === END_ID &&
      data?.dateWindow?.from === FROM_DATE &&
      data?.dateWindow?.to === TO_DATE
    ) {
      return data;
    }
  } catch {
    return null;
  }
  return null;
}

async function main() {
  const existing = existingCompleteScan();
  if (existing) {
    console.log(`2023 historical scan already complete: ${existing.matches?.length || 0} Kings events.`);
    return;
  }

  if (!Number.isInteger(START_ID) || !Number.isInteger(END_ID) || START_ID < 1 || END_ID < START_ID) {
    throw new Error('Invalid event ID scan range.');
  }

  const observedAt = new Date().toISOString();
  const stats = {
    requested: END_ID - START_ID + 1,
    checked: 0,
    foundEvents: 0,
    inDateWindow: 0,
    notFound: 0,
    requestErrors: 0
  };
  const matches = [];
  const errors = [];
  let nextId = START_ID;

  async function worker() {
    while (true) {
      const id = nextId++;
      if (id > END_ID) return;

      const result = await fetchEvent(id);
      stats.checked += 1;

      if (result.state === 'not-found') {
        stats.notFound += 1;
      } else if (result.state !== 'ok') {
        stats.requestErrors += 1;
        if (errors.length < 100) errors.push({ id, ...result });
      } else {
        stats.foundEvents += 1;
        const event = result.event;
        const date = isoDate(event.meetup_at || event.start_at);

        if (date && date >= FROM_DATE && date <= TO_DATE) {
          stats.inDateWindow += 1;
          if (kingsIsConfirmed(event) || Number(event?.vtc?.id || 0) === KINGS_VTC_ID) {
            matches.push(toHistoryRecord(event, observedAt));
            console.log(`MATCH ${id} ${date}: ${event.name}`);
          }
        }
      }

      if (stats.checked % 500 === 0) {
        console.log(`Progress: ${stats.checked}/${stats.requested}, events=${stats.foundEvents}, 2023-window=${stats.inDateWindow}, Kings=${matches.length}, errors=${stats.requestErrors}`);
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()));

  matches.sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    Number(a.platformEventId) - Number(b.platformEventId)
  );

  const output = {
    version: 1,
    mode: 'one-time-truckersmp-2023-historical-event-scan',
    generatedAt: observedAt,
    complete: stats.checked === stats.requested && stats.requestErrors === 0,
    kingsVtcId: KINGS_VTC_ID,
    range: { startId: START_ID, endId: END_ID },
    dateWindow: { from: FROM_DATE, to: TO_DATE },
    requestPolicy: {
      workers: WORKERS,
      minimumRequestStartIntervalMs: MIN_REQUEST_INTERVAL_MS,
      retry429And5xx: true
    },
    stats,
    matches,
    errors
  };

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');

  console.log('2023 historical TruckersMP scan finished.');
  console.log(`Kings matches: ${matches.length}`);
  console.log(`Complete: ${output.complete}`);

  if (stats.requestErrors > 0) {
    throw new Error(`Historical scan finished with ${stats.requestErrors} request errors; refusing to mark 2023 complete.`);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('2023 historical convoy scan failed:', error.message);
    process.exit(1);
  });
}

module.exports = { isoDate, kingsIsConfirmed, toHistoryRecord };
