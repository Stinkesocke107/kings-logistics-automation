'use strict';
// Protected Kings Capacity ingestion boundary (prototype; no live callers).
// The host MUST authenticate its GitHub API and private store clients.
// This file NEVER downloads artifacts, writes state or makes outbound calls.
// All three source readers are injected by a trusted private service.
const {timestamp}=require('./event-capacity-core');
const {validateLedger}=require('./event-capacity-decision-ledger');
const {signPrivateSnapshot}=require('./event-capacity-snapshot-attestation');
const {parsePrivateConvoyArchive}=require('./event-capacity-private-archive');
const ERROR='Kings Event Capacity protected import was not authorized or verified.';
const REPO='Stinkesocke107/kings-logistics-automation';
const WORKFLOW='.github/workflows/convoy-checker.yml';
const ARTIFACT='kings-convoy-reports';
const ID=/^[1-9]\d{5,19}$/;
const SHA=/^[a-f0-9]{40}$/;
const MAX_ARCHIVE=25*1024*1024;
function fail(){throw new Error(ERROR);}
function at(value){return typeof value==='string'?timestamp(value):null;}
function sameID(a,b){return String(a||'')===String(b||'');}
function assertRun(run,{nowMs,expectedRepo=REPO,expectedWorkflow=WORKFLOW,requestedRunId}={}){
  if(!run||typeof run!=='object'||Array.isArray(run)||!Number.isFinite(nowMs)||
     !ID.test(String(run.id||''))||
     (requestedRunId&&!sameID(run.id,requestedRunId))||
     !['Kings Convoy Checker','Kings Convoy Checker (live)'].includes(run.name)||
     run.path!==expectedWorkflow||
     run.repository?.full_name!==expectedRepo||
     run.head_repository?.full_name!==expectedRepo||
     run.head_branch!=='main'||run.status!=='completed'||run.conclusion!=='success'||
     !SHA.test(String(run.head_sha||''))||
     !Number.isSafeInteger(run.run_attempt)||run.run_attempt<1||run.run_attempt>1000)fail();
  // Only scheduled production runs and positively approved live dispatches.
  // A push to main may be a deliberate dry-run; never assume it is live.
  if(run.event!=='schedule'&&!(run.event==='workflow_dispatch'&&run.inputs?.mode==='live'))fail();
  const started=at(run.run_started_at),completed=at(run.updated_at);
  if(started===null||completed===null||started>completed||completed>nowMs+60000||
     nowMs-completed>30*60000||completed-started>20*60000)fail();
  return Object.freeze({id:String(run.id),attempt:run.run_attempt,sha:run.head_sha});
}
function assertArtifact(artifacts,runInfo,{expectedRepo=REPO}={}){
  if(!Array.isArray(artifacts)||artifacts.length>100)fail();
  const matching=artifacts.filter(x=>x?.name===ARTIFACT);
  if(matching.length!==1)fail();
  const artifact=matching[0];
  if(!artifact||typeof artifact!=='object'||artifact.expired!==false||
     !ID.test(String(artifact.id||''))||
     !Number.isSafeInteger(artifact.size_in_bytes)||artifact.size_in_bytes<1||
     artifact.size_in_bytes>MAX_ARCHIVE||
     !sameID(artifact.workflow_run?.id,runInfo.id)||
     artifact.workflow_run?.head_branch!=='main'||
     artifact.workflow_run?.head_sha!==runInfo.sha)fail();
  // Archive must not be followed from an untrusted URL supplied in source data.
  // The trusted loader requests the exact artifact ID through its own API.
  return Object.freeze({id:String(artifact.id),bytes:artifact.size_in_bytes});
}
function assertCursor(cursor,runInfo,ledgerRevision){
  if(!Number.isSafeInteger(ledgerRevision)||ledgerRevision<0)fail();
  if(cursor===null)return {runId:runInfo.id,attempt:runInfo.attempt,ledgerRevision};
  if(!cursor||typeof cursor!=='object'||!ID.test(String(cursor.runId||''))||
     !Number.isSafeInteger(cursor.attempt)||cursor.attempt<1||
     !Number.isSafeInteger(cursor.ledgerRevision)||cursor.ledgerRevision<0)fail();
  const incoming=BigInt(runInfo.id),prior=BigInt(cursor.runId);
  if(incoming<prior||ledgerRevision<cursor.ledgerRevision)fail();
  if(incoming===prior&&(runInfo.attempt<cursor.attempt||
     runInfo.attempt===cursor.attempt&&ledgerRevision<=cursor.ledgerRevision))fail();
  return {runId:runInfo.id,attempt:runInfo.attempt,ledgerRevision};
}
async function importPrivateConvoySnapshot({
  scope,nowMs=Date.now(),runId,secret,expectedRepo=REPO,
  getRun,getArtifacts,readArtifact,loadLedger,readCursor,commitSnapshot,
  authenticatedService=false
}={}){
  // Reject direct CLI/user/web input; callbacks are from a trusted isolated
  // service identity. Boolean alone does NOT authenticate that service.
  if(authenticatedService!==true||typeof expectedRepo!=='string'||
     expectedRepo!==REPO||!ID.test(String(runId||''))||
     !Number.isFinite(nowMs)||
     [getRun,getArtifacts,readArtifact,loadLedger,readCursor,commitSnapshot]
       .some(x=>typeof x!=='function'))fail();
  let run,artifacts,contents,ledger,cursor;
  try{
    run=assertRun(await getRun({repository:REPO,runId:String(runId)}),
      {nowMs,expectedRepo:REPO,requestedRunId:runId});
    artifacts=assertArtifact(await getArtifacts({repository:REPO,runId:run.id}),run);
    // The protected loader must enforce ZIP bomb limits, exact two JSON
    // members, no symlinks/path traversal and a combined output-size cap.
    // No raw report, ZIP bytes or secrets may be logged or stored in public Git.
    const archive=await readArtifact({repository:REPO,runId:run.id,
      runAttempt:run.attempt,artifactId:artifacts.id,maxArchiveBytes:MAX_ARCHIVE,
      requiredFiles:['convoy-check-results.json','convoy-overview.json']});
    if(!Buffer.isBuffer(archive)||archive.length!==artifacts.bytes)fail();
    contents=parsePrivateConvoyArchive(archive);
    ledger=await loadLedger({scope});
    cursor=await readCursor({scope});
  }catch{fail();}
  if(!contents||typeof contents!=='object'||!contents.report||!contents.overview||
     !ledger||!scope||typeof scope!=='object')fail();
  try{validateLedger(ledger,scope);}catch{fail();}
  const advance=assertCursor(cursor,run,ledger.revision);
  const snapshot={
    report:contents.report,overview:contents.overview,ledger,
    integrityVerified:true
  };
  let attestation;
  try{
    attestation=signPrivateSnapshot(snapshot,{
      scope,secret,runId:run.id,attempt:run.attempt,nowMs,trustedProducer:true
    });
  }catch{fail();}
  const protectedSnapshot={...snapshot,attestation};
  const metadata={runId:run.id,attempt:run.attempt,
    ledgerRevision:ledger.revision,sourceVerified:true};
  let saved;
  try{
    // Required atomic durable DB transaction: persist the encrypted snapshot
    // AND its monotonic cursor together. Never advance a cursor alone: a
    // crash after cursor-only advancement would make the source unrecoverable.
    // This trusted callback must verify expected CAS state, encrypt private
    // content, commit both values and return true only after durable success.
    // No GitHub artifact, public CI log, or Discord message receives the data.
    saved=await commitSnapshot({scope,expected:cursor,next:advance,
      snapshot:protectedSnapshot,metadata});
  }catch{fail();}
  if(saved!==true)fail();
  // Returned snapshot is ephemeral and MUST remain in protected process
  // memory / encrypted service transport, not be posted to Discord.
  return {snapshot:protectedSnapshot,metadata};
}
module.exports={assertRun,assertArtifact,assertCursor,importPrivateConvoySnapshot};
