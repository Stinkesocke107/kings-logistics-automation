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


test('main Event source change uses atomic encrypted source-only refresh and existing dashboard dispatch',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/event-leadership-reports.yml'),'utf8');
  const script=fs.readFileSync(path.join(__dirname,'../event-leadership-reports.js'),'utf8');
  assert.match(workflow,/github\.event_name == 'push'/);
  assert.match(workflow,/MODE=source-refresh/);
  assert.match(workflow,/LEADERSHIP_CONSOLIDATED_ONLY: 'true'/);
  assert.match(workflow,/gh workflow run leadership-dashboard\.yml/);
  const start=script.indexOf("if (REPORT_MODE === 'source-refresh')");
  const end=script.indexOf('let invitationUpdated=false;',start);
  assert.ok(start>0&&end>start);
  const refresh=script.slice(start,end);
  const build=refresh.indexOf('buildEventObservation(report,overview)');
  const invite=refresh.indexOf('await readInvitationTracker(');
  const verify=refresh.indexOf('invitation?.tagSchemaVerified!==true');
  const eventAssign=refresh.indexOf('state.eventSourceObservation=event');
  const inviteAssign=refresh.indexOf('state.invitationSourceObservation=invitation');
  const save=refresh.indexOf('saveState(state)');
  assert.ok(build>=0&&invite>build&&verify>invite&&eventAssign>verify&&inviteAssign>eventAssign&&save>inviteAssign);
  assert.doesNotMatch(refresh,/syncTextMessage|method:\s*['"](?:POST|PATCH|DELETE)['"]/);
  assert.match(refresh,/BOTH_SOURCE_OBSERVATIONS_REFRESHED/);
  assert.match(refresh,/if \(PREVIEW\) throw/);
});


test('source writer and integrated GET-only retry both read current protected main',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/event-leadership-reports.yml'),'utf8');
  const source=workflow.split('  event_integrated_source_verify:')[1]?.split('  event_staff_command_verify:')[0]||'';
  const report=workflow.split('\n  report:\n').at(-1)||'';
  assert.match(source,/Checkout repository[\s\S]*?ref: main/);
  assert.match(report,/Checkout repository[\s\S]*?ref: main/);
  assert.match(source,/contents: read/);
  assert.match(report,/contents: write/);
});


test('push-only Event source refresh suppresses private original Forum details in public Actions logs',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/event-leadership-reports.yml'),'utf8');
  const report=workflow.split('\n  report:\n').at(-1)||'';
  const step=report.split('- name: Build fresh read-only Event Leadership data')[1]
    ?.split('- name: Create Event Leadership report')[0]||'';
  assert.match(step,/source-refresh/);
  assert.match(step,/node "\$script" >\/dev\/null 2>&1/);
  assert.match(step,/ORIGINAL_SOURCE_UNAVAILABLE/);
  assert.match(step,/set -euo pipefail/);
});
