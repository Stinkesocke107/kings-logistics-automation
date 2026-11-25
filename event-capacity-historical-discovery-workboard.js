'use strict';
// DRAFT/PRIVATE: crosscheck scanned-page CLAIMS against the existing 24-month
// human historical readiness checklist. Two matching caller assertions never
// become provider verification or capacity availability.
const {auditKingsDiscordHistoryPagination}
  =require('./event-capacity-discord-history-pagination-audit');
const {auditKings24MonthHistoricalReadiness}
  =require('./event-capacity-historical-24month-readiness');
const ERROR='Kings Event Capacity historical discovery workboard invalid.';
function fail(){throw new Error(ERROR);}
function auditKingsHistoricalDiscoveryWorkboard({
  paginationInput,monthlyClaims=[]
}={}){
  try{
    if(!paginationInput||typeof paginationInput!=='object'||
      Array.isArray(paginationInput))fail();
    const pages=auditKingsDiscordHistoryPagination(paginationInput);
    const monthly=auditKings24MonthHistoricalReadiness({
      firstMonth:pages.firstMonth,monthlyClaims,
      asOfMs:paginationInput.nowMs
    });
    if(pages.firstMonth!==monthly.firstMonth||
      pages.finalMonth!==monthly.finalMonth||
      pages.monthRows.length!==24||monthly.rows.length!==24||
      pages.safeToActivate!==false||monthly.safeToActivate!==false||
      pages.freeSlotsCertified!==false||monthly.freeSlotsCertified!==false)
      fail();
    const counts={
      monthsWithoutChannelClaims:0,
      monthsWithIncompleteScanClaims:0,
      monthsWithoutHumanChecklist:0,
      monthsWithOpenHumanChecklist:0,
      monthsWithClaimedAllChecksButMissingSource:0,
      monthsClaimedReadyOnlyOnUntrustedEvidence:0,
      independentlyProviderVerifiedMonths:0
    };
    const rows=pages.monthRows.map((m,i)=>{
      const r=monthly.rows[i];
      if(m.month!==r.month||
        m.availableSlotsCertified!==false||
        r.availableSlotsCertified!==false)fail();
      const hasSource=m.claimedChannelSources>0,
        paginationComplete=m.claimedRequiredStreamsIncomplete===0,
        checklist=Boolean(r.claimSubmitted),
        humanPending=r.missingChecks.length>0||
          (r.unresolvedReviewItems??0)>0;
      const allClaimsComplete=checklist&&!humanPending;
      if(!hasSource)counts.monthsWithoutChannelClaims++;
      if(!paginationComplete)counts.monthsWithIncompleteScanClaims++;
      if(!checklist)counts.monthsWithoutHumanChecklist++;
      else if(humanPending)counts.monthsWithOpenHumanChecklist++;
      if(allClaimsComplete&&(!hasSource||!paginationComplete))
        counts.monthsWithClaimedAllChecksButMissingSource++;
      if(allClaimsComplete&&hasSource&&paginationComplete)
        counts.monthsClaimedReadyOnlyOnUntrustedEvidence++;
      const state=!hasSource?'NO CLAIMED DISCORD SOURCE':
        !paginationComplete?'CLAIMED DISCORD SCAN INCOMPLETE':
        !checklist?'HUMAN SOURCE CHECKLIST NOT SUBMITTED':
        humanPending?'HUMAN SOURCE CHECKLIST HAS OPEN ITEMS':
        'CLAIMED COMPLETE — INDEPENDENT DISCORD PROOF MISSING';
      return Object.freeze({
        month:m.month,reviewState:state,
        channelSourcesClaimed:m.claimedChannelSources,
        sourceStreamsMissingOrIncomplete:m.claimedRequiredStreamsIncomplete,
        humanChecklistSubmitted:checklist,
        humanOpenReviewItems:r.unresolvedReviewItems,
        allCheckmarksCannotOverrideMissingSource:true,
        originalDiscordMessagesAuthenticated:false,
        monthHistoricalCoverageCertified:false,
        usableFreeSlots:null
      });
    });
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      firstMonth:pages.firstMonth,finalMonth:pages.finalMonth,
      monthsRequired:24,
      sourceReceiptChecks:Object.freeze({
        pageClaims:pages.suppliedPageClaims,
        missingStreams:pages.streamsMissingScanClaims,
        brokenCursorChains:pages.brokenCursorChains,
        failedPageRequests:pages.failedPageRequests,
        unfinishedStreams:pages.unfinishedPageStreams,
        providerReadAuthenticated:false
      }),
      counters:Object.freeze(counts),
      months:Object.freeze(rows),
      untrustedSourceChecklistAndPaginationNeverAttestToDiscord:true,
      unknownHistoricalSourceDoesNotMeanEmptyMonth:true,
      full24MonthOriginalSourceInventoryIndependentlyVerified:false,
      latestSignedOwnerHistoryIndependentlyVerified:false,
      actualDiscordMessagesReadByThisWorkboard:0,
      realEventRecordsImported:0,
      autoReleasedHistoricalReservations:0,
      approvalDecisionsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={auditKingsHistoricalDiscoveryWorkboard};
