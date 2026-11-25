'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {evaluate}=require('../event-capacity-core');
const {projectKingsStaffCalendarReview}
  =require('../event-capacity-staff-calendar-review');
const {projectKingsEventBookingSafetyReview:review,
  renderKingsEventBookingSafetyPreview:render}
  =require('../event-capacity-booking-safety-review');
const DAY='2027-04-20';
function event(id,type,day=DAY){
  return {eventId:id,eventType:type,eventTypeVerified:true,
    status:'Scheduled',statusVerified:true,departureVerified:true,
    departureAtUtc:day+'T18:00:00Z',
    meetingAtUtc:day+'T17:00:00Z',
    plannedEndAtUtc:day+'T20:00:00Z'};
}
function calendar(records=[],selectedMonth='2027-04'){
  return projectKingsStaffCalendarReview({
    capacity:evaluate(records,{dataFresh:true}),
    year:'2027',selectedMonth,historicalHoldsReports:[],
    historicalEvidenceReport:null
  });
}
function request(changes={}){
  return {category:'Partner Convoy',
    meetingAtUtc:DAY+'T17:00:00.000Z',
    departureAtUtc:DAY+'T18:00:00.000Z',
    plannedEndAtUtc:DAY+'T20:00:00.000Z',...changes};
}
test('Booking request preview is explicitly NOT a reservation or confirmed free slot',()=>{
  const r=review({calendar:calendar(),request:request()});
  assert.equal(r.reviewStatus,'STAFF_REVIEW_REQUIRED');
  assert.equal(r.slotReserved,false);
  assert.equal(r.bookingWritten,false);
  assert.equal(r.staffApprovalVerified,false);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.officialEventIdentityVerified,false);
  assert.equal(r.parkingSlotEvidenceVerified,false);
  assert.equal(r.reviewReasons.includes('ORIGINAL_SOURCE_AND_STAFF_REVIEW_REQUIRED'),true);
  assert.equal(r.reviewReasons.includes('DAILY_HISTORICAL_HOLDS_MISSING'),true);
});
test('Two reported Partner events trigger separate Partner 2/day review',()=>{
  const r=review({calendar:calendar([
    event('partner','Partner Convoy'),event('partner2','Partner Convoy')
  ]),request:request()});
  assert.equal(r.observedDailyLimitReached,true);
  assert.equal(r.observedMonthlyLimitReached,false);
  assert.equal(r.observedSnapshot.dailyPartner,2);
  assert.equal(r.observedSnapshot.dailyExternal,0);
  assert.ok(r.reviewReasons.includes('OBSERVED_DAILY_LIMIT_REACHED'));
  assert.equal(r.slotReserved,false);
});
test('Twenty observed Partner convoys are only a monthly source count, not an obsolete cap',()=>{
  const events=Array.from({length:20},(_,i)=>event(
    'p'+i,'Partner Convoy',
    '2027-04-'+String(i+1).padStart(2,'0')
  ));
  const r=review({calendar:calendar(events),request:request()});
  assert.equal(r.observedMonthlyLimitReached,false);
  assert.equal(r.observedDailyLimitReached,false);
  assert.equal(r.observedSnapshot.monthlyPartner,20);
  assert.equal(r.observedSnapshot.monthlyExternal,0);
});
test('External monthly source count remains separate with no approved monthly cap',()=>{
  const events=Array.from({length:20},(_,i)=>event(
    'x'+i,'External Convoy',
    '2027-04-'+String(i+1).padStart(2,'0')
  ));
  const r=review({calendar:calendar(events),
    request:request({category:'External Convoy'})});
  assert.equal(r.observedMonthlyLimitReached,false);
  assert.equal(r.observedSnapshot.monthlyExternal,20);
});
test('Kings-owned convoy is quota-exempt, but still requires actual human review',()=>{
  const r=review({calendar:calendar([
    event('p','Partner Convoy'),event('x','External Convoy')
  ]),request:request({category:'Kings Convoy'})});
  assert.equal(r.quotaExempt,true);
  assert.equal(r.observedDailyLimitReached,false);
  assert.equal(r.observedMonthlyLimitReached,false);
  assert.equal(r.staffApprovalVerified,false);
  assert.equal(r.slotReserved,false);
  assert.equal(r.departureSpacingVerified,false);
});
test('Missing meeting or planned end are identified without guessed timestamps',()=>{
  const r=review({calendar:calendar(),request:request({
    meetingAtUtc:null,plannedEndAtUtc:null
  })});
  assert.equal(r.meetingProvided,false);
  assert.equal(r.plannedEndProvided,false);
  assert.ok(r.reviewReasons.includes('MEETING_TIME_MISSING'));
  assert.ok(r.reviewReasons.includes('PLANNED_END_MISSING'));
  assert.equal(r.fullEventOverlapVerified,false);
});
test('Refuse non-UTC, impossible or inverted meeting/departure/end timestamps',()=>{
  const c=calendar();
  for(const changes of [
    {departureAtUtc:DAY+'T18:00:00+02:00'},
    {departureAtUtc:'2027-02-30T18:00:00.000Z'},
    {departureAtUtc:'2027-04-20T25:00:00.000Z'},
    {meetingAtUtc:DAY+'T19:00:00.000Z'},
    {plannedEndAtUtc:DAY+'T17:00:00.000Z'},
    {category:'Other'}
  ])assert.throws(()=>review({calendar:c,request:request(changes)}));
});
test('Requests on a different selected UTC month cannot borrow another calendar',()=>{
  const c=calendar(),r=request({departureAtUtc:'2027-05-01T18:00:00.000Z',
    meetingAtUtc:'2027-05-01T17:00:00.000Z',
    plannedEndAtUtc:'2027-05-01T20:00:00.000Z'});
  assert.throws(()=>review({calendar:c,request:r}));
});
test('Forged view evidence, monthly totals and repeated day rows are refused',()=>{
  const c=calendar(),d=c.days[0],m=c.months[3];
  for(const forged of [
    {...c,freeSlotsCertified:true},
    {...c,sourceAuthenticityIndependentlyProven:true},
    {...c,days:[d,...c.days.slice(0,-1)]},
    {...c,months:[...c.months.slice(0,3),{
      ...m,currentSnapshot:{...m.currentSnapshot,partner:99}
    },...c.months.slice(4)]},
    {...c,days:[{...d,canApprove:true},...c.days.slice(1)]}
  ])assert.throws(()=>review({calendar:forged,request:request()}));
});
test('Only expected booking fields are permitted: private IDs and access tokens stay out',()=>{
  const c=calendar();
  assert.throws(()=>review({calendar:c,request:{
    ...request(),token:'SECRET',eventId:'user-1'
  }}));
  assert.throws(()=>review({calendar:c,request:{
    ...request(),category:'<@everyone>'
  }}));
});
test('Discord preview stays ephemeral, redacted, and refuses forged success flags',()=>{
  const r=review({calendar:calendar(),request:request()}),
    out=render(r),json=JSON.stringify(out);
  assert.equal(out.type,4);
  assert.equal(out.data.flags,64);
  assert.deepEqual(out.data.allowed_mentions,{parse:[]});
  assert.ok(json.includes('No slots certified, reserved or approved'));
  assert.ok(!json.includes('eventId'));
  assert.ok(!json.includes('PRIVATE KEY'));
  assert.throws(()=>render({...r,slotReserved:true}));
  assert.throws(()=>render({...r,freeSlotsCertified:true}));
  assert.throws(()=>render({...r,discordMessagesSent:1}));
});
test('Draft booking checker is isolated from the running Convoy Checker and secrets',()=>{
  const root=path.join(__dirname,'..'),
    w=fs.readFileSync(path.join(root,'.github/workflows/convoy-checker.yml'),'utf8'),
    p=fs.readFileSync(path.join(root,'convoy-checker.js'),'utf8'),
    source=fs.readFileSync(path.join(root,'event-capacity-booking-safety-review.js'),'utf8');
  assert.equal(w.includes('event-capacity-booking-safety-review'),false);
  assert.equal(p.includes('event-capacity-booking-safety-review'),false);
  assert.doesNotMatch(source,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/discord/);
  assert.equal(source.includes('slotReserved:false'),true);
  assert.equal(source.includes('freeSlotsCertified:false,safeToActivate:false'),true);
});

test('Booking renderer refuses falsified quota status or altered review explanations',()=>{
  const base=review({calendar:calendar(),request:request()});
  for(const forged of [
    {...base,quotaExempt:true},
    {...base,observedDailyLimitReached:true},
    {...base,observedMonthlyLimitReached:true},
    {...base,meetingProvided:false},
    {...base,plannedEndProvided:false},
    {...base,reviewReasons:base.reviewReasons.slice(1)},
    {...base,reviewReasons:[...base.reviewReasons,'OBSERVED_DAILY_LIMIT_REACHED']},
    {...base,reviewReasons:[...base.reviewReasons,base.reviewReasons[0]]},
    {...base,reviewReasons:[...base.reviewReasons,'CREATED_A_REAL_BOOKING']}
  ])assert.throws(()=>render(forged));
  const booked=review({
    calendar:calendar([event('one','Partner Convoy'),event('two','Partner Convoy')]),
    request:request()
  });
  assert.equal(booked.observedDailyLimitReached,true);
  assert.throws(()=>render({...booked,observedDailyLimitReached:false}));
  assert.throws(()=>render({...booked,reviewReasons:booked.reviewReasons.filter(
    x=>x!=='OBSERVED_DAILY_LIMIT_REACHED')}));
  assert.equal(render(booked).type,4);
});
