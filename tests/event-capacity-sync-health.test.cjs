'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fresh,apply}=require('../event-capacity-sync-health');
const t=['2027-03-20T12:00:00Z','2027-03-20T12:15:00Z',
  '2027-03-20T12:30:00Z','2027-03-20T12:45:00Z'];
function step(s,result,at=t[s.revision],extra={}){
  return apply(s,{expectedRevision:s.revision,result,at,...extra});
}
const ok={sourceVerified:true,reconciled:true,anchorVerified:true,mode:'Imported'};
test('A failed check immediately marks source outdated and forbids confident free quota',()=>{
  const first=step(fresh(),'Success',t[0],ok);
  assert.equal(first.canShowVerifiedAvailability,true);
  const failed=step(first.state,'Failure',t[1],{errorType:'Source Unavailable'});
  assert.equal(failed.state.status,'Data Outdated');
  assert.equal(failed.state.lastSuccessfulSyncAt,'2027-03-20T12:00:00.000Z');
  assert.equal(failed.canShowVerifiedAvailability,false);
  assert.equal(failed.noticeProposals.length,0);
});
test('Two consecutive failed cycles propose only one private escalation',()=>{
  const first=step(fresh(),'Failure',t[0],{errorType:'Source Unavailable'});
  const second=step(first.state,'Failure',t[1],{errorType:'Source Conflict'});
  assert.equal(second.state.failures,2);
  assert.equal(second.noticeProposals.length,1);
  assert.equal(second.noticeProposals[0].kind,'sync-multiple-failures');
  assert.deepEqual(second.noticeProposals[0].targets,
    ['Development','Event Management','CEO']);
  const third=step(second.state,'Failure',t[2],{errorType:'Unknown'});
  assert.equal(third.noticeProposals.length,0);
});
test('Integrity failure proposes immediate private critical notification',()=>{
  const r=step(fresh(),'Failure',t[0],{errorType:'Integrity Failure'});
  assert.equal(r.state.status,'Data Outdated');
  assert.equal(r.noticeProposals[0].kind,'sync-critical');
  assert.equal(r.state.alertStage,'Critical');
  const next=step(r.state,'Failure',t[1],{errorType:'Integrity Failure'});
  assert.equal(next.noticeProposals.length,0);
});
test('Only reconciled, verified and independently anchored fresh source can recover',()=>{
  const incident=step(fresh(),'Failure',t[0],{errorType:'Storage Failure'}).state;
  for(const key of ['sourceVerified','reconciled','anchorVerified']){
    const evidence={...ok,[key]:false};
    assert.throws(()=>step(incident,'Success',t[1],evidence));
  }
  const recovered=step(incident,'Success',t[1],{...ok,mode:'NoChange'});
  assert.equal(recovered.state.status,'Healthy');
  assert.equal(recovered.noticeProposals.length,1);
  assert.equal(recovered.noticeProposals[0].kind,'sync-recovered');
  assert.equal(step(recovered.state,'Success',t[2],ok).noticeProposals.length,0);
});
test('After recovery, a new incident uses a new deduplicated escalation key',()=>{
  let s=step(fresh(),'Failure',t[0],{errorType:'Source Unavailable'}).state;
  s=step(s,'Failure',t[1],{errorType:'Unknown'}).state;
  const prior=s.incident;
  s=step(s,'Success',t[2],ok).state;
  const next=step(s,'Failure',t[3],{errorType:'Source Conflict'});
  assert.equal(next.state.incident,prior+1);
  assert.equal(next.state.failures,1);
  assert.equal(next.noticeProposals.length,0);
});
test('Revision races, unknown failures and backwards clocks fail closed',()=>{
  let s=step(fresh(),'Failure',t[0],{errorType:'Unknown'}).state;
  assert.throws(()=>apply(s,{expectedRevision:0,result:'Failure',
    errorType:'Unknown',at:t[1]}));
  assert.throws(()=>step(s,'Failure',t[1],{errorType:'Unexpected custom error'}));
  assert.throws(()=>step(s,'Success',t[1],{sourceVerified:true}));
  s=step(s,'Failure',t[1],{errorType:'Source Conflict'}).state;
  assert.throws(()=>step(s,'Failure',t[0],{errorType:'Source Conflict'}));
});
