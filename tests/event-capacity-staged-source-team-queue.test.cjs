'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../event-capacity-core');
const {fixture,adjustTotals}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {projectKingsStagedSourceTeamQueue:review,
  renderKingsStagedSourceTeamQueuePreview:render}
  =require('../event-capacity-staged-source-team-queue');
function input(change){
  const handoffInput=fixture();change?.(handoffInput);
  return {handoffInput,calendarInput:{
    eventTeamInput:{sourceIntake:handoffInput.current,
      capacity:evaluate([],{dataFresh:false}),
      year:'2026',selectedMonth:'2026-11',
      historicalHoldsReports:[],historicalEvidenceReport:null},
    paginationInput:handoffInput.currentPagination,monthlyClaims:[]}};
}
function audit(change){return review(input(change));}
test('Private Event Team workboard composes prior/current source changes and 24-month evidence',()=>{
  const r=audit();
  assert.equal(r.visibility,'PRIVATE_ONLY');
  assert.equal(r.firstHistoryMonth,'2024-12');
  assert.equal(r.lastHistoryMonth,'2026-11');
  assert.equal(r.selectedEventTeamYear,'2026');
  assert.equal(r.counts.unchangedEventClaims,1);
  assert.equal(r.counts.newEventClaims,0);
  assert.equal(r.counts.missingEventClaims,0);
  assert.equal(r.reviewCategories.length,9);
  assert.equal(r.currentPaginationClaimInternallyComplete,true);
  assert.equal(r.originalDiscord24MonthsIndependentlyCertified,false);
  assert.equal(r.safeToActivate,false);
});
test('Missing previously observed Event appears for Staff without disappearing from review history',()=>{
  const r=audit(f=>{f.current.convoyRecords=[];adjustTotals(f);});
  assert.equal(r.counts.missingEventClaims,1);
  assert.equal(r.neverTreatMissingEventsAsDeleted,true);
  assert.equal(r.actualEventChangesApplied,0);
  assert.equal(r.previousDateReviewMonths[0].month,'2026-11');
});
test('A cancellation remains pending human approval rather than removing original Event',()=>{
  const r=audit(f=>{
    for(const row of f.current.convoyRecords)row.status='Cancelled';
  });
  assert.equal(r.reviewCategories[3].observedClaimIndicators,1);
  assert.equal(r.reviewCategories[3].requireHumanReview,true);
  assert.equal(r.staffDecisionsCommitted,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Rescheduled date is visible separately from the original provisional day review',()=>{
  const r=audit(f=>{
    for(const row of f.current.convoyRecords){
      row.status='Rescheduled';
      row.departureAtUtc='2026-11-23T18:00:00.000Z';
    }
  });
  assert.equal(r.reviewCategories[4].observedClaimIndicators,2);
  assert.equal(r.previousDateReviewMonths[0].provisionalPreviouslyObservedEventClaims,1);
  assert.equal(r.cannotReconcileOrReleaseOldHoldsAutomatically,true);
});
test('Missing archived stream remains a source review blocker even without any Event changes',()=>{
  const r=audit(f=>{
    f.currentPagination.scans=f.currentPagination.scans.filter(
      x=>x.stream!=='archived-public');
  });
  assert.equal(r.counts.unchangedEventClaims,1);
  assert.equal(r.counts.scanMissingStreams,1);
  assert.equal(r.currentPaginationClaimInternallyComplete,false);
  assert.equal(r.reviewCategories[8].requireHumanReview,true);
  assert.equal(r.freeSlotsCertified,false);
});
test('Vanished outbound invitation is never interpreted as an Event withdrawal',()=>{
  const r=audit(f=>{f.current.tracker.records=[];});
  assert.equal(r.reviewCategories[6].observedClaimIndicators,1);
  assert.equal(r.eventSourceClaimsAreNotConfirmedBookings,true);
  assert.equal(r.staffDecisionsCommitted,0);
});
test('Privately rendered report shows problem counts but no original identities or messages',()=>{
  const r=audit(),reply=render(r);
  assert.equal(reply.type,4);
  assert.equal(reply.data.flags,64);
  assert.deepEqual(reply.data.allowed_mentions,{parse:[]});
  const text=JSON.stringify(reply);
  for(const forbidden of ['evt100','inv1','990000000000000001',
    '990000000000000003','PRIVATE KEY','@everyone'])
    assert.equal(text.includes(forbidden),false);
  assert.match(text,/Not observed/);
  assert.match(text,/NOT a deletion/);
});
test('Renderer refuses forged success, false read-only and real event actions',()=>{
  const r=audit();
  for(const patch of [
    {safeToActivate:true},{freeSlotsCertified:true},
    {actualEventChangesApplied:1},{externalNetworkOrDiscordCallsMade:1},
    {staffDecisionsCommitted:1},{readOnly:false}
  ])assert.throws(()=>render({...r,...patch}));
});
test('Calendar input and staged current snapshot must reference the SAME candidate',()=>{
  const x=input();
  x.calendarInput.eventTeamInput.sourceIntake=structuredClone(x.handoffInput.current);
  assert.throws(()=>review(x));
  const y=input();
  y.calendarInput.paginationInput=structuredClone(y.handoffInput.currentPagination);
  assert.throws(()=>review(y));
});
test('Two independent runs are deterministic and do not mutate source objects',()=>{
  const x=input(),before=structuredClone(x);
  assert.deepEqual(review(x),review(x));
  assert.deepEqual(x,before);
});
test('Issue count overlaps are not converted into independent approvals or releases',()=>{
  const r=audit(f=>{
    f.current.convoyRecords[0].status='Cancelled';
    f.current.convoyRecords[1].status='Cancelled';
    f.current.tracker.records=[];
  });
  assert.ok(r.counts.urgentReviewItems>0);
  assert.equal(r.actualEventChangesApplied,0);
  assert.equal(r.previousOwnerHighwaterIndependentlyVerified,false);
});
