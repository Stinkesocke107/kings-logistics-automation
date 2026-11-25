'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../event-capacity-core');
const {fixture,adjustTotals}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {projectKingsImportRecoveryTeamPreview:review,
  renderKingsImportRecoveryTeamPreview:render}
  =require('../event-capacity-import-recovery-team-preview');
function input(change){
  const handoffInput=fixture();change?.(handoffInput);
  return {handoffInput,calendarInput:{
    eventTeamInput:{sourceIntake:handoffInput.current,
      capacity:evaluate([],{dataFresh:false}),
      year:'2026',selectedMonth:'2026-11',
      historicalHoldsReports:[],historicalEvidenceReport:null},
    paginationInput:handoffInput.currentPagination,
    monthlyClaims:[]}};
}
test('First recovery stage shows source lock and staff quarantine without live writes',()=>{
  const r=review(input());
  assert.equal(r.state,'OFFLINE_CHECKPOINT_STAGED');
  assert.equal(r.offlinePhase,'SOURCE_SNAPSHOT_LOCKED');
  assert.equal(r.offlinePhaseIndex,0);
  assert.equal(r.eventClaims,1);
  assert.equal(r.trackerInvitationClaims,1);
  assert.equal(r.quarantineRecords,4);
  assert.equal(r.actualEventImportsOrDeletions,0);
  assert.equal(r.safeToActivate,false);
});
test('A before-phase interruption is shown as NOT CHECKPOINTED',()=>{
  const r=review({...input(),fault:{
    phase:'SOURCE_SNAPSHOT_LOCKED',at:'BEFORE_PHASE'
  }});
  assert.equal(r.state,'INTERRUPTED_BEFORE_PHASE');
  assert.equal(r.offlinePhase,'NOT_CHECKPOINTED');
  assert.equal(r.privateOfflineCheckpoint,null);
  assert.equal(r.automaticEventDecisionsMade,0);
});
test('Resuming one saved checkpoint advances exactly one synthetic step',()=>{
  const x=input(),first=review(x);
  const next=review({...x,checkpoint:first.privateOfflineCheckpoint});
  assert.equal(next.offlinePhase,'QUARANTINE_MANIFEST_REVIEWED');
  assert.equal(next.offlinePhaseIndex,1);
  assert.equal(next.quarantineRecords,4);
});
test('Crash after second phase preserves old phase and can be retried',()=>{
  const x=input(),initial=review(x);
  const broken=review({...x,checkpoint:initial.privateOfflineCheckpoint,
    fault:{phase:'QUARANTINE_MANIFEST_REVIEWED',
      at:'AFTER_PHASE_BEFORE_CHECKPOINT'}});
  assert.equal(broken.state,'INTERRUPTED_AFTER_PHASE_REPLAY_REQUIRED');
  assert.deepEqual(broken.privateOfflineCheckpoint,initial.privateOfflineCheckpoint);
  const retry=review({...x,checkpoint:broken.privateOfflineCheckpoint});
  assert.equal(retry.offlinePhase,'QUARANTINE_MANIFEST_REVIEWED');
});
test('Changed real Event claims make stale checkpoint invalid, without releasing prior reservations',()=>{
  const x=input(),first=review(x);
  for(const row of x.handoffInput.current.convoyRecords)
    row.status='Cancelled';
  assert.throws(()=>review({...x,checkpoint:first.privateOfflineCheckpoint}));
  assert.equal(review(x).previousCalendarReservationsReleased,0);
});
test('Missing historical source channel remains quarantine even if review started before',()=>{
  const x=input(),first=review(x);
  x.handoffInput.current.convoyRecords.pop();
  adjustTotals(x.handoffInput);
  assert.throws(()=>review({...x,checkpoint:first.privateOfflineCheckpoint}));
  const fresh=review(x);
  assert.equal(fresh.notObservedNeedsHumanReview,0);
  assert.ok(fresh.changedNeedsHumanReview>0);
  assert.equal(fresh.actualEventImportsOrDeletions,0);
});
test('Preview renderer never echoes private checkpoints, event IDs or archival cursors',()=>{
  const r=review(input()),response=render(r),text=JSON.stringify(response);
  assert.equal(response.type,4);
  assert.equal(response.data.flags,64);
  assert.deepEqual(response.data.allowed_mentions,{parse:[]});
  for(const raw of ['evt100','inv1','990000000000000001',
    'staged-plan:','source-handoff:','proofSeal',
    '2026-11-24T15:00:00.000Z','@everyone'])
    assert.equal(text.includes(raw),false);
  assert.match(text,/No live import/);
});
test('Forged success, live Staff approval and actual backup restore are rejected',()=>{
  const r=review(input());
  for(const patch of [{safeToActivate:true},{freeSlotsCertified:true},
    {actualEventImportsOrDeletions:1},{automaticEventDecisionsMade:1},
    {runtimeStaffPermissionsVerified:true},
    {actualBackupRestoreCompleted:true},{readOnly:false},
    {externalWritesOrDiscordMessagesSent:1}])
    assert.throws(()=>render({...r,...patch}));
});
test('Source and calendar must describe exact same candidate snapshot object',()=>{
  const x=input();
  x.calendarInput.eventTeamInput.sourceIntake=
    structuredClone(x.handoffInput.current);
  assert.throws(()=>review(x));
  const y=input();
  y.calendarInput.paginationInput=
    structuredClone(y.handoffInput.currentPagination);
  assert.throws(()=>review(y));
});
test('Four resumed offline reviews can reach drill-finished but never approve events',()=>{
  const x=input();let cp=null,last;
  for(let i=0;i<4;i++){
    last=review({...x,checkpoint:cp});
    cp=last.privateOfflineCheckpoint;
  }
  assert.equal(last.offlineDrillCompleted,true);
  assert.equal(last.offlinePhase,'OFFLINE_DRILL_COMPLETE');
  assert.equal(last.actualEventImportsOrDeletions,0);
  assert.equal(last.signedOwnerHighwaterIndependentlyVerified,false);
  assert.equal(last.freeSlotsCertified,false);
  const again=review({...x,checkpoint:cp});
  assert.equal(again.state,'ALREADY_FINISHED_OFFLINE_ONLY');
});
