'use strict';
// Manual GitHub Actions operator entrypoint. Never accepts private Event
// evidence as workflow_dispatch input and never logs data or identities.
const fs=require('node:fs');
const path=require('node:path');
const {decryptEventState,encryptEventState}=require('./event-leadership-state');
const {hasAuthorizedActor,applyManualReview}=
  require('./event-operations-manual-review-state');
const STATE=path.join(__dirname,'data/event-leadership-report-state.json');
function run({env=process.env,read=fs.readFileSync,write=fs.writeFileSync,
  nowMs=Date.now()}={}){
  // GitHub owns actor/ref/event; a private allowlist must be explicitly
  // configured by an authorised repository owner. No list = no writes.
  if(!hasAuthorizedActor({
    actor:env.GITHUB_ACTOR,
    triggeringActor:env.GITHUB_TRIGGERING_ACTOR,
    allowlist:env.KINGS_EVENT_REVIEW_OPERATORS,
    eventName:env.GITHUB_EVENT_NAME,ref:env.GITHUB_REF
  }))throw Error('Kings Event Operations review is not authorised');
  const key=String(env.DRIVER_STATE_KEY||'');
  const raw=JSON.parse(read(STATE,'utf8'));
  // This workflow cannot silently migrate an old plaintext repository file.
  if(raw?.encrypted!==true)throw Error('Kings Event Operations encrypted state required');
  const state=decryptEventState(raw,key);
  const next=applyManualReview({
    state,scope:env.INPUT_SCOPE,code:env.INPUT_CODE,
    month:env.INPUT_MONTH==='UNDATED'?null:
      env.INPUT_SCOPE==='worklist'?null:env.INPUT_MONTH,
    action:env.INPUT_ACTION,actor:env.GITHUB_ACTOR,
    evidenceKind:env.INPUT_EVIDENCE_KIND||'NONE',
    confirmation:env.INPUT_CONFIRMATION||'',nowMs
  });
  // No separate storage, no changes to source observations or Events.
  write(STATE,JSON.stringify(encryptEventState(next,key),null,2)+'\n','utf8');
  return Object.freeze({status:'MANUAL_REVIEW_JOURNAL_SAVED',
    readOnlySource:true,originalStaffDecisionsVerified:false,
    freeSlotsCertified:false,bookingsCreated:0,discordWrites:0});
}
function main(){
  try{
    const result=run();
    console.log('Kings Event Operations: '+result.status);
    return result;
  }catch{
    // Fixed public-safe result: do not reveal access list, actor, source
    // counts, secrets, crypto errors, private channel or input contents.
    console.error('Kings Event Operations: MANUAL_REVIEW_NOT_SAVED');
    process.exitCode=1;
    return Object.freeze({status:'MANUAL_REVIEW_NOT_SAVED',
      freeSlotsCertified:false,bookingsCreated:0,discordWrites:0});
  }
}
if(require.main===module)main();
module.exports={run,main};
