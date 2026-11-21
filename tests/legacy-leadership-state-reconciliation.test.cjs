'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SOURCES, validPeriod, projectSource, reconcile, safeLine
} = require('../legacy-leadership-state-reconciliation');

test('all five legacy sources are included, separately from consolidated dashboards', () => {
  assert.deepEqual(SOURCES.map(x => x.alias), ['driver', 'hr', 'staff', 'event', 'management']);
});

test('report keys are never equated with verified Discord delivery', () => {
  const staff = SOURCES.find(x => x.alias === 'staff');
  const state = {
    publishedDailyKeys: ['2026-11-01', '2026-11-01', '2026-11-02'],
    publishedWeeklyKeys: ['2026-10-26'],
    publishedMonthlyKeys: ['2026-10'],
    weeklyReports: [{ key: '2026-10-26', publishedAt: '2026-11-02T00:00:00Z' }],
    monthlyReports: [{ key: '2026-10', publishedAt: '2026-11-01T00:00:00Z' }],
    userId: 'private-id'
  };
  const result = projectSource(staff, state);
  assert.equal(result.status, 'RECORDED_UNVERIFIED');
  assert.deepEqual(result.periods, { day: 2, week: 1, month: 1 });
  assert.equal(result.summaryEntries, 2);
  assert.equal(result.duplicate, 1);
  assert.doesNotMatch(safeLine(result), /private-id|2026-11-01|publishedAt/);
  assert.match(safeLine(result), /no direct per-period Discord delivery proof/);
});

test('management saved publishedWeeks is metadata, never a weekly delivery receipt', () => {
  const management = SOURCES.find(x => x.alias === 'management');
  const result = projectSource(management, {
    publishedWeeks: [{ key: '2026-10-05', publishedAt: '2026-10-13T05:44:24Z' }]
  });
  assert.equal(result.periods.week, 1);
  assert.equal(result.status, 'RECORDED_UNVERIFIED');
});

test('encrypted Event Leadership state is neither decrypted nor treated as empty', () => {
  const event = SOURCES.find(x => x.alias === 'event');
  const result = projectSource(event, {
    encrypted: true, ciphertext: 'PRIVATE_CONTENT',
    publishedDailyKeys: ['2026-10-01']
  });
  assert.equal(result.status, 'SEALED_UNVERIFIED');
  assert.equal(result.periods, undefined);
  assert.doesNotMatch(safeLine(result), /PRIVATE_CONTENT|2026-10-01/);
});

test('invalid period metadata remains unverified, not success or false zero', () => {
  const driver = SOURCES.find(x => x.alias === 'driver');
  assert.equal(validPeriod('2026-02-30', 'day'), false);
  assert.equal(validPeriod('2026-13', 'month'), false);
  const result = projectSource(driver, { publishedDailyKeys: ['bad-key'], publishedMonthlyKeys: 'no-array' });
  assert.equal(result.status, 'RECORDED_UNVERIFIED');
  assert.equal(result.invalid, 2);
  assert.equal(result.reason, 'metadata-integrity-or-availability-limited');
  assert.equal(projectSource(driver, null).status, 'UNVERIFIED');
});

test('real reconciliation reads state without writing or printing raw records', () => {
  const all = reconcile(path.join(__dirname, '../data'));
  assert.equal(all.length, 5);
  for (const result of all) {
    assert.match(result.status, /UNVERIFIED/);
    assert.doesNotMatch(safeLine(result), /<@|discord\.com\/channels|ciphertext/);
  }
  const src = fs.readFileSync(path.join(__dirname, '../legacy-leadership-state-reconciliation.js'), 'utf8');
  assert.doesNotMatch(src, /writeFile|unlink|renameSync|method:\s*['"](?:POST|PATCH|DELETE)['"]/);
});
