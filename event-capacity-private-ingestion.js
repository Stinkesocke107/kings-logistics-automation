'use strict';
// Orchestrates the PRIVATE Kings Event Capacity import boundary.
// NO production callers, no scheduled jobs, no Discord messages or Git writes.
// Inject independently authenticated services from the protected host only.
const {isDeepStrictEqual}=require('node:util');
const {validateLedger}=require('./event-capacity-decision-ledger');
const {importPrivateConvoySnapshot}=require('./event-capacity-private-import');
const ERROR='Kings Event Capacity protected ingestion cannot be verified.';
const REPO='Stinkesocke107/kings-logistics-automation';
const SNOWFLAKE=/^\d{17,22}$/;
function fail(){throw new Error(ERROR);}
function checkedScope(scope){
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
    !SNOWFLAKE.test(String(scope.guildId||''))||
    !SNOWFLAKE.test(String(scope.forumId||'')))fail();
  return {guildId:String(scope.guildId),forumId:String(scope.forumId)};
}
function createPrivateCapacityIngestion({
  scope,githubReader,anchoredStore,loadLedger,authorizeService,
  snapshotSecret,nowMs=()=>Date.now()
}={}){
  const checked=checkedScope(scope);
  if(!githubReader||!anchoredStore||
    ['getLatestScheduledRun','getRun','getArtifacts','readArtifact']
      .some(k=>typeof githubReader[k]!=='function')||
    ['readCursor','readLatest','commitSnapshot','verifyCheckpoint']
      .some(k=>typeof anchoredStore[k]!=='function')||
    typeof loadLedger!=='function'||typeof authorizeService!=='function'||
    typeof snapshotSecret!=='string'||Buffer.byteLength(snapshotSecret,'utf8')<32||
    typeof nowMs!=='function')fail();
  async function runLatestScheduled(){
    let now,verified;
    try{
      now=nowMs();
      if(!Number.isFinite(now))fail();
      // Auth must be derived by protected host independently of the caller,
      // e.g. workload identity; a boolean or user-input role claim is never
      // sufficient to activate an import.
      verified=await authorizeService({
        action:'capacity-import-scheduled',repository:REPO,scope:checked,
        atMs:now
      });
      if(!verified||verified.verified!==true||
        verified.service!=='kings-event-capacity-private-importer'||
        !isDeepStrictEqual(verified.scope,checked)||
        !Number.isSafeInteger(verified.expiresAtMs)||
        verified.expiresAtMs<now||verified.expiresAtMs>now+60000)fail();
    }catch{fail();}
    let candidate,prior,ledger;
    try{
      candidate=await githubReader.getLatestScheduledRun({
        repository:REPO,nowMs:now
      });
      if(!candidate||!(/^[1-9]\d{5,19}$/).test(String(candidate.runId||''))||
        !Number.isSafeInteger(candidate.attempt)||candidate.attempt<1)fail();
      // Even discovering an unchanged source requires a valid external
      // encrypted snapshot checkpoint. A rollback cannot be a "NoChange".
      prior=await anchoredStore.readCursor();
      ledger=await loadLedger({scope:checked});
      validateLedger(ledger,checked);
    }catch{fail();}
    // Idempotent periodic poll: no unnecessary ZIP fetch or duplicate writes.
    // Ledger revisions changed since last import must NOT be dropped.
    if(prior&&prior.runId===candidate.runId&&
      prior.attempt===candidate.attempt&&
      prior.ledgerRevision===ledger.revision){
      let latest;
      try{latest=await anchoredStore.readLatest();}catch{fail();}
      if(!latest||latest.metadata?.runId!==candidate.runId||
        latest.metadata?.attempt!==candidate.attempt||
        latest.metadata?.ledgerRevision!==ledger.revision)fail();
      return Object.freeze({state:'NoChange',runId:candidate.runId,
        attempt:candidate.attempt,ledgerRevision:ledger.revision});
    }
    // importPrivateConvoySnapshot revalidates the exact run, artifact, ZIP,
    // scoped ledger, attestation, monotonic cursor and CAS-backed commit.
    // Keep the complete signed snapshot in protected process memory only.
    try{
      await importPrivateConvoySnapshot({
        scope:checked,nowMs:now,runId:candidate.runId,
        secret:snapshotSecret,authenticatedService:true,
        getRun:args=>githubReader.getRun(args),
        getArtifacts:args=>githubReader.getArtifacts(args),
        readArtifact:args=>githubReader.readArtifact(args),
        loadLedger:args=>loadLedger(args),
        readCursor:()=>anchoredStore.readCursor(),
        commitSnapshot:args=>anchoredStore.commitSnapshot(args)
      });
      // A SQLite write is not success until the independent highwater
      // authority agrees with its exact encrypted digest.
      const latest=await anchoredStore.readLatest();
      if(!latest||latest.metadata?.runId!==candidate.runId||
        latest.metadata?.attempt!==candidate.attempt||
        latest.metadata.sourceVerified!==true)fail();
      return Object.freeze({state:'Imported',runId:candidate.runId,
        attempt:candidate.attempt,
        ledgerRevision:latest.metadata.ledgerRevision});
    }catch{fail();}
  }
  return Object.freeze({runLatestScheduled});
}
module.exports={createPrivateCapacityIngestion};
