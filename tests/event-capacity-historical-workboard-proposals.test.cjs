'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {empty,apply}=require('../event-capacity-workboard');
const {proposeHistoricalWorkboardTasks}
  =require('../event-capacity-historical-workboard-proposals');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW='2027-03-20T12:00:00Z';
const KEY='capacity-crosscheck:'+'a'.repeat(40);
const REASON='current-accepted-event-without-signed-history';
const URGENT_REASON='signed-history-status-conflict';
function item(key=KEY,reason=REASON){
  return {taskKey:key,reason,
    priority:reason===URGENT_REASON?'Urgent':'Review',
    humanReviewRequired:true,autoResolved:false,capacityChanged:false};
}
function report(items=[item()]){
  return {version:1,visibility:'PRIVATE_ONLY',readOnly:true,
    signedJournalIntegrityVerified:true,currentSourceStructureChecked:true,
    sourceProvenanceTrustedByThisPureFunction:false,
    historicalCoverageCertified:false,freeSlotsCertified:false,
    calendarMutated:false,staffDecisionsCommitted:false,
    counts:{newCrosscheckIssues:items.length},issues:items};
}
function board(){return empty(SCOPE,NOW);}
const staff={id:'111111111111111111',source:'trusted-server-gateway',
  verifiedRoles:['Event Coordination'],verifiedDepartments:[]};
test('Historical discrepancy becomes only a private task proposal, not a task write',()=>{
  const original=board(),view=proposeHistoricalWorkboardTasks({
    audit:report(),workboard:original,scope:SCOPE});
  assert.equal(view.proposedCount,1);
  assert.equal(view.staffTasksCreated,0);
  assert.equal(view.commandsReadyToExecute,false);
  assert.equal(view.humanAuthorizationRequired,true);
  assert.equal(original.revision,0);
  assert.deepEqual(Object.keys(original.tasks),[]);
  assert.equal(view.proposals[0].title,'Verify historical acceptance evidence');
  assert.equal(view.proposals[0].taskId,KEY);
  assert.equal(view.proposals[0].required,false);
  assert.equal(view.freeSlotsCertified,false);
  assert.equal(JSON.stringify(view).includes('event:10'),false);
});
test('Human-approved workboard creation is subsequently recognized without duplication',()=>{
  let workboard=board();
  const first=proposeHistoricalWorkboardTasks({audit:report(),workboard,scope:SCOPE});
  const suggested=first.proposals[0];
  workboard=apply(workboard,{action:'create-task',expectedRevision:0,
    taskId:suggested.taskId,eventRef:suggested.eventRef,
    code:suggested.code,title:suggested.title,required:suggested.required},
    staff,NOW);
  const second=proposeHistoricalWorkboardTasks({
    audit:report(),workboard,scope:SCOPE});
  assert.equal(second.proposedCount,0);
  assert.equal(second.alreadyTrackedCount,1);
  assert.equal(second.alreadyTracked[0].status,'Open');
  assert.equal(workboard.revision,1);
});
test('Done work is never silently reopened on repeated audit evidence',()=>{
  let workboard=board();
  workboard=apply(workboard,{action:'create-task',expectedRevision:0,
    taskId:KEY,eventRef:KEY,code:REASON,title:'Review historical acceptance'},
    staff,NOW);
  workboard=apply(workboard,{action:'finish-task',taskId:KEY,
    expectedRevision:1,evidenceRef:'private-review-evidence'},staff,NOW);
  const view=proposeHistoricalWorkboardTasks({
    audit:report(),workboard,scope:SCOPE});
  assert.equal(view.proposedCount,0);
  assert.equal(view.alreadyTracked[0].status,'Done');
  assert.equal(view.staffTasksReopened,0);
});
test('Urgent conflict recommends Leadership review but cannot grant leadership rights',()=>{
  const urgent=item('capacity-crosscheck:'+'b'.repeat(40),URGENT_REASON);
  const view=proposeHistoricalWorkboardTasks({
    audit:report([urgent]),workboard:board(),scope:SCOPE});
  assert.equal(view.proposals[0].priority,'Urgent');
  assert.equal(view.proposals[0].leadershipReviewRecommended,true);
  assert.equal(view.proposals[0].requiresVerifiedHumanActor,true);
  assert.equal(view.staffTasksCreated,0);
});
test('Multiple distinct disagreements produce deterministic private deduped proposals',()=>{
  const second=item('capacity-crosscheck:'+'c'.repeat(40),
    'signed-history-departure-conflict');
  const input=report([item(),second]);
  const a=proposeHistoricalWorkboardTasks({audit:input,workboard:board(),scope:SCOPE});
  const b=proposeHistoricalWorkboardTasks({audit:input,workboard:board(),scope:SCOPE});
  assert.deepEqual(a.proposals,b.proposals);
  assert.equal(a.proposedCount,2);
});
test('Duplicate keys and forged HMAC task identities fail closed',()=>{
  const x=item();
  for(const items of [
    [x,x],
    [{...x,taskKey:'event:10'}],
    [{...x,taskKey:KEY+'bad'}],
    [{...x,reason:'delete-all-staff-roles'}],
    [{...x,priority:'Urgent'}],
    [{...x,autoResolved:true}]
  ])assert.throws(()=>proposeHistoricalWorkboardTasks({
    audit:report(items),workboard:board(),scope:SCOPE}));
});
test('Forged completeness, missing source validation or wrong workboard scope fails',()=>{
  const other={...SCOPE,forumId:'999999999999999999'};
  for(const audit of [
    {...report(),historicalCoverageCertified:true},
    {...report(),sourceProvenanceTrustedByThisPureFunction:true},
    {...report(),signedJournalIntegrityVerified:false},
    {...report(),counts:{newCrosscheckIssues:2}}
  ])assert.throws(()=>proposeHistoricalWorkboardTasks({
    audit,workboard:board(),scope:SCOPE}));
  assert.throws(()=>proposeHistoricalWorkboardTasks({
    audit:report(),workboard:board(),scope:other}));
});
test('Colliding task ID or malformed existing workboard never causes hidden rewrite',()=>{
  let old=board();
  old=apply(old,{action:'create-task',expectedRevision:0,
    taskId:KEY,eventRef:'event:fake',code:'wrong',
    title:'Existing different task'},staff,NOW);
  assert.throws(()=>proposeHistoricalWorkboardTasks({
    audit:report(),workboard:old,scope:SCOPE}));
  assert.equal(old.tasks[KEY].code,'wrong');
});
