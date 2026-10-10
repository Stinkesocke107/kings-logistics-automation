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

test('TruckersMP candidate collector treats VTCs Attending as verified participation', () => {
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
  assert.equal(external.suggestedParticipation.status, 'attended');
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

test('Discord public convoy statistics payload includes all-time, yearly and monthly views', () => {
  const { buildPayload } = require('../convoy-history-discord.js');
  const payload = buildPayload({
    generatedAt: '2026-10-10T05:30:00.000Z',
    allTime: { total: 120, own: 20, external: 100 },
    years: {
      '2023': { total: 10, own: 2, external: 8 },
      '2024': { total: 25, own: 4, external: 21 },
      '2025': { total: 35, own: 6, external: 29 },
      '2026': { total: 50, own: 8, external: 42 }
    },
    months: {
      '2026-01': { total: 3, own: 1, external: 2 },
      '2026-10': { total: 7, own: 1, external: 6 }
    },
    platforms: {
      truckersmp: { total: 115, own: 19, external: 96 },
      haulmp: { total: 5, own: 1, external: 4 }
    },
    recordsHighLevel: {
      mostActiveYear: { year: '2026', total: 50 },
      mostActiveMonth: { month: '2026-10', total: 7 }
    }
  });

  assert.equal(payload.embeds.length, 3);
  assert.match(payload.embeds[0].description, /Total Convoys Attended:\*\* 120/);
  assert.match(payload.embeds[0].fields[0].value, /2023/);
  assert.match(payload.embeds[1].title, /2026/);
  assert.match(payload.embeds[1].fields[0].value, /January.*3/s);
  assert.match(payload.embeds[2].fields[0].value, /TruckersMP.*115/s);
  assert.match(payload.embeds[2].fields[0].value, /HaulMP.*5/s);
});

