'use strict';
// DRAFT / OFFLINE ONLY. A safe functional test matrix while Kings systems
// are user-reported unavailable through 2026-11-30. NO provider connections,
// credentials, Discord writes or live actions. A passing self-check cannot
// make an unverified real Event booking available.
const {projectKingsConvoySystemBridge}
  =require('./event-capacity-convoy-system-calendar-bridge');
const ERROR='Kings Event Capacity prelaunch diagnostics unavailable.';
function fail(){throw new Error(ERROR);}
function count(x){if(!Number.isSafeInteger(x)||x<0||x>10000)fail();return x;}
function date(x){
  if(typeof x!=='string'||!/^20\d\d-\d\d-\d\d$/.test(x))fail();
  const d=Date.parse(x+'T00:00:00.000Z');
  if(!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==x)fail();
  return x;
}
const FIXED=Object.freeze([
  ['Convoy Center & Checker','Current source inventory checked, origin NOT authenticated'],
  ['Archived / Legacy Convoy Channels','Original archive and deletion coverage NOT authenticated'],
  ['Event Invitation Tracker','Outbound acceptance NOT valid as Kings event approval'],
  ['Kings Event Capacity Calendar','Private projected month/day totals, not live slots'],
  ['Source Security / Staff Authorization','Actual effective Discord permissions NOT verified'],
  ['Historical 24-Month Completeness','Original source data completeness NOT verified'],
  ['Independent Disaster Recovery','External backup and restore host NOT verified']
]);
function runKingsPrelaunchSystemDiagnostics({
  bridgeInput,asOfUtc='2026-11-25',userReportedMaintenanceThroughUtc='2026-11-30'
}={}){
  try{
    const today=date(asOfUtc),maintenance=date(userReportedMaintenanceThroughUtc);
    if(!bridgeInput||typeof bridgeInput!=='object'||Array.isArray(bridgeInput)||
      !bridgeInput.sourceIntake||typeof bridgeInput.sourceIntake!=='object')fail();
    const bridge=projectKingsConvoySystemBridge(bridgeInput);
    if(bridge.safeToActivate!==false||bridge.freeSlotsCertified!==false||
      bridge.calendar.freeSlotsCertified!==false||
      bridge.staffDecisionsCommitted!==0||
      bridge.currentDiscordChannelsAuthenticatedHere!==false)fail();
    const intake=bridgeInput.sourceIntake,archived=new Map(),
      deleted=new Map(),live=new Map();
    for(const c of intake.convoyRecords){
      live.set(c.channelId,(live.get(c.channelId)??0)+1);
      if(c.sourceKind==='archived')
        archived.set(c.channelId,(archived.get(c.channelId)??0)+1);
      if(c.sourceKind==='deleted')
        deleted.set(c.channelId,(deleted.get(c.channelId)??0)+1);
    }
    let mismatch=0,archivedMismatch=0,deletedMismatch=0,missingArchiveReview=0;
    for(const c of intake.channelInventory){
      count(c.claimedThreadCount);count(c.claimedArchivedCount);
      count(c.claimedDeletedCount);
      if(count(live.get(c.channelId)??0)!==c.claimedThreadCount)mismatch++;
      if(count(archived.get(c.channelId)??0)!==c.claimedArchivedCount)
        archivedMismatch++;
      if(count(deleted.get(c.channelId)??0)!==c.claimedDeletedCount)
        deletedMismatch++;
      if(c.archivedThreadsRead!==true||c.deletedThreadsReviewed!==true||
        c.editHistoryReviewed!==true)missingArchiveReview++;
    }
    const hasMismatch=mismatch+archivedMismatch+deletedMismatch>0;
    const missingTracker=!intake.tracker||intake.tracker.configured!==true||
      intake.tracker.connected!==true||intake.tracker.claimsComplete!==true;
    const checks=FIXED.map(([component,expectation],i)=>Object.freeze({
      component,expectation,
      offlineOutcome:i===0||i===1?
        (hasMismatch?'SOURCE CLAIM MISMATCH — REVIEW':
          i===1&&missingArchiveReview?'INCOMPLETE CLAIMED ARCHIVE REVIEW':
            'STRUCTURE CHECK PASS — REAL ORIGIN UNVERIFIED'):
        i===2?(missingTracker?'TRACKER NOT CONNECTED IN SUPPLIED CLAIMS':
          'TRACKER CLAIMS MATCHED — REAL ORIGIN UNVERIFIED'):
        i===3?'PRIVATE CALENDAR PROJECTED — NO LIVE AVAILABILITY':
        'NOT LIVE VERIFIED',
      liveOutcome:'NOT TESTED / NOT CERTIFIED',
      humanFollowUpRequired:true,
      productionApprovalGranted:false
    }));
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      diagnosticDayUtc:today,
      userReportedMaintenanceThroughUtc:maintenance,
      reportedMaintenanceWindowActive:today<=maintenance,
      reportedMaintenanceIsNotIndependentlyVerified:true,
      sourceClaimsMismatch:Object.freeze({
        channelTotalMismatches:mismatch,
        archivedClaimMismatches:archivedMismatch,
        deletedClaimMismatches:deletedMismatch,
        channelsMissingFullArchiveOrEditClaim:missingArchiveReview
      }),
      sourceReviewItemsFromExistingAudit:bridge.sourceReview.unresolvedHumanReviewItems,
      sourceUrgentItemsFromExistingAudit:bridge.sourceReview.urgentHumanReviewItems,
      legacyExistingFileRows:bridge.sourceReview.frozenLegacyClaimedConvoys,
      originalDiscordThreadsReadHere:0,
      totalDiagnosticChecks:checks.length,checks,
      offlineSoftwareCheckSucceeded:true,
      actualGitHubCIIndependentlyVerifiedHere:false,
      realDiscordCurrentSourceChecked:false,
      realDiscordArchivedSourceChecked:false,
      realEventInvitationTrackerConnectedHere:false,
      actualDiscordPermissionsVerified:false,
      independentOwnerBackupRecoveryVerified:false,
      canSendRealDiscordTestMessages:false,
      safeToActivate:false,freeSlotsCertified:false,
      liveFunctionalReadiness:'BLOCKED — ORIGINAL SOURCES AND AUTHORIZATION NOT VERIFIED'
    });
  }catch{fail();}
}
module.exports={runKingsPrelaunchSystemDiagnostics};
