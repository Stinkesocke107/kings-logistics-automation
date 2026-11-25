'use strict';
// PRIVATE OFFLINE ONLY: bind a real encrypted local staged-import SQLite
// checkpoint to a CALLER-INJECTED separate monotonic compare-and-swap witness.
// This code does NOT deploy, authenticate, operate or certify independent
// custody of that witness; an in-process mock is never an offsite backup.
// A DB-vs-anchor mismatch denies all reads/writes; recovery is manual.
const {isDeepStrictEqual}=require('node:util');
const ERROR='Kings staged quarantine independent witness mismatch or unavailable.';
const DIGEST=/^[a-f0-9]{64}$/;
const ID=/^[1-9]\d{16,21}$/;
function fail(){throw new Error(ERROR);}
function exact(x,names){return x!==null&&typeof x==='object'&&
  !Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&
  Object.keys(x).sort().join('\0')===names.slice().sort().join('\0');}
function scopeOf(x){
  if(!exact(x,['guildId','forumId'])||
    typeof x.guildId!=='string'||!ID.test(x.guildId)||
    typeof x.forumId!=='string'||!ID.test(x.forumId))fail();
  return Object.freeze({...x});
}
function normalize(x){
  if(x===null)return null;
  if(!exact(x,['revision','digest'])||
    !Number.isSafeInteger(x.revision)||x.revision<1||x.revision>4||
    typeof x.digest!=='string'||!DIGEST.test(x.digest))fail();
  return Object.freeze({revision:x.revision,digest:x.digest});
}
function localCheckpoint(x){
  if(x===null)return null;
  if(!exact(x,['revision','digest','independentExternalAnchorAlreadyWritten'])||
    x.independentExternalAnchorAlreadyWritten!==false)fail();
  return normalize({revision:x.revision,digest:x.digest});
}
function createKingsExternallyWitnessedStagedImportStore({
  scope,store,anchor
}={}){
  const expected=scopeOf(scope);
  if(!store||!anchor||typeof store.read!=='function'||
    typeof store.advance!=='function'||
    typeof store.checkpointDigest!=='function'||
    typeof anchor.load!=='function'||
    typeof anchor.compareAndAdvance!=='function')fail();
  async function checkedPair(sourceInput){
    if(!sourceInput||!sourceInput.current||
      sourceInput.current.guildId!==expected.guildId||
      sourceInput.current.currentChannelId!==expected.forumId)fail();
    let local,remote;
    try{
      local=localCheckpoint(await store.checkpointDigest({sourceInput}));
      remote=normalize(await anchor.load({scope:expected}));
    }catch{fail();}
    if(!isDeepStrictEqual(local,remote))fail();
    return Object.freeze({local,remote});
  }
  async function read({sourceInput}={}){
    try{
      const before=await checkedPair(sourceInput);
      const value=await store.read({sourceInput});
      const after=await checkedPair(sourceInput);
      if(!isDeepStrictEqual(before.local,after.local)||
        value.safeToActivate!==false||value.freeSlotsCertified!==false||
        value.actualDiscordOrGitHubApiCalls!==0||
        value.realEventImportsOrDeletes!==0||
        value.revision!==(before.local?.revision??0))fail();
      return Object.freeze({
        visibility:'PRIVATE_ONLY',readOnly:true,
        state:value.state,stage:value.stage,
        revision:value.revision,
        quarantinedRecordCount:value.quarantinedRecordCount,
        exactLocalAndInjectedWitnessCheckpointMatched:true,
        actualOffsiteWitnessIndependentlyAuthenticated:false,
        originalDiscordHistoryIndependentlyVerified:false,
        anyProductionEventMigrated:false,
        actualSourceChangesMade:0,
        freeSlotsCertified:false,safeToActivate:false
      });
    }catch{fail();}
  }
  async function advance({sourceInput,expectedRevision}={}){
    try{
      if(!Number.isSafeInteger(expectedRevision)||
        expectedRevision<0||expectedRevision>4)fail();
      const {local,remote}=await checkedPair(sourceInput);
      // Store does the actual SQLite BEGIN IMMEDIATE / COMMIT.
      // An injected witness may fail after local commit. NEVER compensate by
      // deleting/rolling back the committed SQLite record automatically.
      const outcome=await store.advance({sourceInput,expectedRevision});
      if(outcome.safeToActivate!==false||outcome.freeSlotsCertified!==false||
        outcome.realEventImportsOrDeletes!==0||
        outcome.actualDiscordOrGitHubApiCalls!==0)fail();
      if(outcome.state==='ALREADY_STAGED_SAME_PHASE_REPLAY'||
        outcome.state==='OFFLINE_DRILL_ALREADY_COMPLETE'){
        const after=await checkedPair(sourceInput);
        if(!isDeepStrictEqual(after.local,local)||
          outcome.revision!==(local?.revision??0))fail();
        return Object.freeze({
          state:outcome.state,revision:outcome.revision,
          exactLocalAndInjectedWitnessCheckpointMatched:true,
          actualOffsiteWitnessIndependentlyAuthenticated:false,
          durableLocalQuarantineStepCommittedNow:false,
          productionImportCommitted:false,
          oldReservationsReleased:0,staffApprovalsCommitted:0,
          freeSlotsCertified:false,safeToActivate:false
        });
      }
      if(outcome.state!=='STAGED_OFFLINE_PHASE_COMMITTED'||
        outcome.revision!==(local?.revision??0)+1)fail();
      const next=localCheckpoint(await store.checkpointDigest({sourceInput}));
      if(!next||next.revision!==(local?.revision??0)+1)fail();
      // This remote CAS MUST be implemented by a separate authenticated
      // linearizable durable authority in any eventual real system.
      let advanced;
      try{advanced=await anchor.compareAndAdvance({
        scope:expected,expected:remote,next
      });}catch{fail();}
      if(advanced!==true)fail();
      const after=await checkedPair(sourceInput);
      if(!isDeepStrictEqual(after.local,next))fail();
      return Object.freeze({
        state:'WITNESSED_OFFLINE_SQLITE_STEP',
        revision:next.revision,
        exactLocalAndInjectedWitnessCheckpointMatched:true,
        actualOffsiteWitnessIndependentlyAuthenticated:false,
        durableLocalQuarantineStepCommittedNow:true,
        productionImportCommitted:false,
        oldReservationsReleased:0,staffApprovalsCommitted:0,
        freeSlotsCertified:false,safeToActivate:false
      });
    }catch{fail();}
  }
  async function inspect({sourceInput}={}){
    try{
      const {local}=await checkedPair(sourceInput);
      return Object.freeze({
        visibility:'PRIVATE_ONLY',readOnly:true,
        state:'LOCAL_AND_INJECTED_WITNESS_MATCH',
        revision:local?.revision??0,
        exactLocalAndInjectedWitnessCheckpointMatched:true,
        physicalWitnessIndependenceVerified:false,
        originalDiscordSourceAuthenticated:false,
        independentlyStoredOffsiteBackupVerified:false,
        realRecoveryPerformed:false,
        certifiedProductionReady:false,
        freeSlotsCertified:false,safeToActivate:false
      });
    }catch{fail();}
  }
  return Object.freeze({inspect,read,advance});
}
module.exports={createKingsExternallyWitnessedStagedImportStore};
