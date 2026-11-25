'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {empty,apply}=require('../event-capacity-workboard');
const {createStableHistoricalWorkboardReview}
  =require('../event-capacity-historical-review-workboard-bundle');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW='2027-03-20T12:00:00Z';
const KEY='capacity-crosscheck:'+'a'.repeat(40);
const REASON='current-accepted-event-without-signed-history';
const ISSUE={taskKey:KEY,reason:REASON,priority:'Review',
  humanReviewRequired:true,autoResolved:false,capacityChanged:false};
const STAFF={source:'trusted-server-gateway',id:'111111111111111111',
  verifiedRoles:['Event Coordination'],verifiedDepartments:[]};
function issueAudit(issues=[ISSUE]){
  return {version:1,visibility:'PRIVATE_ONLY',readOnly:true,
    signedJournalIntegrityVerified:true,
    currentSourceStructureChecked:true,
    sourceProvenanceTrustedByThisPureFunction:false,
    historicalCoverageCertified:false,freeSlotsCertified:false,
    calendarMutated:false,staffDecisionsCommitted:false,
    counts:{newCrosscheckIssues:issues.length},issues};
}
function kit(){
  let board=empty(SCOPE,NOW),reads=0;
  const getter=()=>{reads++;return structuredClone(board);};
  const wrapper=(changes={})=>createStableHistoricalWorkboardReview({
    readHistoricalCrosscheck:async()=>issueAudit(),
    readWorkboard:getter,scope:SCOPE,...changes
  });
  return {wrapper,reads:()=>reads,setBoard:value=>{board=value;},
    getBoard:()=>board};
}
test('One private historical discrepancy yields workboard proposal only',async()=>{
  const x=kit();
  const result=await x.wrapper().read();
  assert.equal(result.state,'Historical Review Workboard Snapshot');
  assert.equal(result.workboardRevisionRead,0);
  assert.equal(result.crosscheckIssueCount,1);
  assert.equal(result.proposedCount,1);
  assert.equal(result.proposals[0].taskId,KEY);
  assert.equal(result.staffTasksCreated,0);
  assert.equal(result.humanAuthorizationRequired,true);
  assert.equal(result.commandsReadyToExecute,false);
  assert.equal(result.currentSourceAuthenticatedByThisBundle,false);
  assert.equal(result.privateWorkboardStorageAuthenticatedByThisBundle,false);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(x.reads(),2);
});
test('Already tracked completed review is not duplicated or reopened',async()=>{
  const x=kit();
  let s=x.getBoard();
  s=apply(s,{action:'create-task',expectedRevision:0,
    taskId:KEY,eventRef:KEY,code:REASON,
    title:'Verify historical acceptance evidence'},STAFF,NOW);
  s=apply(s,{action:'finish-task',expectedRevision:1,taskId:KEY,
    evidenceRef:'private-verified-source-evidence'},STAFF,NOW);
  x.setBoard(s);
  const result=await x.wrapper().read();
  assert.equal(result.proposedCount,0);
  assert.equal(result.alreadyTrackedCount,1);
  assert.equal(result.alreadyTracked[0].status,'Done');
  assert.equal(result.staffTasksReopened,0);
  assert.equal(s.revision,2);
});
test('Concurrent Workboard revision change aborts rather than proposing stale work',async()=>{
  const x=kit(),first=structuredClone(x.getBoard());
  const changed=apply(first,{action:'create-task',expectedRevision:0,
    taskId:'otherTask',eventRef:'event:other',code:'route',
    title:'Existing operational work'},STAFF,NOW);
  let n=0;
  const builder=x.wrapper({readWorkboard:async()=>++n===1?first:changed});
  await assert.rejects(builder.read(),/task snapshot changed/);
});
test('Same revision with different task content is also a snapshot race',async()=>{
  const x=kit(),first=structuredClone(x.getBoard());
  const tampered=structuredClone(first);tampered.updatedAt='2027-03-20T12:00:01.000Z';
  let n=0;
  await assert.rejects(x.wrapper({
    readWorkboard:async()=>++n===1?first:tampered
  }).read());
});
test('Source review defects and forged complete-history claims are rejected',async()=>{
  const x=kit();
  const bad={...issueAudit(),historicalCoverageCertified:true};
  await assert.rejects(x.wrapper({
    readHistoricalCrosscheck:async()=>bad
  }).read());
  await assert.rejects(x.wrapper({
    readHistoricalCrosscheck:async()=>({version:1,issues:[]})
  }).read());
});
test('Invalid workboard scope and malformed actor-proxy state never create tasks',async()=>{
  const x=kit();
  await assert.rejects(x.wrapper({scope:{guildId:SCOPE.guildId,
    forumId:'999999999999999999'}}).read());
  await assert.rejects(x.wrapper({
    readWorkboard:async()=>({revision:1,tasks:{}})
  }).read());
  assert.equal(x.getBoard().revision,0);
});
test('Provider errors cannot leak private event text or tokens through bundle',async()=>{
  const x=kit();
  await assert.rejects(x.wrapper({
    readHistoricalCrosscheck:async()=>{
      throw new Error('secret-event-id=123456;token=private-secret');
    }
  }).read(),error=>{
    assert.doesNotMatch(String(error),/private-secret|secret-event-id/);
    return true;
  });
});
test('A clean zero-issue report produces no work without authorizing capacity',async()=>{
  const x=kit(),value=await x.wrapper({
    readHistoricalCrosscheck:async()=>issueAudit([])
  }).read();
  assert.equal(value.proposedCount,0);
  assert.equal(value.crosscheckIssueCount,0);
  assert.equal(value.freeSlotsCertified,false);
  assert.equal(value.historicalCoverageCertified,false);
  assert.equal(value.eventStatusesChanged,false);
});
