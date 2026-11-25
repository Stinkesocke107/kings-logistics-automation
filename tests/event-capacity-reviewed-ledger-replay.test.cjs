'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createEmptyLedger,applyDecision,validateLedger,sealLedger,unsealLedger}
  =require('../event-capacity-decision-ledger');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const AT='2027-03-20T12:00:00Z';
const KEY='synthetic-secret-for-offline-reviewed-ledger-000000';
const SUBMITTER='111111111111111111',REVIEWER='222222222222222222';
const ORIGINAL='777777777777777777',CONFIRM='888888888888888888';
const actor={id:REVIEWER,source:'trusted-server-gateway',
  verifiedRoles:['Event Leadership']};
const proof=()=>({
  version:1,evidenceMessageId:ORIGINAL,reviewMessageId:CONFIRM,
  submitterId:SUBMITTER,reviewerId:REVIEWER,
  sourceRunId:'45502949674',sourceAttempt:1,
  sourceDigest:'a'.repeat(64),verifiedAt:'2027-03-20T11:59:00Z'
});
const begin=()=>createEmptyLedger(SCOPE,AT);
function command(ledger,override={}){
  return {
    ref:'event:20270',action:'classification',value:'Partner Convoy',
    evidenceRef:'discord:'+ORIGINAL+':review:'+CONFIRM,
    reviewProof:proof(),expectedRevision:ledger.revision,...override
  };
}
test('Two-person proof persists encrypted in private history without exposing plaintext',()=>{
  const s=applyDecision(begin(),command(begin()),actor,AT);
  assert.equal(s.revision,1);
  assert.deepEqual(s.history[0].reviewProof,proof());
  assert.equal(s.entries['event:20270'].approved,true);
  const envelope=sealLedger(s,KEY);
  const text=JSON.stringify(envelope);
  for(const x of [ORIGINAL,CONFIRM,REVIEWER,SUBMITTER,'event:20270']){
    assert.equal(text.includes(x),false);
  }
  const recovered=unsealLedger(envelope,KEY,SCOPE);
  assert.deepEqual(recovered,s);
});
test('A repeated Discord evidence ID is rejected after a new GitHub runner recovers revision',()=>{
  const first=applyDecision(begin(),command(begin()),actor,AT);
  const recovered=unsealLedger(sealLedger(first,KEY),KEY,SCOPE);
  assert.throws(()=>applyDecision(recovered,command(recovered),actor,AT));
  assert.throws(()=>applyDecision(recovered,command(recovered,{
    reviewProof:{...proof(),reviewMessageId:'999999999999999999'},
    evidenceRef:'discord:'+ORIGINAL+':review:999999999999999999'
  }),{...actor,id:'999999999999999999'},AT));
});
test('A reviewer message may not be reused for a different event or submission',()=>{
  const first=applyDecision(begin(),command(begin()),actor,AT);
  const different={...proof(),evidenceMessageId:'999999999999999999'};
  assert.throws(()=>applyDecision(first,command(first,{
    ref:'event:20271',reviewProof:different,
    evidenceRef:'discord:999999999999999999:review:'+CONFIRM
  }),actor,AT));
});
test('Proof must bind currently checked reviewer, source run, exact time and version',()=>{
  const s=begin();
  for(const bad of [
    {reviewerId:SUBMITTER},{sourceDigest:'invalid'},
    {sourceAttempt:0},{sourceRunId:'0'},
    {verifiedAt:'2027-03-20T10:00:00Z'},
    {verifiedAt:'2027-03-20T12:30:00Z'},
    {submitterId:REVIEWER},
    {evidenceMessageId:CONFIRM},
    {reviewMessageId:ORIGINAL},
    {version:2}
  ])assert.throws(()=>applyDecision(s,
    command(s,{reviewProof:{...proof(),...bad}}),actor,AT));
});
test('Forged Discord evidence identifier without review proof is refused',()=>{
  const s=begin();
  assert.throws(()=>applyDecision(s,
    command(s,{reviewProof:undefined}),actor,AT));
  assert.throws(()=>applyDecision(s,
    command(s,{evidenceRef:'discord:'+ORIGINAL+':review:123456789012345678'}),
    actor,AT));
  assert.throws(()=>applyDecision(s,
    command(s,{evidenceRef:'legacy-private-ref'}),actor,AT));
});
test('Ledger validation detects duplicated proof after editing a stored audit history',()=>{
  const first=applyDecision(begin(),command(begin()),actor,AT);
  const modified=structuredClone(first);
  modified.revision=2;
  modified.history.push({...structuredClone(modified.history[0]),
    revision:2});
  assert.throws(()=>validateLedger(modified,SCOPE));
});
test('Only separately authorized Event Management or CEO can grant an exception',()=>{
  const first=applyDecision(begin(),command(begin()),actor,AT);
  assert.throws(()=>applyDecision(first,{
    ref:'event:20270',action:'exception',value:true,
    expectedRevision:1,evidenceRef:'synthetic-exception'
  },actor,AT));
  const manager={id:'333333333333333333',
    source:'trusted-server-gateway',verifiedRoles:['Event Management']};
  const second=applyDecision(first,{
    ref:'event:20270',action:'exception',value:true,
    expectedRevision:1,evidenceRef:'independently-approved-exception'
  },manager,AT);
  assert.equal(second.history.length,2);
  assert.equal(second.history[0].reviewProof.evidenceMessageId,ORIGINAL);
  assert.equal(second.history[1].reviewProof,undefined);
});
test('Legacy evidence remains readable but is never incorrectly upgraded to reviewed proof',()=>{
  const first=applyDecision(begin(),{
    ref:'event:20270',action:'classification',value:'Partner Convoy',
    expectedRevision:0,evidenceRef:'legacy-private-ref'
  },actor,AT);
  assert.equal(first.history[0].reviewProof,undefined);
  assert.equal(validateLedger(first,SCOPE),first);
});
