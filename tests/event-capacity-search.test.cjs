'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {project,discordResponse,validateFilters}=require('../event-capacity-search');
const GUILD='1114967437788577792',THREAD='1550619865805754378';
const NOW=Date.parse('2027-03-20T12:00:00Z');
const capacity={issues:[],warnings:[],globalUncertainty:false};
const e=(id,opts={})=>({
  eventId:String(id),threadId:THREAD,status:'Scheduled',statusVerified:true,
  eventType:'Partner Convoy',eventTypeVerified:true,
  departureAtUtc:'2027-03-21T12:00:00Z',departureVerified:true,
  meetingAtUtc:'2027-03-21T11:00:00Z',plannedEndAtUtc:null,
  rescheduleApproved:false,dataConflict:false,...opts
});
const adapter=(events,opts={})=>({
  events,dataFresh:true,issues:[],...opts
});
function search(events,filters={},opts={}){
  return project(adapter(events),capacity,{
    guildId:GUILD,filters,nowMs:NOW,...opts});
}
test('Search includes accepted, pending, cancelled and verified sorted upcoming events',()=>{
  const r=search([
    e(1),e(2,{status:'Pending',departureAtUtc:'2027-03-25T10:00:00Z'}),
    e(3,{status:'Cancelled',departureAtUtc:'2027-03-22T09:00:00Z'}),
    e(4,{status:'Completed',departureAtUtc:'2027-03-01T10:00:00Z'})
  ]);
  assert.equal(r.visibility,'PRIVATE_ONLY');
  assert.equal(r.availabilityCertified,false);
  assert.deepEqual(r.items.map(x=>x.status),
    ['Scheduled','Cancelled','Pending','Completed']);
  assert.equal(r.total,4);
});
test('Multiple filters combine UTC date, type, verified status and exceptions',()=>{
  const events=[
    e(1,{exceptionApprovedBy:'CEO'}),
    e(2,{eventType:'Kings Convoy'}),
    e(3,{status:'Pending'}),
    e(4,{exceptionApprovedBy:'CEO',departureAtUtc:'2027-04-01T12:00:00Z'})
  ];
  const r=search(events,{dateFrom:'2027-03-20',dateTo:'2027-03-25',
    type:'Partner Convoy',status:'Scheduled',exception:'yes',quality:'Verified'});
  assert.equal(r.total,1);
  assert.equal(r.items[0].exception,true);
  assert.equal(r.items[0].type,'Partner Convoy');
});
test('Unverified event status or category is never promoted to accepted',()=>{
  const r=search([
    e(1,{statusVerified:false}),
    e(2,{eventTypeVerified:false}),
    e(3,{departureVerified:false})
  ]);
  assert.equal(r.items.every(x=>x.quality!=='Verified'),true);
  assert.equal(r.items.every(x=>x.accepted===false),true);
  assert.equal(search([e(1,{statusVerified:false})],{
    status:'Unverified'}).total,1);
});
test('Duplicate Event IDs even if snapshots match are a Data Conflict',()=>{
  const r=search([e(1),e(1)]);
  assert.equal(r.total,1);
  assert.equal(r.items[0].quality,'Data Conflict');
  assert.equal(r.items[0].conflict,true);
  assert.equal(r.items[0].accepted,false);
  assert.equal(search([e(1),e(1)],{conflict:'yes'}).total,1);
});
test('Missing unique identity is excluded and sourceVerified is false',()=>{
  const r=search([e(1),e(null,{eventId:null,threadId:null})]);
  assert.equal(r.total,1);
  assert.equal(r.unknownIdentity,1);
  assert.equal(r.sourceVerified,false);
});
test('Stale adapter or capacity result cannot claim verified source',()=>{
  const a=project(adapter([e(1)],{dataFresh:false}),capacity,{
    guildId:GUILD,nowMs:NOW});
  assert.equal(a.items[0].quality,'Needs Verification');
  const b=project(adapter([e(1)]),{...capacity,globalUncertainty:true},{
    guildId:GUILD,nowMs:NOW});
  assert.equal(b.items[0].quality,'Needs Verification');
  assert.equal(a.sourceVerified,false);
});
test('10 records per page with strict page boundaries',()=>{
  const events=Array.from({length:22},(_,i)=>e(i+1));
  const page=search(events,{}, {page:3});
  assert.equal(page.total,22);
  assert.equal(page.pages,3);
  assert.equal(page.items.length,2);
  assert.throws(()=>search(events,{}, {page:4}));
  assert.throws(()=>search(events,{}, {page:0}));
});
test('Invalid date, options and injection-shaped identifiers fail before filtering',()=>{
  assert.throws(()=>validateFilters({dateFrom:'2027-02-30'}));
  assert.throws(()=>validateFilters({eventId:'1\n@everyone'}));
  assert.throws(()=>validateFilters({untrusted:'yes'}));
  assert.throws(()=>validateFilters({dateFrom:'2027-04-01',dateTo:'2027-03-01'}));
  assert.throws(()=>validateFilters({exception:'maybe'}));
  assert.throws(()=>validateFilters({sort:'eval'}));
});
test('Sort priority puts Kings before Partner before External when requested',()=>{
  const r=search([
    e(1,{eventType:'External Convoy'}),
    e(2,{eventType:'Kings Convoy'}),
    e(3,{eventType:'Partner Convoy'})
  ],{sort:'priority'});
  assert.deepEqual(r.items.map(x=>x.type),
    ['Kings Convoy','Partner Convoy','External Convoy']);
});
test('Discord response hides source event ID, private evidence and unverified free slots',()=>{
  const r=search([e('PRIVATE_EVENT_IDENTIFIER')],{});
  const payload=discordResponse(r);
  assert.equal(payload.type,4);
  assert.equal(payload.data.flags,64);
  assert.deepEqual(payload.data.allowed_mentions,{parse:[]});
  const rendered=JSON.stringify(payload);
  assert.equal(rendered.includes('PRIVATE_EVENT_IDENTIFIER'),false);
  assert.equal(rendered.includes('free slot'),true);
  assert.equal(rendered.includes('Available: 2'),false);
  assert.match(rendered,/https:\/\/discord.com\/channels\//);
});
test('Conflicting duplication with different dates cannot create two accepted entries',()=>{
  const rows=[e(1),e(1,{departureAtUtc:'2027-03-23T12:00:00Z'})];
  const r=search(rows);
  assert.equal(r.items.length,1);
  assert.equal(r.items[0].quality,'Data Conflict');
  assert.equal(r.items[0].accepted,false);
});
