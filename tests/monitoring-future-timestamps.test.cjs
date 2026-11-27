'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {ageMinutes, isFreshAge} = require('../monitoring-time');

const now = Date.parse('2026-11-27T12:00:00.000Z');
const atOffsetMinutes = minutes => new Date(now + minutes * 60000).toISOString();

test('monitoring rejects timestamps more than five minutes in the future', () => {
  const age = ageMinutes(atOffsetMinutes(6), now);
  assert.equal(age, -6);
  assert.equal(isFreshAge(age, 45), false);
  assert.equal(isFreshAge(age, 120), false);
});

test('monitoring tolerates bounded clock skew but not stale data', () => {
  assert.equal(ageMinutes(atOffsetMinutes(5), now), -5);
  assert.equal(isFreshAge(-5, 45), true);
  assert.equal(isFreshAge(0, 45), true);
  assert.equal(isFreshAge(45, 45), true);
  assert.equal(isFreshAge(46, 45), false);
});

test('invalid or missing monitoring timestamps never satisfy freshness', () => {
  assert.equal(ageMinutes('', now), Infinity);
  assert.equal(ageMinutes('not-a-date', now), Infinity);
  assert.equal(isFreshAge(Infinity, 45), false);
  assert.equal(isFreshAge(NaN, 45), false);
  assert.equal(isFreshAge(-6, 45), false);
});

test('future-dated active runs cannot hide overdue or failed workflows', () => {
  assert.equal(isFreshAge(ageMinutes(atOffsetMinutes(7), now), 20), false);
  assert.equal(isFreshAge(ageMinutes(atOffsetMinutes(-10), now), 20), true);
});
