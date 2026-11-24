'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {empty,apply,attention}=require('../event-capacity-workboard');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const T0='2027-03-20T10:00:00Z';
const actor=(roles=['Event Coordination'],departments=[])=>({
  source:'trusted-server-gateway',id:'111111111111111111',verifiedRoles:roles,
  verifiedDepartments:departments
});
const coord=actor(),leader=actor(['Event Leadership']),dept=actor([],['Creative']);
function start(){return empty(SCOPE,T0);}
function action(s,what,user=coord,at=T0){
  return apply(s,{expectedRevision:s.revision,...what},user,at);
}
function task(s=start(),o={}){return action(s,{action:'create-task',taskId:'task1',
  eventRef:'event:12345',code:'route',title:'Route confirmed',...o},o.required?leader:coord);}
test('Tasks are private scoped immutable revisions; duplicate event checklist item rejected',()=>{
  const original=start(),state=task(original);
  assert.equal(original.revision,0);
  assert.equal(state.revision,1);
  assert.equal(state.tasks.task1.status,'Open');
  assert.throws(()=>action(state,{action:'create-task',taskId:'task2',
    eventRef:'event:12345',code:'route',title:'Duplicate route'}));
  assert.throws(()=>apply(state,{action:'claim-task',taskId:'task1',expectedRevision:0},coord,T0));
  assert.throws(()=>action(state,{action:'create-task',taskId:'new',
    eventRef:'event:999',code:'approval',title:'Approve',required:true},coord));
});
test('Claim is exclusive and completion requires evidence',()=>{
  let s=task();
  s=action(s,{action:'claim-task',taskId:'task1'});
  assert.equal(s.tasks.task1.status,'In Progress');
  assert.throws(()=>action(s,{action:'claim-task',taskId:'task1'}));
  assert.throws(()=>action(s,{action:'finish-task',taskId:'task1'}));
  s=action(s,{action:'finish-task',taskId:'task1',evidenceRef:'verified-private-evidence'});
  assert.equal(s.tasks.task1.status,'Done');
  assert.throws(()=>action(s,{action:'finish-task',taskId:'task1',evidenceRef:'again'}));
});
test('Leadership may reassign but coordinator may not',()=>{
  let s=task();
  assert.throws(()=>action(s,{action:'assign-task',taskId:'task1',assignee:'222222222222222222'}));
  s=action(s,{action:'assign-task',taskId:'task1',assignee:'222222222222222222'},leader);
  assert.equal(s.tasks.task1.assignee,'222222222222222222');
  assert.throws(()=>action(s,{action:'finish-task',taskId:'task1',evidenceRef:'proof'}));
  s=action(s,{action:'finish-task',taskId:'task1',evidenceRef:'proof'},leader);
  assert.equal(s.tasks.task1.status,'Done');
});
test('On Hold pauses standard inactivity and only proposes deadline reminder',()=>{
  let s=task();
  s=action(s,{action:'hold-task',taskId:'task1',reason:'Organizer Response',followUpDays:3});
  assert.equal(attention(s,'2027-03-22T11:00:00Z').length,0);
  assert.deepEqual(attention(s,'2027-03-23T10:00:00Z').map(x=>x.kind),['follow-up-due']);
  assert.equal(s.tasks.task1.status,'On Hold');
});
test('24h and 48h notice proposals are stable and never mutate workboard',()=>{
  const s=task();
  assert.deepEqual(attention(s,'2027-03-22T11:00:00Z').map(x=>x.kind),
    ['coordination-reminder','leadership-overview']);
  assert.equal(s.revision,1);
  assert.deepEqual(attention(s,'2027-03-22T12:00:00Z').map(x=>x.key),
    attention(s,'2027-03-22T11:00:00Z').map(x=>x.key));
});
test('Required N/A needs Leadership and auditable approval; optional may be marked N/A',()=>{
  let s=task(start(),{required:true});
  assert.throws(()=>action(s,{action:'mark-na',taskId:'task1',evidenceRef:'approval'},coord));
  s=action(s,{action:'mark-na',taskId:'task1',evidenceRef:'approval'},leader);
  assert.equal(s.tasks.task1.waiver.approvedByRole,'Event Leadership');
  assert.equal(s.tasks.task1.status,'Done');
  let o=task();
  o=action(o,{action:'mark-na',taskId:'task1',evidenceRef:'optional not needed'},coord);
  assert.equal(o.tasks.task1.proof,'optional-not-applicable');
});
test('Reopen on real recurrence keeps history but does not retain old completion proof',()=>{
  let s=task();
  s=action(s,{action:'finish-task',taskId:'task1',evidenceRef:'old-proof'});
  s=action(s,{action:'reopen-task',taskId:'task1',evidenceRef:'recurrence'});
  assert.equal(s.tasks.task1.status,'Reopened');
  assert.equal(s.tasks.task1.proof,null);
  assert.equal(s.history.length,3);
});
test('Department assistance is linked to one parent task, never duplicated',()=>{
  let s=task();
  s=action(s,{action:'request-department',taskId:'task1',requestId:'req1',department:'Creative'});
  assert.throws(()=>action(s,{action:'request-department',taskId:'task1',
    requestId:'req2',department:'Creative'}));
  assert.equal(s.tasks.task1.requestIds.length,1);
  s=action(s,{action:'respond-department',requestId:'req1',value:'Accepted'},dept);
  s=action(s,{action:'respond-department',requestId:'req1',value:'Completed',
    evidenceRef:'private-approved-banner-ref'},dept);
  assert.equal(s.requests.req1.status,'Completed');
  assert.equal(s.tasks.task1.status,'Open');
});
test('Unauthorized department responses fail, coordinator can withdraw pending request',()=>{
  let s=task();
  s=action(s,{action:'request-department',taskId:'task1',requestId:'req1',department:'Creative'});
  assert.throws(()=>action(s,{action:'respond-department',requestId:'req1',value:'Accepted'},coord));
  s=action(s,{action:'respond-department',requestId:'req1',value:'Withdrawn'},coord);
  assert.equal(s.requests.req1.status,'Withdrawn');
});
test('Department request inactivity proposals have stable dedupe keys',()=>{
  let s=task();
  s=action(s,{action:'request-department',taskId:'task1',requestId:'req1',department:'Creative'});
  const notices=attention(s,'2027-03-22T11:00:00Z');
  assert.ok(notices.some(x=>x.kind==='department-reminder'));
  assert.ok(notices.some(x=>x.kind==='department-leadership-overview'));
});
test('Malicious or unverified actors cannot change private tasks',()=>{
  const s=task();
  assert.throws(()=>action(s,{action:'finish-task',taskId:'task1',evidenceRef:'proof'},
    {...coord,source:'user-input'}));
  assert.throws(()=>action(s,{action:'create-task',taskId:'evil',
    eventRef:'event:other',code:'route',title:'malicious\nembed'}));
  assert.throws(()=>action(s,{action:'hold-task',taskId:'task1',
    reason:'fake-reason',followUpDays:3}));
});
