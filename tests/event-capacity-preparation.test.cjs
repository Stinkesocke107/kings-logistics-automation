'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {proposedChecklist,planChecklists,milestoneTag}=require('../event-capacity-preparation');
const base={
  eventId:'12345',threadId:'155000000000000000',eventType:'Partner Convoy',
  eventTypeVerified:true,status:'Scheduled',statusVerified:true,
  departureAtUtc:'2027-03-20T12:00:00Z',departureVerified:true,
  meetingAtUtc:'2027-03-20T11:00:00Z',dataConflict:false
};
const proof=(key)=>({[key]:{verified:true,evidenceRef:'private-proof-'+key}});
const verified={
  approved:proof('approved').approved,
  times:proof('times').times,
  slot:proof('slot').slot,
  route:proof('route').route
};
test('Accepted partner convoy generates one canonical set of private checklist proposals',()=>{
  const p=proposedChecklist(base,{sourceVerified:true});
  assert.equal(p.category,'Partner Convoy');
  assert.equal(p.items.filter(x=>x.required).length,4);
  assert.equal(p.createProposals.length,p.items.length);
  assert.equal(p.status,'Not Started');
  assert.equal(p.readOnly,true);
});
test('A verified mandatory source fact is completed without inventing other approvals',()=>{
  const p=proposedChecklist(base,{sourceVerified:true,verifiedFacts:verified});
  assert.equal(p.status,'Ready');
  assert.equal(p.items.filter(x=>x.required&&!['Done'].includes(x.status)).length,0);
  assert.ok(p.items.some(x=>!x.required&&x.status==='Open'));
});
test('Unverified source never becomes Ready even with claimed verified facts',()=>{
  const p=proposedChecklist(base,{sourceVerified:false,verifiedFacts:verified});
  assert.equal(p.status,'Needs Attention');
  assert.ok(p.createProposals.length>0);
});
test('Missing verified meeting time prevents Ready',()=>{
  const p=proposedChecklist({...base,meetingAtUtc:null},{sourceVerified:true,
    verifiedFacts:verified});
  assert.equal(p.status,'Needs Attention');
  assert.equal(p.items.find(x=>x.code==='time').blocked,true);
});
test('Existing tasks are reused rather than duplicated',()=>{
  const p=proposedChecklist(base,{sourceVerified:true,existingTasks:[{
    id:'previous',eventRef:'event:12345',code:'approval',status:'Done',proof:'private-proof'
  }]});
  assert.equal(p.items.find(x=>x.code==='approval').existingTaskId,'previous');
  assert.equal(p.createProposals.some(x=>x.code==='approval'),false);
});
test('Milestones require manual verified confirmation and cannot change quota',()=>{
  assert.equal(milestoneTag({type:'Kings Anniversary'}),null);
  const milestone={type:'Partnership Anniversary',verified:true,evidenceRef:'approval'};
  const p=proposedChecklist(base,{sourceVerified:true,milestone});
  assert.equal(p.items.some(x=>x.code==='milestone-details'&&x.required),true);
  assert.equal(p.items.some(x=>x.code==='milestone-assets'&&!x.required),true);
  assert.equal(p.category,'Partner Convoy');
});
test('Historical Completed event is not recreated as new active staff tasks',()=>{
  const p=proposedChecklist({...base,status:'Completed'},{sourceVerified:true});
  assert.equal(p.status,'Historical');
  assert.equal(p.createProposals.length,0);
});
test('Unverified status and category cannot generate work',()=>{
  assert.throws(()=>proposedChecklist({...base,statusVerified:false},{sourceVerified:true}));
  assert.throws(()=>proposedChecklist({...base,eventTypeVerified:false},{sourceVerified:true}));
});
test('Kings owns a broader checklist than other external, no extra capacity implied',()=>{
  const kings=proposedChecklist({...base,eventType:'Kings Convoy'},{sourceVerified:true});
  const external=proposedChecklist({...base,eventType:'External Convoy'},{sourceVerified:true});
  assert.ok(kings.items.length>external.items.length);
  assert.equal(kings.items.some(x=>x.code==='convoy-control'),true);
});
test('Board-level duplicate event identifiers are flagged and never create duplicate tasks',()=>{
  const result=planChecklists([base,{...base,threadId:'155000000000000001'}],{sourceVerified:true});
  assert.ok(result.issues.includes('Duplicate event identity'));
});
