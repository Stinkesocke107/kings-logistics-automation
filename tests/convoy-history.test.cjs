const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  normalizeRecord,
  recordKey,
  validateRecord,
  isPubliclyCountable,
  buildStatistics
} = require('../convoy-history.js');

function base(overrides = {}) {
  return {
    id: 'KCE-2026-0001',
    platform: 'truckersmp',
    platformEventId: '12345',
    name: 'Example Convoy',
    date: '2026-01-15',
    type: 'external',
    organizer: 'Example VTC',
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
    evidence: [],
    ...overrides
  };
}

test('normalization keeps platform event identity stable', () => {
  const r = normalizeRecord(base({ platform: 'TMP' }));
  assert.equal(r.platform, 'truckersmp');
  assert.equal(recordKey(r), 'truckersmp:12345');
  assert.deepEqual(validateRecord(r), []);
});

test('public statistics count only completed verified attendance', () => {
  const verified = normalizeRecord(base());
  const rsvpOnly = normalizeRecord(base({
    id: 'KCE-2026-0002',
    platformEventId: '12346',
    participation: { status: 'registered', confidence: 'verified' }
  }));
  const uncertain = normalizeRecord(base({
    id: 'KCE-2026-0003',
    platformEventId: '12347',
    participation: { status: 'attended', confidence: 'review_required' }
  }));
  const planned = normalizeRecord(base({
    id: 'KCE-2026-0004',
    platformEventId: '12348',
    status: 'planned'
  }));

  assert.equal(isPubliclyCountable(verified), true);
  assert.equal(isPubliclyCountable(rsvpOnly), false);
  assert.equal(isPubliclyCountable(uncertain), false);
  assert.equal(isPubliclyCountable(planned), false);

  const stats = buildStatistics({ records: [verified, rsvpOnly, uncertain, planned] });
  assert.equal(stats.allTime.total, 1);
  assert.equal(stats.allTime.external, 1);
  assert.equal(stats.records.registeredOnly, 1);
  assert.equal(stats.records.reviewRequired, 1);
});

test('statistics separate years, months, own/external and platforms', () => {
  const records = [
    normalizeRecord(base({
      id: 'KCE-2025-0001',
      platformEventId: '20001',
      date: '2025-12-20',
      type: 'own'
    })),
    normalizeRecord(base({
      id: 'KCE-2026-0001',
      platformEventId: '20002',
      date: '2026-01-10',
      type: 'external'
    })),
    normalizeRecord(base({
      id: 'KCE-2026-0002',
      platform: 'haulmp',
      platformEventId: 'H-42',
      date: '2026-01-11',
      type: 'external',
      participation: { status: 'attended', confidence: 'confirmed_internal' },
      attendance: { known: true, count: 12, driverIds: [] }
    }))
  ];

  const stats = buildStatistics({ records });
  assert.equal(stats.allTime.total, 3);
  assert.equal(stats.allTime.own, 1);
  assert.equal(stats.allTime.external, 2);
  assert.equal(stats.years['2025'].total, 1);
  assert.equal(stats.years['2026'].total, 2);
  assert.equal(stats.months['2026-01'].total, 2);
  assert.equal(stats.platforms.truckersmp.total, 2);
  assert.equal(stats.platforms.haulmp.total, 1);
  assert.equal(stats.attendance.totalKnownDriverAttendances, 12);
});

test('TruckersMP candidate collector distinguishes hosted from attending evidence', () => {
  const { normalizeCandidate } = require('../convoy-history-truckersmp-candidates.js');

  const event = {
    id: 26666,
    name: 'Laxis Logistics Mai Konvoi',
    meetup_at: '2025-05-02T16:00:00Z',
    start_at: '2025-05-02T17:00:00Z',
    vtc: { name: 'Laxis Logistics' },
    departure: { city: 'Copenhagen', location: 'Slots' },
    arrive: { city: 'Trieste', location: 'Harbour' }
  };

  const external = normalizeCandidate(event, 'attending');
  assert.equal(external.type, 'external');
  assert.equal(external.suggestedParticipation.status, 'registered');
  assert.equal(external.suggestedParticipation.confidence, 'verified');
  assert.equal(external.candidateKey, 'truckersmp:26666');

  const own = normalizeCandidate(event, 'hosted');
  assert.equal(own.type, 'own');
  assert.equal(own.organizer, 'Kings Logistics');
  assert.equal(own.suggestedParticipation.status, 'unknown');
  assert.equal(own.suggestedParticipation.confidence, 'review_required');
});

test('TruckersMP candidate dedupe gives hosted classification priority', () => {
  const { deduplicate } = require('../convoy-history-truckersmp-candidates.js');
  const attending = [{ candidateKey: 'truckersmp:1', platformEventId: '1', date: '2026-01-01', type: 'external' }];
  const hosted = [{ candidateKey: 'truckersmp:1', platformEventId: '1', date: '2026-01-01', type: 'own' }];
  const result = deduplicate(hosted, attending);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'own');
});

