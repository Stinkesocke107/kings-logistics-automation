'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,dayAvailability}=require('../event-capacity-core');
const {projectDashboard,projectMonth,ephemeralResponse,monthAt}=require('../event-capacity-dashboard');
function event(id,type,date,status='Scheduled'){
  return {
    eventId:String(id),eventType:type,eventTypeVerified:true,
    status,statusVerified:true,departureAtUtc:date+'T16:00:00Z',
    departureVerified:true,
    meetingAtUtc:date+'T15:00:00Z',
    plannedEndAtUtc:date+'T18:00:00Z'
  };
}
function view(events,{fresh=true,nowMs=Date.parse('2027-03-20T12:00:00Z')}={}){
  return projectDashboard(evaluate(events,{dataFresh:fresh}),{nowMs});
}
test('Three UTC months visible without changing the event records',()=>{
  const source=[event(1,'Partner Convoy','2027-03-20')];
  const before=JSON.stringify(source);
  const d=view(source);
  assert.deepEqual(d.months.map(x=>x.month),['2027-03','2027-04','2027-05']);
  assert.equal(d.mode,'READ_ONLY');
  assert.equal(d.visibility,'PRIVATE_ONLY');
  assert.equal(JSON.stringify(source),before);
});
test('Current source counts are shown without implying available Sunday bookings',()=>{
  const d=view([
    event(1,'Partner Convoy','2027-03-20'),
    event(2,'External Convoy','2027-03-20'),
    event(3,'Kings Convoy','2027-03-20'),
    event(4,'Kings Convoy','2027-03-20')
  ]);
  const day=d.months[0].days.find(x=>x.date==='2027-03-20');
  assert.equal(day.status,'Unverified');
  assert.equal(day.combinedUsed,2);
  assert.equal(day.kings,2);
  assert.equal(day.partner,1);
  assert.equal(day.external,1);
  assert.equal(day.remaining,null);
});
test('Single reported external remains unverified as a bookable slot',()=>{
  const d=view([event(1,'External Convoy','2027-03-20')]);
  const day=d.months[0].days.find(x=>x.date==='2027-03-20');
  assert.equal(day.status,'Unverified');
  assert.equal(day.remaining,null);
  assert.equal(day.reportedPlanningRoom,4);
});
test('Fresh current source with no events is still not proven free',()=>{
  const d=view([]);
  assert.equal(d.months[0].days.find(x=>x.date==='2027-03-20').status,'Unverified');
  assert.equal(d.months[0].monthly.partner,0);
});
test('Missing source freshness blocks any misleading capacity green status',()=>{
  const d=view([],{fresh:false});
  assert.equal(d.sourceStatus,'Data Outdated / Unverified');
  assert.equal(d.months[0].days.find(x=>x.date==='2027-03-20').status,'Unverified');
  assert.equal(d.months[2].summary.Unverified,31);
});
test('Unverified end time leaves the particular day unverified, not free',()=>{
  const item=event(1,'Partner Convoy','2027-03-20');
  item.plannedEndAtUtc=null;
  const d=view([item]);
  const day=d.months[0].days.find(x=>x.date==='2027-03-20');
  assert.equal(day.status,'Unverified');
  assert.equal(day.remaining,null);
  assert.equal(day.combinedUsed,1);
});
test('Approved exception is visible as a claim, not a verified free slot',()=>{
  const items=[
    event(1,'External Convoy','2027-03-20'),
    event(2,'Partner Convoy','2027-03-20'),
    {...event(3,'External Convoy','2027-03-20'),exceptionApprovedBy:'CEO'}
  ];
  const d=view(items);
  const day=d.months[0].days.find(x=>x.date==='2027-03-20');
  assert.equal(day.status,'Unverified');
  assert.equal(day.quotaConflict,false);
  assert.equal(day.approvedExceptions,1);
  assert.equal(day.combinedUsed,3);
  assert.equal(d.policy.weekdayCombined,3);
  assert.equal(d.policy.weekendCombined,5);
  assert.equal(d.policy.partnerDaily,2);
});
test('Twenty monthly partner claims no longer impose retired monthly quota',()=>{
  const records=[];
  for(let i=1;i<=20;i++)records.push(event(i,'Partner Convoy','2027-03-'+String(i).padStart(2,'0')));
  const d=view(records),day=d.months[0].days.find(x=>x.date==='2027-03-21');
  assert.equal(day.status,'Unverified');
  assert.equal(day.partnerAvailableVerified,false);
  assert.equal(day.externalAvailableVerified,false);
  assert.equal(d.months[0].monthly.partner,20);
  assert.equal(d.months[0].monthly.partnerRemaining,null);
});
test('Ephemeral response is never a public dashboard and has no personal event details',()=>{
  const d=view([event(1,'Partner Convoy','2027-03-20')]);
  const response=ephemeralResponse(d);
  assert.equal(response.type,4);
  assert.equal(response.data.flags,64);
  assert.deepEqual(response.data.allowed_mentions,{parse:[]});
  assert.equal(response.data.embeds.length,3);
  assert.equal(response.data.embeds[0].title,'Kings Event Capacity | 2027-03 UTC');
  assert.equal(JSON.stringify(response).includes('event:1'),false);
});
test('Calendar respects leap month in UTC and preserves bounds',()=>{
  assert.equal(monthAt('2027-12',1),'2028-01');
  const result=evaluate([],{dataFresh:true});
  const d=projectDashboard(result,{startMonth:'2028-02',monthCount:1});
  assert.equal(d.months[0].days.length,29);
  assert.throws(()=>projectDashboard(result,{startMonth:'2028-13'}));
  assert.throws(()=>projectDashboard(result,{monthCount:12}));
});
test('Reject incompatible or forged policy structures',()=>{
  const result=evaluate([],{dataFresh:true});
  assert.throws(()=>projectDashboard({...result,limits:{...result.limits,combinedDaily:4}}));
  assert.throws(()=>ephemeralResponse({visibility:'PUBLIC',months:[]}));
});

test('Optional map outage never blocks or changes Event Capacity day and monthly quota',()=>{
  const source=[event(1,'Partner Convoy','2027-03-20')];
  const capacity=evaluate(source,{dataFresh:true});
  const nowMs=Date.parse('2027-03-20T12:00:00.000Z');
  const baseline=projectDashboard(capacity,{nowMs});
  const withOutage=projectDashboard(capacity,{nowMs,trackerSource:{
    sourceAuthenticated:false,coverageComplete:false,mapAvailable:false,
    provider:'TruckersMP',observedAtUtc:'2027-03-20T11:59:00.000Z'
  }});
  assert.equal(withOutage.tracker.mode,'WITHOUT_MAP');
  assert.deepEqual(withOutage.months,baseline.months);
  assert.equal(withOutage.sourceStatus,baseline.sourceStatus);
  assert.equal(withOutage.issueCount,baseline.issueCount);
  assert.match(ephemeralResponse(withOutage).data.content,/works without a live map/);
  assert.equal(withOutage.months[0].days.find(x=>x.date==='2027-03-20').combinedUsed,1);
});
test('A trusted fresh map feed is only optional status, never proof of free capacity',()=>{
  const capacity=evaluate([],{dataFresh:false});
  const nowMs=Date.parse('2027-03-20T12:00:00.000Z');
  const d=projectDashboard(capacity,{nowMs,trackerSource:{
    sourceAuthenticated:true,coverageComplete:true,mapAvailable:true,
    provider:'HaulMP',observedAtUtc:'2027-03-20T11:59:00.000Z'
  }});
  assert.equal(d.tracker.mode,'WITH_MAP');
  assert.equal(d.sourceStatus,'Data Outdated / Unverified');
  assert.equal(d.months[0].days.find(x=>x.date==='2027-03-20').status,'Unverified');
  const text=ephemeralResponse(d).data.content;
  assert.match(text,/available \(HaulMP\)/);
  assert.match(text,/Data Outdated/);
});
