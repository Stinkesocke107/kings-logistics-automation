'use strict';
// DRAFT, PURE, PRIVATE: review UNTRUSTED exported Discord Convoy Center and
// legacy-channel records beside a FUTURE outbound Invitation Tracker export.
// Does not connect to Discord, authenticate archives, migrate data, issue
// tickets, approve invitations, or certify available event capacity.
const {createHmac}=require('node:crypto');
const ERROR='Kings Event Capacity multi-source channel intake refused.';
const SNOW=/^[1-9]\d{16,21}$/;
const EVENT=/^[A-Za-z0-9_-]{1,64}$/;
const INV=/^[A-Za-z0-9_.:-]{1,96}$/;
const HASH=/^[a-f0-9]{64}$/;
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const TIME=/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const STATES=new Set(['Submitted','Needs Information','Ready for Approval',
  'Scheduled','Completed','Cancelled','Rescheduled','Unknown']);
const CATEGORIES=new Set(['Kings Convoy','Partner Convoy','External Convoy','Unknown']);
const SOURCE_KINDS=new Set(['current','archived','deleted','legacy']);
const INVITE_STATES=new Set(['Draft','Sent','Accepted','Declined','Withdrawn','Unknown']);
const MAX_CHANNELS=100,MAX_ROWS=10000,MAX_REVS=100;
function fail(){throw new Error(ERROR);}
function obj(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function exact(x,fields){if(!obj(x)||
  Object.keys(x).sort().join(',')!==fields.slice().sort().join(','))fail();}
function iso(t){if(typeof t!=='string'||!TIME.test(t)||
  !Number.isFinite(Date.parse(t))||new Date(t).toISOString()!==t)fail();return t;}
function month(m){if(typeof m!=='string'||!MONTH.test(m))fail();return m;}
function nonneg(n){if(!Number.isSafeInteger(n)||n<0||n>MAX_ROWS)fail();return n;}
function opaque(secret,guild,reason,ref){
  return 'capacity-source:'+createHmac('sha256',secret)
    .update(['source-review-v1',guild,reason,ref].join('\0')).digest('hex').slice(0,32);
}
function reconcileKingsMultiSourceConvoys({
  guildId,currentChannelId,firstMonth,finalMonth,
  channelInventory=[],convoyRecords=[],tracker=null,
  reviewSecret,nowMs=Date.now()
}={}){
  try{
    if(!SNOW.test(guildId)||!SNOW.test(currentChannelId)||
      !Number.isSafeInteger(nowMs)||nowMs<0||
      !Array.isArray(channelInventory)||channelInventory.length>MAX_CHANNELS||
      !Array.isArray(convoyRecords)||convoyRecords.length>MAX_ROWS||
      typeof reviewSecret!=='string'||Buffer.byteLength(reviewSecret,'utf8')<32||
      Buffer.byteLength(reviewSecret,'utf8')>4096)fail();
    const start=month(firstMonth),end=month(finalMonth);
    const last=new Date(start+'-01T00:00:00.000Z');
    last.setUTCMonth(last.getUTCMonth()+23);
    if(start>end||end!==last.toISOString().slice(0,7)||
      end>new Date(nowMs).toISOString().slice(0,7))fail();
    const channels=new Map(),issues=new Map();
    function issue(reason,ref,level='Review'){
      const key=opaque(reviewSecret,guildId,reason,ref);
      if(!issues.has(key))issues.set(key,Object.freeze({
        reviewKey:key,reason,level,staffReviewRequired:true,
        autoResolved:false,capacityAllocationChanged:false
      }));
    }
    let currentCount=0;
    for(const c of channelInventory){
      exact(c,['channelId','kind','firstCoveredMonth','lastCoveredMonth',
        'claimedThreadCount','claimedArchivedCount','claimedDeletedCount',
        'currentThreadsRead','archivedThreadsRead','deletedThreadsReviewed',
        'editHistoryReviewed']);
      if(!SNOW.test(c.channelId)||channels.has(c.channelId)||
        !['current','legacy'].includes(c.kind)||
        month(c.firstCoveredMonth)>month(c.lastCoveredMonth)||
        c.firstCoveredMonth<start||c.lastCoveredMonth>end||
        ['currentThreadsRead','archivedThreadsRead',
          'deletedThreadsReviewed','editHistoryReviewed']
          .some(k=>typeof c[k]!=='boolean'))fail();
      nonneg(c.claimedThreadCount);
      nonneg(c.claimedArchivedCount);nonneg(c.claimedDeletedCount);
      if(c.claimedArchivedCount+c.claimedDeletedCount>c.claimedThreadCount)fail();
      if(c.kind==='current'){
        currentCount++;
        if(c.channelId!==currentChannelId)fail();
      }else if(c.channelId===currentChannelId)fail();
      channels.set(c.channelId,c);
      if(!c.currentThreadsRead)issue('channel-live-inventory-not-reviewed',c.channelId);
      if(!c.archivedThreadsRead)issue('channel-archived-threads-not-reviewed',c.channelId);
      if(!c.deletedThreadsReviewed)issue('channel-deleted-evidence-not-reviewed',c.channelId);
      if(!c.editHistoryReviewed)issue('channel-edits-not-reviewed',c.channelId);
    }
    if(currentCount!==1)fail();
    const observed=new Map(),observedArchived=new Map(),
      observedDeleted=new Map(),seenThreads=new Set(),grouped=new Map();
    const counters={currentChannelRecords:0,legacyChannelRecords:0,
      archivedRecordClaims:0,deletedRecordClaims:0,
      rawConvoyRecordClaims:convoyRecords.length,
      outgoingTrackerRecordClaims:0,trackerMatchedEventClaims:0,
      claimedDistinctConvoyIdentities:0,claimedAcceptedIdentities:0,
      centerAndLegacyOverlapClaims:0,conflictingClaimGroups:0};
    for(const r of convoyRecords){
      exact(r,['channelId','threadId','eventId','sourceKind','status',
        'category','departureAtUtc','modifiedAtUtc','sourceDigest','revisionDigests']);
      const channel=channels.get(r.channelId);
      if(!channel||!SNOW.test(r.threadId)||
        (r.eventId!==null&&(!EVENT.test(r.eventId)))||
        !SOURCE_KINDS.has(r.sourceKind)||!STATES.has(r.status)||
        !CATEGORIES.has(r.category)||!HASH.test(r.sourceDigest)||
        !Array.isArray(r.revisionDigests)||r.revisionDigests.length>MAX_REVS)fail();
      const departure=iso(r.departureAtUtc),modified=iso(r.modifiedAtUtc);
      if(Date.parse(modified)>nowMs+60000||
        departure.slice(0,7)<start||departure.slice(0,7)>end)fail();
      const digests=new Set();
      for(const d of r.revisionDigests){
        if(typeof d!=='string'||!HASH.test(d)||digests.has(d))fail();
        digests.add(d);
      }
      if(channel.kind==='current'&&r.sourceKind==='legacy')fail();
      if(channel.kind==='legacy'&&r.sourceKind==='current')fail();
      // A Discord thread snowflake is globally unique. The same thread cannot
      // legitimately belong to two different parent channels. Fail closed
      // rather than counting a moved/mislabeled source twice.
      const threadKey=r.channelId+':'+r.threadId;
      if(seenThreads.has(r.threadId))fail();
      seenThreads.add(r.threadId);
      observed.set(r.channelId,(observed.get(r.channelId)??0)+1);
      if(r.sourceKind==='archived')
        observedArchived.set(r.channelId,(observedArchived.get(r.channelId)??0)+1);
      if(r.sourceKind==='deleted')
        observedDeleted.set(r.channelId,(observedDeleted.get(r.channelId)??0)+1);
      if(channel.kind==='current')counters.currentChannelRecords++;
      else counters.legacyChannelRecords++;
      if(r.sourceKind==='archived')counters.archivedRecordClaims++;
      if(r.sourceKind==='deleted')counters.deletedRecordClaims++;
      if(r.eventId===null)issue('convoy-without-canonical-event-id',threadKey);
      if(r.sourceKind==='deleted')issue('deleted-thread-needs-independent-source',threadKey);
      if(r.sourceKind==='archived')issue('archived-thread-needs-original-source',threadKey);
      if(r.revisionDigests.length===0)issue('event-edit-history-not-supplied',threadKey);
      // Only identical eventId may merge cross-channel records. Otherwise
      // never guess matches from text, date, organizer, or route.
      const canonical=r.eventId===null?'thread:'+threadKey:'event:'+r.eventId;
      const group=grouped.get(canonical)??[];
      group.push({kind:channel.kind,status:r.status,category:r.category,
        departure,ref:threadKey,hasHistory:digests.size>0});
      grouped.set(canonical,group);
    }
    for(const channel of channels.values()){
      const count=observed.get(channel.channelId)??0;
      if(count!==channel.claimedThreadCount)
        issue('channel-inventory-count-contradiction',channel.channelId,'Urgent');
      // A matching total does not prove that archived/deleted thread claims
      // match their reported subsets. Surface both gaps independently.
      if((observedArchived.get(channel.channelId)??0)!==channel.claimedArchivedCount)
        issue('channel-archived-count-contradiction',channel.channelId,'Urgent');
      if((observedDeleted.get(channel.channelId)??0)!==channel.claimedDeletedCount)
        issue('channel-deleted-count-contradiction',channel.channelId,'Urgent');
      // Coverage manifest is always caller-supplied, not provider attested.
      if(channel.firstCoveredMonth>start||channel.lastCoveredMonth<end)
        issue('channel-does-not-cover-entire-window',channel.channelId);
    }
    for(const [key,records] of grouped){
      if(records.length>1){
        const types=new Set(records.map(r=>r.kind));
        if(types.has('current')&&types.has('legacy'))
          counters.centerAndLegacyOverlapClaims++;
        const claims=new Set(records.map(r=>JSON.stringify([
          r.status,r.category,r.departure
        ])));
        if(claims.size>1){
          counters.conflictingClaimGroups++;
          issue('cross-channel-event-lifecycle-conflict',key,'Urgent');
        }else issue('cross-channel-duplicate-needs-source-reconciliation',key);
      }
      if(records.some(r=>r.status==='Unknown'||r.category==='Unknown'))
        issue('unverified-center-status-or-category',key);
      // Even Accepted-like statuses are only SOURCE CLAIMS here, never a
      // legitimate Capacity acceptance without signed staff verification.
      if(records.some(r=>['Scheduled','Completed','Rescheduled'].includes(r.status)))
        counters.claimedAcceptedIdentities++;
    }
    counters.claimedDistinctConvoyIdentities=grouped.size;
    if(tracker!==null){
      exact(tracker,['configured','connected','claimsComplete','records']);
      if(typeof tracker.configured!=='boolean'||typeof tracker.connected!=='boolean'||
        typeof tracker.claimsComplete!=='boolean'||
        !Array.isArray(tracker.records)||tracker.records.length>MAX_ROWS||
        (!tracker.configured&&(tracker.connected||tracker.claimsComplete||
          tracker.records.length>0)))fail();
      if(!tracker.configured)issue('outbound-invitation-tracker-not-configured','tracker');
      else if(!tracker.connected||!tracker.claimsComplete)
        issue('outbound-invitation-tracker-coverage-unverified','tracker');
      const trackerSeen=new Set();
      for(const row of tracker.records){
        exact(row,['invitationId','eventId','status','departureAtUtc','sourceDigest']);
        if(!INV.test(row.invitationId)||
          row.eventId!==null&&!EVENT.test(row.eventId)||
          !INVITE_STATES.has(row.status)||!HASH.test(row.sourceDigest))fail();
        const departure=iso(row.departureAtUtc);
        if(departure.slice(0,7)<start||departure.slice(0,7)>end||
          trackerSeen.has(row.invitationId))fail();
        trackerSeen.add(row.invitationId);
        counters.outgoingTrackerRecordClaims++;
        if(row.eventId===null)
          issue('tracker-invitation-without-event-link',row.invitationId);
        else if(grouped.has('event:'+row.eventId))
          counters.trackerMatchedEventClaims++;
        else issue('outgoing-tracker-entry-without-convoy-center-link',
          row.invitationId);
        // Tracker 'Accepted' is NOT proof that the event was formally
        // approved within Convoy Center for the Kings quota.
      }
    }else issue('outbound-invitation-tracker-not-supplied','tracker');
    const listed=[...issues.values()].sort((a,b)=>a.reason.localeCompare(b.reason)||
      a.reviewKey.localeCompare(b.reviewKey));
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      scope:'Single Kings Discord guild — claims only',
      window:Object.freeze({firstMonth:start,finalMonth:end}),
      sourceSystems:Object.freeze([
        'Convoy Center & Checker','Event Invitation Tracker',
        'Archived / Legacy Convoy Channels'
      ]),
      suppliedCurrentChannelCount:1,
      suppliedLegacyChannelCount:channels.size-1,
      suppliedDistinctChannelCount:channels.size,
      sourceCounts:Object.freeze(counters),
      reviewItems:Object.freeze(listed),
      unresolvedReviewItemCount:listed.length,
      urgentReviewItemCount:listed.filter(x=>x.level==='Urgent').length,
      currentDiscordChannelActuallyRead:false,
      olderDiscordChannelsActuallyRead:false,
      outboundTrackerActuallyRead:false,
      allExistingLegacyChannelsDiscovered:false,
      originalChannelHistoryAuthenticated:false,
      deletionAndEditCoverageProviderVerified:false,
      historical24MonthCoverageIndependentlyProven:false,
      crossSystemEventsMergedIntoProduction:false,
      outboundTrackerAcceptanceNeverCountsWithoutCenterApproval:true,
      rawChannelMessagesStoredHere:false,
      capacityEventsImported:0,staffApprovalsCommitted:0,
      availableSlotsCertified:false,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={reconcileKingsMultiSourceConvoys};
