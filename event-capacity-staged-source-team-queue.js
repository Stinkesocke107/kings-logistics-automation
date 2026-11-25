'use strict';
// PRIVATE DRAFT — combines staged old/new source handoff and existing Kings
// Event Team 24-month source view, never a writable migration or a live feed.
const {rehearseKingsStagedSourceHandoff}
  =require('./event-capacity-staged-source-handoff-review');
const {projectKingsUnifiedEvidenceCoverage}
  =require('./event-capacity-unified-evidence-coverage');
const ERROR='Kings Event Team staged source queue unavailable.';
function fail(){throw new Error(ERROR);}
function num(v){
  if(!Number.isSafeInteger(v)||v<0||v>10000)fail();
  return v;
}
function projectKingsStagedSourceTeamQueue({
  handoffInput,calendarInput
}={}){
  try{
    if(!handoffInput||typeof handoffInput!=='object'||
      !calendarInput||typeof calendarInput!=='object'||
      !calendarInput.eventTeamInput||
      !calendarInput.paginationInput||
      calendarInput.eventTeamInput.sourceIntake!==handoffInput.current||
      calendarInput.paginationInput!==handoffInput.currentPagination)fail();
    const staged=rehearseKingsStagedSourceHandoff(handoffInput);
    const workboard=projectKingsUnifiedEvidenceCoverage(calendarInput);
    if(staged.safeToActivate!==false||staged.freeSlotsCertified!==false||
      workboard.safeToActivate!==false||workboard.freeSlotsCertified!==false||
      staged.firstMonth!==workboard.firstHistoryMonth||
      staged.finalMonth!==workboard.lastHistoryMonth||
      staged.laterClaimTimestampUtc!==
        new Date(calendarInput.eventTeamInput.sourceIntake.nowMs).toISOString())
      fail();
    const c=staged.counts,types=[
      ['Previously observed Events missing in later source',c.missingPreviouslySeenEventClaims],
      ['Earlier source threads absent later',c.previouslySeenSourceThreadMissing],
      ['Historical channel lost or renamed',c.sourceChannelMissing+
        c.sourceChannelCoverageChanged],
      ['Cancellations needing decision review',c.cancellationClaimTransitions],
      ['Reschedules / old departure review',c.rescheduleClaimTransitions+
        c.changedDateClaims],
      ['Original message / edit evidence changed',c.sourceDigestChanges+
        c.missingEditRevisionProofClaims],
      ['Tracker invitations not observed',c.outboundInvitationNotObserved],
      ['Outbound invitation dates / links changed',c.outboundInvitationDateChanged+
        c.outboundInvitationEventLinkChanged],
      ['Original 24-month source claim gaps',
        workboard.counters.historyMonthsWithIncompleteScanClaims+
        workboard.counters.historyMonthsWithoutSourceClaims]
    ];
    const queue=types.map(([label,count])=>Object.freeze({
      label,observedClaimIndicators:num(count),
      requireHumanReview:count>0,
      verifiedProductionIssue:false
    }));
    const counts={
      unchangedEventClaims:num(c.unchangedEventClaims),
      newEventClaims:num(c.newEventClaims),
      changedEventClaims:num(c.changedEventClaims),
      missingEventClaims:num(c.missingPreviouslySeenEventClaims),
      potentiallyAffectedHistoricalMonths:num(c.historicDateMonthReviewIndicators),
      sourceReviewItems:num(staged.unresolvedHumanReviewItems),
      urgentReviewItems:num(staged.urgentHumanReviewItems),
      scanMissingStreams:num(staged.laterPagination.claimedStreamsMissing),
      realDiscordSourceVerified:0
    };
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,version:1,
      firstHistoryMonth:workboard.firstHistoryMonth,
      lastHistoryMonth:workboard.lastHistoryMonth,
      selectedEventTeamYear:workboard.eventTeamYear,
      counts:Object.freeze(counts),
      reviewCategories:Object.freeze(queue),
      previousDateReviewMonths:staged.provisionalOldDateReviewMonths,
      sourceInventoryClaimsAgree:workboard.sourceInventoryClaimsAgree,
      currentPaginationClaimInternallyComplete:
        staged.laterPagination.sourceClaimScanInternallyComplete,
      timelineNotProofOfActualSignedDecisions:true,
      neverTreatMissingEventsAsDeleted:true,
      eventSourceClaimsAreNotConfirmedBookings:true,
      cannotReconcileOrReleaseOldHoldsAutomatically:true,
      previousOwnerHighwaterIndependentlyVerified:false,
      originalDiscord24MonthsIndependentlyCertified:false,
      actualEventChangesApplied:0,
      externalNetworkOrDiscordCallsMade:0,
      staffDecisionsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsStagedSourceTeamQueuePreview(report){
  try{
    if(!report||report.visibility!=='PRIVATE_ONLY'||report.readOnly!==true||
      report.safeToActivate!==false||report.freeSlotsCertified!==false||
      report.actualEventChangesApplied!==0||
      report.externalNetworkOrDiscordCallsMade!==0||
      report.staffDecisionsCommitted!==0||
      !report.counts||!Array.isArray(report.reviewCategories)||
      report.reviewCategories.length!==9||!Array.isArray(report.previousDateReviewMonths))fail();
    const c=report.counts;
    for(const field of ['newEventClaims','changedEventClaims',
      'missingEventClaims','urgentReviewItems',
      'sourceReviewItems'])num(c[field]);
    let content='**Kings Event Team — Safe Source Handoff Preview (OFFLINE)**\n'+
      'New: '+c.newEventClaims+' | Changed: '+c.changedEventClaims+
      ' | Not observed: '+c.missingEventClaims+'\n'+
      'Human review issues: '+c.sourceReviewItems+
      ' | Urgent: '+c.urgentReviewItems+'\n';
    for(const item of report.reviewCategories){
      if(!item||typeof item.label!=='string'||
        !/^[A-Za-z0-9 /()—-]{8,80}$/.test(item.label)||
        item.verifiedProductionIssue!==false||
        typeof item.requireHumanReview!=='boolean'||
        item.requireHumanReview!==(item.observedClaimIndicators>0))
        fail();
      content+=item.label+': '+num(item.observedClaimIndicators)+'\n';
    }
    content+='**A missing record is NOT a deletion. Old dates are not released.**\n'+
      '**Original Discord 24-month source and live authorization not verified.**';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{
      flags:64,allowed_mentions:{parse:[]},
      content,embeds:[]}});
  }catch{fail();}
}
module.exports={projectKingsStagedSourceTeamQueue,
  renderKingsStagedSourceTeamQueuePreview};
