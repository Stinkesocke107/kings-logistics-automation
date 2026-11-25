'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {evaluate}=require('../event-capacity-core');
const {runKingsPrelaunchSystemDiagnostics:diagnose}
 =require('../event-capacity-prelaunch-diagnostics');
const {projectKingsMaintenanceTestScorecard:score}
 =require('../event-capacity-prelaunch-test-scorecard');
const C='990000000000000001',L='990000000000000002';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function fixture(){
  const channel=(id,kind)=>({channelId:id,kind,claimedThreadCount:1,
    claimedArchivedCount:0,claimedDeletedCount:0,
    firstCoveredMonth:'2024-12',lastCoveredMonth:'2026-11',
    currentThreadsRead:true,archivedThreadsRead:true,
    deletedThreadsReviewed:true,editHistoryReviewed:true});
  const row=(id,thread,sourceKind)=>({
    channelId:id,threadId:thread,sourceKind,eventId:'evt1',
    status:'Scheduled',category:'Partner Convoy',
    departureAtUtc:'2026-11-20T18:00:00.000Z',
    modifiedAtUtc:'2026-11-19T15:00:00.000Z',
    sourceDigest:sha(thread),revisionDigests:[sha('edited'+thread)]});
  return {bridgeInput:{
    sourceIntake:{
      guildId:'990000000000000000',currentChannelId:C,
      firstMonth:'2024-12',finalMonth:'2026-11',
      channelInventory:[channel(C,'current'),channel(L,'legacy')],
      convoyRecords:[row(C,'990000000000000003','current'),
        row(L,'990000000000000004','legacy')],
      tracker:null,reviewSecret:'synthetic private evidence HMAC key only',
      nowMs:Date.parse('2026-11-25T15:00:00.000Z')
    },
    capacity:evaluate([],{dataFresh:false}),year:'2026',
    selectedMonth:'2026-11',historicalHoldsReports:[],
    historicalEvidenceReport:null
  },asOfUtc:'2026-11-25',userReportedMaintenanceThroughUtc:'2026-11-30'};
}
const run=change=>{const x=fixture();change?.(x);const d=diagnose(x);
  return {d,s:score(d)};};
test('Integrated clean offline claims do not prove any live system works',()=>{
  const {s}=run();
  assert.deepEqual(s.totals,{offlinePassed:3,offlineFailed:0,
    offlineWarnings:0,liveBlocked:4});
  assert.equal(s.actualLiveDiscordEventsVerified,0);
});
test('Omitted archive record marks source failure even if thread totals match',()=>{
  const {d,s}=run(x=>{x.bridgeInput.sourceIntake.convoyRecords[1].sourceKind='archived';});
  assert.equal(d.sourceClaimsMismatch.archivedClaimMismatches,1);
  assert.equal(d.sourceClaimsMismatch.channelTotalMismatches,0);
  assert.equal(s.totals.offlineFailed,2);
});
test('Missing deleted evidence is also a source failure, not a valid booking',()=>{
  const {d,s}=run(x=>{x.bridgeInput.sourceIntake.convoyRecords[1].sourceKind='deleted';});
  assert.equal(d.sourceClaimsMismatch.deletedClaimMismatches,1);
  assert.equal(s.freeSlotsCertified,false);
});
test('Unverified edit review is visibly downgraded to warning',()=>{
  const {s}=run(x=>{x.bridgeInput.sourceIntake.channelInventory[1].editHistoryReviewed=false;});
  assert.equal(s.totals.offlineWarnings,1);
  assert.equal(s.systems[1].actualLiveSystemTested,false);
});
test('After November 30 there is never an automatic production activation',()=>{
  const {d,s}=run(x=>{x.asOfUtc='2026-12-01';});
  assert.equal(d.reportedMaintenanceWindowActive,false);
  assert.equal(s.noAutomaticActivationAfterMaintenance,true);
  assert.equal(s.safeToActivate,false);
});
test('Duplicate source thread aborts the entire offline scorecard',()=>{
  assert.throws(()=>run(x=>{
    x.bridgeInput.sourceIntake.convoyRecords.push(
      {...x.bridgeInput.sourceIntake.convoyRecords[0]});
  }));
});
