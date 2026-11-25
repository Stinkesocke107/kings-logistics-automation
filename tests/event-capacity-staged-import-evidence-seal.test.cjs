'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {createKingsStagedImportQuarantinePlan:plan}
  =require('../event-capacity-staged-import-quarantine-plan');
test('Changing page receipt digest changes sealed plan even with identical Event rows',()=>{
  const f=fixture(),a=plan(f);
  f.currentPagination.scans[0].pages[0].responseDigest=
    'a'.repeat(64);
  const b=plan(f);
  assert.notEqual(a.replaySeal,b.replaySeal);
  assert.deepEqual(a.counts,b.counts);
  assert.equal(b.counts.unchangedUnverified,4);
  assert.equal(b.stagingReadyForProduction,false);
});
test('Archive page cursor changes produce a new sealed plan or fail closed if invalid',()=>{
  const f=fixture(),a=plan(f);
  f.currentPagination.scans[1].pages[0].nextCursor=
    '2026-11-23T15:00:00.000Z';
  f.currentPagination.scans[1].pages[1].requestCursor=
    '2026-11-23T15:00:00.000Z';
  const b=plan(f);
  assert.notEqual(a.replaySeal,b.replaySeal);
  assert.equal(b.laterClaimPaginationInternallyComplete,true);
});
test('A newly missing archived stream changes the plan receipt signature',()=>{
  const f=fixture(),a=plan(f);
  f.currentPagination.scans=f.currentPagination.scans.filter(s=>
    s.stream!=='archived-public');
  const b=plan(f);
  assert.notEqual(a.replaySeal,b.replaySeal);
  assert.equal(b.laterClaimPaginationInternallyComplete,false);
  assert.equal(b.counts.unchangedUnverified,4);
});
test('Sorting source channel and scan arrays does not alter the seal',()=>{
  const f=fixture(),before=plan(f);
  f.previousPagination.channels.reverse();
  f.currentPagination.channels.reverse();
  f.previousPagination.scans.reverse();
  f.currentPagination.scans.reverse();
  assert.equal(plan(f).replaySeal,before.replaySeal);
});
test('Changed outgoing Tracker source coverage cannot reuse previous plan seal',()=>{
  const f=fixture(),a=plan(f);
  f.current.tracker.connected=false;
  const b=plan(f);
  assert.notEqual(a.replaySeal,b.replaySeal);
  assert.equal(b.counts.unchangedUnverified,4);
  assert.equal(b.freeSlotsCertified,false);
});
test('Changing a historical receipt fetch timestamp changes audit seal but proves nothing live',()=>{
  const f=fixture(),a=plan(f);
  f.currentPagination.scans[0].pages[0].fetchedAtUtc=
    '2026-11-25T14:50:00.000Z';
  const b=plan(f);
  assert.notEqual(a.replaySeal,b.replaySeal);
  assert.equal(b.original24MonthHistoryIndependentlyVerified,false);
});
test('Changing prior pagination while current snapshot unchanged also alters replay seal',()=>{
  const f=fixture(),a=plan(f);
  f.previousPagination.scans[0].pages[0].responseDigest='b'.repeat(64);
  assert.notEqual(plan(f).replaySeal,a.replaySeal);
});
test('Public report does not reveal raw changed page digests or before cursors',()=>{
  const f=fixture();
  const changed='a'.repeat(64);
  f.currentPagination.scans[0].pages[0].responseDigest=changed;
  const json=JSON.stringify(plan(f));
  assert.equal(json.includes(changed),false);
  assert.equal(json.includes('2026-11-24T15:00:00.000Z'),false);
  assert.equal(json.includes('990000000000000001'),false);
});
