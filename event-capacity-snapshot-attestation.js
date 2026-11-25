'use strict';
// Kings Event Capacity: private ingestion attestation for a snapshot that a
// separately authenticated issuer ALREADY obtained from the Convoy workflow.
// HMAC protects this in-memory handoff from tampering. It does not authenticate
// GitHub/Discord by itself or replace private storage/replay rollback controls.
const crypto=require('node:crypto');
const {timestamp}=require('./event-capacity-core');
const {validateLedger}=require('./event-capacity-decision-ledger');
const {reconcileSourceInventory}=require('./event-capacity-source-reconcile');
const DOMAIN='kings-capacity-private-source-snapshot-v1';
const ERROR='Kings Event Capacity source snapshot could not be authenticated.';
const SHA=/^[a-f0-9]{64}$/;
const SCOPE=/^\d{17,22}$/;
const RUN=/^[1-9]\d{5,19}$/;
const MAX_AGE=30*60000;
function fail(){throw new Error(ERROR);}
function checkedScope(scope){
  if(!scope||typeof scope!=='object'||!SCOPE.test(String(scope.guildId||''))||
     !SCOPE.test(String(scope.forumId||'')))fail();
  return {guildId:String(scope.guildId),forumId:String(scope.forumId)};
}
function stable(value,depth=0){
  if(depth>40)fail();
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value)){
    if(value.length>50000)fail();
    return '['+value.map(x=>stable(x,depth+1)).join(',')+']';
  }
  if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype&&
     Object.getPrototypeOf(value)!==null)fail();
  const names=Object.keys(value).sort();
  if(names.length>10000)fail();
  return '{'+names.map(key=>{
    if(key==='__proto__'||key==='constructor'||key==='prototype'||key.length>256)fail();
    return JSON.stringify(key)+':'+stable(value[key],depth+1);
  }).join(',')+'}';
}
function digest(value){
  const raw=stable(value);
  if(Buffer.byteLength(raw,'utf8')>24*1024*1024)fail();
  return crypto.createHash('sha256').update(raw).digest('hex');
}
function keyBytes(secret){
  // A dedicated, randomly generated secret must be injected by the trusted
  // issuer and private consumer; never put it in GitHub artifacts or logs.
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32)fail();
  return crypto.createHash('sha256').update(DOMAIN+'\0').update(secret).digest();
}
function hmac(proof,secret){
  return crypto.createHmac('sha256',keyBytes(secret))
    .update(DOMAIN+'\0'+stable(proof)).digest('hex');
}
function inspectSource(snapshot,scope,nowMs){
  if(!snapshot||typeof snapshot!=='object'||!snapshot.report||!snapshot.overview||
     !snapshot.ledger||!Number.isFinite(nowMs))fail();
  const {report,overview,ledger}=snapshot;
  const expected=checkedScope(scope);
  try{validateLedger(ledger,expected);}catch{fail();}
  if(report.guildId!==expected.guildId||overview.guildId!==expected.guildId||
     report.forumId!==expected.forumId||overview.forumId!==expected.forumId)fail();
  const created=timestamp(report.generatedAt);
  const finalized=timestamp(report.finalization?.finalizedAt);
  const updated=timestamp(overview.generatedAt);
  if(created===null||finalized===null||updated===null||
     created>finalized||finalized>updated||
     updated-created>60*60000||updated>nowMs+60000||
     nowMs-updated>MAX_AGE)fail();
  const inventory=reconcileSourceInventory(report,overview);
  if(inventory.ok!==true)fail();
  return {expected,updated};
}
function signPrivateSnapshot(snapshot,{
  scope,secret,runId,attempt,nowMs=Date.now(),trustedProducer=false
}={}){
  // Production producer MUST verify GitHub run identity, successful completion,
  // private artifact provenance, authorization and secure transport itself.
  if(trustedProducer!==true||typeof runId!=='string'||!RUN.test(runId)||
     !Number.isSafeInteger(attempt)||attempt<1||attempt>1000)fail();
  const {expected,updated}=inspectSource(snapshot,scope,nowMs);
  if(nowMs+60000<updated)fail();
  const proof={
    version:1,domain:DOMAIN,scope:expected,
    runId,attempt,issuedAt:new Date(nowMs).toISOString(),
    reportSha256:digest(snapshot.report),
    overviewSha256:digest(snapshot.overview),
    ledgerSha256:digest(snapshot.ledger),
    ledgerRevision:snapshot.ledger.revision
  };
  return Object.freeze({...proof,mac:hmac(proof,secret)});
}
function verifyPrivateSnapshot(snapshot,{scope,secret,nowMs=Date.now()}={}){
  const proof=snapshot?.attestation;
  if(!proof||typeof proof!=='object'||Array.isArray(proof)||
     Object.keys(proof).sort().join(',')!==
       'attempt,domain,issuedAt,ledgerRevision,ledgerSha256,mac,overviewSha256,reportSha256,runId,scope,version'||
     proof.version!==1||proof.domain!==DOMAIN||
     typeof proof.runId!=='string'||!RUN.test(proof.runId)||
     !Number.isSafeInteger(proof.attempt)||proof.attempt<1||proof.attempt>1000||
     !Number.isSafeInteger(proof.ledgerRevision)||proof.ledgerRevision<0||
     !SHA.test(proof.mac)||!SHA.test(proof.reportSha256)||
     !SHA.test(proof.overviewSha256)||!SHA.test(proof.ledgerSha256))fail();
  const {expected}=inspectSource(snapshot,scope,nowMs);
  if(proof.scope?.guildId!==expected.guildId||proof.scope?.forumId!==expected.forumId)fail();
  const issued=timestamp(proof.issuedAt);
  if(issued===null||issued>nowMs+60000||nowMs-issued>MAX_AGE||
     issued<timestamp(snapshot.overview.generatedAt)-60000)fail();
  if(proof.ledgerRevision!==snapshot.ledger.revision||
     proof.reportSha256!==digest(snapshot.report)||
     proof.overviewSha256!==digest(snapshot.overview)||
     proof.ledgerSha256!==digest(snapshot.ledger))fail();
  const {mac,...unsigned}=proof;
  const expectedMac=hmac(unsigned,secret);
  if(!crypto.timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(expectedMac,'hex')))fail();
  // The producer's HMAC cannot attest independent origin or prevent rollback
  // without a separately protected, monotonically checked source-run cursor.
  return Object.freeze({verified:true,runId:proof.runId,attempt:proof.attempt});
}
module.exports={signPrivateSnapshot,verifyPrivateSnapshot};
