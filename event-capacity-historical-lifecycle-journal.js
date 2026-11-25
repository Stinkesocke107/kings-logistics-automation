'use strict';
// OFFLINE, private historical lifecycle evidence journal for Kings Convoys.
// A human-reviewed owner signature binds EACH historical transition to its
// evidence fingerprint; neither signature nor snapshot proves that the
// historical inventory is complete. No GitHub/Discord/production I/O.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const DOMAIN='kings-capacity-historical-lifecycle-v1';
const ERROR='Kings Event Capacity historical lifecycle proof invalid or incomplete.';
const SNOWFLAKE=/^\d{17,22}$/;
const REF=/^(?:event:[A-Za-z0-9_-]{1,64}|thread:\d{17,22})$/;
const DIGEST=/^[0-9a-f]{64}$/;
const SIG=/^[A-Za-z0-9+/]{86}==$/;
const TYPES=new Set(['Kings Convoy','Partner Convoy','External Convoy']);
const ACTIONS=new Set(['accept','cancel','reschedule','complete']);
const STATES={accept:'Accepted',cancel:'Cancelled',reschedule:'Rescheduled',complete:'Completed'};
const MAX_ENTRIES=24000;
function fail(){throw new Error(ERROR);}
function exactKeys(value,names){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype||
    Object.keys(value).sort().join(',')!==names.slice().sort().join(','))fail();
}
function scopeOf(scope){
  exactKeys(scope,['guildId','forumId']);
  if(!SNOWFLAKE.test(scope.guildId)||!SNOWFLAKE.test(scope.forumId))fail();
  return {guildId:scope.guildId,forumId:scope.forumId};
}
function utc(value){
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||
    !Number.isFinite(Date.parse(value))||
    new Date(value).toISOString()!==value)fail();
  return value;
}
function keyOf(input,publicOnly=true){
  try{
    const key=publicOnly?crypto.createPublicKey(input):crypto.createPrivateKey(input);
    if(key.asymmetricKeyType!=='ed25519')fail();
    return key;
  }catch{fail();}
}
function hash(data){
  return crypto.createHash('sha256').update(data).digest('hex');
}
function genesis(scope,createdAt){
  return hash(DOMAIN+'\0genesis\0'+scope.guildId+'\0'+scope.forumId+'\0'+utc(createdAt));
}
function createEmptyHistoricalJournal({scope,at}={}){
  const s=scopeOf(scope),t=utc(at);
  return {version:1,scope:s,revision:0,tip:genesis(s,t),
    createdAt:t,events:{},history:[],
    historicalCoverageCertified:false,freeSlotsCertified:false};
}
function signedMessage(payload){
  return Buffer.from(DOMAIN+'\0'+JSON.stringify(payload),'utf8');
}
function validatePayload(payload,scope,rev,tip,current){
  exactKeys(payload,[
    'version','scope','revision','previousTip','ref','action',
    'category','departureAtUtc','evidenceDigest','archiveDigest',
    'reviewedAt','priorStatus'
  ]);
  const s=scopeOf(payload.scope);
  if(payload.version!==1||!isDeepStrictEqual(s,scope)||
    payload.revision!==rev+1||payload.previousTip!==tip||
    !REF.test(payload.ref)||!ACTIONS.has(payload.action)||
    !TYPES.has(payload.category)||!DIGEST.test(payload.evidenceDigest)||
    !DIGEST.test(payload.archiveDigest))fail();
  utc(payload.departureAtUtc);utc(payload.reviewedAt);
  const prior=current||null;
  if(payload.priorStatus!==(prior?.status??null))fail();
  if(payload.action==='accept'){
    if(prior!==null)fail();
  }else{
    if(prior===null||
      !['Accepted','Rescheduled'].includes(prior.status)||
      prior.category!==payload.category)fail();
    if(payload.action==='reschedule'&&
      prior.departureAtUtc===payload.departureAtUtc)fail();
    if(payload.action!=='reschedule'&&
      prior.departureAtUtc!==payload.departureAtUtc)fail();
  }
  return s;
}
function calcTip(old,payload,signature){
  return hash(DOMAIN+'\0entry\0'+old+'\0'+
    JSON.stringify(payload)+'\0'+signature);
}
function replay(journal,scope,ownerPublicKey){
  exactKeys(journal,[
    'version','scope','revision','tip','createdAt','events','history',
    'historicalCoverageCertified','freeSlotsCertified'
  ]);
  const sc=scopeOf(scope);
  if(journal.version!==1||
    !isDeepStrictEqual(scopeOf(journal.scope),sc)||
    !Number.isSafeInteger(journal.revision)||journal.revision<0||
    !DIGEST.test(journal.tip)||!Array.isArray(journal.history)||
    journal.history.length>MAX_ENTRIES||
    journal.history.length!==journal.revision||
    journal.historicalCoverageCertified!==false||
    journal.freeSlotsCertified!==false)fail();
  utc(journal.createdAt);
  if(!journal.events||typeof journal.events!=='object'||
    Array.isArray(journal.events)||
    Object.getPrototypeOf(journal.events)!==Object.prototype)fail();
  const pub=keyOf(ownerPublicKey),events={};
  const usedEvidence=new Set();
  let tip=genesis(sc,journal.createdAt),lastReviewed=Date.parse(journal.createdAt);
  for(let i=0;i<journal.history.length;i++){
    const entry=journal.history[i];
    exactKeys(entry,['payload','signature','entryTip']);
    if(!SIG.test(entry.signature)||!DIGEST.test(entry.entryTip))fail();
    const payload=entry.payload;
    validatePayload(payload,sc,i,tip,events[payload?.ref]);
    const reviewed=Date.parse(payload.reviewedAt);
    if(reviewed<lastReviewed||
      usedEvidence.has(payload.evidenceDigest))fail();
    usedEvidence.add(payload.evidenceDigest);
    const signature=Buffer.from(entry.signature,'base64');
    if(signature.length!==64||
      signature.toString('base64')!==entry.signature||
      !crypto.verify(null,signedMessage(payload),pub,signature))fail();
    tip=calcTip(tip,payload,entry.signature);
    if(tip!==entry.entryTip)fail();
    events[payload.ref]={
      status:STATES[payload.action],category:payload.category,
      departureAtUtc:payload.departureAtUtc,revision:i+1
    };
    lastReviewed=reviewed;
  }
  if(journal.tip!==tip||
    !isDeepStrictEqual(journal.events,events))fail();
  return {scope:sc,tip,events,usedEvidence};
}
function verifyHistoricalJournal(journal,{scope,ownerPublicKey}={}){
  replay(journal,scope,ownerPublicKey);
  return Object.freeze({verified:true,revision:journal.revision,
    historicalCoverageCertified:false,freeSlotsCertified:false});
}
function prepareHistoricalTransition({
  journal,scope,ownerPublicKey,expectedRevision,
  ref,action,category,departureAtUtc,
  evidenceDigest,archiveDigest,reviewedAt
}={}){
  const state=replay(journal,scope,ownerPublicKey);
  if(!Number.isSafeInteger(expectedRevision)||
    expectedRevision!==journal.revision||
    !REF.test(ref)||!ACTIONS.has(action)||
    !TYPES.has(category)||!DIGEST.test(evidenceDigest)||
    !DIGEST.test(archiveDigest)||state.usedEvidence.has(evidenceDigest))fail();
  const payload={
    version:1,scope:state.scope,revision:journal.revision+1,
    previousTip:state.tip,ref,action,category,
    departureAtUtc:utc(departureAtUtc),
    evidenceDigest,archiveDigest,reviewedAt:utc(reviewedAt),
    priorStatus:state.events[ref]?.status??null
  };
  validatePayload(payload,state.scope,journal.revision,
    state.tip,state.events[ref]);
  if(Date.parse(payload.reviewedAt)<Date.parse(journal.createdAt))fail();
  return payload;
}
function signHistoricalTransitionOffline({payload,ownerPrivateKey}={}){
  // NEVER supply the owner PRIVATE key to GitHub Actions, public repo or
  // bot secrets. Sign this exact candidate in an independent offline tool.
  if(!payload||typeof payload!=='object')fail();
  const signature=crypto.sign(null,signedMessage(payload),
    keyOf(ownerPrivateKey,false)).toString('base64');
  return {payload:structuredClone(payload),signature};
}
function appendOwnerSignedHistoricalTransition({
  journal,scope,ownerPublicKey,receipt,expectedRevision
}={}){
  if(!receipt||typeof receipt!=='object')fail();
  exactKeys(receipt,['payload','signature']);
  const {payload,signature}=receipt;
  const state=replay(journal,scope,ownerPublicKey);
  if(journal.revision>=MAX_ENTRIES||
    expectedRevision!==journal.revision||!SIG.test(signature)||
    state.usedEvidence.has(payload?.evidenceDigest))fail();
  validatePayload(payload,state.scope,journal.revision,
    state.tip,state.events[payload.ref]);
  if(Date.parse(payload.reviewedAt)<Date.parse(journal.createdAt)||
    journal.history.length&&
      Date.parse(payload.reviewedAt)<
      Date.parse(journal.history.at(-1).payload.reviewedAt))fail();
  const bytes=Buffer.from(signature,'base64');
  if(bytes.length!==64||bytes.toString('base64')!==signature||
    !crypto.verify(null,signedMessage(payload),
      keyOf(ownerPublicKey),bytes))fail();
  const result=structuredClone(journal);
  const entryTip=calcTip(state.tip,payload,signature);
  result.history.push({payload:structuredClone(payload),
    signature,entryTip});
  result.events[payload.ref]={
    status:STATES[payload.action],category:payload.category,
    departureAtUtc:payload.departureAtUtc,
    revision:journal.revision+1
  };
  result.tip=entryTip;result.revision++;
  replay(result,scope,ownerPublicKey);
  return result;
}
module.exports={
  createEmptyHistoricalJournal,verifyHistoricalJournal,
  prepareHistoricalTransition,signHistoricalTransitionOffline,
  appendOwnerSignedHistoricalTransition
};
