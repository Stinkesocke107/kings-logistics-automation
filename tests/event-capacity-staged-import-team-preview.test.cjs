'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../event-capacity-core');
const {fixture,adjustTotals}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {projectKingsImportStaffPreview:preview,
  renderKingsImportStaffPreview:render}
  =require('../event-capacity-staged-import-team-preview');
function input(change){
  const handoffInput=fixture();change?.(handoffInput);
  return {handoffInput,calendarInput:{
    eventTeamInput:{sourceIntake:handoffInput.current,
      capacity:evaluate([],{dataFresh:false}),
      year:'2026',selectedMonth:'2026-11',
      historicalHoldsReports:[],historicalEvidenceReport:null},
    paginationInput:handoffInput.currentPagination,monthlyClaims:[]}};
}
const audit=fn=>preview(input(fn));
test('Unified private import review shows Event, Tracker, and historical channel claims',()=>{
  const r=audit(),c=r.counts;
  assert.equal(r.staffReviewStatus,'ALL STAGED ITEMS QUARANTINED — NO LIVE IMPORT');
  assert.equal(c.proposedUntrustedRecords,4);
  assert.equal(c.claimedEventIdentities,1);
  assert.equal(c.outgoingInvitationIdentities,1);
  assert.equal(c.historicalChannelIdentities,2);
  assert.equal(c.unchangedNotAuthenticated,4);
  assert.equal(r.realEventRecordsImported,0);
  assert.equal(r.safeToActivate,false);
});
test('Previously observed missing Event remains visible and cannot be deleted',()=>{
  const r=audit(f=>{f.current.convoyRecords=[];adjustTotals(f);});
  assert.equal(r.counts.noLongerObservedNeedsReview,1);
  assert.equal(r.noAutoEventDeletion,true);
  assert.equal(r.noAutoCapacityRelease,true);
  assert.equal(r.freeSlotsCertified,false);
});
test('Cancelled current Event is quarantined as changed, with urgent Staff review',()=>{
  const r=audit(f=>{
    for(const row of f.current.convoyRecords)row.status='Cancelled';
  });
  assert.equal(r.counts.changedNeedsHumanReview,1);
  assert.ok(r.counts.urgentReviewItems>0);
  assert.equal(r.realStaffDecisionsMade,0);
});
test('A new Event cannot become an actual booking through a completed simulated audit',()=>{
  const r=audit(f=>{
    f.current.convoyRecords.push({...f.current.convoyRecords[1],
      threadId:'990000000000000089',eventId:'secondEvent',
      sourceDigest:'a'.repeat(64)});
    adjustTotals(f);
  });
  assert.equal(r.counts.claimedEventIdentities,2);
  assert.equal(r.counts.newUnverifiedNeedsReview,1);
  assert.equal(r.realEventRecordsImported,0);
});
test('Incomplete archive pages do not change the untrusted unchanged-source classification',()=>{
  const r=audit(f=>{
    f.currentPagination.scans=f.currentPagination.scans.filter(
      x=>x.stream!=='archived-public');
  });
  assert.equal(r.counts.unchangedNotAuthenticated,4);
  assert.equal(r.original24MonthsAndOwnerFloorVerified,false);
  assert.equal(r.noProductionMergeOrRuntimeActivation,true);
});
test('Quarantine preview is ephemeral, avoids mentions and outputs no raw Event or source IDs',()=>{
  const r=audit(),reply=render(r),out=JSON.stringify(reply);
  assert.equal(reply.type,4);
  assert.equal(reply.data.flags,64);
  assert.deepEqual(reply.data.allowed_mentions,{parse:[]});
  for(const id of ['evt100','inv1','990000000000000000',
    '990000000000000001','990000000000000002',
    'DISCORD_BOT_TOKEN','@everyone'])
    assert.equal(out.includes(id),false);
  assert.match(out,/ALL records quarantined/);
});
test('Fake production readiness, nonzero import count and forged read-only mode are rejected',()=>{
  const r=audit();
  for(const change of [
    {safeToActivate:true},{freeSlotsCertified:true},
    {realEventRecordsImported:1},{realStaffDecisionsMade:1},
    {readOnly:false},{liveDiscordProviderVerified:true}
  ])assert.throws(()=>render({...r,...change}));
});
test('Event Team preview cannot be composed with an unrelated source or pagination snapshot',()=>{
  const x=input();
  x.calendarInput.eventTeamInput.sourceIntake=
    structuredClone(x.handoffInput.current);
  assert.throws(()=>preview(x));
  const y=input();
  y.calendarInput.paginationInput=structuredClone(y.handoffInput.currentPagination);
  assert.throws(()=>preview(y));
});
test('Repeated in-memory reports use same private HMAC seal and never mutate inputs',()=>{
  const x=input(),before=structuredClone(x);
  assert.deepEqual(preview(x),preview(x));
  assert.deepEqual(x,before);
});
