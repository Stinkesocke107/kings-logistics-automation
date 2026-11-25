'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {upcoming,reminders}=require('../event-capacity-milestones');
const REF='event:12345';
const e={eventId:'12345',status:'Scheduled',statusVerified:true,
  departureAtUtc:'2027-03-20T12:00:00Z',departureVerified:true,dataConflict:false};
const milestone={type:'Partnership Anniversary',verified:true,evidenceRef:'approved-anniversary'};
const options={events:[e],milestones:{[REF]:milestone},sourceVerified:true,
  preparationByEvent:{[REF]:{status:'Needs Attention'}}};
test('Upcoming milestone is private and visible only after verification',()=>{
  const r=upcoming({...options,nowMs:Date.parse('2027-03-10T12:00:00Z')});
  assert.equal(r.visibility,'PRIVATE_ONLY');
  assert.equal(r.items.length,1);
  assert.equal(r.items[0].milestone.type,'Partnership Anniversary');
  assert.equal(upcoming({...options,milestones:{[REF]:{...milestone,verified:false}},
    nowMs:Date.parse('2027-03-10T12:00:00Z')}).total,0);
});
test('14-day and 3-day reminder windows are UTC and stage-specific',()=>{
  const fourteen=reminders({...options,nowMs:Date.parse('2027-03-06T12:00:00Z')});
  assert.equal(fourteen.length,1);
  assert.equal(fourteen[0].phase,'14d');
  const three=reminders({...options,nowMs:Date.parse('2027-03-17T12:00:00Z')});
  assert.equal(three.length,1);
  assert.equal(three[0].phase,'3d');
  assert.notEqual(three[0].key,fourteen[0].key);
});
test('Dedup delivery key, no real notification and no CEO routine ping',()=>{
  const time=Date.parse('2027-03-10T12:00:00Z');
  const notices=reminders({...options,nowMs:time});
  assert.deepEqual(reminders({...options,nowMs:time,sentKeys:[notices[0].key]}),[]);
  assert.equal(notices[0].privateOnly,true);
  assert.deepEqual(notices[0].targetGroups,['Assigned Event Coordination','Event Leadership']);
});
test('Ready or cancelled or historic events do not generate staff reminders',()=>{
  const nowMs=Date.parse('2027-03-10T12:00:00Z');
  assert.equal(reminders({...options,nowMs,
    preparationByEvent:{[REF]:{status:'Ready'}}}).length,0);
  assert.equal(reminders({...options,nowMs,
    events:[{...e,status:'Completed'}]}).length,0);
  assert.equal(reminders({...options,nowMs,
    events:[{...e,status:'Cancelled'}]}).length,0);
});
test('Do not notify on stale sources, uncertain departure or duplicate event identity',()=>{
  const nowMs=Date.parse('2027-03-10T12:00:00Z');
  assert.equal(reminders({...options,nowMs,sourceVerified:false}).length,0);
  assert.equal(reminders({...options,nowMs,events:[{...e,departureVerified:false}]}).length,0);
  assert.equal(reminders({...options,nowMs,events:[e,{...e}]}).length,0);
});
test('Reschedule changes reminder key to verified new departure',()=>{
  const nowMs=Date.parse('2027-03-10T12:00:00Z');
  const initial=reminders({...options,nowMs});
  const next=reminders({...options,nowMs,events:[{...e,status:'Rescheduled',
    rescheduleApproved:true,departureAtUtc:'2027-03-24T12:00:00Z'}]});
  assert.equal(next.length,1);
  assert.notEqual(initial[0].key,next[0].key);
});
test('Upcoming milestones paginate at 10 entries and reject invalid page',()=>{
  const list=Array.from({length:12},(_,i)=>({...e,eventId:String(10000+i)}));
  const tags=Object.fromEntries(list.map(x=>['event:'+x.eventId,milestone]));
  const r=upcoming({events:list,milestones:tags,
    nowMs:Date.parse('2027-03-01T00:00:00Z'),page:2,sourceVerified:true});
  assert.equal(r.total,12);
  assert.equal(r.items.length,2);
  assert.equal(r.pages,2);
  assert.throws(()=>upcoming({events:list,milestones:tags,page:3}));
});
