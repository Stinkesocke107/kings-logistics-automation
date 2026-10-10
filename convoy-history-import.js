const fs = require('fs');

const HISTORY_PATH = process.env.KINGS_CONVOY_HISTORY_PATH || 'data/convoy-history.json';
const CANDIDATES_PATH = process.env.KINGS_CONVOY_HISTORY_CANDIDATES || 'data/convoy-history-truckersmp-candidates.json';
const MANUAL_PATH = process.env.KINGS_CONVOY_HISTORY_MANUAL || 'data/convoy-history-manual-evidence.json';

function readJson(path, fallback = null) {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function absoluteTruckersMpUrl(url, eventId) {
  const raw = String(url || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return 'https://truckersmp.com' + raw;
  return eventId ? 'https://truckersmp.com/events/' + eventId : null;
}

function keyOf(record) {
  const platform = String(record?.platform || '').toLowerCase();
  const id = String(record?.platformEventId || '').trim();
  if (platform && id) return platform + ':' + id;
  return record?.id ? 'id:' + record.id : null;
}

function idFor(record) {
  const platform = String(record.platform || 'unknown').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const eventId = String(record.platformEventId || '').replace(/[^A-Za-z0-9_-]/g, '');
  return eventId ? 'KCE-' + platform + '-' + eventId : null;
}

function candidateToRecord(candidate, now = new Date()) {
  const date = String(candidate.date || '');
  const today = now.toISOString().slice(0, 10);
  const completed = /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today;

  return {
    id: idFor(candidate),
    platform: 'truckersmp',
    platformEventId: String(candidate.platformEventId),
    name: candidate.name,
    date: candidate.date,
    type: candidate.type,
    organizer: candidate.organizer,
    status: completed ? 'completed' : 'planned',
    participation: completed
      ? { status: 'attended', confidence: 'verified' }
      : { status: 'planned', confidence: 'verified' },
    attendance: {
      known: false,
      count: null,
      driverIds: []
    },
    eventUrl: absoluteTruckersMpUrl(candidate.eventUrl, candidate.platformEventId),
    evidence: [
      {
        source: 'truckersmp-api',
        kind: candidate.discoveryEvidence?.kind || candidate.sourceKind || 'event',
        url: absoluteTruckersMpUrl(candidate.eventUrl, candidate.platformEventId),
        note: candidate.discoveryEvidence?.meaning || null,
        observedAt: null
      }
    ],
    createdAt: null,
    updatedAt: new Date().toISOString()
  };
}

function normalizeManual(record) {
  return {
    ...record,
    id: record.id || idFor(record),
    updatedAt: new Date().toISOString()
  };
}

function mergeHistory(history, incoming) {
  const map = new Map();

  for (const existing of history.records || []) {
    const key = keyOf(existing);
    if (key) map.set(key, existing);
  }

  let added = 0;
  let updated = 0;

  for (const next of incoming) {
    const key = keyOf(next);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, next);
      added += 1;
      continue;
    }

    // Preserve known Driver attendance and any stronger/manual evidence while
    // refreshing platform-owned metadata and lifecycle state.
    const evidence = [
      ...(Array.isArray(existing.evidence) ? existing.evidence : []),
      ...(Array.isArray(next.evidence) ? next.evidence : [])
    ];
    const evidenceMap = new Map();
    for (const item of evidence) {
      const evidenceKey = [item?.source, item?.kind, item?.url, item?.note].join('|');
      evidenceMap.set(evidenceKey, item);
    }

    map.set(key, {
      ...existing,
      ...next,
      id: existing.id || next.id,
      attendance: existing.attendance?.known ? existing.attendance : next.attendance,
      evidence: [...evidenceMap.values()],
      createdAt: existing.createdAt || next.createdAt || null,
      updatedAt: new Date().toISOString()
    });
    updated += 1;
  }

  return {
    history: {
      ...history,
      updatedAt: new Date().toISOString(),
      records: [...map.values()].sort((a, b) =>
        String(a.date || '9999-99-99').localeCompare(String(b.date || '9999-99-99')) ||
        String(a.platformEventId || '').localeCompare(String(b.platformEventId || ''))
      )
    },
    added,
    updated
  };
}

function main() {
  const history = readJson(HISTORY_PATH, { version: 1, mode: 'kings-convoy-history', records: [] });
  const candidateData = readJson(CANDIDATES_PATH, { candidates: [] });
  const manualData = readJson(MANUAL_PATH, { records: [] });

  const candidateRecords = (candidateData.candidates || []).map(candidate => candidateToRecord(candidate));
  const manualRecords = (manualData.records || []).map(normalizeManual);
  const result = mergeHistory(history, [...candidateRecords, ...manualRecords]);

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(result.history, null, 2) + '\n');

  console.log('Kings Convoy History import completed.');
  console.log('Candidate records: ' + candidateRecords.length);
  console.log('Manual verified records: ' + manualRecords.length);
  console.log('Added: ' + result.added + ' | Updated: ' + result.updated);
  console.log('History records: ' + result.history.records.length);
}

module.exports = { absoluteTruckersMpUrl, keyOf, idFor, candidateToRecord, mergeHistory };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Kings Convoy History import failed:', error.message);
    process.exit(1);
  }
}
