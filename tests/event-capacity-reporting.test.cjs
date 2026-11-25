'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize,duePeriods,versionReport,aggregateCsv}=require('../event-capacity-reporting');
const event=(id,status,type='Partner Convoy',other={})=>({
  eventId:String(id),status,statusVerified:true,eventType:type,eventTypeVerified:true,
  departureAtUtc:'2027-03-20T16:00:00Z',departureVerified:true,...other
});
function report(events,extra={}){
  return summarize({events,kind:'month',period:'2027-03',dataFresh:true,...extra});
}
test('Verified month counts accepted, pending and cancelled without treating completed as attendance',()=>{
  const r=report([event(1,'Scheduled'),event(2,'Completed','Kings Convoy'),
    event(3,'Pending'),event(4,'Cancelled')]);
  assert.equal(r.sourceStatus,'Verified');
  assert.equal(r.counts.accepted,2);
  assert.equal(r.counts.partner,1);
  assert.equal(r.counts.kings,1);
  assert.equal(r.counts.pending,1);
  assert.equal(r.counts.cancelled,1);
  assert.equal(r.counts.completed,1);
  assert.equal(r.counts.attendanceVerified,0);
});
test('Attendance is counted only with independent verified evidence',()=>{
  const r=report([event(1,'Completed')],{
    attendanceEvidence:{'event:1':{verified:true,evidenceRef:'private-attendance-check'}}
  });
  assert.equal(r.counts.attendanceVerified,1);
  const r2=report([event(1,'Completed')],{
    attendanceEvidence:{'event:1':{verified:false,evidenceRef:'private-attendance-check'}}
  });
  assert.equal(r2.counts.attendanceVerified,0);
});
test('Unverified departure and duplicate identity block a verified report',()=>{
  const r=report([event(1,'Scheduled'),event(1,'Scheduled'),
    event(2,'Scheduled','Partner Convoy',{departureVerified:false})]);
  assert.equal(r.sourceStatus,'Unverified');
  assert.ok(r.issues.includes('duplicate-identity'));
  assert.ok(r.issues.includes('unverified-departure'));
});
test('Approved quota exceptions are separate counts, Kings are not exceptions',()=>{
  const r=report([event(1,'Scheduled','Partner Convoy',{exceptionApprovedBy:'CEO'}),
    event(2,'Scheduled','Kings Convoy',{exceptionApprovedBy:'CEO'})]);
  assert.equal(r.counts.exceptions,1);
});
test('Month and year use UTC departure boundaries, not meeting time',()=>{
  const e=event(1,'Scheduled','Partner Convoy',{
    departureAtUtc:'2027-04-01T00:15:00Z',meetingAtUtc:'2027-03-31T23:30:00Z'});
  assert.equal(report([e]).counts.accepted,0);
  const y=summarize({events:[e],dataFresh:true,kind:'year',period:'2027'});
  assert.equal(y.counts.accepted,1);
});
test('Reporting schedule proposes monthly second day and annual third January at 09 UTC',()=>{
  assert.deepEqual(duePeriods('2027-04-02T09:00:00Z'),
    [{kind:'month',period:'2027-03',dedupeKey:'month:2027-03'}]);
  assert.deepEqual(duePeriods('2028-01-03T09:00:00Z'),
    [{kind:'year',period:'2027',dedupeKey:'year:2027'}]);
  assert.deepEqual(duePeriods('2027-04-02T08:59:59Z'),[]);
});
test('Report history versions late corrections; history remains available',()=>{
  const r=report([event(1,'Scheduled')]),a={at:'2027-04-02T09:00:00Z',
    actorId:'111111111111111111',evidenceRef:'private-source'};
  const first=versionReport([],r,a);
  const second=versionReport(first,report([event(1,'Scheduled'),event(2,'Scheduled')]),
    {...a,at:'2027-04-05T10:00:00Z'});
  assert.equal(first[0].status,'Current');
  assert.equal(second[0].status,'Superseded');
  assert.equal(second[1].version,2);
  assert.equal(second[1].status,'Current');
});
test('Unverified reports cannot become approved current publication history',()=>{
  const r=report([event(1,'Scheduled')],{dataFresh:false});
  assert.throws(()=>versionReport([],r,{at:'2027-04-02T09:00:00Z',
    actorId:'111111111111111111',evidenceRef:'proof'}));
});
test('CSV remains aggregate only and excludes event/person references',()=>{
  const r=report([event('person-sensitive','Scheduled')]);
  const csv=aggregateCsv(r);
  assert.match(csv,/partner,external/);
  assert.equal(csv.includes('person-sensitive'),false);
  assert.equal(csv.includes('event:'),false);
});
