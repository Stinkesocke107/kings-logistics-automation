'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../event-capacity-core');
const {fixture,invite,h}=require('./fixtures/outbound-center-scenario.cjs');
const {projectKingsUnifiedEventTeamReview:review,
  renderKingsUnifiedEventTeamReviewPreview:render}
  =require('../event-capacity-unified-team-review');
function input(change){
  const x=fixture();change?.(x);
  return {sourceIntake:x,capacity:evaluate([],{dataFresh:false}),
    year:'2026',selectedMonth:'2026-11',historicalHoldsReports:[],
    historicalEvidenceReport:null};
}
test('Combined Event Team review includes linked outgoing Tracker and Center/legacy evidence',()=>{
  const r=review(input()),c=r.sourceCounts;
  assert.equal(c.currentCenterClaims,1);
  assert.equal(c.olderChannelClaims,1);
  assert.equal(c.outboundInvitations,1);
  assert.equal(c.explicitlyLinkedInvitations,1);
  assert.equal(c.missingLinks,0);
  assert.equal(r.currentAndHistoricalCountsNeverAdded,true);
  assert.equal(r.realEventsApproved,0);
  assert.equal(r.safeToActivate,false);
});
test('Mismatched outgoing date reaches shared human-review totals',()=>{
  const r=review(input(x=>{
    x.tracker.records[0].departureAtUtc='2026-11-22T18:00:00.000Z';
  }));
  assert.equal(r.sourceCounts.staleOrWrongDeparture,1);
  assert.ok(r.sourceCounts.separateOutboundUrgentItems>0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Older legacy date but different current Center date remains unresolved',()=>{
  const r=review(input(x=>{
    x.convoyRecords[1].departureAtUtc='2026-11-17T18:00:00.000Z';
    x.tracker.records[0].departureAtUtc='2026-11-17T18:00:00.000Z';
  }));
  assert.equal(r.sourceCounts.staleOrWrongDeparture,1);
  assert.equal(r.outboundAcceptedIsNotKingsApproval,true);
});
test('Outgoing Accepted with Center Cancelled cannot become valid confirmed booking',()=>{
  const r=review(input(x=>{x.convoyRecords[0].status='Cancelled';}));
  assert.equal(r.sourceCounts.outboundAcceptedVsCenterConflict,1);
  assert.equal(r.realEventsApproved,0);
  assert.equal(r.discordMessagesSent,0);
});
test('Private Event Calendar review exposes missing evidence months, not free slots',()=>{
  const r=review(input());
  assert.equal(r.sourceCounts.calendarMonths,12);
  assert.equal(r.sourceCounts.calendarMonthsWithoutSignedHolds,12);
  assert.equal(r.sourceCounts.calendarMonthsOutsideOriginalEvidence,12);
  assert.equal(r.sourceCounts.calendarMonthsWithQuotaConflicts,0);
  assert.match(JSON.stringify(render(r)),/Original evidence not supplied 12/);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.realEventsApproved,0);
});
test('Missing canonical links still appear without fuzzy matching',()=>{
  const r=review(input(x=>{x.tracker.records[0].eventId=null;}));
  assert.equal(r.sourceCounts.missingLinks,1);
  assert.equal(r.sourceCounts.explicitlyLinkedInvitations,0);
});
test('Multiple outgoing invitations remain separate invitations for same Event',()=>{
  const r=review(input(x=>{x.tracker.records.push(invite({
    invitationId:'inv2',status:'Sent',sourceDigest:h('second invitation')
  }));}));
  assert.equal(r.sourceCounts.outboundInvitations,2);
  assert.equal(r.sourceCounts.multiInvitationEventGroups,1);
  assert.equal(r.sourceIssueCountsAreNonadditive,true);
});
test('Unified private Event Team preview shows outgoing invitation status totals only',()=>{
  const r=review(input(x=>{
    x.tracker.records[0].status='Unknown';
    x.tracker.records.push(invite({invitationId:'inv2',status:'Sent',
      sourceDigest:h('second recipient')}));
  }));
  assert.equal(r.sourceCounts.outboundByStatus.Unknown,1);
  assert.equal(r.sourceCounts.outboundByStatus.Sent,1);
  assert.equal(r.sourceCounts.outboundByStatus.Accepted,0);
  const text=JSON.stringify(render(r));
  assert.match(text,/Draft 0/);
  assert.match(text,/Sent 1/);
  assert.match(text,/Unknown 1/);
  assert.equal(text.includes('inv2'),false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Archive/deleted count mismatches surface but never authorize automatic releases',()=>{
  const a=review(input(x=>{x.convoyRecords[1].sourceKind='archived';}));
  assert.equal(a.sourceCounts.archiveCountContradictions,1);
  const d=review(input(x=>{x.convoyRecords[1].sourceKind='deleted';}));
  assert.equal(d.sourceCounts.deletionCountContradictions,1);
  assert.equal(a.freeSlotsCertified,false);
  assert.equal(d.freeSlotsCertified,false);
});
test('Missing Tracker remains visibly unverified without inventing outgoing events',()=>{
  const r=review(input(x=>{x.tracker=null;}));
  assert.equal(r.sourceCounts.outboundInvitations,0);
  assert.ok(r.sourceCounts.separateOutboundReviewItems>0);
  assert.equal(r.outboundTrackerActuallyRead,false);
});
test('Ephemeral preview excludes event identities, channel numbers and secrets',()=>{
  const r=review(input()),reply=render(r),output=JSON.stringify(reply);
  assert.equal(reply.type,4);assert.equal(reply.data.flags,64);
  assert.deepEqual(reply.data.allowed_mentions,{parse:[]});
  for(const forbidden of ['evt100','inv1','990000000000000001',
    'PRIVATE KEY','DISCORD_BOT_TOKEN','@everyone'])
    assert.equal(output.includes(forbidden),false);
  assert.match(output,/No certified free slots/);
});
test('Forged success and real Discord claims are refused by the renderer',()=>{
  const r=review(input());
  assert.throws(()=>render({...r,freeSlotsCertified:true}));
  assert.throws(()=>render({...r,realEventsApproved:1}));
  assert.throws(()=>render({...r,outboundTrackerActuallyRead:true}));
  assert.throws(()=>render({...r,sourceCounts:{...r.sourceCounts,
    outboundByStatus:{...r.sourceCounts.outboundByStatus,Accepted:99}}}));
  assert.throws(()=>render({...r,sourceCounts:{...r.sourceCounts,
    calendarMonthsOutsideOriginalEvidence:99}}));
});
