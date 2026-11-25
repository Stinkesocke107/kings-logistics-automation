'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {evaluate}=require('../event-capacity-core');
const {projectKingsStaffCalendarReview}
  =require('../event-capacity-staff-calendar-review');
const {empty,apply}=require('../event-capacity-workboard');
const {projectKingsEventOperationsWorkboardAudit:review,
  renderKingsEventOperationsWorkboardPreview:render}
  =require('../event-capacity-operations-workboard-audit');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const T0='2027-04-18T10:00:00Z',NOW='2027-04-20T12:00:00Z',
  BASE='2027-04-20T',REF='event:ops-123';
const coordinator={source:'trusted-server-gateway',id:'111111111111111111',
  verifiedRoles:['Event Coordination'],verifiedDepartments:[]};
const leader={...coordinator,id:'222222222222222222',
  verifiedRoles:['Event Leadership']};
const department={...coordinator,id:'333333333333333333',
  verifiedRoles:[],verifiedDepartments:['Creative']};
function event(patch={}){return {
  eventId:'ops-123',status:'Scheduled',statusVerified:true,
  eventType:'Partner Convoy',eventTypeVerified:true,
  departureAtUtc:BASE+'18:00:00Z',departureVerified:true,
  meetingAtUtc:BASE+'17:00:00Z',plannedEndAtUtc:BASE+'20:00:00Z',
  dataConflict:false,...patch};
}
function request(patch={}){return {
  category:'Partner Convoy',meetingAtUtc:BASE+'17:00:00.000Z',
  departureAtUtc:BASE+'18:00:00.000Z',
  plannedEndAtUtc:BASE+'20:00:00.000Z',...patch};
}
function calendar(){return projectKingsStaffCalendarReview({
  capacity:evaluate([],{dataFresh:false}),
  year:'2027',selectedMonth:'2027-04',
  historicalHoldsReports:[],historicalEvidenceReport:null
});}
function action(state,params,actor=coordinator,at=T0){
  return apply(state,{expectedRevision:state.revision,...params},actor,at);
}
function withTask(code='media',required=false){
  return action(empty(SCOPE,T0),{
    action:'create-task',eventRef:REF,taskId:'task-'+code,
    code,title:'Synthetic '+code,required
  },required?leader:coordinator);
}
function run(params={}){return review({
  calendar:calendar(),request:request(),event:event(),
  workboard:empty(SCOPE,T0),nowUtc:NOW,...params
});}
test('Empty Workboard yields redacted code-only checklist proposals; no task created',()=>{
  const r=run();
  assert.equal(r.visibility,'PRIVATE_ONLY');
  assert.equal(r.reviewStatus,'STAFF_REVIEW_REQUIRED');
  assert.equal(r.existingTaskCount,0);
  assert.equal(r.missingTaskSuggestions.length,7);
  assert.equal(r.expectedChecklistCount,7);
  assert.ok(r.missingTaskSuggestions.some(p=>p.code==='approval'&&p.required));
  assert.equal(r.createdTaskCount,0);
  assert.equal(r.remindersSent,0);
  assert.equal(r.staffDecisionsCommitted,0);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.callerWorkboardClaimAuthenticated,false);
});
test('Existing task suppresses only matching checklist code; private raw IDs not returned',()=>{
  const state=withTask();
  const r=run({workboard:state});
  assert.equal(r.existingTaskCount,1);
  assert.equal(r.missingTaskSuggestions.length,6);
  assert.equal(r.missingTaskSuggestions.some(p=>p.code==='media'),false);
  assert.equal(r.assignedTaskCount,0);
  assert.equal(r.doneTaskCount,0);
  assert.equal(JSON.stringify(r).includes('task-media'),false);
  assert.equal(JSON.stringify(r).includes('ops-123'),false);
});
test('Verified-looking existing Workboard state remains untrusted and never grants readiness',()=>{
  let state=withTask('approval',true);
  state=action(state,{action:'finish-task',taskId:'task-approval',
    evidenceRef:'synthetic-human-approved'},leader,'2027-04-18T11:00:00Z');
  const r=run({workboard:state});
  assert.equal(r.doneTaskCount,1);
  assert.equal(r.staffPermissionsVerified,false);
  assert.equal(r.originalDiscordSourceAuthenticated,false);
  assert.equal(r.existingTaskStatusProvenCurrent,false);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.createdTaskCount,0);
});
test('On Hold defers ordinary inactivity reminder and only projects follow-up',()=>{
  let state=withTask();
  state=action(state,{action:'hold-task',taskId:'task-media',
    reason:'Organizer Response',followUpDays:3});
  const before=run({workboard:state,nowUtc:NOW});
  assert.equal(before.heldTaskCount,1);
  assert.equal(before.reminderProposalCounts['coordination-reminder'],0);
  assert.equal(before.reminderProposalCounts['leadership-overview'],0);
  assert.equal(before.reminderProposalCounts['follow-up-due'],0);
  const after=run({workboard:state,nowUtc:'2027-04-22T12:00:00Z'});
  assert.equal(after.reminderProposalCounts['follow-up-due'],1);
  assert.equal(after.remindersSent,0);
});
test('Unclaimed 48-hour task reminders are stable summaries, never notifications',()=>{
  const state=withTask();
  const a=run({workboard:state}),b=run({workboard:state});
  assert.deepEqual(a.reminderProposalCounts,b.reminderProposalCounts);
  assert.equal(a.reminderProposalCounts['coordination-reminder'],1);
  assert.equal(a.reminderProposalCounts['leadership-overview'],1);
  assert.equal(a.remindersSent,0);
});
test('Department requests stay linked and pending; completing request does not finish task',()=>{
  let state=withTask();
  state=action(state,{action:'request-department',taskId:'task-media',
    requestId:'req-creatives',department:'Creative'});
  const r=run({workboard:state});
  assert.equal(r.linkedDepartmentRequestCount,1);
  assert.equal(r.departmentRequestsUnresolved,1);
  assert.equal(r.reminderProposalCounts['department-reminder'],1);
  assert.equal(r.reminderProposalCounts['department-leadership-overview'],1);
  assert.equal(r.doneTaskCount,0);
  state=action(state,{action:'respond-department',
    requestId:'req-creatives',value:'Accepted'},department,
    '2027-04-18T11:00:00Z');
  state=action(state,{action:'respond-department',
    requestId:'req-creatives',value:'Completed',
    evidenceRef:'synthetic-artifact'},department,'2027-04-18T12:00:00Z');
  const final=run({workboard:state});
  assert.equal(final.departmentRequestsUnresolved,0);
  assert.equal(final.doneTaskCount,0);
  assert.equal(final.remindersSent,0);
});
test('Duplicate task codes or incompatible requirements fail safely to a review issue',()=>{
  const state=withTask();
  state.tasks['task-duplicate']={...state.tasks['task-media'],
    id:'task-duplicate'};
  const result=run({workboard:state});
  assert.equal(result.duplicateTaskCodeGroups,1);
  assert.equal(result.workboardConflictsRequireHumanReview,true);
  assert.ok(result.reviewIssueCodes.includes('DUPLICATE_EVENT_TASK_CODE'));
  assert.equal(result.missingTaskSuggestions.some(p=>p.code==='media'),false);
  const bad=withTask();
  bad.tasks['task-media'].required=true;
  const mismatch=run({workboard:bad});
  assert.ok(mismatch.reviewIssueCodes.includes(
    'EXISTING_TASK_REQUIREMENT_CONFLICT'));
  assert.equal(mismatch.createdTaskCount,0);
});
test('Cancelled and mismatched Event handoffs block all new Workboard proposals',()=>{
  for(const e of [event({status:'Cancelled'}),
    event({departureAtUtc:BASE+'19:00:00Z'}),
    event({dataConflict:true}),event({statusVerified:false})]){
    const r=run({event:e});
    assert.equal(r.matchedIdentityAndSchedule,false);
    assert.equal(r.missingTaskSuggestions.length,0);
    assert.ok(r.reviewIssueCodes.includes('EVENT_HANDOFF_BLOCKED'));
  }
});
test('A crafted foreign task or invalid department request link is rejected',()=>{
  const state=withTask();
  state.tasks['task-media'].requestIds=['ghost-request'];
  assert.throws(()=>run({workboard:state}));
  const state2=withTask();
  state2.requests['rogue-request']={id:'rogue-request',taskId:'task-media',
    department:'Creative',status:'Pending',updatedAt:T0};
  assert.throws(()=>run({workboard:state2}));
});
test('Future Workboard revisions and malformed UTC review dates fail closed',()=>{
  const state=withTask();
  assert.throws(()=>run({workboard:state,nowUtc:'2027-04-17T12:00:00Z'}));
  assert.throws(()=>run({workboard:state,nowUtc:'2027-02-30T12:00:00Z'}));
  assert.throws(()=>run({workboard:state,nowUtc:'2027-04-20T12:00:00+02:00'}));
  assert.throws(()=>run({workboard:{...state,revision:-1}}));
});
test('Preview is ephemeral, no mentions, no raw IDs; fake delivery/authority is refused',()=>{
  const r=run({workboard:withTask()}),
    rendered=render(r),serial=JSON.stringify(rendered);
  assert.equal(rendered.type,4);
  assert.equal(rendered.data.flags,64);
  assert.deepEqual(rendered.data.allowed_mentions,{parse:[]});
  assert.ok(serial.includes('No tasks created, reminders sent'));
  for(const secret of ['ops-123','task-media','1114967437788577792',
    'req-creatives','DISCORD_BOT_TOKEN','@everyone'])
    assert.equal(serial.includes(secret),false);
  for(const change of [{createdTaskCount:1},{remindersSent:1},
    {bookingWritten:true},{slotReserved:true},{staffPermissionsVerified:true},
    {freeSlotsCertified:true},{safeToActivate:true},
    {callerWorkboardClaimAuthenticated:true},
    {workboardConflictsRequireHumanReview:true},
    {matchedIdentityAndSchedule:false},
    {expectedChecklistCount:200},
    {reminderProposalCounts:{'department-reminder':-1}}])
    assert.throws(()=>render({...r,...change}));
});
test('No live Convoy Checker import or GitHub/Discord network in new Workboard audit',()=>{
  const root=path.join(__dirname,'..');
  const read=f=>fs.readFileSync(path.join(root,f),'utf8');
  const source=read('event-capacity-operations-workboard-audit.js');
  assert.equal(read('convoy-checker.js').includes(
    'event-capacity-operations-workboard-audit'),false);
  assert.equal(read('.github/workflows/convoy-checker.yml').includes(
    'event-capacity-operations-workboard-audit'),false);
  assert.doesNotMatch(source,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/discord/);
  assert.match(source,/createdTaskCount:0,remindersSent:0,bookingWritten:false/);
  assert.match(source,/freeSlotsCertified:false,safeToActivate:false/);
});

test('Workboard dictionary IDs and revision timestamps must agree before any preview',()=>{
  const mismatched=withTask();
  mismatched.tasks['task-media'].id='fake-key';
  assert.throws(()=>run({workboard:mismatched}));
  const future=withTask();
  future.tasks['task-media'].updatedAt='2027-04-19T11:00:00Z';
  assert.throws(()=>run({workboard:future}));
  const reversed=withTask();
  reversed.tasks['task-media'].createdAt='2027-04-20T11:00:00Z';
  assert.throws(()=>run({workboard:reversed}));
  const badBoard=withTask();
  badBoard.createdAt='2027-04-19T10:00:00Z';
  assert.throws(()=>run({workboard:badBoard}));
  let requested=withTask();
  requested=action(requested,{action:'request-department',taskId:'task-media',
    requestId:'req-creatives',department:'Creative'});
  const badRequest=structuredClone(requested);
  badRequest.requests['req-creatives'].id='other-request';
  assert.throws(()=>run({workboard:badRequest}));
  const lateRequest=structuredClone(requested);
  lateRequest.requests['req-creatives'].updatedAt='2027-04-20T11:00:00Z';
  assert.throws(()=>run({workboard:lateRequest}));
});
