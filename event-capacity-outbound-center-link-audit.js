'use strict';
// DRAFT/OFFLINE/PRIVATE. Reconcile UNTRUSTED outbound invitation records
// against Convoy Center + older-channel claims by explicit canonical eventId.
// A tracker Accepted is NOT a Kings Event Capacity staff acceptance;
// multiple invitations for one convoy may be legitimate different recipients.
// No live Discord, provider authentication, token issuance, archive writes or
// automatic booking decisions.
const crypto=require('node:crypto');
const {reconcileKingsMultiSourceConvoys}
  =require('./event-capacity-convoy-multi-source-intake');
const ERROR='Kings Event Capacity outbound-center link audit refused.';
const ACCEPTING=new Set(['Scheduled','Rescheduled','Completed']);
const CANCELLED=new Set(['Cancelled','Unknown']);
const NOT_READY=new Set(['Submitted','Needs Information','Ready for Approval']);
const MAX=10000;
function fail(){throw new Error(ERROR);}
function opaque(secret,guild,reason,key){
  return 'capacity-outbound:'+crypto.createHmac('sha256',secret)
    .update(['kings-outbound-link-review-v1',guild,reason,key].join('\0'))
    .digest('hex').slice(0,40);
}
function inspectKingsOutboundCenterLinks(sourceIntake){
  try{
    const verified=reconcileKingsMultiSourceConvoys(sourceIntake);
    if(verified.visibility!=='PRIVATE_ONLY'||verified.readOnly!==true||
      verified.safeToActivate!==false||verified.freeSlotsCertified!==false)fail();
    const tracker=sourceIntake.tracker,groups=new Map();
    const errors=new Map(),counters={
      outboundInvitationClaims:0,linkedByCanonicalEventId:0,
      linkedToCurrentCenter:0,linkedToLegacyOnly:0,
      missingCenterEventLink:0,noCanonicalEventLink:0,
      departureDiffersFromAllSources:0,
      departureMatchesOldSourceOnly:0,
      outboundAcceptedWhileCenterNotApproved:0,
      outboundAcceptedWhileCenterCancelledOrUnknown:0,
      outboundLifecycleNeedsReview:0,
      multipleOutboundInvitationGroups:0,
      outboundAcceptanceClaimsNotUsedForCapacity:0
    };
    function issue(reason,ref,priority='Review'){
      const id=opaque(sourceIntake.reviewSecret,sourceIntake.guildId,reason,ref);
      if(!errors.has(id))errors.set(id,Object.freeze({
        reviewKey:id,reason,priority,
        staffReviewRequired:true,autoResolved:false,
        changedCapacity:false,acceptedEvent:false
      }));
      if(errors.size>MAX)fail();
    }
    const center=new Map();
    for(const r of sourceIntake.convoyRecords){
      if(r.eventId===null)continue;
      const key=r.eventId;
      if(!center.has(key))center.set(key,[]);
      const channel=sourceIntake.channelInventory.find(c=>c.channelId===r.channelId);
      if(!channel)fail(); // Base validator should have rejected this already.
      center.get(key).push({
        sourceKind:channel.kind,
        status:r.status,
        departure:r.departureAtUtc
      });
    }
    if(tracker===null){
      issue('outbound-tracker-not-supplied','tracker');
    }else if(!tracker.configured||!tracker.connected||!tracker.claimsComplete){
      issue('outbound-tracker-coverage-not-provider-verified','tracker');
    }
    // Even caller-supplied "connected" / "complete" is not provider proof.
    issue('outbound-tracker-provider-attestation-required','provider');
    if(tracker!==null)for(const item of tracker.records){
      counters.outboundInvitationClaims++;
      if(item.status==='Accepted')
        counters.outboundAcceptanceClaimsNotUsedForCapacity++;
      if(item.eventId===null){
        counters.noCanonicalEventLink++;
        issue('outbound-invitation-needs-explicit-event-link',item.invitationId);
        continue;
      }
      const records=center.get(item.eventId);
      if(!records){
        counters.missingCenterEventLink++;
        issue('outbound-invitation-has-no-matching-center-event',item.invitationId);
        continue;
      }
      counters.linkedByCanonicalEventId++;
      const current=records.filter(r=>r.sourceKind==='current');
      if(current.length===0){
        counters.linkedToLegacyOnly++;
        issue('outbound-invitation-matches-legacy-only',item.invitationId);
      }else counters.linkedToCurrentCenter++;
      const dateMatches=records.some(r=>r.departure===item.departureAtUtc);
      const currentDateMatches=current.some(r=>r.departure===item.departureAtUtc);
      if(!dateMatches){
        counters.departureDiffersFromAllSources++;
        issue('outbound-invitation-date-differs-from-center',item.invitationId,'Urgent');
      }else if(current.length>0&&!currentDateMatches){
        counters.departureMatchesOldSourceOnly++;
        issue('outbound-invitation-may-use-pre-reschedule-date',
          item.invitationId,'Urgent');
      }
      if(item.status==='Accepted'){
        // Use current Convoy Center first, never a legacy status to infer
        // the present decision. "Scheduled" itself is an untrusted claim.
        const live=current.length>0?current:records;
        if(live.some(r=>CANCELLED.has(r.status))){
          counters.outboundAcceptedWhileCenterCancelledOrUnknown++;
          issue('outbound-accepted-center-cancelled-or-unknown',
            item.invitationId,'Urgent');
        }else if(live.every(r=>NOT_READY.has(r.status))){
          counters.outboundAcceptedWhileCenterNotApproved++;
          issue('outbound-accepted-center-not-yet-approved',
            item.invitationId,'Urgent');
        }else if(!live.some(r=>ACCEPTING.has(r.status))){
          counters.outboundLifecycleNeedsReview++;
          issue('outbound-center-acceptance-status-ambiguous',
            item.invitationId);
        }
      }else if(['Declined','Withdrawn'].includes(item.status)&&
        current.some(r=>ACCEPTING.has(r.status))){
        // This is not automatically a contradiction: the outbound invite
        // might be for one participant; it still needs human review.
        counters.outboundLifecycleNeedsReview++;
        issue('outbound-invitation-declined-center-event-still-listed',
          item.invitationId);
      }
      const group=groups.get(item.eventId)??0;
      groups.set(item.eventId,group+1);
    }
    for(const [eventId,n] of groups){
      if(n>1){
        counters.multipleOutboundInvitationGroups++;
        issue('multiple-outbound-invitations-verify-recipients',eventId);
      }
    }
    if(counters.outboundInvitationClaims>MAX||
      counters.linkedByCanonicalEventId>MAX)fail();
    const reviewItems=[...errors.values()].sort((a,b)=>
      (a.priority==='Urgent'?-1:0)-(b.priority==='Urgent'?-1:0)||
      a.reason.localeCompare(b.reason)||a.reviewKey.localeCompare(b.reviewKey));
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      sourceWindow:Object.freeze({...verified.window}),
      counts:Object.freeze(counters),
      reviewItems:Object.freeze(reviewItems),
      unresolvedReviewItems:reviewItems.length,
      urgentReviewItems:reviewItems.filter(x=>x.priority==='Urgent').length,
      eventIdentityMatchedOnlyByCanonicalId:true,
      trackerAcceptanceNeverCertifiesKingsStaffApproval:true,
      multipleOutboundInvitationsNotAssumedDuplicateEvents:true,
      pastRescheduleDatesNeverAutoReleased:true,
      rawInvitationIdentifiersReturned:false,
      currentConvoyCenterProviderReadHere:false,
      outboundTrackerProviderReadHere:false,
      original24MonthHistoryIndependentlyComplete:false,
      actualEffectiveStaffPermissionsProven:false,
      eventCapacityBookingsAdded:0,
      externalWritesPerformed:0,
      staffDecisionsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={inspectKingsOutboundCenterLinks};
