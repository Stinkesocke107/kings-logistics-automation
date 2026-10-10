const fs = require('fs');
const path = require('path');

const CHUNK_DIR = process.env.KINGS_2023_CHUNK_DIR || 'data/convoy-history-2023-chunks';
const OUTPUT = process.env.KINGS_2023_SCAN_OUTPUT || 'data/convoy-history-2023-scan.json';
const COVERAGE_PATH = process.env.KINGS_CONVOY_HISTORY_BACKFILL || 'data/convoy-history-backfill.json';
const EXPECTED = [
  [10000, 11999],
  [12000, 13999],
  [14000, 15999],
  [16000, 17999],
  [18000, 19999]
];

function readChunks(dir = CHUNK_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const full = path.join(dir, name);
      return { file: name, data: JSON.parse(fs.readFileSync(full, 'utf8')) };
    });
}

function rangeKey(startId, endId) {
  return String(startId) + '-' + String(endId);
}

function mergeChunks(chunks) {
  const byRange = new Map();
  for (const item of chunks) {
    const startId = Number(item?.data?.range?.startId);
    const endId = Number(item?.data?.range?.endId);
    if (!Number.isInteger(startId) || !Number.isInteger(endId)) continue;
    byRange.set(rangeKey(startId, endId), item);
  }

  const missing = [];
  const incomplete = [];
  const used = [];
  for (const [startId, endId] of EXPECTED) {
    const item = byRange.get(rangeKey(startId, endId));
    if (!item) {
      missing.push({ startId, endId });
      continue;
    }
    used.push(item);
    if (item.data.complete !== true) {
      incomplete.push({
        startId,
        endId,
        checked: Number(item.data?.stats?.checked || 0),
        requested: Number(item.data?.stats?.requested || endId - startId + 1),
        requestErrors: Number(item.data?.stats?.requestErrors || 0)
      });
    }
  }

  const matchesMap = new Map();
  const errors = [];
  const stats = {
    requested: 0,
    checked: 0,
    foundEvents: 0,
    inDateWindow: 0,
    notFound: 0,
    requestErrors: 0
  };

  for (const item of used) {
    for (const [key, value] of Object.entries(stats)) {
      stats[key] += Number(item.data?.stats?.[key] || 0);
    }

    for (const record of item.data?.matches || []) {
      const key = String(record?.platform || '') + ':' + String(record?.platformEventId || '');
      if (key !== ':') matchesMap.set(key, record);
    }

    for (const error of item.data?.errors || []) {
      errors.push({ range: item.data.range, ...error });
    }
  }

  const complete =
    missing.length === 0 &&
    incomplete.length === 0 &&
    stats.checked === stats.requested &&
    stats.requestErrors === 0;

  return {
    version: 1,
    mode: 'merged-truckersmp-2023-historical-event-scan',
    generatedAt: new Date().toISOString(),
    complete,
    kingsVtcId: 64284,
    range: { startId: 10000, endId: 19999 },
    dateWindow: { from: '2023-07-09', to: '2023-12-31' },
    coverage: {
      expectedChunks: EXPECTED.map(([startId, endId]) => ({ startId, endId })),
      receivedChunks: used.map(item => ({
        file: item.file,
        startId: Number(item.data.range.startId),
        endId: Number(item.data.range.endId),
        complete: item.data.complete === true
      })),
      missing,
      incomplete
    },
    stats,
    matches: [...matchesMap.values()].sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) ||
      Number(a.platformEventId) - Number(b.platformEventId)
    ),
    errors
  };
}

function main() {
  const chunks = readChunks();
  const merged = mergeChunks(chunks);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2) + '\n');

  if (fs.existsSync(COVERAGE_PATH)) {
    const coverage = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
    coverage.years ||= {};
    coverage.years['2023'] ||= {};
    coverage.years['2023'] = {
      ...coverage.years['2023'],
      status: merged.complete ? 'primary_api_scan_complete' : 'backfill_in_progress',
      publicZeroAllowed: false,
      primaryApiScan: {
        complete: merged.complete,
        checked: merged.stats.checked,
        requested: merged.stats.requested,
        kingsMatches: merged.matches.length,
        requestErrors: merged.stats.requestErrors,
        updatedAt: merged.generatedAt
      },
      notes: merged.complete
        ? 'Primary TruckersMP Event API scan for event IDs 10000-19999 and dates 2023-07-09 through 2023-12-31 completed. Additional archived/internal sources may still add events.'
        : 'Chunked TruckersMP historical backfill is still incomplete.'
    };
    fs.writeFileSync(COVERAGE_PATH, JSON.stringify(coverage, null, 2) + '\n');
  }

  console.log('2023 chunk merge completed.');
  console.log('Chunks received: ' + merged.coverage.receivedChunks.length + '/5');
  console.log('Checked: ' + merged.stats.checked + '/' + merged.stats.requested);
  console.log('Kings matches: ' + merged.matches.length);
  console.log('Request errors: ' + merged.stats.requestErrors);
  console.log('Complete: ' + merged.complete);
}

module.exports = { readChunks, mergeChunks, rangeKey };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('2023 convoy history merge failed:', error.message);
    process.exit(1);
  }
}
