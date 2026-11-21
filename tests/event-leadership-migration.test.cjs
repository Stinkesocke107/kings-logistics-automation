'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { migrateEventContainer } = require('../scripts/migrate-event-leadership-state');
const { decryptEventState } = require('../event-leadership-state');

const secret = 'migration-tests-only-secret-32-bytes-minimum';
const sample = {
  version: 1,
  createdAt: '2026-11-21T00:00:00.000Z',
  updatedAt: '2026-11-21T00:46:30.000Z',
  lastSnapshot: [{threadId: 'synthetic', responsibleStaff: '<@123456789012345678>'}],
  changeLog: [{type: 'event_changed', current: {responsibleStaff: '<@123456789012345678>'}}],
  publishedDailyKeys: ['2026-11-21'],
  publishedWeeklyKeys: [],
  publishedMonthlyKeys: [],
  weeklyReports: [],
  monthlyReports: []
};

test('one-time migration preserves the complete original Event state', () => {
  const result = migrateEventContainer(sample, secret);
  assert.equal(result.changed, true);
  assert.equal(result.sealed.encrypted, true);
  assert.equal(JSON.stringify(result.sealed).includes('123456789012345678'), false);
  assert.deepEqual(decryptEventState(result.sealed, secret), sample);
});

test('migration is idempotent, verifies integrity and rejects missing keys', () => {
  const encrypted = migrateEventContainer(sample, secret).sealed;
  const second = migrateEventContainer(encrypted, secret);
  assert.equal(second.changed, false);
  assert.deepEqual(second.sealed, encrypted);
  assert.throws(() => migrateEventContainer(encrypted, 'wrong-not-secret-32-bytes-long-long'), /integrity check failed/);
  assert.throws(() => migrateEventContainer(sample, ''), /missing or too short/);
});

test('the workflow uses a private key and never runs a Discord publisher while migrating state', () => {
  const workflow = fs.readFileSync(path.join(__dirname,'..','.github','workflows','event-leadership-reports.yml'),'utf8');
  assert.match(workflow,/node scripts\/migrate-event-leadership-state\.js/);
  assert.match(workflow,/EVENT_LEADERSHIP_STATE_KEY: \$\{\{ secrets\.DRIVER_STATE_KEY \}\}/);
  const source = fs.readFileSync(path.join(__dirname,'..','scripts','migrate-event-leadership-state.js'),'utf8');
  assert.doesNotMatch(source,/discord\(/);
  assert.doesNotMatch(source,/node event-leadership-reports\.js/);
});
