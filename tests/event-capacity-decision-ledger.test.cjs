'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  createEmptyLedger,applyDecision,privateDecisions,sealLedger,unsealLedger,validateLedger
}=require('../event-capacity-decision-ledger');

const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const OTHER={guildId:'222222222222222222',forumId:'333333333333333333'};
const KEY='test-only-high-entropy-mock-secret-not-for-production-00001';
const WRONG='test-only-high-entropy-mock-secret-not-for-production-00002';
const AT='2027-03-20T12:00:00Z';
const STAFF={id:'00000000000001',verifiedRoles:['Event Coordination'],source:'trusted-server-gateway'};
const LEAD={id:'00000000000002',verifiedRoles:['Event Leadership'],source:'trusted-server-gateway'};
const MANAGEMENT={id:'00000000000003',verifiedRoles:['Event Management'],source:'trusted-server-gateway'};
const CEO={id:'00000000000004',verifiedRoles:['CEO'],source:'trusted-server-gateway'};
const unauth={id:'00000000000005',verifiedRoles:[],source:'trusted-server-gateway'};
const cmd=(s,action,value,other={})=>({
  ref:'event:1234',action,value,evidenceRef:'private-proof-ref',
  expectedRevision:s.revision,...other
});
const begin=()=>createEmptyLedger(SCOPE,AT);
const classify=(state,type='Partner Convoy',actor=STAFF)=>
  applyDecision(state,cmd(state,'classification',type),actor,AT);

test('Create scoped private empty ledger',()=>{
  const s=begin();
  assert.equal(s.revision,0);
  assert.deepEqual(s.scope,SCOPE);
  assert.equal(Object.keys(s.entries).length,0);
  assert.equal(s.history.length,0);
});
test('Classify only with verified Event Coordination/Leadership/CEO role',()=>{
  const s=classify(begin());
  assert.equal(s.entries['event:1234'].eventType,'Partner Convoy');
  assert.equal(s.entries['event:1234'].approvedByRole,'Event Coordination');
  assert.equal(s.history[0].actorId,STAFF.id);
  assert.equal(s.history[0].revision,1);
});
test('Reject unauthenticated, wrongly scoped or incomplete actor metadata',()=>{
  const s=begin();
  assert.throws(()=>applyDecision(s,cmd(s,'classification','Partner Convoy'),unauth,AT));
  assert.throws(()=>applyDecision(s,cmd(s,'classification','Partner Convoy'),
    {...STAFF,source:'untrusted-user-payload'},AT));
  assert.throws(()=>applyDecision(s,cmd(s,'classification','Partner Convoy'),
    {...STAFF,verifiedRoles:['External event']},AT));
  assert.throws(()=>applyDecision(s,cmd(s,'classification','Partner Convoy'),
    {...STAFF,id:''},AT));
});
test('Reject Event Coordination attempts to approve a quota exception',()=>{
  const s=classify(begin());
  assert.throws(()=>applyDecision(s,cmd(s,'exception',true),STAFF,AT));
  assert.throws(()=>applyDecision(s,cmd(s,'exception',true),LEAD,AT));
});
test('Allow Event Management and CEO exception, independently of classification approver',()=>{
  let s=classify(begin());
  s=applyDecision(s,cmd(s,'exception',true),MANAGEMENT,AT);
  assert.equal(s.entries['event:1234'].exception.approvedByRole,'Event Management');
  let second=classify(begin(),'External Convoy');
  second=applyDecision(second,cmd(second,'exception',true),CEO,AT);
  assert.equal(privateDecisions(second)['event:1234'].exception.approvedByRole,'CEO');
});
test('Kings-owned event never holds external quota exception',()=>{
  let s=classify(begin(),'Kings Convoy');
  assert.throws(()=>applyDecision(s,cmd(s,'exception',true),CEO,AT));
  s=classify(s,'Partner Convoy');
  s=applyDecision(s,cmd(s,'exception',true),CEO,AT);
  s=classify(s,'Kings Convoy');
  assert.equal(s.entries['event:1234'].exception,null);
});
test('Revoke an exception independently without deleting classification or audit',()=>{
  let s=classify(begin());
  s=applyDecision(s,cmd(s,'exception',true),MANAGEMENT,AT);
  s=applyDecision(s,cmd(s,'revoke-exception',null),CEO,AT);
  assert.equal(s.entries['event:1234'].exception,null);
  assert.equal(s.entries['event:1234'].approved,true);
  assert.equal(s.history.length,3);
});
test('Reject stale revision to guard concurrent lost updates',()=>{
  const s=classify(begin());
  assert.throws(()=>applyDecision(s,{...cmd(s,'end','2027-03-20T19:00:00Z'),expectedRevision:0},STAFF,AT));
});
test('Reject invalid identities, event types, evidence, time and commands',()=>{
  const s=begin();
  assert.throws(()=>applyDecision(s,cmd(s,'classification','Unrelated Kind'),STAFF,AT));
  assert.throws(()=>applyDecision(s,cmd(s,'classification','Partner Convoy',{ref:'__proto__'}),STAFF,AT));
  assert.throws(()=>applyDecision(s,cmd(s,'classification','Partner Convoy',{evidenceRef:''}),STAFF,AT));
  assert.throws(()=>applyDecision(s,cmd(s,'exception',true),CEO,'not-a-time'));
  assert.throws(()=>applyDecision(s,cmd(s,'unknown-action',true),CEO,AT));
});
test('Departure, meeting and end are separate verified and individually revocable',()=>{
  let s=classify(begin());
  s=applyDecision(s,cmd(s,'departure','2027-03-20T16:00:00Z'),STAFF,AT);
  s=applyDecision(s,cmd(s,'meeting','2027-03-20T15:00:00Z'),STAFF,AT);
  s=applyDecision(s,cmd(s,'end','2027-03-20T19:00:00Z'),LEAD,AT);
  let d=privateDecisions(s)['event:1234'];
  assert.equal(d.departureVerified,true);
  assert.equal(d.meetingVerified,true);
  assert.equal(d.endVerified,true);
  s=applyDecision(s,cmd(s,'revoke-end',null),STAFF,AT);
  d=privateDecisions(s)['event:1234'];
  assert.equal(d.endVerified,false);
  assert.equal(d.plannedEndAtUtc,null);
});
test('Rescheduling preserves allocation history and invalidates old meeting/end proofs',()=>{
  let s=classify(begin());
  s=applyDecision(s,cmd(s,'departure','2027-03-20T16:00:00Z'),STAFF,AT);
  s=applyDecision(s,cmd(s,'meeting','2027-03-20T15:00:00Z'),STAFF,AT);
  s=applyDecision(s,cmd(s,'end','2027-03-20T19:00:00Z'),STAFF,AT);
  s=applyDecision(s,cmd(s,'reschedule','2027-03-21T16:00:00Z'),STAFF,AT);
  const decision=privateDecisions(s)['event:1234'];
  assert.equal(decision.status,'Rescheduled');
  assert.equal(decision.rescheduleApproved,true);
  assert.equal(decision.departureAtUtc,'2027-03-21T16:00:00.000Z');
  assert.equal(decision.meetingVerified,false);
  assert.equal(decision.endVerified,false);
  assert.equal(s.entries['event:1234'].rescheduleHistory[0].previousDepartureAtUtc,'2027-03-20T16:00:00.000Z');
  assert.equal(s.entries['event:1234'].rescheduleHistory[0].newDepartureAtUtc,'2027-03-21T16:00:00.000Z');
});
test('Reschedule requires a verified original departure and a different new time',()=>{
  let s=classify(begin());
  assert.throws(()=>applyDecision(s,cmd(s,'reschedule','2027-03-21T16:00:00Z'),STAFF,AT));
  s=applyDecision(s,cmd(s,'departure','2027-03-20T16:00:00Z'),STAFF,AT);
  assert.throws(()=>applyDecision(s,cmd(s,'reschedule','2027-03-20T16:00:00Z'),STAFF,AT));
});
test('Revoking classification removes active exception but preserves encrypted history',()=>{
  let s=classify(begin());
  s=applyDecision(s,cmd(s,'exception',true),CEO,AT);
  s=applyDecision(s,cmd(s,'revoke-classification',null),LEAD,AT);
  assert.equal(Object.keys(privateDecisions(s)).length,0);
  assert.equal(s.history.length,3);
  assert.equal(s.entries['event:1234'].exception,null);
});
test('State changes are pure: original state is not mutated',()=>{
  const before=begin();
  const original=JSON.stringify(before);
  const next=classify(before);
  assert.equal(JSON.stringify(before),original);
  assert.notEqual(next,before);
});
test('AES-256-GCM seals private decisions and audit IDs, with randomized IV',()=>{
  let s=classify(begin());
  s=applyDecision(s,cmd(s,'exception',true),CEO,AT);
  const a=sealLedger(s,KEY);
  const b=sealLedger(s,KEY);
  assert.equal(a.encrypted,true);
  assert.equal(a.algorithm,'aes-256-gcm');
  assert.notEqual(a.iv,b.iv);
  assert.notEqual(a.ciphertext,b.ciphertext);
  assert.deepEqual(unsealLedger(a,KEY,SCOPE),s);
  for(const sensitive of [STAFF.id,'private-proof-ref','event:1234']){
    assert.equal(JSON.stringify(a).includes(sensitive),false);
  }
});
test('Ledger cannot decrypt with incorrect key, cross-guild scope, or tampered content',()=>{
  const s=sealLedger(classify(begin()),KEY);
  assert.throws(()=>unsealLedger(s,WRONG,SCOPE));
  assert.throws(()=>unsealLedger(s,KEY,OTHER));
  assert.throws(()=>unsealLedger({...s,ciphertext:s.ciphertext.slice(0,-4)+'aaaa'},KEY,SCOPE));
  assert.throws(()=>unsealLedger({...s,algorithm:'none'},KEY,SCOPE));
  assert.throws(()=>unsealLedger({...s,leakedPersonal:'x'},KEY,SCOPE));
});
test('Fail closed on missing key, plaintext state or malformed authenticated container',()=>{
  const state=classify(begin());
  assert.throws(()=>sealLedger(state,''));
  assert.throws(()=>sealLedger(state,'weak'));
  assert.throws(()=>unsealLedger(state,KEY,SCOPE));
  assert.throws(()=>unsealLedger({encrypted:false},KEY,SCOPE));
});
test('Private decision materialization is restricted to currently approved classifications',()=>{
  let s=begin();
  s=applyDecision(s,cmd(s,'end','2027-03-20T19:00:00Z'),STAFF,AT);
  assert.equal(Object.keys(privateDecisions(s)).length,0);
  s=classify(s);
  assert.equal(privateDecisions(s)['event:1234'].endVerified,true);
  s=applyDecision(s,cmd(s,'revoke-classification',null),STAFF,AT);
  assert.equal(Object.keys(privateDecisions(s)).length,0);
});
test('Reject malformed state audits or unknown scope before encryption',()=>{
  const s=classify(begin());
  assert.throws(()=>validateLedger({...s,revision:22}));
  assert.throws(()=>validateLedger({...s,history:[]}));
  assert.throws(()=>validateLedger({...s,scope:OTHER},SCOPE));
  assert.throws(()=>sealLedger({...s,history:[]},KEY));
});

test('Changing Partner to External invalidates prior monthly/daily exception approval',()=>{
  let s=classify(begin(),'Partner Convoy');
  s=applyDecision(s,cmd(s,'exception',true),CEO,AT);
  assert.equal(s.entries['event:1234'].exception.approvedByRole,'CEO');
  s=classify(s,'External Convoy');
  assert.equal(s.entries['event:1234'].exception,null);
});
test('Rescheduling invalidates old quota exception, requiring fresh management approval',()=>{
  let s=classify(begin(),'Partner Convoy');
  s=applyDecision(s,cmd(s,'departure','2027-03-20T16:00:00Z'),STAFF,AT);
  s=applyDecision(s,cmd(s,'exception',true),CEO,AT);
  s=applyDecision(s,cmd(s,'reschedule','2027-03-21T16:00:00Z'),STAFF,AT);
  assert.equal(s.entries['event:1234'].exception,null);
  assert.equal(s.entries['event:1234'].rescheduleHistory.length,1);
});
test('An accepted departure cannot be silently changed without reschedule history',()=>{
  let s=classify(begin(),'Partner Convoy');
  s=applyDecision(s,cmd(s,'departure','2027-03-20T16:00:00Z'),STAFF,AT);
  assert.throws(()=>applyDecision(s,cmd(s,'departure','2027-03-21T16:00:00Z'),STAFF,AT));
  assert.equal(s.entries['event:1234'].departureAtUtc,'2027-03-20T16:00:00.000Z');
  assert.equal(s.entries['event:1234'].rescheduleHistory.length,0);
});
test('Revoking departure clears linked reschedule status and stale exceptions',()=>{
  let s=classify(begin(),'Partner Convoy');
  s=applyDecision(s,cmd(s,'departure','2027-03-20T16:00:00Z'),STAFF,AT);
  s=applyDecision(s,cmd(s,'exception',true),CEO,AT);
  s=applyDecision(s,cmd(s,'revoke-departure',null),LEAD,AT);
  assert.equal(s.entries['event:1234'].departureVerified,false);
  assert.equal(s.entries['event:1234'].exception,null);
  assert.equal(s.entries['event:1234'].status,null);
});
