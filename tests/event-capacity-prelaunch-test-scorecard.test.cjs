'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectKingsMaintenanceTestScorecard:score}
 =require('../event-capacity-prelaunch-test-scorecard');
const systems=['Convoy Center & Checker','Archived / Legacy Convoy Channels',
'Event Invitation Tracker','Kings Event Capacity Calendar',
'Source Security / Staff Authorization','Historical 24-Month Completeness',
'Independent Disaster Recovery'];
function fixture(){
  const offline=['STRUCTURE CHECK PASS — REAL ORIGIN UNVERIFIED',
  'STRUCTURE CHECK PASS — REAL ORIGIN UNVERIFIED',
  'TRACKER CLAIMS MATCHED — REAL ORIGIN UNVERIFIED',
  'PRIVATE CALENDAR PROJECTED — NO LIVE AVAILABILITY',
  'NOT LIVE VERIFIED','NOT LIVE VERIFIED','NOT LIVE VERIFIED'];
  return {visibility:'PRIVATE_ONLY',readOnly:true,safeToActivate:false,
    freeSlotsCertified:false,totalDiagnosticChecks:7,
    userReportedMaintenanceThroughUtc:'2026-11-30',
    sourceClaimsMismatch:{channelTotalMismatches:0,
      archivedClaimMismatches:0,deletedClaimMismatches:0,
      channelsMissingFullArchiveOrEditClaim:0},
    originalDiscordThreadsReadHere:0,
    actualGitHubCIIndependentlyVerifiedHere:false,
    realDiscordCurrentSourceChecked:false,
    realDiscordArchivedSourceChecked:false,
    realEventInvitationTrackerConnectedHere:false,
    actualDiscordPermissionsVerified:false,
    canSendRealDiscordTestMessages:false,
    checks:systems.map((component,i)=>({component,offlineOutcome:offline[i],
      liveOutcome:'NOT TESTED / NOT CERTIFIED',humanFollowUpRequired:true,
      productionApprovalGranted:false}))};
}
test('Clean offline checks mean three software passes and four live blockers',()=>{
  const r=score(fixture());
  assert.deepEqual(r.totals,{offlinePassed:3,offlineFailed:0,
    offlineWarnings:0,liveBlocked:4});
  assert.equal(r.actualLiveDiscordEventsVerified,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Archive count contradictions surface as failures',()=>{
  const f=fixture();f.checks[1].offlineOutcome='SOURCE CLAIM MISMATCH — REVIEW';
  const r=score(f);assert.equal(r.totals.offlineFailed,1);
  assert.match(r.status,/SOURCE CLAIM DEFECTS/);
});
test('Missing archival reviews create warnings without live pass',()=>{
  const f=fixture();
  f.checks[1].offlineOutcome='INCOMPLETE CLAIMED ARCHIVE REVIEW';
  const r=score(f);assert.equal(r.totals.offlineWarnings,1);
  assert.equal(r.systems[1].actualLiveSystemTested,false);
});
test('Unconnected outgoing tracker never auto approves an invitation',()=>{
  const f=fixture();f.checks[2].offlineOutcome='TRACKER NOT CONNECTED IN SUPPLIED CLAIMS';
  const r=score(f);
  assert.equal(r.systems[2].result,'BLOCKED — LIVE NOT VERIFIED');
  assert.equal(r.productionApprovalsCommitted,0);
});
test('Forged check statuses and reordered system labels fail',()=>{
  const f=fixture();f.checks[0].offlineOutcome='LIVE ONLINE';
  assert.throws(()=>score(f));
  const g=fixture();g.checks.reverse();assert.throws(()=>score(g));
});
test('False production flags, live permissions and Discord write actions fail',()=>{
  for(const patch of [{safeToActivate:true},{freeSlotsCertified:true},
    {realDiscordCurrentSourceChecked:true},
    {realEventInvitationTrackerConnectedHere:true},
    {actualDiscordPermissionsVerified:true},
    {canSendRealDiscordTestMessages:true}])
    assert.throws(()=>score({...fixture(),...patch}));
});
test('Raw Event IDs and Discord channel IDs are absent from report',()=>{
  const r=score(fixture()),s=JSON.stringify(r);
  for(const bad of ['event:100','1114967437788577792','PRIVATE KEY'])
    assert.equal(s.includes(bad),false);
  assert.equal(r.CIActuallyFetchedAndValidatedByThisModule,false);
  assert.equal(r.noAutomaticActivationAfterMaintenance,true);
});
