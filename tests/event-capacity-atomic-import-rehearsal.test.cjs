'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,hash,adjustTotals}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {runKingsAtomicImportRehearsal:run}
  =require('../event-capacity-atomic-import-rehearsal');
const PHASES=['SOURCE_SNAPSHOT_LOCKED','QUARANTINE_MANIFEST_REVIEWED',
  'RECOVERY_CONSISTENCY_INSPECTED','OFFLINE_DRILL_COMPLETE'];
const call=(f,checkpoint=null,fault=null)=>
  run({sourceInput:f,checkpoint,fault});
function complete(f){
  let cp=null,latest;
  for(let i=0;i<4;i++){
    latest=call(f,cp);cp=latest.checkpoint;
    assert.equal(cp.phaseIndex,i);
    assert.equal(latest.phaseAttempted,PHASES[i]);
  }
  return latest;
}
test('Initial stage is a sealed private quarantine checkpoint and zero real imports',()=>{
  const r=call(fixture());
  assert.equal(r.state,'OFFLINE_CHECKPOINT_STAGED');
  assert.equal(r.checkpoint.phaseIndex,0);
  assert.equal(r.checkpoint.phase,PHASES[0]);
  assert.match(r.checkpoint.proofSeal,/^[a-f0-9]{64}$/);
  assert.equal(r.quarantineRecords,4);
  assert.equal(r.externalCallsOrWritesPerformed,0);
  assert.equal(r.realEventImports,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Four monotonic steps complete a synthetic DRILL, not a live transaction',()=>{
  const r=complete(fixture());
  assert.equal(r.state,'OFFLINE_DRILL_FINISHED_NO_IMPORT');
  assert.equal(r.offlineReviewDrillCompleted,true);
  assert.equal(r.actualExternalTransactionCompleted,false);
  assert.equal(r.productionTransactionCommitted,false);
  assert.equal(r.actualRecoveryOrRollbackPerformed,false);
  assert.equal(r.externalDurableCheckpointPersisted,false);
});
test('Finished checkpoint replay stays completed and cannot apply data twice',()=>{
  const f=fixture(),last=complete(f);
  const r=call(f,last.checkpoint);
  assert.equal(r.state,'ALREADY_FINISHED_OFFLINE_ONLY');
  assert.deepEqual(r.checkpoint,last.checkpoint);
  assert.equal(r.externalCallsOrWritesPerformed,0);
  assert.equal(r.realEventImports,0);
});
test('Pause before first source lock returns no checkpoint and no side effects',()=>{
  const f=fixture(),r=call(f,null,{phase:PHASES[0],at:'BEFORE_PHASE'});
  assert.equal(r.state,'INTERRUPTED_BEFORE_PHASE');
  assert.equal(r.checkpoint,null);
  assert.equal(r.realEventDeletes,0);
  assert.equal(r.staffApprovalsCommitted,0);
  assert.equal(call(f).checkpoint.phaseIndex,0);
});
test('Crash after first phase but before its checkpoint never pretends phase completed',()=>{
  const f=fixture(),r=call(f,null,{
    phase:PHASES[0],at:'AFTER_PHASE_BEFORE_CHECKPOINT'});
  assert.equal(r.checkpoint,null);
  assert.equal(r.state,'INTERRUPTED_AFTER_PHASE_REPLAY_REQUIRED');
  const retry=call(f,r.checkpoint);
  assert.equal(retry.checkpoint.phaseIndex,0);
});
test('A crash before the second step retains exactly the prior sealed checkpoint',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  const pause=call(f,cp,{phase:PHASES[1],at:'BEFORE_PHASE'});
  assert.deepEqual(pause.checkpoint,cp);
  assert.equal(pause.offlineReviewDrillCompleted,false);
  assert.equal(call(f,pause.checkpoint).checkpoint.phaseIndex,1);
});
test('A crash after an intermediate phase returns previous checkpoint, requiring safe replay',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  const pause=call(f,cp,{phase:PHASES[1],
    at:'AFTER_PHASE_BEFORE_CHECKPOINT'});
  assert.deepEqual(pause.checkpoint,cp);
  assert.equal(pause.state,'INTERRUPTED_AFTER_PHASE_REPLAY_REQUIRED');
  const resumed=call(f,pause.checkpoint);
  assert.equal(resumed.checkpoint.phaseIndex,1);
  assert.equal(resumed.externalCallsOrWritesPerformed,0);
});
test('Crash before synthetic final stage leaves it offline and resumable',()=>{
  const f=fixture();
  let cp=null;
  for(let i=0;i<3;i++)cp=call(f,cp).checkpoint;
  const pause=call(f,cp,{phase:PHASES[3],at:'BEFORE_PHASE'});
  assert.deepEqual(pause.checkpoint,cp);
  assert.equal(pause.offlineReviewDrillCompleted,false);
  assert.equal(call(f,pause.checkpoint).state,'OFFLINE_DRILL_FINISHED_NO_IMPORT');
});
test('Crash after final review but before checkpoint must not claim completion',()=>{
  const f=fixture();
  let cp=null;
  for(let i=0;i<3;i++)cp=call(f,cp).checkpoint;
  const pause=call(f,cp,{phase:PHASES[3],
    at:'AFTER_PHASE_BEFORE_CHECKPOINT'});
  assert.equal(pause.offlineReviewDrillCompleted,false);
  assert.equal(pause.checkpoint.phaseIndex,2);
  assert.equal(call(f,pause.checkpoint).checkpoint.phaseIndex,3);
});
test('Same snapshot and checkpoint replay always returns identical next sealed checkpoint',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  assert.deepEqual(call(f,cp),call(f,cp));
  assert.equal(call(f,cp).checkpoint.phaseIndex,1);
});
test('Source record order does not change valid HMAC checkpoint replay',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  f.current.convoyRecords.reverse();
  f.previous.convoyRecords.reverse();
  assert.equal(call(f,cp).checkpoint.phaseIndex,1);
});
test('Changed original message digest invalidates any checkpoint from earlier source',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  f.current.convoyRecords[0].sourceDigest=hash('changed source');
  assert.throws(()=>call(f,cp));
  assert.equal(call(f).checkpoint.phaseIndex,0);
});
test('Cancelled Event claim cannot resume with old plan checkpoint',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  for(const row of f.current.convoyRecords)row.status='Cancelled';
  assert.throws(()=>call(f,cp));
});
test('Reschedule on new day cannot inherit prior phase or release old date',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  for(const row of f.current.convoyRecords){
    row.status='Rescheduled';row.departureAtUtc='2026-11-22T18:00:00.000Z';
  }
  assert.throws(()=>call(f,cp));
  assert.equal(call(f).oldReservationsReleased,0);
});
test('Archived pagination response change invalidates replay even with unchanged Events',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  f.currentPagination.scans[0].pages[0].responseDigest='a'.repeat(64);
  assert.throws(()=>call(f,cp));
});
test('Interrupted or missing archive page can never reuse a previous checkpoint',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  f.currentPagination.scans=f.currentPagination.scans.filter(
    x=>x.stream!=='archived-public');
  assert.throws(()=>call(f,cp));
  const newRun=call(f);
  assert.equal(newRun.quarantineRecords,4);
  assert.equal(newRun.allRecordsRemainQuarantined,true);
});
test('Changed tracker connection flag invalidates checkpoint even when events unchanged',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  f.current.tracker.connected=false;
  assert.throws(()=>call(f,cp));
});
test('Added new outbound invitation invalidates prior plan checkpoint',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  f.current.tracker.records.push({...f.current.tracker.records[0],
    invitationId:'inv2',sourceDigest:hash('new invite'),status:'Sent'});
  assert.throws(()=>call(f,cp));
  assert.equal(call(f).quarantineInvitations,2);
});
test('Missing previous source thread cannot be deleted during replay',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  f.current.convoyRecords.pop();adjustTotals(f);
  assert.throws(()=>call(f,cp));
  const fresh=call(f);
  assert.equal(fresh.realEventDeletes,0);
  assert.equal(fresh.oldReservationsReleased,0);
});
test('Rotated HMAC key makes previous checkpoint untrusted even with identical sources',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  f.reviewSecret='rotated synthetic private key for recovery checks';
  assert.throws(()=>call(f,cp));
});
test('Tampered HMAC and forged later phase never advance the checkpoint',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  for(const patch of [
    {proofSeal:'0'.repeat(64)},{phaseIndex:3},{phase:PHASES[3]},
    {quarantineCount:0},{planSeal:'staged-plan:'+'a'.repeat(64)},
    {kind:'REAL_IMPORT'},{version:2}
  ])assert.throws(()=>call(f,{...cp,...patch}));
});
test('Extra fields and object prototype tricks cannot smuggle a fake approval',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  assert.throws(()=>call(f,{...cp,approved:true}));
  assert.throws(()=>call(f,Object.assign(Object.create({}),cp)));
});
test('Invalid requested crash phase, timing or fault on already complete state fails closed',()=>{
  const f=fixture(),cp=call(f).checkpoint;
  for(const fault of [
    {phase:'REAL_COMMIT',at:'BEFORE_PHASE'},
    {phase:PHASES[1],at:'AFTER_WRITE'},
    {phase:PHASES[2],at:'BEFORE_PHASE'},
    {phase:PHASES[1],at:'BEFORE_PHASE',token:'SECRET'}
  ])assert.throws(()=>call(f,cp,fault));
  const last=complete(f);
  assert.throws(()=>call(f,last.checkpoint,{
    phase:PHASES[3],at:'BEFORE_PHASE'}));
});
test('No original Event, channel, invitation or secret appears in checkpoint output',()=>{
  const f=fixture(),data=JSON.stringify(complete(f));
  for(const raw of [
    'evt100','inv1','990000000000000000','990000000000000001',
    '990000000000000003','synthetic private source-handoff'
  ])assert.equal(data.includes(raw),false);
});
test('Checkpoint creation never mutates source claims or owner-signed historical data',()=>{
  const f=fixture(),copy=structuredClone(f);
  complete(f);
  assert.deepEqual(f,copy);
});
test('Record count and source identities cannot pretend to be authorized by a local seal',()=>{
  const r=complete(fixture());
  assert.equal(r.checkpointIsOnlyLocalHmacConsistencyEvidence,true);
  assert.equal(r.realDiscordSourceAuthenticated,false);
  assert.equal(r.signedOwnerHistoryAttestedHere,false);
  assert.equal(r.allRecordsRemainQuarantined,true);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.safeToActivate,false);
});
