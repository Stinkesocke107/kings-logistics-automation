'use strict';
// DRAFT: test-report categorization only. Never assert live connectivity,
// independently verified source history or production permission.
const ERROR='Kings maintenance test scorecard invalid.';
const SYSTEMS=['Convoy Center & Checker','Archived / Legacy Convoy Channels',
  'Event Invitation Tracker','Kings Event Capacity Calendar',
  'Source Security / Staff Authorization','Historical 24-Month Completeness',
  'Independent Disaster Recovery'];
function fail(){throw new Error(ERROR);}
function safeObject(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function projectKingsMaintenanceTestScorecard(d){
  try{
    if(!safeObject(d)||d.visibility!=='PRIVATE_ONLY'||d.readOnly!==true||
      d.safeToActivate!==false||d.freeSlotsCertified!==false||
      d.totalDiagnosticChecks!==7||!Array.isArray(d.checks)||
      d.checks.length!==7||!safeObject(d.sourceClaimsMismatch)||
      d.originalDiscordThreadsReadHere!==0||
      d.actualGitHubCIIndependentlyVerifiedHere!==false||
      d.realDiscordCurrentSourceChecked!==false||
      d.realDiscordArchivedSourceChecked!==false||
      d.realEventInvitationTrackerConnectedHere!==false||
      d.actualDiscordPermissionsVerified!==false||
      d.canSendRealDiscordTestMessages!==false)fail();
    const report=d.checks.map((row,i)=>{
      if(!safeObject(row)||row.component!==SYSTEMS[i]||
        row.liveOutcome!=='NOT TESTED / NOT CERTIFIED'||
        row.humanFollowUpRequired!==true||
        row.productionApprovalGranted!==false)fail();
      let result='BLOCKED — LIVE NOT VERIFIED';
      if(i<=1){
        if(row.offlineOutcome==='SOURCE CLAIM MISMATCH — REVIEW')
          result='FAIL — SOURCE COUNT MISMATCH';
        else if(row.offlineOutcome==='INCOMPLETE CLAIMED ARCHIVE REVIEW')
          result='WARN — INCOMPLETE ARCHIVE CLAIMS';
        else if(row.offlineOutcome==='STRUCTURE CHECK PASS — REAL ORIGIN UNVERIFIED')
          result='PASS — OFFLINE STRUCTURE ONLY';
        else fail();
      }else if(i===2){
        if(!['TRACKER NOT CONNECTED IN SUPPLIED CLAIMS',
          'TRACKER CLAIMS MATCHED — REAL ORIGIN UNVERIFIED']
          .includes(row.offlineOutcome))fail();
      }else if(i===3){
        if(row.offlineOutcome!=='PRIVATE CALENDAR PROJECTED — NO LIVE AVAILABILITY')
          fail();
        result='PASS — OFFLINE CALENDAR ONLY';
      }else if(row.offlineOutcome!=='NOT LIVE VERIFIED')fail();
      return Object.freeze({system:SYSTEMS[i],result,
        actualLiveSystemTested:false,productionApprovalGranted:false});
    });
    const count=token=>report.filter(r=>r.result.startsWith(token)).length;
    const metrics=Object.freeze({
      offlinePassed:count('PASS'),offlineFailed:count('FAIL'),
      offlineWarnings:count('WARN'),liveBlocked:count('BLOCKED')
    });
    if(metrics.offlinePassed+metrics.offlineFailed+
      metrics.offlineWarnings+metrics.liveBlocked!==7)fail();
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      status:metrics.offlineFailed>0?'SOURCE CLAIM DEFECTS DETECTED':
        metrics.offlineWarnings>0?'SOURCE COVERAGE REVIEW PENDING':
          'OFFLINE SOFTWARE VALIDATED — LIVE SYSTEMS STILL BLOCKED',
      maintenanceDateReportedByUser:d.userReportedMaintenanceThroughUtc,
      userReportedMaintenanceIsNotAnActualOutageVerification:true,
      systems:report,totals:metrics,
      actualLiveDiscordEventsVerified:0,
      productionApprovalsCommitted:0,
      original24MonthArchiveIndependentlyProven:false,
      CIActuallyFetchedAndValidatedByThisModule:false,
      noAutomaticActivationAfterMaintenance:true,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={projectKingsMaintenanceTestScorecard};
