const fs = require('fs');
const { resilientFetchJson } = require('./api-resilience');

const VTC_ID = String(process.env.KINGS_VTC_ID || '64284');
const API_BASE = 'https://api.truckersmp.com/v2';
const OUTPUT_PATH = process.env.KINGS_CONVOY_HISTORY_CANDIDATES || 'output/convoy-history-truckersmp-candidates.json';
const FROM_DATE = process.env.KINGS_CONVOY_HISTORY_FROM || '2023-01-01';

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function eventId(event) {
  return clean(event?.id || event?.event_id);
}

function eventName(event) {
  return clean(event?.name || event?.title) || 'Unknown TruckersMP Event';
}

function eventDate(event) {
  const value = clean(event?.meetup_at || event?.start_at || event?.date);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function eventUrl(event) {
  const id = eventId(event);
  const raw = clean(event?.url);
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  if (raw && raw.startsWith('/')) return 'https://truckersmp.com' + raw;
  return id ? `https://truckersmp.com/events/${id}` : null;
}

function hostVtcName(event) {
  return clean(
    event?.vtc?.name ||
    event?.host_vtc?.name ||
    event?.hostVtc?.name ||
    event?.organizer?.name
  );
}

function locationLabel(value) {
  if (!value) return null;
  if (typeof value === 'string') return clean(value);
  const city = clean(value.city);
  const location = clean(value.location || value.name);
  if (city && location) return city + ' — ' + location;
  return city || location;
}

function normalizeCandidate(event, sourceKind) {
  const id = eventId(event);
  const date = eventDate(event);
  const today = new Date().toISOString().slice(0, 10);
  const phase = !date ? 'unknown' : date < today ? 'past' : date === today ? 'today' : 'future';

  const completed = phase === 'past';
  const participation = completed
    ? { status: 'attended', confidence: 'verified' }
    : { status: 'planned', confidence: 'verified' };

  return {
    candidateKey: id ? 'truckersmp:' + id : null,
    platform: 'truckersmp',
    platformEventId: id,
    name: eventName(event),
    date,
    phase,
    type: sourceKind === 'hosted' ? 'own' : 'external',
    organizer: sourceKind === 'hosted' ? 'Kings Logistics' : hostVtcName(event),
    eventUrl: eventUrl(event),
    sourceKind,
    discoveryEvidence: sourceKind === 'hosted'
      ? {
          kind: 'truckersmp-vtc-hosted-event',
          meaning: 'TruckersMP lists the event under Kings Logistics hosted events.'
        }
      : {
          kind: 'truckersmp-vtc-attending',
          meaning: 'TruckersMP lists Kings Logistics under VTCs Attending. By Kings policy, this is verified Kings participation once the event date has passed.'
        },
    suggestedParticipation: participation,
    start: locationLabel(event?.departure),
    destination: locationLabel(event?.arrive),
    server: clean(event?.server?.name || event?.server),
    meetupAt: clean(event?.meetup_at),
    departureAt: clean(event?.start_at)
  };
}

function unwrapArray(payload, label) {
  if (!payload || payload.error === true || !Array.isArray(payload.response)) {
    throw new Error(label + ' returned an invalid TruckersMP API payload.');
  }
  return payload.response;
}

async function fetchList(path, label) {
  return resilientFetchJson(API_BASE + path, {
    label,
    retries: 3,
    timeoutMs: 15000,
    fetchOptions: {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics Convoy History/1.0'
      }
    },
    validateJson: payload => Boolean(payload && payload.error !== true && Array.isArray(payload.response))
  });
}

function deduplicate(hosted, attending) {
  const map = new Map();

  for (const item of attending) {
    if (!item.candidateKey) continue;
    map.set(item.candidateKey, item);
  }

  for (const item of hosted) {
    if (!item.candidateKey) continue;
    // Hosted-by-Kings is the stronger classification when the same event is
    // returned by both TruckersMP VTC endpoints.
    map.set(item.candidateKey, item);
  }

  return [...map.values()].sort((a, b) => {
    const dateCompare = String(a.date || '9999-99-99').localeCompare(String(b.date || '9999-99-99'));
    if (dateCompare !== 0) return dateCompare;
    return String(a.platformEventId || '').localeCompare(String(b.platformEventId || ''));
  });
}

function filterFromDate(items, fromDate = FROM_DATE) {
  return items.filter(item => !item.date || item.date >= fromDate);
}

async function collect() {
  const [hostedPayload, attendingPayload] = await Promise.all([
    fetchList(`/vtc/${encodeURIComponent(VTC_ID)}/events`, 'truckersmp-kings-hosted-events-history'),
    fetchList(`/vtc/${encodeURIComponent(VTC_ID)}/events/attending`, 'truckersmp-kings-attending-events-history')
  ]);

  const hostedRaw = unwrapArray(hostedPayload, 'Hosted events');
  const attendingRaw = unwrapArray(attendingPayload, 'Attending events');

  const hosted = hostedRaw.map(event => normalizeCandidate(event, 'hosted'));
  const attending = attendingRaw.map(event => normalizeCandidate(event, 'attending'));
  const candidates = filterFromDate(deduplicate(hosted, attending));

  const output = {
    version: 1,
    mode: 'truckersmp-historical-candidate-discovery',
    generatedAt: new Date().toISOString(),
    vtcId: VTC_ID,
    fromDate: FROM_DATE,
    policy: {
      readOnlyDiscovery: true,
      automaticHistoryWrite: false,
      truckersmpVtcAttendingMeansParticipation: true,
      publicStatisticsUnaffected: true
    },
    summary: {
      hostedEndpointRecords: hostedRaw.length,
      attendingEndpointRecords: attendingRaw.length,
      uniqueCandidatesSinceFromDate: candidates.length,
      pastCandidates: candidates.filter(item => item.phase === 'past').length,
      futureCandidates: candidates.filter(item => item.phase === 'future').length,
      ownCandidates: candidates.filter(item => item.type === 'own').length,
      externalCandidates: candidates.filter(item => item.type === 'external').length
    },
    candidates
  };

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');

  return output;
}

module.exports = {
  eventId,
  eventDate,
  normalizeCandidate,
  deduplicate,
  filterFromDate,
  collect
};

if (require.main === module) {
  collect()
    .then(output => {
      console.log('TruckersMP convoy-history candidate discovery completed.');
      console.log('Hosted endpoint records: ' + output.summary.hostedEndpointRecords);
      console.log('Attending endpoint records: ' + output.summary.attendingEndpointRecords);
      console.log('Unique candidates since ' + output.fromDate + ': ' + output.summary.uniqueCandidatesSinceFromDate);
      console.log('Past candidates: ' + output.summary.pastCandidates);
      console.log('TruckersMP VTCs Attending candidates are classified as verified Kings participation.');
    })
    .catch(error => {
      console.error('TruckersMP convoy-history candidate discovery failed:', error.message);
      process.exit(1);
    });
}
