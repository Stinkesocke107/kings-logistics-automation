'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectKingsSourceChannelEvidenceClaims:check}
  =require('../event-capacity-cross-channel-evidence-assurance');
const A='1550619824005062697',B='1550619824005062698';
const C='1550619824005062699',D='1550619824005062700';
function sample(){
  return {channelInventory:[
    {channelId:A,kind:'current',claimedThreadCount:1,
      claimedArchivedCount:0,claimedDeletedCount:0,
      currentThreadsRead:true,archivedThreadsRead:true,
      deletedThreadsReviewed:true,editHistoryReviewed:true},
    {channelId:B,kind:'legacy',claimedThreadCount:1,
      claimedArchivedCount:1,claimedDeletedCount:0,
      currentThreadsRead:true,archivedThreadsRead:true,
      deletedThreadsReviewed:true,editHistoryReviewed:true}
  ],convoyRecords:[
    {channelId:A,threadId:C,sourceKind:'current'},
    {channelId:B,threadId:D,sourceKind:'archived'}
  ]};
}
test('Matching claimed totals still never prove Discord source authenticity',()=>{
  const x=check(sample());
  assert.equal(x.examinedChannelClaims,2);
  assert.equal(x.examinedThreadClaims,2);
  assert.equal(x.untrustedInventoryInternallyConsistent,true);
  assert.equal(x.complete24MonthOriginalSourceHistoryVerified,false);
  assert.equal(x.originalPrivateDiscordMessagesRead,0);
  assert.equal(x.safeToActivate,false);
});
test('Archived discrepancy is detected with a matching overall thread total',()=>{
  const f=sample();f.channelInventory[1].claimedArchivedCount=0;
  const x=check(f);
  assert.equal(x.counters.mismatchedArchivedCounts,1);
  assert.equal(x.counters.mismatchedThreadCounts,0);
  assert.equal(x.untrustedInventoryInternallyConsistent,false);
});
test('Deleted discrepancy is detected separately from a matching total',()=>{
  const f=sample();f.convoyRecords[1].sourceKind='deleted';
  const x=check(f);
  assert.equal(x.counters.mismatchedDeletedCounts,1);
  assert.equal(x.counters.mismatchedArchivedCounts,1);
});
test('Channel total discrepancies are separate from archived subcounts',()=>{
  const f=sample();f.channelInventory[0].claimedThreadCount=2;
  const x=check(f);
  assert.equal(x.counters.mismatchedThreadCounts,1);
  assert.equal(x.counters.mismatchedArchivedCounts,0);
});
test('Unverified edits and archived/deleted coverage still need human review',()=>{
  const f=sample();f.channelInventory[0].editHistoryReviewed=false;
  const x=check(f);
  assert.equal(x.counters.channelsWithCoverageClaimGaps,1);
  assert.equal(x.allOldChannelsIndependentlyEnumerated,false);
});
test('Duplicate channel identities and repeated source thread claims fail closed',()=>{
  const f=sample();f.channelInventory.push({...f.channelInventory[0]});
  assert.throws(()=>check(f));
  const g=sample();g.convoyRecords.push({...g.convoyRecords[1]});
  assert.throws(()=>check(g));
});
test('Thread identity cannot appear under two channels or the wrong channel kind',()=>{
  const repeated=sample();
  repeated.convoyRecords[1].threadId=C;
  assert.throws(()=>check(repeated));
  const wrongLegacy=sample();
  wrongLegacy.convoyRecords[0].sourceKind='legacy';
  assert.throws(()=>check(wrongLegacy));
  const wrongCurrent=sample();
  wrongCurrent.convoyRecords[1].sourceKind='current';
  assert.throws(()=>check(wrongCurrent));
});
test('Invalid source types, missing channel, and claimed totals are refused',()=>{
  const f=sample();f.convoyRecords[0].sourceKind='secret';
  assert.throws(()=>check(f));
  const g=sample();g.convoyRecords[0].channelId='999999999999999999';
  assert.throws(()=>check(g));
  const h=sample();h.channelInventory[0].claimedThreadCount=-1;
  assert.throws(()=>check(h));
});
test('Empty invented source inventories are not certified as complete',()=>{
  const x=check({channelInventory:[],convoyRecords:[]});
  assert.equal(x.examinedChannelClaims,0);
  assert.equal(x.complete24MonthOriginalSourceHistoryVerified,false);
  assert.equal(x.freeSlotsCertified,false);
});
test('Private reports redact actual channel and thread identifiers',()=>{
  const s=JSON.stringify(check(sample()));
  for(const id of [A,B,C,D,'PRIVATE KEY','DISCORD_BOT_TOKEN'])
    assert.equal(s.includes(id),false);
  assert.equal(s.includes('staffDecisionsMade":0'),true);
});
