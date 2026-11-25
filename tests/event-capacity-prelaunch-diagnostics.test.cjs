'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {evaluate}=require('../event-capacity-core');
const {runKingsPrelaunchSystemDiagnostics}
  =require('../event-capacity-prelaunch-diagnostics');
const N=Date.parse('2026-11-25T16:00:00.000Z');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const G='990000000000000000',C='990000000000000001',A='990000000000000002';
function channel(id,kind,claim,patch={}){
  return {channelId:id,kind,firstCoveredMonth:'2024-12',
    lastCoveredMonth:'2026-11',claimedThreadCount:claim,
    claimedArchivedCount:0,claimedDeletedCount:0,
    currentThreadsRead:true,archivedThreadsRead:true,
    deletedThreadsReviewed:true,editHistoryReviewed:true,...patch};
}
function record(id,thread,kind,patch={}){
  return {channelId:id,threadId:thread,eventId:'sameevent',
    sourceKind:kind,status:'Scheduled',category:'Partner Convoy',
    departureAtUtc:'2026-11-20T18:00:00.000Z',
    modifiedAtUtc:'2026-11-21T01:00:00.000Z',
    sourceDigest:hash('source'+thread),revisionDigests:[hash('edit'+thread)],
    ...patch};
}
function base(){
  return {bridgeInput:{
    sourceIntake:{
      guildId:G,currentChannelId:C,firstMonth:'2024-12',
      finalMonth:'2026-11',channelInventory:[
        channel(C,'current',1),channel(A,'legacy',1)
      ],convoyRecords:[
        record(C,'990000000000000010','current'),
        record(A,'990000000000000011','legacy')
      ],
      tracker:{configured:true,connected:true,claimsComplete:true,
        records:[{invitationId:'invite1',eventId:'sameevent',
          status:'Accepted',departureAtUtc:'2026-11-20T18:00:00.000Z',
          sourceDigest:hash('tracker source')}]},
      nowMs:N,reviewSecret:'synthetic source review key for off-line testing only'
    },
    capacity:evaluate([{eventId:'sameevent',eventType:'Partner Convoy',
      eventTypeVerified:true,status:'Scheduled',statusVerified:true,
      departureAtUtc:'2026-11-20T18:00:00Z',departureVerified:true,
      meetingAtUtc:'2026-11-20T17:00:00Z',
      plannedEndAtUtc:'2026-11-20T20:00:00Z'}],{dataFresh:false}),
    year:'2026',selectedMonth:'2026-11',
    historicalHoldsReports:[],historicalEvidenceReport:null
  },asOfUtc:'2026-11-25',userReportedMaintenanceThroughUtc:'2026-11-30'};
}
function check(mutate){
  const f=base();mutate?.(f);return runKingsPrelaunchSystemDiagnostics(f);
}
test('Seven concrete Kings prelaunch categories distinguish offline structure from never-tested live providers',()=>{
  const r=check();
  assert.equal(r.totalDiagnosticChecks,7);
  assert.equal(r.checks.length,7);
  assert.equal(r.checks[0].offlineOutcome,'STRUCTURE CHECK PASS — REAL ORIGIN UNVERIFIED');
  assert.equal(r.checks[1].offlineOutcome,'STRUCTURE CHECK PASS — REAL ORIGIN UNVERIFIED');
  assert.equal(r.reportedMaintenanceWindowActive,true);
  assert.equal(r.reportedMaintenanceIsNotIndependentlyVerified,true);
  assert.ok(r.checks.every(x=>x.liveOutcome==='NOT TESTED / NOT CERTIFIED'));
  assert.equal(r.originalDiscordThreadsReadHere,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Archive number mismatch is detected even if per-channel total matches',()=>{
  const r=check(f=>{f.bridgeInput.sourceIntake.channelInventory[1].claimedArchivedCount=1;});
  assert.equal(r.sourceClaimsMismatch.archivedClaimMismatches,1);
  assert.equal(r.sourceClaimsMismatch.channelTotalMismatches,0);
  assert.match(r.checks[1].offlineOutcome,/SOURCE CLAIM MISMATCH/);
});
test('Deletion number mismatch is flagged for review without attempting message recovery',()=>{
  const r=check(f=>{f.bridgeInput.sourceIntake.channelInventory[0].claimedDeletedCount=1;});
  assert.equal(r.sourceClaimsMismatch.deletedClaimMismatches,1);
  assert.equal(r.realDiscordArchivedSourceChecked,false);
});
test('Out-of-sync thread totals are not silently considered reliable source inventory',()=>{
  const r=check(f=>{f.bridgeInput.sourceIntake.channelInventory[0].claimedThreadCount=2;});
  assert.equal(r.sourceClaimsMismatch.channelTotalMismatches,1);
  assert.match(r.checks[0].offlineOutcome,/SOURCE CLAIM MISMATCH/);
});
test('Archive / deletion / edit coverage toggles are visible as incomplete claims',()=>{
  const r=check(f=>{f.bridgeInput.sourceIntake.channelInventory[1].editHistoryReviewed=false;});
  assert.equal(r.sourceClaimsMismatch.channelsMissingFullArchiveOrEditClaim,1);
  assert.match(r.checks[1].offlineOutcome,/INCOMPLETE CLAIMED ARCHIVE REVIEW/);
});
test('Disconnected or absent outbound Invitation Tracker remains explicitly untested',()=>{
  const r=check(f=>{f.bridgeInput.sourceIntake.tracker=null;});
  assert.equal(r.checks[2].offlineOutcome,'TRACKER NOT CONNECTED IN SUPPLIED CLAIMS');
  assert.equal(r.realEventInvitationTrackerConnectedHere,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Maintenance boundary November 30 is interpreted inclusively but never auto-activates live tests',()=>{
  const a=check(f=>{f.asOfUtc='2026-11-30';});
  assert.equal(a.reportedMaintenanceWindowActive,true);
  const b=check(f=>{f.asOfUtc='2026-12-01';});
  assert.equal(b.reportedMaintenanceWindowActive,false);
  assert.equal(b.canSendRealDiscordTestMessages,false);
  assert.equal(b.safeToActivate,false);
  assert.equal(b.liveFunctionalReadiness,
    'BLOCKED — ORIGINAL SOURCES AND AUTHORIZATION NOT VERIFIED');
});
test('Invalid date and real secret embedded in source fail closed',()=>{
  assert.throws(()=>check(f=>{f.asOfUtc='2026-11-31';}));
  assert.throws(()=>check(f=>{f.userReportedMaintenanceThroughUtc='soon';}));
  assert.throws(()=>check(f=>{f.bridgeInput.sourceIntake.convoyRecords[0].botToken='SECRET';}));
});
test('A green offline diagnostic does not certify the full 24-month original Discord archive',()=>{
  const r=check();
  assert.equal(r.offlineSoftwareCheckSucceeded,true);
  assert.equal(r.actualGitHubCIIndependentlyVerifiedHere,false);
  assert.equal(r.realDiscordCurrentSourceChecked,false);
  assert.equal(r.originalDiscordThreadsReadHere,0);
  assert.equal(r.independentOwnerBackupRecoveryVerified,false);
  assert.equal(r.safeToActivate,false);
});
test('Real frozen six-month Legacy import is included only as nonadditive historical claims',()=>{
  const r=check(f=>{
    f.bridgeInput.frozenLegacyImport=JSON.parse(fs.readFileSync(
      path.join(__dirname,'../data/legacy-convoys.json'),'utf8'));
  });
  assert.equal(r.legacyExistingFileRows,115);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.actualDiscordPermissionsVerified,false);
});
test('Private report includes no Event IDs, Discord channel IDs, hashes or raw legacy records',()=>{
  const serialized=JSON.stringify(check());
  for(const bad of [G,C,A,'sameevent','invite1',
    hash('tracker source'),'DISCORD_BOT_TOKEN','PRIVATE KEY'])
    assert.equal(serialized.includes(bad),false);
  assert.ok(!serialized.includes('Available 1'));
});
test('A fake success status can never override the externally unverified provider state',()=>{
  const r=check(f=>{f.bridgeInput.sourceIntake.tracker.connected=true;});
  assert.equal(r.checks[2].offlineOutcome,
    'TRACKER CLAIMS MATCHED — REAL ORIGIN UNVERIFIED');
  assert.equal(r.realEventInvitationTrackerConnectedHere,false);
  assert.equal(r.canSendRealDiscordTestMessages,false);
});
