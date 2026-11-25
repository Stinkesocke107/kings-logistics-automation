'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {evaluate}=require('../event-capacity-core');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {reviewSignedHistoricalReservationHolds}
  =require('../event-capacity-historical-reservation-holds');
const {projectKingsConvoySystemBridge,renderKingsConvoySystemBridgePreview}
  =require('../event-capacity-convoy-system-calendar-bridge');
const guild='990000000000000000',current='990000000000000001',
  old='990000000000000002',thread='990000000000000003',
  oldThread='990000000000000004';
const now=Date.parse('2027-05-20T12:00:00.000Z');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function channel(channelId,kind,count){
  return {channelId,kind,firstCoveredMonth:'2025-06',
    lastCoveredMonth:'2027-05',claimedThreadCount:count,
    claimedArchivedCount:0,claimedDeletedCount:0,
    currentThreadsRead:true,archivedThreadsRead:true,
    deletedThreadsReviewed:true,editHistoryReviewed:true};
}
function row(channelId,threadId,sourceKind){
  return {channelId,threadId,sourceKind,
    eventId:'sameevent',status:'Scheduled',category:'Partner Convoy',
    departureAtUtc:'2027-04-20T18:00:00.000Z',
    modifiedAtUtc:'2027-04-18T16:00:00.000Z',
    sourceDigest:digest('source:'+threadId),
    revisionDigests:[digest('revision:'+threadId)]};
}
function fixture(){
  const signed=setup();
  const historicalHoldsReports=['2027-03','2027-04'].map(month=>
    reviewSignedHistoricalReservationHolds({
      journal:signed.afterJournal,
      scope:{guildId:'1114967437788577792',
        forumId:'1550619824005062697'},
      ownerPublicKey:signed.ownerPublicKey,month,nowMs:now
    }));
  const sourceIntake={
    guildId:guild,currentChannelId:current,
    firstMonth:'2025-06',finalMonth:'2027-05',
    nowMs:now,reviewSecret:'private synthetic HMAC test key to review source',
    channelInventory:[channel(current,'current',1),channel(old,'legacy',1)],
    convoyRecords:[row(current,thread,'current'),row(old,oldThread,'legacy')],
    tracker:{configured:true,connected:true,claimsComplete:true,records:[{
      invitationId:'outbound1',eventId:'sameevent',status:'Accepted',
      departureAtUtc:'2027-04-20T18:00:00.000Z',
      sourceDigest:digest('outbound1')
    }]}
  };
  const capacity=evaluate([{
    eventId:'100',status:'Rescheduled',statusVerified:true,
    rescheduleApproved:true,eventType:'Partner Convoy',eventTypeVerified:true,
    departureAtUtc:'2027-04-20T18:00:00Z',
    departureVerified:true,meetingAtUtc:'2027-04-20T17:00:00Z',
    plannedEndAtUtc:'2027-04-20T20:00:00Z'
  }],{dataFresh:true});
  return {sourceIntake,capacity,year:'2027',selectedMonth:'2027-04',
    historicalHoldsReports};
}
test('The two Kings systems plus old Discord channels project into the same private staff calendar',()=>{
  const result=projectKingsConvoySystemBridge(fixture());
  assert.equal(result.sourceReview.convoyCenterClaimedThreads,1);
  assert.equal(result.sourceReview.olderChannelClaimedThreads,1);
  assert.equal(result.sourceReview.outboundTrackerClaimedInvitations,1);
  assert.equal(result.sourceReview.trackerClaimedLinkedEvents,1);
  assert.equal(result.sourceReview.crossChannelOverlaps,1);
  assert.equal(result.calendar.months.length,12);
  assert.equal(result.calendar.days.length,30);
  assert.equal(result.calendar.months[2].signedHistoricalProvisional.partner,1);
  assert.equal(result.calendar.months[3].currentSnapshot.partner,1);
  assert.equal(result.calendar.months[3].signedHistoricalProvisional.partner,1);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.staffDecisionsCommitted,0);
});
test('Multiple matching sources do not add an extra Capacity booking',()=>{
  const r=projectKingsConvoySystemBridge(fixture());
  assert.equal(r.calendar.days.find(d=>d.utcDate==='2027-04-20').snapshotCombined,1);
  assert.equal(r.calendar.days.find(d=>d.utcDate==='2027-04-20').historicalCombinedProvisional,1);
  assert.equal(r.sourceAndHistoricalCountsCanOverlap,true);
  assert.equal(r.outboundInvitationAcceptedNeverAutomaticallyCountsForCapacity,true);
});
test('Missing old channels are unknown, never classified as proven empty history',()=>{
  const f=fixture();
  f.sourceIntake.channelInventory=[channel(current,'current',1)];
  f.sourceIntake.convoyRecords=[row(current,thread,'current')];
  f.sourceIntake.tracker=null;
  const r=projectKingsConvoySystemBridge(f);
  assert.equal(r.sourceReview.olderChannelClaimedThreads,0);
  assert.equal(r.previousDiscordChannelsAuthenticatedHere,false);
  assert.equal(r.eventInvitationTrackerActuallyConnectedHere,false);
  assert.ok(r.sourceReview.unresolvedHumanReviewItems>0);
});
test('Unlinked outgoing invitation cannot be used to approve the event',()=>{
  const f=fixture();
  f.sourceIntake.tracker.records[0].eventId='unknown-event';
  const r=projectKingsConvoySystemBridge(f);
  assert.equal(r.sourceReview.trackerClaimedLinkedEvents,0);
  assert.equal(r.freeSlotsCertified,false);
  assert.ok(r.sourceReview.unresolvedHumanReviewItems>0);
});
test('An incomplete 24-month boundary is refused, not silently marked complete',()=>{
  const f=fixture();f.sourceIntake.finalMonth='2027-04';
  assert.throws(()=>projectKingsConvoySystemBridge(f));
});
test('Discord preview is ephemeral, blue-styled and exposes no private IDs',()=>{
  const view=projectKingsConvoySystemBridge(fixture());
  const message=renderKingsConvoySystemBridgePreview(view);
  assert.equal(message.type,4);
  assert.equal(message.data.flags,64);
  assert.deepEqual(message.data.allowed_mentions,{parse:[]});
  assert.equal(message.data.embeds.length,2);
  assert.equal(message.data.embeds[0].color,0x182DFF);
  const output=JSON.stringify(message);
  for(const hidden of [guild,current,old,thread,oldThread,
    'sameevent','outbound1','@everyone','PRIVATE KEY'])
    assert.equal(output.includes(hidden),false);
  assert.match(output,/PREVIEW ONLY/);
  assert.match(output,/No free slots certified/);
});
test('Forged readiness flags and unsafe output numbers are refused',()=>{
  const r=projectKingsConvoySystemBridge(fixture());
  assert.throws(()=>renderKingsConvoySystemBridgePreview({
    ...r,freeSlotsCertified:true
  }));
  assert.throws(()=>renderKingsConvoySystemBridgePreview({
    ...r,sourceReview:{...r.sourceReview,unresolvedHumanReviewItems:-1}
  }));
  assert.throws(()=>renderKingsConvoySystemBridgePreview({
    ...r,eventInvitationTrackerActuallyConnectedHere:true
  }));
});
test('No data is fetched or external approval issued by this pure integration',()=>{
  const r=projectKingsConvoySystemBridge(fixture());
  assert.equal(r.currentDiscordChannelsAuthenticatedHere,false);
  assert.equal(r.previousDiscordChannelsAuthenticatedHere,false);
  assert.equal(r.anySourceReadOrImportedInThisFunction,false);
  assert.equal(r.original24MonthSourceHistoryFullyVerified,false);
  assert.equal(r.staffDecisionsCommitted,0);
  assert.equal(r.safeToActivate,false);
});
