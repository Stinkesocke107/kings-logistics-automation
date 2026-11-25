'use strict';
// KINGS EVENT CAPACITY — PRIVATE OFFLINE TRANSACTION REHEARSAL.
// This module NEVER imports real Events, publishes a change, connects to
// Discord/GitHub, loads tokens or advances the independently retained owner
// history. A "completed" state means ONLY the synthetic review drill ran.
// Every phase starts from the same validated and quarantined source snapshot.
// Phase checkpoints are HMAC-sealed, NOT independently attested source proof.
const {createHmac,timingSafeEqual}=require('node:crypto');
const {createKingsStagedImportQuarantinePlan}
  =require('./event-capacity-staged-import-quarantine-plan');
const ERROR='Kings Event Capacity offline import recovery rehearsal refused.';
const PHASES=Object.freeze([
  'SOURCE_SNAPSHOT_LOCKED',
  'QUARANTINE_MANIFEST_REVIEWED',
  'RECOVERY_CONSISTENCY_INSPECTED',
  'OFFLINE_DRILL_COMPLETE'
]);
const FAULTS=Object.freeze(['BEFORE_PHASE','AFTER_PHASE_BEFORE_CHECKPOINT']);
const HEX=/^[a-f0-9]{64}$/;
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function keys(x,k){
  return plain(x)&&Object.keys(x).sort().join('\0')===k.slice().sort().join('\0');
}
function seal(secret,{version,kind,planSeal,phaseIndex,phase,quarantineCount}){
  return createHmac('sha256',secret)
    .update(JSON.stringify(['kings-atomic-import-rehearsal-v1',version,
      kind,planSeal,phaseIndex,phase,quarantineCount]))
    .digest('hex');
}
function assertPlan(plan){
  if(!plan||plan.version!==1||plan.visibility!=='PRIVATE_ONLY'||
    plan.readOnly!==true||plan.safeToActivate!==false||
    plan.freeSlotsCertified!==false||
    plan.stagingReadyForProduction!==false||
    plan.importOperationsCommitted!==0||
    plan.realEventApprovalsCommitted!==0||
    plan.original24MonthHistoryIndependentlyVerified!==false||
    plan.independentOwnerHighwaterVerified!==false||
    typeof plan.replaySeal!=='string'||
    !/^staged-plan:[a-f0-9]{64}$/.test(plan.replaySeal)||
    !plan.counts||!Number.isSafeInteger(plan.counts.total)||
    plan.counts.total<0||plan.counts.total>25000||
    !Array.isArray(plan.quarantineItems)||
    plan.quarantineItems.length!==plan.counts.total||
    plan.quarantineItems.some(x=>
      x.approvedForImport!==false||
      x.independentlyAuthenticatedSource!==false||
      x.humanReconciliationRequired!==true))fail();
}
function checkpointFor(secret,plan,i){
  const body={
    version:1,kind:'KINGS_OFFLINE_IMPORT_DRILL_ONLY',
    planSeal:plan.replaySeal,phaseIndex:i,phase:PHASES[i],
    quarantineCount:plan.counts.total
  };
  return Object.freeze({...body,proofSeal:seal(secret,body)});
}
function validateCheckpoint(checkpoint,secret,plan){
  if(!keys(checkpoint,['version','kind','planSeal','phaseIndex',
    'phase','quarantineCount','proofSeal'])||
    checkpoint.version!==1||
    checkpoint.kind!=='KINGS_OFFLINE_IMPORT_DRILL_ONLY'||
    checkpoint.planSeal!==plan.replaySeal||
    !Number.isSafeInteger(checkpoint.phaseIndex)||
    checkpoint.phaseIndex<0||checkpoint.phaseIndex>=PHASES.length||
    checkpoint.phase!==PHASES[checkpoint.phaseIndex]||
    checkpoint.quarantineCount!==plan.counts.total||
    typeof checkpoint.proofSeal!=='string'||!HEX.test(checkpoint.proofSeal))
    fail();
  const expect=seal(secret,checkpoint);
  if(!timingSafeEqual(Buffer.from(expect,'hex'),
    Buffer.from(checkpoint.proofSeal,'hex')))fail();
}
function output(plan,checkpoint,state,phaseAttempted){
  const completed=checkpoint?.phaseIndex===PHASES.length-1;
  return Object.freeze({
    visibility:'PRIVATE_ONLY',readOnly:true,
    version:1,state,phaseAttempted:phaseAttempted??null,
    checkpoint:checkpoint??null,
    replaySeal:plan.replaySeal,
    quarantineRecords:plan.counts.total,
    quarantineEvents:plan.counts.events,
    quarantineInvitations:plan.counts.invitations,
    quarantineChannels:plan.counts.channels,
    offlineReviewDrillCompleted:completed,
    actualExternalTransactionCompleted:false,
    checkpointIsOnlyLocalHmacConsistencyEvidence:true,
    allRecordsRemainQuarantined:true,
    realDiscordSourceAuthenticated:false,
    signedOwnerHistoryAttestedHere:false,
    externalDurableCheckpointPersisted:false,
    productionTransactionCommitted:false,
    actualRecoveryOrRollbackPerformed:false,
    realEventImports:0,realEventDeletes:0,
    oldReservationsReleased:0,
    staffApprovalsCommitted:0,
    externalCallsOrWritesPerformed:0,
    freeSlotsCertified:false,safeToActivate:false
  });
}
function runKingsAtomicImportRehearsal({
  sourceInput,checkpoint=null,fault=null
}={}){
  try{
    if(!plain(sourceInput)||
      typeof sourceInput.reviewSecret!=='string'||
      Buffer.byteLength(sourceInput.reviewSecret,'utf8')<32||
      Buffer.byteLength(sourceInput.reviewSecret,'utf8')>4096)fail();
    if(fault!==null&&(!plain(fault)||
      !keys(fault,['phase','at'])||
      !PHASES.includes(fault.phase)||!FAULTS.includes(fault.at)))fail();
    // Always re-run full source validation. A previously returned checkpoint
    // never substitutes for source/actual owner highwater verification.
    const plan=createKingsStagedImportQuarantinePlan(sourceInput);
    assertPlan(plan);
    if(checkpoint!==null)validateCheckpoint(checkpoint,
      sourceInput.reviewSecret,plan);
    if(checkpoint!==null&&checkpoint.phaseIndex===PHASES.length-1){
      if(fault!==null)fail();
      return output(plan,checkpoint,'ALREADY_FINISHED_OFFLINE_ONLY',null);
    }
    const i=checkpoint===null?0:checkpoint.phaseIndex+1;
    const phase=PHASES[i];
    if(fault!==null&&fault.phase!==phase)fail();
    if(fault!==null&&fault.at==='BEFORE_PHASE')
      return output(plan,checkpoint,'INTERRUPTED_BEFORE_PHASE',phase);
    // This phase does NOT write an Event record or a durable checkpoint.
    // After-phase interruption is ambiguous: return OLD checkpoint and
    // require a deterministic replay rather than assuming completion.
    if(fault!==null&&fault.at==='AFTER_PHASE_BEFORE_CHECKPOINT')
      return output(plan,checkpoint,
        'INTERRUPTED_AFTER_PHASE_REPLAY_REQUIRED',phase);
    const next=checkpointFor(sourceInput.reviewSecret,plan,i);
    return output(plan,next,
      i===PHASES.length-1?'OFFLINE_DRILL_FINISHED_NO_IMPORT':
        'OFFLINE_CHECKPOINT_STAGED',phase);
  }catch{fail();}
}
module.exports={runKingsAtomicImportRehearsal};
