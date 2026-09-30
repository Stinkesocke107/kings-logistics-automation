'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SAFE_WORKFLOWS,
  ageMinutes,
  needsRecovery,
  isRecentActiveRun,
  parsePositiveInt
} = require('../workflow-recovery.js');

test('recovery allowlist contains only safe technical workflows', () => {
  assert.deepEqual(
    SAFE_WORKFLOWS.map((item) => item.file),
    ['driver-updates.yml', 'live-tracker.yml']
  );
  assert.equal(SAFE_WORKFLOWS.some((item) => item.file.includes('convoy')), false);
  assert.equal(SAFE_WORKFLOWS.some((item) => /staff|hr|management|probation/i.test(item.file)), false);
});

test('ageMinutes returns elapsed minutes and Infinity for invalid timestamps', () => {
  const now = Date.parse('2026-09-30T13:00:00Z');
  assert.equal(ageMinutes('2026-09-30T12:40:00Z', now), 20);
  assert.equal(ageMinutes('not-a-date', now), Number.POSITIVE_INFINITY);
});

test('needsRecovery activates only after the configured stale window', () => {
  const now = Date.parse('2026-09-30T13:00:00Z');
  assert.equal(needsRecovery('2026-09-30T12:45:00Z', 20, now), false);
  assert.equal(needsRecovery('2026-09-30T12:39:59Z', 20, now), true);
  assert.equal(needsRecovery(null, 20, now), true);
});

test('recent active runs suppress duplicate dispatches', () => {
  const now = Date.parse('2026-09-30T13:00:00Z');
  assert.equal(isRecentActiveRun({ status: 'in_progress', created_at: '2026-09-30T12:50:00Z' }, now), true);
  assert.equal(isRecentActiveRun({ status: 'queued', created_at: '2026-09-30T12:40:00Z' }, now), false);
  assert.equal(isRecentActiveRun({ status: 'completed', created_at: '2026-09-30T12:59:00Z' }, now), false);
});

test('positive integer parser rejects zero, negative, and invalid values', () => {
  assert.equal(parsePositiveInt('5000', 1000), 5000);
  assert.equal(parsePositiveInt('0', 1000), 1000);
  assert.equal(parsePositiveInt('-4', 1000), 1000);
  assert.equal(parsePositiveInt('nope', 1000), 1000);
});
