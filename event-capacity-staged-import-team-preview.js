'use strict';
// DRAFT/OFFLINE — staff-facing counts only. No actual queue installation,
// Discord runtime, archived original data or booking approval.
const {createKingsStagedImportQuarantinePlan}
  =require('./event-capacity-staged-import-quarantine-plan');
const {projectKingsStagedSourceTeamQueue}
  =require('./event-capacity-staged-source-team-queue');
const ERROR='Kings Event Team import preview refused.';
function fail(){throw new Error(ERROR);}
function num(x){if(!Number.isSafeInteger(x)||x<0||x>25000)fail();return x;}
function projectKingsImportStaffPreview({handoffInput,calendarInput}={}){
  try{
    const plan=createKingsStagedImportQuarantinePlan(handoffInput);
    const team=projectKingsStagedSourceTeamQueue({handoffInput,calendarInput});
    if(plan.safeToActivate!==false||team.safeToActivate!==false||
      plan.stagingReadyForProduction!==false||
      plan.freeSlotsCertified!==false||team.freeSlotsCertified!==false||
      plan.firstMonth!==team.firstHistoryMonth||
      plan.finalMonth!==team.lastHistoryMonth||
      plan.original24MonthHistoryIndependentlyVerified!==false||
      team.originalDiscord24MonthsIndependentlyCertified!==false)
      fail();
    const c=plan.counts;
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      firstMonth:plan.firstMonth,finalMonth:plan.finalMonth,
      staffReviewStatus:'ALL STAGED ITEMS QUARANTINED — NO LIVE IMPORT',
      counts:Object.freeze({
        proposedUntrustedRecords:num(c.total),
        claimedEventIdentities:num(c.events),
        outgoingInvitationIdentities:num(c.invitations),
        historicalChannelIdentities:num(c.channels),
        unchangedNotAuthenticated:num(c.unchangedUnverified),
        changedNeedsHumanReview:num(c.changedQuarantined),
        noLongerObservedNeedsReview:num(c.notObservedQuarantined),
        newUnverifiedNeedsReview:num(c.newUnverifiedQuarantined),
        ambiguousNeedsHumanReview:num(c.ambiguousSourceQuarantined),
        withoutCanonicalEventLink:num(c.unlinkedQuarantined),
        originalReviewItems:num(team.counts.sourceReviewItems),
        urgentReviewItems:num(team.counts.urgentReviewItems),
        historicalMonthIndicators:num(team.counts.potentiallyAffectedHistoricalMonths)
      }),
      replaySeal:plan.replaySeal,
      liveDiscordProviderVerified:false,
      original24MonthsAndOwnerFloorVerified:false,
      noAutoEventDeletion:true,noAutoCapacityRelease:true,
      realEventRecordsImported:0,realStaffDecisionsMade:0,
      noProductionMergeOrRuntimeActivation:true,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsImportStaffPreview(view){
  try{
    if(!view||view.visibility!=='PRIVATE_ONLY'||view.readOnly!==true||
      view.freeSlotsCertified!==false||view.safeToActivate!==false||
      view.realEventRecordsImported!==0||view.realStaffDecisionsMade!==0||
      view.liveDiscordProviderVerified!==false||
      view.original24MonthsAndOwnerFloorVerified!==false||
      !view.counts)fail();
    const c=view.counts;
    for(const field of ['proposedUntrustedRecords','claimedEventIdentities',
      'outgoingInvitationIdentities','unchangedNotAuthenticated',
      'changedNeedsHumanReview','noLongerObservedNeedsReview',
      'newUnverifiedNeedsReview','urgentReviewItems'])num(c[field]);
    const message='**Kings Event-Team | Safe Import Preview (OFFLINE)**\n'+
      'Event claims: '+c.claimedEventIdentities+
      ' | Outgoing invitations: '+c.outgoingInvitationIdentities+'\n'+
      'Unchanged (still unverified): '+c.unchangedNotAuthenticated+'\n'+
      'Changed: '+c.changedNeedsHumanReview+
      ' | Missing in later scan: '+c.noLongerObservedNeedsReview+
      ' | New: '+c.newUnverifiedNeedsReview+'\n'+
      'Urgent human review: '+c.urgentReviewItems+'\n'+
      '**ALL records quarantined. No actual import, approval or free slots.**';
    if(message.length>2000)fail();
    return Object.freeze({type:4,data:{
      flags:64,allowed_mentions:{parse:[]},content:message,embeds:[]
    }});
  }catch{fail();}
}
module.exports={projectKingsImportStaffPreview,
  renderKingsImportStaffPreview};
