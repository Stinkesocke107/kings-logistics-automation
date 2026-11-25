'use strict';
// KINGS EVENT CAPACITY — DRAFT/OFFLINE/PRIVATE-ONLY.
// A deterministic, read-only, QUARANTINED import plan, not an import engine.
// A matching/unchanged record is NOT trusted Discord data or an approved
// event. No provider access, no Event/Tracker/History writes and no releases.
const {createHmac}=require('node:crypto');
const {rehearseKingsStagedSourceHandoff}
  =require('./event-capacity-staged-source-handoff-review');
const ERROR='Kings Event Capacity import quarantine plan invalid.';
const STATUS=Object.freeze({
  unchanged:'UNCHANGED_UNVERIFIED',
  changed:'CHANGED_QUARANTINED',
  missing:'NOT_OBSERVED_QUARANTINED',
  added:'NEW_UNVERIFIED_QUARANTINED',
  ambiguous:'AMBIGUOUS_SOURCE_QUARANTINED',
  unlinked:'MISSING_CANONICAL_LINK_QUARANTINED'
});
const TYPES=Object.freeze(['event','outbound-invitation','source-channel']);
const MAX=25000;
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function sig(parts){return JSON.stringify(parts);}
function idEvent(row){
  return row.eventId===null?'thread:'+row.channelId+':'+row.threadId:
    'event:'+row.eventId;
}
function events(snapshot){
  const out=new Map();
  for(const row of snapshot.convoyRecords){
    const id=idEvent(row);
    if(!out.has(id))out.set(id,[]);
    out.get(id).push(row);
  }
  return out;
}
function invitations(snapshot){
  return new Map((snapshot.tracker?.records??[])
    .map(row=>[row.invitationId,[row]]));
}
function channels(snapshot){
  return new Map(snapshot.channelInventory.map(row=>[row.channelId,[row]]));
}
function eventRow(row){
  return sig([row.channelId,row.threadId,row.eventId,
    row.status,row.category,row.departureAtUtc,row.modifiedAtUtc,
    row.sourceKind,row.sourceDigest,[...row.revisionDigests].sort()]);
}
function invitationRow(row){
  return sig([row.invitationId,row.eventId,row.status,
    row.departureAtUtc,row.sourceDigest]);
}
function channelRow(row){
  return sig([row.channelId,row.kind,row.firstCoveredMonth,
    row.lastCoveredMonth,row.claimedThreadCount,row.claimedArchivedCount,
    row.claimedDeletedCount,row.currentThreadsRead,row.archivedThreadsRead,
    row.deletedThreadsReviewed,row.editHistoryReviewed]);
}
function sourceEvidenceFingerprint(snapshot,pagination,secret){
  // Private HMAC binds all pagination status, content digests, cursors and
  // tracker feed coverage flags. Never release the input/raw identifiers.
  const channels=pagination.channels.map(c=>[
    c.channelId,c.channelKind,c.firstCoveredMonth,c.lastCoveredMonth
  ]).sort((a,b)=>a[0].localeCompare(b[0]));
  const streams=pagination.scans.map(row=>[
    row.channelId,row.stream,
    row.pages.map(p=>[p.index,p.requestCursor,p.nextCursor,
      p.hasMore,p.status,p.itemCount,p.responseDigest,p.fetchedAtUtc])
  ]).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
  const t=snapshot.tracker;
  return createHmac('sha256',secret)
    .update(sig(['kings-staged-paginated-source-evidence-v1',
      snapshot.guildId,snapshot.firstMonth,snapshot.finalMonth,
      snapshot.nowMs,channels,streams,
      t===null?['tracker-absent']:[
        t.configured,t.connected,t.claimsComplete]]))
    .digest('hex');
}
function inconsistent(rows){
  if(!rows||rows.length<2)return false;
  return new Set(rows.map(r=>sig([
    r.status,r.category,r.departureAtUtc
  ]))).size>1;
}
function summarize(oldMap,newMap,kind,identityKey,encode,secret,guild,flags){
  const keys=new Set([...oldMap.keys(),...newMap.keys()]);
  if(keys.size>MAX)fail();
  const items=[];
  for(const key of keys){
    const a=oldMap.get(key),b=newMap.get(key);
    const changed=a&&b&&sig(a.map(encode).sort())!==sig(b.map(encode).sort());
    const needsLink=kind==='event'&&
      (key.startsWith('thread:')||a?.some(x=>x.eventId===null)||
      b?.some(x=>x.eventId===null));
    const ambiguous=kind==='event'&&(inconsistent(a)||inconsistent(b));
    const state=ambiguous?STATUS.ambiguous:needsLink?STATUS.unlinked:
      !a?STATUS.added:!b?STATUS.missing:changed?STATUS.changed:STATUS.unchanged;
    const identity='kings-staged-item-v1\0'+guild+'\0'+kind+'\0'+key;
    const issueKey='staged-item:'+createHmac('sha256',secret)
      .update(identity).digest('hex').slice(0,40);
    const snapshotParts=[
      'kings-staged-pair-v1',kind,key,
      ...(a?['old',...a.map(encode).sort()]:['old:none']),
      ...(b?['new',...b.map(encode).sort()]:['new:none'])
    ];
    const privateChangeSeal=createHmac('sha256',secret)
      .update(sig(snapshotParts)).digest('hex');
    items.push(Object.freeze({
      itemKey:issueKey,kind,status:state,
      sourceClaimsPreviouslyObserved:a?.length??0,
      sourceClaimsNowObserved:b?.length??0,
      privateChangeSeal,
      explicitCanonicalLinkRequired:needsLink,
      humanReconciliationRequired:true,
      independentlyAuthenticatedSource:false,
      approvedForImport:false,
      actualBookingApproval:false,
      oldReservationsReleased:0
    }));
  }
  items.sort((a,b)=>a.kind.localeCompare(b.kind)||
    a.itemKey.localeCompare(b.itemKey));
  return items;
}
function createKingsStagedImportQuarantinePlan({
  previous,current,previousPagination,currentPagination,reviewSecret
}={}){
  try{
    if(!plain(previous)||!plain(current)||
      typeof reviewSecret!=='string'||
      Buffer.byteLength(reviewSecret,'utf8')<32||
      Buffer.byteLength(reviewSecret,'utf8')>4096||
      previous.guildId!==current.guildId)fail();
    const review=rehearseKingsStagedSourceHandoff({
      previous,current,previousPagination,currentPagination,reviewSecret
    });
    if(review.safeToActivate!==false||review.freeSlotsCertified!==false||
      review.physicalRecordsDeleted!==0||review.externalWritesPerformed!==0||
      review.originalDiscordProviderAuthenticated!==false)fail();
    const kinds=[
      ['event',events(previous),events(current),eventRow],
      ['outbound-invitation',invitations(previous),
        invitations(current),invitationRow],
      ['source-channel',channels(previous),channels(current),channelRow]
    ];
    const items=kinds.flatMap(([kind,prior,now,encode])=>
      summarize(prior,now,kind,null,encode,
        reviewSecret,previous.guildId,review));
    if(items.length>MAX)fail();
    const count={total:items.length,events:0,invitations:0,channels:0,
      unchangedUnverified:0,changedQuarantined:0,
      notObservedQuarantined:0,newUnverifiedQuarantined:0,
      ambiguousSourceQuarantined:0,unlinkedQuarantined:0};
    const fieldByStatus={
      [STATUS.unchanged]:'unchangedUnverified',
      [STATUS.changed]:'changedQuarantined',
      [STATUS.missing]:'notObservedQuarantined',
      [STATUS.added]:'newUnverifiedQuarantined',
      [STATUS.ambiguous]:'ambiguousSourceQuarantined',
      [STATUS.unlinked]:'unlinkedQuarantined'
    };
    for(const item of items){
      count[item.kind==='event'?'events':
        item.kind==='outbound-invitation'?'invitations':'channels']++;
      count[fieldByStatus[item.status]]++;
    }
    const replaySeal='staged-plan:'+createHmac('sha256',reviewSecret)
      .update(sig(['kings-staged-plan-v1',previous.guildId,
        review.firstMonth,review.finalMonth,
        review.earlierClaimTimestampUtc,review.laterClaimTimestampUtc,
        sourceEvidenceFingerprint(previous,previousPagination,reviewSecret),
        sourceEvidenceFingerprint(current,currentPagination,reviewSecret),
        items.map(x=>[x.kind,x.itemKey,x.status,x.privateChangeSeal])
      ])).digest('hex');
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      firstMonth:review.firstMonth,finalMonth:review.finalMonth,
      earlierClaimTimestampUtc:review.earlierClaimTimestampUtc,
      laterClaimTimestampUtc:review.laterClaimTimestampUtc,
      replaySeal,counts:Object.freeze(count),
      quarantineItems:Object.freeze(items),
      originalReviewItems:review.unresolvedHumanReviewItems,
      originalUrgentReviewItems:review.urgentHumanReviewItems,
      earlierClaimPaginationInternallyComplete:
        review.earlierPagination.sourceClaimScanInternallyComplete,
      laterClaimPaginationInternallyComplete:
        review.laterPagination.sourceClaimScanInternallyComplete,
      previouslyReservedMonthReviewIndicators:
        review.provisionalOldDateReviewMonths.length,
      allItemsRequireAuthenticatedOriginalSourceAndHumanReview:true,
      identicalReplaysAreOnlyDeduplicatedInThisOfflinePlan:true,
      unchangedDoesNotMeanSourceAuthenticated:true,
      outboundAcceptedNotEventCapacityApproval:true,
      sourceRecordsNotObservedDoNotProveDeletion:true,
      oldDepartureDatesNeverAutomaticallyReleased:true,
      original24MonthHistoryIndependentlyVerified:false,
      independentOwnerHighwaterVerified:false,
      stagingReadyForProduction:false,
      importOperationsCommitted:0,
      discordMessagesSent:0,externalWritesPerformed:0,
      realEventApprovalsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={createKingsStagedImportQuarantinePlan};
