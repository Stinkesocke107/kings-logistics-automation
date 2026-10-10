const fs = require('fs');

const HISTORY_PATH = process.env.KINGS_CONVOY_HISTORY_PATH || 'data/convoy-history.json';
const JSON_OUTPUT = process.env.KINGS_CONVOY_HISTORY_STATS_JSON || 'output/convoy-history-statistics.json';
const MARKDOWN_OUTPUT = process.env.KINGS_CONVOY_HISTORY_STATS_MD || 'output/convoy-history-statistics.md';

const COUNTABLE_CONFIDENCE = new Set(['verified', 'confirmed_internal']);
const VALID_TYPES = new Set(['own', 'external', 'unknown']);
const VALID_STATUS = new Set(['planned', 'completed', 'cancelled', 'unknown']);
const VALID_PARTICIPATION = new Set(['attended', 'registered', 'planned', 'unknown']);
const VALID_CONFIDENCE = new Set(['verified', 'confirmed_internal', 'partial', 'review_required', 'unknown']);

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isoDate(value) {
  const text = clean(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  return text;
}

function canonicalPlatform(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (text === 'truckersmp' || text === 'tmp') return 'truckersmp';
  if (text === 'haulmp' || text === 'hmp') return 'haulmp';
  if (text === 'tlmp' || text === 'trucklinemp') return 'tlmp';
  if (text === 'realmmp') return 'realmmp';
  return text || 'unknown';
}

function normalizeRecord(input = {}) {
  const date = isoDate(input.date || input.eventDate);
  const platform = canonicalPlatform(input.platform);
  const platformEventId = clean(input.platformEventId || input.eventId);
  const type = VALID_TYPES.has(String(input.type || '').toLowerCase())
    ? String(input.type).toLowerCase()
    : 'unknown';
  const status = VALID_STATUS.has(String(input.status || '').toLowerCase())
    ? String(input.status).toLowerCase()
    : 'unknown';

  const rawParticipation = input.participation && typeof input.participation === 'object'
    ? input.participation
    : {};
  const participationStatus = VALID_PARTICIPATION.has(String(rawParticipation.status || '').toLowerCase())
    ? String(rawParticipation.status).toLowerCase()
    : 'unknown';
  const confidence = VALID_CONFIDENCE.has(String(rawParticipation.confidence || '').toLowerCase())
    ? String(rawParticipation.confidence).toLowerCase()
    : 'unknown';

  const attendance = input.attendance && typeof input.attendance === 'object'
    ? input.attendance
    : {};
  const attendanceKnown = attendance.known === true;
  const attendanceCount = attendanceKnown && Number.isInteger(Number(attendance.count)) && Number(attendance.count) >= 0
    ? Number(attendance.count)
    : null;
  const driverIds = Array.isArray(attendance.driverIds)
    ? [...new Set(attendance.driverIds.map(clean).filter(Boolean))]
    : [];

  const sourceEvidence = Array.isArray(input.evidence)
    ? input.evidence
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          source: clean(item.source) || 'unknown',
          kind: clean(item.kind) || 'unknown',
          url: clean(item.url),
          note: clean(item.note),
          observedAt: clean(item.observedAt)
        }))
    : [];

  return {
    id: clean(input.id),
    platform,
    platformEventId,
    name: clean(input.name) || 'Unknown Convoy',
    date,
    type,
    organizer: clean(input.organizer),
    status,
    participation: {
      status: participationStatus,
      confidence
    },
    attendance: {
      known: attendanceKnown,
      count: attendanceCount,
      driverIds
    },
    eventUrl: clean(input.eventUrl),
    evidence: sourceEvidence,
    createdAt: clean(input.createdAt),
    updatedAt: clean(input.updatedAt)
  };
}

function recordKey(record) {
  if (record.platform && record.platform !== 'unknown' && record.platformEventId) {
    return record.platform + ':' + record.platformEventId;
  }
  return record.id ? 'id:' + record.id : null;
}

function validateRecord(record) {
  const issues = [];
  if (!record.id) issues.push('missing-id');
  if (!record.name) issues.push('missing-name');
  if (!record.date) issues.push('invalid-or-missing-date');
  if (!VALID_TYPES.has(record.type)) issues.push('invalid-type');
  if (!VALID_STATUS.has(record.status)) issues.push('invalid-status');
  if (!VALID_PARTICIPATION.has(record.participation.status)) issues.push('invalid-participation-status');
  if (!VALID_CONFIDENCE.has(record.participation.confidence)) issues.push('invalid-participation-confidence');

  if (record.attendance.known && record.attendance.count === null) {
    issues.push('attendance-known-without-count');
  }
  if (!record.attendance.known && record.attendance.count !== null) {
    issues.push('attendance-count-without-known-flag');
  }

  return issues;
}

function isPubliclyCountable(record) {
  return record.status === 'completed' &&
    record.participation.status === 'attended' &&
    COUNTABLE_CONFIDENCE.has(record.participation.confidence);
}

function emptyBucket() {
  return { total: 0, own: 0, external: 0, unknownType: 0 };
}

function incrementBucket(bucket, record) {
  bucket.total += 1;
  if (record.type === 'own') bucket.own += 1;
  else if (record.type === 'external') bucket.external += 1;
  else bucket.unknownType += 1;
}

function buildStatistics(history) {
  const records = Array.isArray(history?.records) ? history.records.map(normalizeRecord) : [];
  const countable = records.filter(isPubliclyCountable);
  const years = {};
  const months = {};
  const platforms = {};
  let knownAttendanceEvents = 0;
  let knownDriverAttendances = 0;

  for (const record of countable) {
    incrementBucket(years[record.date.slice(0, 4)] ||= emptyBucket(), record);
    incrementBucket(months[record.date.slice(0, 7)] ||= emptyBucket(), record);
    incrementBucket(platforms[record.platform] ||= emptyBucket(), record);

    if (record.attendance.known && record.attendance.count !== null) {
      knownAttendanceEvents += 1;
      knownDriverAttendances += record.attendance.count;
    }
  }

  const allTime = emptyBucket();
  for (const record of countable) incrementBucket(allTime, record);

  const reviewRequired = records.filter(record =>
    record.participation.confidence === 'review_required' ||
    record.participation.confidence === 'partial'
  ).length;

  const registeredOnly = records.filter(record => record.participation.status === 'registered').length;

  const sortedMonths = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0]));
  let mostActiveMonth = null;
  for (const [month, stats] of sortedMonths) {
    if (!mostActiveMonth || stats.total > mostActiveMonth.total) {
      mostActiveMonth = { month, total: stats.total };
    }
  }

  let mostActiveYear = null;
  for (const [year, stats] of Object.entries(years).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!mostActiveYear || stats.total > mostActiveYear.total) {
      mostActiveYear = { year, total: stats.total };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    countingPolicy: 'completed + attended + confidence verified/confirmed_internal',
    allTime,
    years,
    months,
    platforms,
    records: {
      totalStored: records.length,
      publicCountable: countable.length,
      registeredOnly,
      reviewRequired
    },
    attendance: {
      eventsWithKnownDriverCount: knownAttendanceEvents,
      totalKnownDriverAttendances: knownDriverAttendances
    },
    recordsHighLevel: {
      mostActiveYear,
      mostActiveMonth
    }
  };
}

function formatMarkdown(stats) {
  const lines = [
    '# Kings Logistics — Convoy Statistics',
    '',
    'Generated: ' + stats.generatedAt,
    '',
    '## All Time',
    '',
    '- Total Convoys Attended: **' + stats.allTime.total + '**',
    '- Kings Hosted Convoys: **' + stats.allTime.own + '**',
    '- External Convoys Attended: **' + stats.allTime.external + '**',
    '',
    '## By Year',
    ''
  ];

  const years = Object.keys(stats.years).sort();
  if (!years.length) lines.push('- No verified attended convoys stored yet.');
  for (const year of years) {
    const s = stats.years[year];
    lines.push('- **' + year + '** — ' + s.total + ' total · ' + s.own + ' own · ' + s.external + ' external');
  }

  lines.push('', '## Platforms', '');
  const platforms = Object.keys(stats.platforms).sort();
  if (!platforms.length) lines.push('- No platform statistics yet.');
  for (const platform of platforms) {
    const s = stats.platforms[platform];
    lines.push('- **' + platform + '** — ' + s.total + ' attended');
  }

  lines.push('', '## Data Quality', '');
  lines.push('- Stored records: **' + stats.records.totalStored + '**');
  lines.push('- Publicly countable: **' + stats.records.publicCountable + '**');
  lines.push('- Registered/RSVP only: **' + stats.records.registeredOnly + '**');
  lines.push('- Needs review / partial: **' + stats.records.reviewRequired + '**');
  lines.push('');
  lines.push('> Public totals intentionally exclude planned events, RSVP-only records and uncertain historical evidence.');
  lines.push('');

  return lines.join('\n');
}

function loadHistory(path = HISTORY_PATH) {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!data || data.version !== 1 || !Array.isArray(data.records)) {
    throw new Error('Unsupported or invalid convoy history file.');
  }

  const seen = new Map();
  const normalized = [];
  for (const raw of data.records) {
    const record = normalizeRecord(raw);
    const issues = validateRecord(record);
    if (issues.length) {
      throw new Error('Invalid convoy history record ' + (record.id || '<unknown>') + ': ' + issues.join(', '));
    }

    const key = recordKey(record);
    if (!key) throw new Error('Convoy history record has no usable duplicate key: ' + record.id);
    if (seen.has(key)) {
      throw new Error('Duplicate convoy history key ' + key + ' for ' + seen.get(key) + ' and ' + record.id);
    }
    seen.set(key, record.id);
    normalized.push(record);
  }

  return { ...data, records: normalized };
}

function main() {
  const history = loadHistory();
  const stats = buildStatistics(history);

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(stats, null, 2) + '\n');
  fs.writeFileSync(MARKDOWN_OUTPUT, formatMarkdown(stats) + '\n');

  console.log('Kings Convoy History statistics generated.');
  console.log('Stored records: ' + stats.records.totalStored);
  console.log('Publicly countable attended convoys: ' + stats.records.publicCountable);
  console.log('Own: ' + stats.allTime.own + ' | External: ' + stats.allTime.external);
}

module.exports = {
  normalizeRecord,
  recordKey,
  validateRecord,
  isPubliclyCountable,
  buildStatistics,
  formatMarkdown,
  loadHistory
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Kings Convoy History failed:', error.message);
    process.exit(1);
  }
}
