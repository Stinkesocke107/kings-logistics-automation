'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {encryptEventState, decryptEventState} = require('../event-leadership-state');

const secret = 'example-test-only-secret-of-more-than-32-bytes';
const differentSecret = 'another-test-only-secret-of-more-than-32-bytes';
function sampleState() {
  return {
    version: 1,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
    lastSnapshot: [{threadId: 'SYNTHETIC', responsibleStaff: 'INTERNAL_TEST_MARKER'}],
    changeLog: [{type: 'event_changed', current: {responsibleStaff: 'INTERNAL_TEST_MARKER'}}],
    publishedDailyKeys: [], publishedWeeklyKeys: [], publishedMonthlyKeys: [],
    weeklyReports: [], monthlyReports: []
  };
}

test('encrypts private Event state without storing staff or event details in public JSON', () => {
  const original = sampleState();
  const sealed = encryptEventState(original, secret);
  assert.equal(sealed.encrypted, true);
  assert.equal(sealed.algorithm, 'aes-256-gcm');
  assert.equal(JSON.stringify(sealed).includes('INTERNAL_TEST_MARKER'), false);
  assert.deepEqual(decryptEventState(sealed, secret), original);
  assert.notEqual(encryptEventState(original, secret).ciphertext, sealed.ciphertext);
});

test('fails closed on missing/wrong encryption key and corrupted ciphertext', () => {
  const sealed = encryptEventState(sampleState(), secret);
  assert.throws(() => decryptEventState(sealed, differentSecret), /integrity check failed/);
  assert.throws(() => decryptEventState(sealed, ''), /missing or too short/);
  assert.throws(() => encryptEventState(sampleState(), ''), /missing or too short/);
  assert.throws(() => decryptEventState({...sealed, ciphertext: sealed.ciphertext + 'A'}, secret), /integrity check failed/);
  assert.throws(() => decryptEventState({...sealed, algorithm: 'none'}, secret), /container is invalid/);
});

test('reads the known legacy plaintext state only with valid structure and a configured secret', () => {
  const original = sampleState();
  assert.deepEqual(decryptEventState(original, secret), original);
  assert.throws(() => decryptEventState(original, ''), /missing or too short/);
  assert.throws(() => decryptEventState({version: 1, encrypted: false, ...original}, secret), /not trusted/);
  assert.throws(() => decryptEventState({version: 1, changeLog: []}, secret), /structure is invalid/);
});
