'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {evaluate}=require('../event-capacity-core');
const {projectKingsConvoySystemBridge,renderKingsConvoySystemBridgePreview}
 =require('../event-capacity-convoy-system-calendar-bridge');
const C='990000000000000001',L='990000000000000002';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function channel(channelId,kind,patch={}){
  return {channelId,kind,firstCoveredMonth:'2024-12',
    lastCoveredMonth:'2026-11',claimedThreadCount:1,
    claimedArchivedCount:0,claimedDeletedCount:0,
    currentThreadsRead:true,archivedThreadsRead:true,
    deletedThreadsReviewed:true,editHistoryReviewed:true,...patch};
}
function row(channelId,threadId,sourceKind){
  return {channelId,threadId,eventId:'evt1',sourceKind,
    status:'Scheduled',category:'Partner Convoy',
    departureAtUtc:'2026-11-20T18:00:00.000Z',
    modifiedAtUtc:'2026-11-19T18:00:00.000Z',
    sourceDigest:digest(threadId),revisionDigests:[digest('edit'+threadId)]};
}
function data(){
  return {sourceIntake:{
    guildId:'990000000000000000',currentChannelId:C,
    firstMonth:'2024-12',finalMonth:'2026-11',
    channelInventory:[channel(C,'current'),channel(L,'legacy')],
    convoyRecords:[row(C,'990000000000000003','current'),
      row(L,'990000000000000004','legacy')],
    tracker:null,nowMs:Date.parse('2026-11-25T16:00:00.000Z'),
    reviewSecret:'synthetic audit HMAC used only in isolated tests'
  },capacity:evaluate([],{dataFresh:false}),year:'2026',
  selectedMonth:'2026-11',historicalHoldsReports:[],
  historicalEvidenceReport:null};
}
test('Concordant source claims show no count conflicts but never establish Discord authenticity',()=>{
  const r=projectKingsConvoySystemBridge(data());
  assert.equal(r.sourceReview.archivedChannelCountMismatches,0);
  assert.equal(r.sourceReview.deletedChannelCountMismatches,0);
  assert.equal(r.sourceReview.threadTotalCountMismatches,0);
  assert.equal(r.sourceReview.untrustedInventoriesInternallyConsistent,true);
  assert.equal(r.originalSourceProviderAttestationProven,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Archived record claim with unchanged total must surface private archive mismatch',()=>{
  const x=data();x.sourceIntake.convoyRecords[1].sourceKind='archived';
  const r=projectKingsConvoySystemBridge(x);
  assert.equal(r.sourceReview.archivedChannelCountMismatches,1);
  assert.equal(r.sourceReview.threadTotalCountMismatches,0);
  assert.equal(r.sourceReview.untrustedInventoriesInternallyConsistent,false);
  assert.equal(r.staffDecisionsCommitted,0);
});
test('Deleted record claim with unchanged total must surface private deletion mismatch',()=>{
  const x=data();x.sourceIntake.convoyRecords[1].sourceKind='deleted';
  const r=projectKingsConvoySystemBridge(x);
  assert.equal(r.sourceReview.deletedChannelCountMismatches,1);
  assert.equal(r.sourceReview.archivedChannelCountMismatches,0);
  assert.equal(r.sourceReview.threadTotalCountMismatches,0);
  assert.equal(r.safeToActivate,false);
});
test('Missing archive/edit coverage is a review gap even when all thread totals match',()=>{
  const x=data();x.sourceIntake.channelInventory[1].editHistoryReviewed=false;
  const r=projectKingsConvoySystemBridge(x);
  assert.equal(r.sourceReview.channelsWithCoverageReviewGaps,1);
  assert.equal(r.sourceReview.untrustedInventoriesInternallyConsistent,true);
  assert.equal(r.unverifiedSourceInventoryReviewRequired,true);
  assert.equal(r.freeSlotsCertified,false);
});
test('Duplicate source thread is refused before rendering any supposedly safe calendar',()=>{
  const x=data();x.sourceIntake.convoyRecords.push({
    ...x.sourceIntake.convoyRecords[0]
  });
  assert.throws(()=>projectKingsConvoySystemBridge(x));
});
test('Cross-channel reuse of a Discord thread ID is rejected by the combined calendar bridge',()=>{
  const x=data();
  x.sourceIntake.convoyRecords[1].threadId=x.sourceIntake.convoyRecords[0].threadId;
  assert.throws(()=>projectKingsConvoySystemBridge(x));
});
test('Private preview never includes raw Discord thread or source IDs',()=>{
  const x=data(),r=projectKingsConvoySystemBridge(x);
  const reply=renderKingsConvoySystemBridgePreview(r);
  assert.equal(reply.type,4);assert.equal(reply.data.flags,64);
  const text=JSON.stringify(reply);
  for(const forbidden of [C,L,'evt1','PRIVATE KEY','@everyone',
    '990000000000000003'])assert.equal(text.includes(forbidden),false);
});
test('Fake zero-gap count cannot grant source authenticity or available slots',()=>{
  const r=projectKingsConvoySystemBridge(data());
  assert.equal(r.currentDiscordChannelsAuthenticatedHere,false);
  assert.equal(r.previousDiscordChannelsAuthenticatedHere,false);
  assert.equal(r.eventInvitationTrackerActuallyConnectedHere,false);
  assert.equal(r.freeSlotsCertified,false);
});
