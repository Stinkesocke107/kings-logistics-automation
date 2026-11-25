'use strict';
// KINGS CAPACITY — PRIVATE/OFFLINE/DRAFT.
// Two caller-supplied Convoy Center/legacy/Tracker snapshots are compared
// without writing, deleting, releasing, approving, or migrating any Event.
// A vanished record is "not observed in newer claims", NEVER "deleted".
// Original archived/deleted Discord history, Staff approval, independent
// highwater and source completeness still require external authentication.
const {createHmac}=require('node:crypto');
const {reconcileKingsMultiSourceConvoys}
  =require('./event-capacity-convoy-multi-source-intake');
const {inspectKingsSourceChannelEvidenceClaims}
  =require('./event-capacity-cross-channel-evidence-assurance');
const {auditKingsDiscordHistoryPagination}
  =require('./event-capacity-discord-history-pagination-audit');
const ERROR='Kings Event Capacity staged source handoff refused.';
const ACCEPTED=new Set(['Scheduled','Completed','Rescheduled']);
function fail(){throw new Error(ERROR);}
function shape(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function bounded(n,max=10000){
  if(!Number.isSafeInteger(n)||n<0||n>max)fail();
  return n;
}
function keyed(secret,guild,reason,identity){
  return 'source-handoff:'+createHmac('sha256',secret)
    .update(['kings-capacity-staged-source-diff-v1',guild,reason,identity].join('\0'))
    .digest('hex').slice(0,40);
}
function identity(r){
  return r.eventId===null?'thread:'+r.channelId+':'+r.threadId:'event:'+r.eventId;
}
function threadIdentity(r){return r.channelId+':'+r.threadId;}
function groups(rows){
  const out=new Map();
  for(const item of rows){
    const id=identity(item);
    if(!out.has(id))out.set(id,[]);
    out.get(id).push(item);
  }
  return out;
}
function stateSet(rows){
  return new Set(rows.map(x=>JSON.stringify([
    x.status,x.category,x.departureAtUtc
  ])));
}
function dateClaims(rows){
  return [...new Set(rows.map(x=>x.departureAtUtc))].sort();
}
function kindClaims(rows){
  return [...new Set(rows.map(x=>x.sourceKind))].sort();
}
function compareStrings(a,b){
  return JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
}
function checkPaginationForSnapshot(source,pagination){
  if(!shape(pagination)||source.guildId!==pagination.guildId||
    source.firstMonth!==pagination.firstMonth||
    source.finalMonth!==pagination.finalMonth||
    source.nowMs!==pagination.nowMs)fail();
  const checked=auditKingsDiscordHistoryPagination(pagination);
  if(checked.readOnly!==true||checked.safeToActivate!==false||
    checked.freeSlotsCertified!==false||
    checked.providerPaginationAuthenticityVerified!==false)fail();
  const src=new Map(source.channelInventory.map(x=>[x.channelId,x]));
  const pag=new Map(pagination.channels.map(x=>[x.channelId,x]));
  let absent=0,additional=0,disputed=0;
  for(const [id,row] of src){
    const p=pag.get(id);
    if(!p){absent++;continue;}
    if(row.firstCoveredMonth!==p.firstCoveredMonth||
      row.lastCoveredMonth!==p.lastCoveredMonth||
      (row.kind==='current')!==(p.channelKind==='current-forum'))
      disputed++;
  }
  for(const id of pag.keys())if(!src.has(id))additional++;
  return Object.freeze({
    totalSourceClaims:src.size,claimedPaginationChannels:pag.size,
    claimedStreamsMissing:checked.streamsMissingScanClaims,
    claimedStreamsUnfinished:checked.unfinishedPageStreams,
    brokenCursorChains:checked.brokenCursorChains,
    sourcePageErrors:checked.failedPageRequests,
    channelsAbsentFromPagination:absent,
    channelsAbsentFromSource:additional,
    channelsWithContradictoryMonthCoverage:disputed,
    sourceClaimScanInternallyComplete:
      checked.untrustedPaginationClaimsInternallyComplete&&
      absent===0&&additional===0&&disputed===0,
    discordProviderAuthenticated:false
  });
}
function rehearseKingsStagedSourceHandoff({
  previous,current,previousPagination,currentPagination,reviewSecret
}={}){
  try{
    if(!shape(previous)||!shape(current)||
      typeof reviewSecret!=='string'||
      Buffer.byteLength(reviewSecret,'utf8')<32||
      Buffer.byteLength(reviewSecret,'utf8')>4096||
      previous.guildId!==current.guildId||
      previous.currentChannelId!==current.currentChannelId||
      previous.firstMonth!==current.firstMonth||
      previous.finalMonth!==current.finalMonth||
      !Number.isSafeInteger(previous.nowMs)||
      !Number.isSafeInteger(current.nowMs)||
      current.nowMs<previous.nowMs)fail();
    const oldReview=reconcileKingsMultiSourceConvoys(previous),
      newReview=reconcileKingsMultiSourceConvoys(current);
    const oldChannel=inspectKingsSourceChannelEvidenceClaims(previous),
      newChannel=inspectKingsSourceChannelEvidenceClaims(current);
    if(oldReview.safeToActivate!==false||newReview.safeToActivate!==false||
      oldChannel.safeToActivate!==false||newChannel.safeToActivate!==false)
      fail();
    const oldPages=checkPaginationForSnapshot(previous,previousPagination),
      newPages=checkPaginationForSnapshot(current,currentPagination);
    const items=new Map(),c={
      priorOriginalClaims:previous.convoyRecords.length,
      newOriginalClaims:current.convoyRecords.length,
      previousDistinctIdentities:0,newDistinctIdentities:0,
      unchangedEventClaims:0,newEventClaims:0,
      missingPreviouslySeenEventClaims:0,changedEventClaims:0,
      changedStatusClaims:0,changedDateClaims:0,changedCategoryClaims:0,
      sourceDigestChanges:0,missingEditRevisionProofClaims:0,
      cancellationClaimTransitions:0,rescheduleClaimTransitions:0,
      completionClaimTransitions:0,ambiguousMultiSourceEventClaims:0,
      previouslySeenSourceThreadMissing:0,
      previouslySeenSourceThreadIdentityChanged:0,
      newSourceThreadsForKnownEvent:0,
      missingSourceThreadsWithinKnownEvent:0,
      archivedOrDeletedSourceTransitions:0,
      sourceChannelMissing:0,sourceChannelAdded:0,
      sourceChannelCoverageChanged:0,
      outboundInvitationAdded:0,outboundInvitationNotObserved:0,
      outboundInvitationStatusChanged:0,outboundInvitationDateChanged:0,
      outboundInvitationEventLinkChanged:0,
      historicDateMonthReviewIndicators:0
    };
    function issue(reason,id,priority='Review'){
      const key=keyed(reviewSecret,previous.guildId,reason,id);
      if(!items.has(key))items.set(key,Object.freeze({
        reviewKey:key,reason,priority,requiresHumanReconciliation:true,
        isActualDeletionProof:false,approvedBooking:false,
        automaticallyReleasedPreviousDate:false
      }));
      if(items.size>10000)fail();
    }
    const prevGroups=groups(previous.convoyRecords),
      nextGroups=groups(current.convoyRecords);
    c.previousDistinctIdentities=prevGroups.size;
    c.newDistinctIdentities=nextGroups.size;
    const historicMonths=new Map();
    for(const [id,pRows] of prevGroups){
      const nRows=nextGroups.get(id);
      if(pRows.some(x=>ACCEPTED.has(x.status))){
        // A previously accepted-like *claim* is retained as a provisional
        // review indicator even after cancellation or reschedule.
        for(const iso of dateClaims(pRows)){
          const m=iso.slice(0,7);
          if(!historicMonths.has(m))historicMonths.set(m,new Set());
          historicMonths.get(m).add(id);
        }
      }
      if(!nRows){
        c.missingPreviouslySeenEventClaims++;
        issue('previous-event-not-observed-in-later-source',id,'Urgent');
        continue;
      }
      const stateOld=stateSet(pRows),stateNew=stateSet(nRows);
      if(stateOld.size>1||stateNew.size>1){
        c.ambiguousMultiSourceEventClaims++;
        issue('same-event-multiple-conflicting-source-states',id,'Urgent');
      }
      const priorDates=dateClaims(pRows),newDates=dateClaims(nRows);
      const oldStatus=new Set(pRows.map(x=>x.status)),
        newStatus=new Set(nRows.map(x=>x.status));
      const oldCategory=new Set(pRows.map(x=>x.category)),
        newCategory=new Set(nRows.map(x=>x.category));
      let changed=false;
      if(!compareStrings(oldStatus,newStatus)){
        c.changedStatusClaims++;changed=true;
        issue('event-status-claim-changed',id,'Urgent');
        if(newStatus.has('Cancelled')){
          c.cancellationClaimTransitions++;
          issue('cancellation-needs-signed-staff-decision',id,'Urgent');
        }
        if(newStatus.has('Completed')){
          c.completionClaimTransitions++;
          issue('completion-needs-signed-staff-evidence',id);
        }
        if(newStatus.has('Rescheduled')){
          c.rescheduleClaimTransitions++;
          issue('reschedule-needs-old-date-hold-review',id,'Urgent');
        }
      }
      if(!compareStrings(priorDates,newDates)){
        c.changedDateClaims++;changed=true;
        issue('departure-date-claim-changed-previous-date-retained',id,'Urgent');
      }
      if(!compareStrings(oldCategory,newCategory)){
        c.changedCategoryClaims++;changed=true;
        issue('event-category-claim-changed',id,'Urgent');
      }
      const priorRefs=new Map(pRows.map(r=>[threadIdentity(r),r]));
      const nextRefs=new Map(nRows.map(r=>[threadIdentity(r),r]));
      for(const [ref,r] of priorRefs){
        const n=nextRefs.get(ref);
        if(!n){
          c.missingSourceThreadsWithinKnownEvent++;changed=true;
          issue('previous-event-source-thread-not-observed',ref,'Urgent');
          continue;
        }
        if(r.sourceKind!==n.sourceKind){
          c.archivedOrDeletedSourceTransitions++;
          changed=true;
          issue('event-source-state-claim-changed',ref);
        }
        if(r.sourceDigest!==n.sourceDigest){
          c.sourceDigestChanges++;changed=true;
          issue('original-source-message-digest-changed',ref);
          const older=new Set(r.revisionDigests);
          const newer=new Set(n.revisionDigests);
          if(newer.size===0||![...newer].some(x=>!older.has(x))){
            c.missingEditRevisionProofClaims++;
            issue('message-changed-without-new-revision-proof',ref,'Urgent');
          }
        }
        if(r.revisionDigests.some(x=>!n.revisionDigests.includes(x))){
          c.missingEditRevisionProofClaims++;
          changed=true;
          issue('previous-edit-revision-evidence-not-retained',ref,'Urgent');
        }
      }
      for(const ref of nextRefs.keys())if(!priorRefs.has(ref)){
        c.newSourceThreadsForKnownEvent++;changed=true;
        issue('new-source-thread-for-previously-observed-event',ref);
      }
      if(changed)c.changedEventClaims++;
      else c.unchangedEventClaims++;
    }
    for(const id of nextGroups.keys())if(!prevGroups.has(id)){
      c.newEventClaims++;
      issue('new-source-event-requires-staff-review',id);
    }
    const oldThreads=new Map(previous.convoyRecords.map(
      r=>[threadIdentity(r),r]));
    const newThreads=new Map(current.convoyRecords.map(
      r=>[threadIdentity(r),r]));
    for(const [ref,prior] of oldThreads){
      const next=newThreads.get(ref);
      if(!next){
        c.previouslySeenSourceThreadMissing++;
        issue('previous-original-thread-not-observed',ref,'Urgent');
      }else if(prior.eventId!==next.eventId){
        c.previouslySeenSourceThreadIdentityChanged++;
        issue('same-thread-canonical-event-identity-changed',ref,'Urgent');
      }
    }
    const oldChannels=new Map(previous.channelInventory.map(x=>[x.channelId,x]));
    const newChannels=new Map(current.channelInventory.map(x=>[x.channelId,x]));
    for(const [id,p] of oldChannels){
      const n=newChannels.get(id);
      if(!n){
        c.sourceChannelMissing++;
        issue('previous-channel-not-in-later-inventory',id,'Urgent');
      }else if(p.kind!==n.kind||p.firstCoveredMonth!==n.firstCoveredMonth||
        p.lastCoveredMonth!==n.lastCoveredMonth){
        c.sourceChannelCoverageChanged++;
        issue('source-channel-coverage-or-kind-changed',id,'Urgent');
      }
    }
    for(const id of newChannels.keys())if(!oldChannels.has(id)){
      c.sourceChannelAdded++;
      issue('new-old-source-channel-not-independently-proven',id);
    }
    const oldInv=new Map((previous.tracker?.records??[])
      .map(x=>[x.invitationId,x]));
    const newInv=new Map((current.tracker?.records??[])
      .map(x=>[x.invitationId,x]));
    for(const [id,p] of oldInv){
      const n=newInv.get(id);
      if(!n){
        c.outboundInvitationNotObserved++;
        issue('previous-outbound-invitation-not-observed',id);
        continue;
      }
      if(p.status!==n.status){
        c.outboundInvitationStatusChanged++;
        issue('outbound-invitation-status-claim-changed',id);
      }
      if(p.departureAtUtc!==n.departureAtUtc){
        c.outboundInvitationDateChanged++;
        issue('outbound-invitation-date-claim-changed',id,'Urgent');
      }
      if(p.eventId!==n.eventId){
        c.outboundInvitationEventLinkChanged++;
        issue('outbound-invitation-event-link-changed',id,'Urgent');
      }
    }
    for(const id of newInv.keys())if(!oldInv.has(id)){
      c.outboundInvitationAdded++;
      issue('new-outbound-invitation-needs-review',id);
    }
    const byMonth=[...historicMonths].sort(([a],[b])=>a.localeCompare(b))
      .map(([month,ids])=>Object.freeze({
        month,provisionalPreviouslyObservedEventClaims:ids.size,
        originalSignedHistoricalHoldProof:false,
        canAutomaticallyRelease:false
      }));
    c.historicDateMonthReviewIndicators=byMonth.length;
    // Neither a source count nor a self-claimed complete page scan authorizes
    // actual data removal or capacity acceptance; even identical snapshots
    // lack independent Discord and prior-owner highwater authentication.
    issue('independent-provider-and-owner-highwater-not-verified','provenance');
    if(!newPages.sourceClaimScanInternallyComplete)
      issue('new-source-pagination-or-inventory-incomplete','pagination','Urgent');
    if(!oldPages.sourceClaimScanInternallyComplete)
      issue('previous-source-pagination-or-inventory-incomplete','pagination');
    if(!oldChannel.untrustedInventoryInternallyConsistent||
      !newChannel.untrustedInventoryInternallyConsistent)
      issue('source-channel-inventory-counters-contradict-records',
        'counts','Urgent');
    const reviewItems=[...items.values()].sort((a,b)=>
      (a.priority==='Urgent'?-1:0)-(b.priority==='Urgent'?-1:0)||
      a.reason.localeCompare(b.reason)||a.reviewKey.localeCompare(b.reviewKey));
    for(const value of Object.values(c))bounded(value);
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      firstMonth:previous.firstMonth,finalMonth:previous.finalMonth,
      earlierClaimTimestampUtc:new Date(previous.nowMs).toISOString(),
      laterClaimTimestampUtc:new Date(current.nowMs).toISOString(),
      counts:Object.freeze(c),
      earlierPagination:Object.freeze(oldPages),
      laterPagination:Object.freeze(newPages),
      provisionalOldDateReviewMonths:Object.freeze(byMonth),
      reviewItems:Object.freeze(reviewItems),
      unresolvedHumanReviewItems:reviewItems.length,
      urgentHumanReviewItems:reviewItems.filter(x=>x.priority==='Urgent').length,
      unchangedSourceClaimsAlsoRequireIndependentOriginProof:true,
      missingFromLaterSourceNeverMeansDeleted:true,
      reschedulesDoNotReleasePreviouslyClaimedDates:true,
      cancellationsDoNotProveActualSignedDecision:true,
      outboundAcceptedDoesNotAuthorizeKingsCapacity:true,
      sourceClaimsCanOverlapAcrossCurrentLegacyAndTracker:true,
      originalDiscordProviderAuthenticated:false,
      original24MonthSourceHistoryIndependentlyComplete:false,
      independentSignedOwnerHighwaterVerified:false,
      snapshotOrEventsCommitted:0,
      physicalRecordsDeleted:0,
      externalWritesPerformed:0,
      staffDecisionsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={rehearseKingsStagedSourceHandoff};
