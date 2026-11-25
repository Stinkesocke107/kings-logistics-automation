'use strict';
// DRAFT / OFFLINE ONLY. Link PR #147's untrusted outgoing invitation lifecycle
// with PR #143's existing Calendar and Convoy Center source review, without
// creating a second event authority or approving anything.
const {reviewKingsEventInvitationsOffline}
  =require('./event-invitation-tracker-offline');
const {projectKingsConvoySystemBridge,renderKingsConvoySystemBridgePreview}
  =require('./event-capacity-convoy-system-calendar-bridge');
const ERROR='Kings Event Invitation / Calendar offline handoff refused.';
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function exact(x,keys){
  if(!plain(x)||Object.keys(x).sort().join(',')!==keys.slice().sort().join(','))fail();
}
// Existing sourceIntake.tracker is THE one tracker slot in the pre-existing
// multi-source reconciliation contract. Reject, never silently overwrite.
function projectKingsInvitationCalendarOffline({bridgeInput,invitationClaims}={}){
  try{
    if(!plain(bridgeInput)||!plain(bridgeInput.sourceIntake)||
      !plain(invitationClaims))fail();
    exact(invitationClaims,['asOfUtc','invitations','changes']);
    const intake=bridgeInput.sourceIntake;
    if(intake.tracker!==null&&intake.tracker!==undefined)fail();
    if(!Number.isSafeInteger(intake.nowMs)||intake.nowMs<0||
      invitationClaims.asOfUtc!==new Date(intake.nowMs).toISOString())fail();
    // Single authoritative status transition validator, reused directly from
    // System #15. Never independently invent an Accepted state.
    const invitationReview=reviewKingsEventInvitationsOffline(invitationClaims);
    if(invitationReview.safeToActivate!==false||
      invitationReview.trackerConnectedHere!==false||
      invitationReview.discordSourceAuthenticatedHere!==false||
      invitationReview.eventBookingsCreated!==0||
      invitationReview.remindersSent!==0||
      invitationReview.staffApprovalsCommitted!==0)fail();
    const finalStates=new Map();
    for(const change of invitationClaims.changes)
      finalStates.set(change.invitationId,change);
    // Keep raw ids inside this in-memory function. Only its existing scoped
    // private source adapter receives them; return object excludes all rows.
    // configured=true means a synthetic offline REVIEW ADAPTER is supplied,
    // not that an actual Discord invitation source is connected.
    // The pre-existing Convoy/legacy intake is a 24-month HISTORICAL review,
    // with finalMonth <= current month. Future Invitations (e.g. May 2027
    // planned in Nov 2026) must NEVER be injected into that old-history window.
    // Preserve future claims for human Calendar review instead of silently
    // dropping them or coercing their event dates into history.
    const futureLimit=new Date(intake.finalMonth+'-01T00:00:00.000Z');
    if(!Number.isFinite(futureLimit.getTime()))fail();
    futureLimit.setUTCMonth(futureLimit.getUTCMonth()+12);
    const futureLimitMonth=futureLimit.toISOString().slice(0,7);
    const records=[];
    let futureUnreconciled=0;
    for(const row of invitationClaims.invitations){
      const departureMonth=row.departureAtUtc.slice(0,7);
      if(departureMonth<intake.firstMonth||
        departureMonth>futureLimitMonth)fail();
      if(departureMonth>intake.finalMonth){
        futureUnreconciled++;
        continue;
      }
      const last=finalStates.get(row.invitationId);
      records.push({
        invitationId:row.invitationId,eventId:row.eventId,
        status:last?last.status:'Draft',departureAtUtc:row.departureAtUtc,
        sourceDigest:last?last.sourceDigest:row.sourceDigest
      });
    }
    const crossSystem=projectKingsConvoySystemBridge({
      ...bridgeInput,
      sourceIntake:{
        ...intake,
        tracker:{configured:true,connected:false,claimsComplete:false,records}
      }
    });
    if(crossSystem.safeToActivate!==false||
      crossSystem.freeSlotsCertified!==false||
      crossSystem.staffDecisionsCommitted!==0||
      crossSystem.eventInvitationTrackerActuallyConnectedHere!==false||
      crossSystem.outboundInvitationAcceptedNeverAutomaticallyCountsForCapacity!==true||
      crossSystem.sourceReview.outboundTrackerClaimedInvitations!==records.length||
      records.length+futureUnreconciled!==invitationReview.counts.total)fail();
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,offlineOnly:true,
      invitationReview,crossSystem,
      usingOnlyExistingSourceIntakeTrackerContract:true,
      trackerSourceSuppliedButUnauthenticated:true,
      futureInvitationClaimsOutsideHistoricalWindow:futureUnreconciled,
      futureInvitationsRequireVerifiedCenterReview:futureUnreconciled>0,
      invitationsAddedToCapacity:0,
      remindersSent:0,eventBookingsCreated:0,staffApprovalsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsInvitationCalendarOfflinePreview(result){
  try{
    if(!plain(result)||result.version!==1||
      result.visibility!=='PRIVATE_ONLY'||result.readOnly!==true||
      result.offlineOnly!==true||
      result.usingOnlyExistingSourceIntakeTrackerContract!==true||
      result.trackerSourceSuppliedButUnauthenticated!==true||
      !Number.isSafeInteger(result.futureInvitationClaimsOutsideHistoricalWindow)||
      result.futureInvitationClaimsOutsideHistoricalWindow<0||
      result.futureInvitationClaimsOutsideHistoricalWindow>10000||
      result.futureInvitationsRequireVerifiedCenterReview!==
        (result.futureInvitationClaimsOutsideHistoricalWindow>0)||
      result.invitationsAddedToCapacity!==0||result.remindersSent!==0||
      result.eventBookingsCreated!==0||result.staffApprovalsCommitted!==0||
      result.freeSlotsCertified!==false||result.safeToActivate!==false)fail();
    const n=result.invitationReview?.counts;
    if(!plain(n)||Object.values(n).some(v=>!Number.isSafeInteger(v)||
      v<0||v>10000)||n.total!==result.crossSystem?.
      sourceReview?.outboundTrackerClaimedInvitations+
        result.futureInvitationClaimsOutsideHistoricalWindow)fail();
    const base=renderKingsConvoySystemBridgePreview(result.crossSystem);
    const content=base.data.content+
      '\n**Invitation lifecycle (UNVERIFIED source):** '+
      'total '+n.total+' | sent awaiting reply '+n.pendingReplies+
      ' | overdue follow-ups '+n.overdueReplyReview+
      ' | duplicate Event links '+n.duplicateEventLinkClaims+
      ' | future source claims pending manual Center link '+
      result.futureInvitationClaimsOutsideHistoricalWindow+
      '\nNo invitation approval, reminder, booking or capacity change.';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{
      flags:64,allowed_mentions:{parse:[]},
      content,embeds:base.data.embeds
    }});
  }catch{fail();}
}
module.exports={projectKingsInvitationCalendarOffline,
  renderKingsInvitationCalendarOfflinePreview};
