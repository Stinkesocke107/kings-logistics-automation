'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {reconcileKingsMultiSourceConvoys}=require('../event-capacity-convoy-multi-source-intake');
const SCOPE='1114967437788577792';
const CURRENT='1433705423285915668',OLD='1114974151296417834';
const THREAD='1550619824005062697',LEGACY_THREAD='1550619824005062698';
const KEY='synthetic review HMAC never stored outside unit tests';
const NOW=Date.parse('2026-11-25T14:00:00.000Z');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const month='2026-09';
function source(channelId,kind,count,patch={}){
  return {channelId,kind,firstCoveredMonth:'2024-12',
    lastCoveredMonth:'2026-11',claimedThreadCount:count,
    claimedArchivedCount:0,claimedDeletedCount:0,
    currentThreadsRead:true,archivedThreadsRead:true,
    deletedThreadsReviewed:true,editHistoryReviewed:true,...patch};
}
function convoy(patch={}){
  return {channelId:CURRENT,threadId:THREAD,eventId:'event100',
    sourceKind:'current',status:'Scheduled',
    category:'Partner Convoy',departureAtUtc:'2026-09-20T18:00:00.000Z',
    modifiedAtUtc:'2026-09-19T12:00:00.000Z',
    sourceDigest:hash('event source text'),revisionDigests:[hash('edit')],
    ...patch};
}
function trackerRecord(patch={}){
  return {invitationId:'invitation1',eventId:'event100',status:'Accepted',
    departureAtUtc:'2026-09-20T18:00:00.000Z',
    sourceDigest:hash('outgoing tracker'),...patch};
}
function fixture(){
  return {guildId:SCOPE,currentChannelId:CURRENT,
    firstMonth:'2024-12',finalMonth:'2026-11',
    channelInventory:[source(CURRENT,'current',1),source(OLD,'legacy',1)],
    convoyRecords:[convoy(),convoy({channelId:OLD,threadId:LEGACY_THREAD,
      sourceKind:'legacy'})],
    tracker:{configured:true,connected:true,claimsComplete:true,
      records:[trackerRecord()]},reviewSecret:KEY,nowMs:NOW};
}
function audit(patch={}){return reconcileKingsMultiSourceConvoys({...fixture(),...patch});}
test('Convoy Center, old channel and outbound tracker same Event link as ONE claimed identity',()=>{
  const report=audit();
  assert.equal(report.sourceCounts.currentChannelRecords,1);
  assert.equal(report.sourceCounts.legacyChannelRecords,1);
  assert.equal(report.sourceCounts.claimedDistinctConvoyIdentities,1);
  assert.equal(report.sourceCounts.centerAndLegacyOverlapClaims,1);
  assert.equal(report.sourceCounts.outgoingTrackerRecordClaims,1);
  assert.equal(report.sourceCounts.trackerMatchedEventClaims,1);
  assert.equal(report.sourceCounts.claimedAcceptedIdentities,1);
  assert.equal(report.crossSystemEventsMergedIntoProduction,false);
  assert.equal(report.availableSlotsCertified,false);
  assert.equal(report.freeSlotsCertified,false);
  assert.equal(report.safeToActivate,false);
});
test('Outbound tracker Accepted never becomes a verified Convoy Center acceptance',()=>{
  const f=fixture();
  f.convoyRecords=[];
  f.channelInventory=[source(CURRENT,'current',0)];
  const report=reconcileKingsMultiSourceConvoys(f);
  assert.equal(report.sourceCounts.claimedAcceptedIdentities,0);
  assert.equal(report.sourceCounts.trackerMatchedEventClaims,0);
  assert.ok(report.reviewItems.some(x=>
    x.reason==='outgoing-tracker-entry-without-convoy-center-link'));
  assert.equal(report.outboundTrackerAcceptanceNeverCountsWithoutCenterApproval,true);
});
test('Conflicting date or category across current and old channel flags a human urgent review',()=>{
  const f=fixture();f.convoyRecords[1]=convoy({
    channelId:OLD,threadId:LEGACY_THREAD,sourceKind:'legacy',
    departureAtUtc:'2026-09-21T18:00:00.000Z',
    category:'External Convoy'
  });
  const r=reconcileKingsMultiSourceConvoys(f);
  assert.equal(r.sourceCounts.conflictingClaimGroups,1);
  assert.ok(r.reviewItems.some(x=>x.reason==='cross-channel-event-lifecycle-conflict'&&
    x.level==='Urgent'));
  assert.equal(r.staffApprovalsCommitted,0);
});
test('Unlinked old threads cannot silently be matched based on date or title',()=>{
  const f=fixture();f.convoyRecords[1]=convoy({
    channelId:OLD,threadId:LEGACY_THREAD,eventId:null,sourceKind:'legacy'
  });
  const r=reconcileKingsMultiSourceConvoys(f);
  assert.equal(r.sourceCounts.claimedDistinctConvoyIdentities,2);
  assert.ok(r.reviewItems.some(x=>x.reason==='convoy-without-canonical-event-id'));
  assert.equal(r.capacityEventsImported,0);
});
test('Archives, deletions and incomplete message revisions are explicit review cases',()=>{
  const f=fixture();f.convoyRecords[0]=convoy({
    sourceKind:'deleted',revisionDigests:[]
  });
  f.convoyRecords[1]=convoy({channelId:OLD,threadId:LEGACY_THREAD,
    sourceKind:'archived'});
  f.channelInventory[0]={...f.channelInventory[0],claimedDeletedCount:1,
    editHistoryReviewed:false};
  f.channelInventory[1]={...f.channelInventory[1],claimedArchivedCount:1,
    deletedThreadsReviewed:false};
  const r=reconcileKingsMultiSourceConvoys(f),codes=r.reviewItems.map(x=>x.reason);
  assert.ok(codes.includes('deleted-thread-needs-independent-source'));
  assert.ok(codes.includes('archived-thread-needs-original-source'));
  assert.ok(codes.includes('event-edit-history-not-supplied'));
  assert.ok(codes.includes('channel-edits-not-reviewed'));
  assert.ok(codes.includes('channel-deleted-evidence-not-reviewed'));
  assert.equal(r.deletionAndEditCoverageProviderVerified,false);
});
test('Missing actual tracker configuration is separately visible without inventing completed tracker',()=>{
  const f=fixture();f.tracker=null;
  const r=reconcileKingsMultiSourceConvoys(f);
  assert.ok(r.reviewItems.some(x=>x.reason==='outbound-invitation-tracker-not-supplied'));
  assert.equal(r.outboundTrackerActuallyRead,false);
  const x=fixture();x.tracker={configured:false,connected:false,claimsComplete:false,
    records:[]};
  const status=reconcileKingsMultiSourceConvoys(x);
  assert.ok(status.reviewItems.some(i=>i.reason==='outbound-invitation-tracker-not-configured'));
});
test('Claimed inventory totals inconsistent with captured thread count flag urgent gap',()=>{
  const f=fixture();f.channelInventory[0].claimedThreadCount=3;
  const r=reconcileKingsMultiSourceConvoys(f);
  assert.ok(r.reviewItems.some(x=>
    x.reason==='channel-inventory-count-contradiction'&&x.level==='Urgent'));
  assert.equal(r.originalChannelHistoryAuthenticated,false);
});
test('Duplicate channel IDs, threads and tracker invitations are rejected',()=>{
  const f=fixture();
  assert.throws(()=>audit({channelInventory:[...f.channelInventory,f.channelInventory[0]]}));
  assert.throws(()=>audit({convoyRecords:[...f.convoyRecords,f.convoyRecords[0]]}));
  assert.throws(()=>audit({tracker:{...f.tracker,records:[trackerRecord(),trackerRecord()]}}));
});
test('Wrong guild, missing primary channel, spoofed legacy primary and foreign channel reject',()=>{
  const f=fixture();
  assert.throws(()=>audit({guildId:'123'}));
  assert.throws(()=>audit({channelInventory:[f.channelInventory[1]]}));
  assert.throws(()=>audit({channelInventory:[source(CURRENT,'legacy',1)]}));
  assert.throws(()=>audit({convoyRecords:[convoy({channelId:'999999999999999999'})]}));
  assert.throws(()=>audit({currentChannelId:OLD}));
});
test('Invalid UTC date, future edited messages and event status are rejected',()=>{
  for(const patch of [
    {departureAtUtc:'2026-02-30T18:00:00.000Z'},
    {modifiedAtUtc:'2027-01-01T12:00:00.000Z'},
    {status:'Secret Accepted'},
    {category:'Untrusted'},
    {sourceDigest:'garbage'},
    {revisionDigests:[hash('a'),hash('a')]}
  ]){
    const f=fixture();f.convoyRecords[0]=convoy(patch);
    assert.throws(()=>reconcileKingsMultiSourceConvoys(f));
  }
});
test('Malicious extra token or raw Discord message content cannot enter a source claim',()=>{
  const f=fixture();f.convoyRecords[0]=convoy({token:'SUPERSECRET'});
  assert.throws(()=>reconcileKingsMultiSourceConvoys(f),e=>{
    assert.doesNotMatch(String(e),/SUPERSECRET/);return true;
  });
  const x=fixture();x.tracker.records[0]={...trackerRecord(),
    rawMessage:'@everyone DM me for a token'};
  assert.throws(()=>reconcileKingsMultiSourceConvoys(x));
});
test('No private Event IDs, channel IDs, hashes, token strings or message content leak',()=>{
  const result=audit(),encoded=JSON.stringify(result);
  for(const secret of [SCOPE,CURRENT,OLD,THREAD,LEGACY_THREAD,'event100',
    'invitation1',hash('edit'),hash('event source text'),KEY,'@everyone']){
    assert.equal(encoded.includes(secret),false);
  }
  assert.ok(result.reviewItems.every(i=>/^capacity-source:[a-f0-9]{32}$/.test(i.reviewKey)));
});
test('Archived and deleted subtotals are checked even when channel totals match',()=>{
  for(const [kind,reason] of [
    ['archived','channel-archived-count-contradiction'],
    ['deleted','channel-deleted-count-contradiction']
  ]){
    const f=fixture();
    f.convoyRecords[1]={...f.convoyRecords[1],sourceKind:kind};
    const r=reconcileKingsMultiSourceConvoys(f);
    assert.ok(r.reviewItems.some(i=>i.reason===reason&&i.level==='Urgent'));
    assert.equal(r.reviewItems.some(i=>i.reason===
      'channel-inventory-count-contradiction'),false);
    assert.equal(r.capacityEventsImported,0);
    assert.equal(r.freeSlotsCertified,false);
    assert.equal(r.safeToActivate,false);
    assert.equal(JSON.stringify(r).includes(OLD),false);
  }
});
test('Matching archived and deleted claims do not create subtotal contradictions',()=>{
  const f=fixture();
  f.convoyRecords[0]={...f.convoyRecords[0],sourceKind:'deleted'};
  f.convoyRecords[1]={...f.convoyRecords[1],sourceKind:'archived'};
  f.channelInventory[0].claimedDeletedCount=1;
  f.channelInventory[1].claimedArchivedCount=1;
  const r=reconcileKingsMultiSourceConvoys(f);
  assert.equal(r.reviewItems.some(i=>i.reason===
    'channel-archived-count-contradiction'),false);
  assert.equal(r.reviewItems.some(i=>i.reason===
    'channel-deleted-count-contradiction'),false);
  assert.ok(r.reviewItems.some(i=>i.reason===
    'deleted-thread-needs-independent-source'));
  assert.ok(r.reviewItems.some(i=>i.reason===
    'archived-thread-needs-original-source'));
  assert.equal(r.originalChannelHistoryAuthenticated,false);
});
test('Zero displayed historical conflicts does not prove original Discord access or capacity',()=>{
  const f=fixture();f.convoyRecords=[convoy()];
  f.channelInventory=[source(CURRENT,'current',1)];
  f.tracker=null;
  const r=reconcileKingsMultiSourceConvoys(f);
  assert.equal(r.currentDiscordChannelActuallyRead,false);
  assert.equal(r.olderDiscordChannelsActuallyRead,false);
  assert.equal(r.allExistingLegacyChannelsDiscovered,false);
  assert.equal(r.historical24MonthCoverageIndependentlyProven,false);
  assert.equal(r.capacityEventsImported,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Full historical interval requires explicit, bounded coverage window and source claims',()=>{
  const f=fixture();
  assert.throws(()=>audit({firstMonth:'2027-01'}));
  assert.throws(()=>audit({finalMonth:'2027-01'}));
  assert.throws(()=>audit({channelInventory:[{
    ...f.channelInventory[0],claimedThreadCount:-1
  }]}));
  const r=audit({channelInventory:[
    {...f.channelInventory[0],firstCoveredMonth:'2025-01'},
    f.channelInventory[1]
  ]});
  assert.ok(r.reviewItems.some(i=>i.reason==='channel-does-not-cover-entire-window'));
});
