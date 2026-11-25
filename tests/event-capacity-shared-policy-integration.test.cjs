'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {POLICY,dailyLimitForUtcDate}
  =require('../event-capacity-policy');
const {evaluate,dayAvailability}
  =require('../event-capacity-core');
const {projectMonth}=require('../event-capacity-dashboard');
const {detailProjection,sanitizeDiscord}=require('../event-capacity-day-view');
const {projectKingsStaffCalendarReview}
  =require('../event-capacity-staff-calendar-review');
const {projectKingsEventBookingSafetyReview:review}
  =require('../event-capacity-booking-safety-review');
const {messageFor}=require('../event-capacity-github-only');
const G='1114967437788577792';
const ref=(n,kind,date)=>({eventId:'evt'+n,threadId:'77777777777777'+String(n).padStart(4,'0'),
  eventType:kind,eventTypeVerified:true,status:'Scheduled',statusVerified:true,
  departureAtUtc:date+'T18:00:00Z',departureVerified:true,
  meetingAtUtc:date+'T17:00:00Z',plannedEndAtUtc:date+'T20:00:00Z'});
const request=(date,kind='Partner Convoy')=>({
  category:kind,meetingAtUtc:date+'T17:00:00.000Z',
  departureAtUtc:date+'T18:00:00.000Z',
  plannedEndAtUtc:date+'T20:00:00.000Z'
});
function projections(rows,date){
  const snapshot=evaluate(rows,{dataFresh:true});
  return {snapshot,month:projectMonth(snapshot,date.slice(0,7)),
    calendar:projectKingsStaffCalendarReview({capacity:snapshot,
      year:date.slice(0,4),selectedMonth:date.slice(0,7),
      historicalHoldsReports:[],historicalEvidenceReport:null})};
}
test('Weekday 4 reported mixed Convoys is a conflict in Capacity, calendar and booking review',()=>{
  const date='2027-04-20';
  const rows=[ref(1,'Partner Convoy',date),ref(2,'Partner Convoy',date),
    ref(3,'External Convoy',date),ref(4,'External Convoy',date)];
  const {snapshot,month,calendar}=projections(rows,date);
  assert.equal(dailyLimitForUtcDate(date),3);
  assert.equal(snapshot.days[date].dayLimit,3);
  assert.equal(snapshot.days[date].combined,4);
  assert.equal(snapshot.days[date].remaining,null);
  assert.ok(snapshot.warnings.some(x=>x.code==='combined-day-over-limit'));
  assert.equal(month.days.find(x=>x.date===date).status,'Review');
  assert.equal(calendar.days.find(x=>x.utcDate===date).status,
    'Daily Quota Conflict — Human Review');
  const r=review({calendar,request:request(date)});
  assert.equal(r.observedDailyLimitReached,true);
  assert.equal(r.observedMonthlyLimitReached,false);
  assert.equal(r.safeToActivate,false);
});
test('Weekend four mixed source convoys are below shared max five, but each category is at two',()=>{
  const date='2027-04-25';
  const rows=[ref(1,'Partner Convoy',date),ref(2,'Partner Convoy',date),
    ref(3,'External Convoy',date),ref(4,'External Convoy',date)];
  const {snapshot,month,calendar}=projections(rows,date);
  assert.equal(dailyLimitForUtcDate(date),5);
  assert.equal(snapshot.days[date].combined,4);
  assert.equal(snapshot.warnings.some(x=>x.code==='combined-day-over-limit'),false);
  assert.equal(month.days.find(x=>x.date===date).status,'Unverified');
  const r=review({calendar,request:request(date,'External Convoy')});
  assert.equal(r.observedDailyLimitReached,true);
  assert.ok(r.reviewReasons.includes('OBSERVED_DAILY_LIMIT_REACHED'));
  assert.equal(r.freeSlotsCertified,false);
});
test('Kings convoy does not use partner/external caps, and unverified days cannot be booked',()=>{
  const date='2027-04-20';
  const rows=Array.from({length:8},(_,i)=>ref(i+1,'Kings Convoy',date));
  const {snapshot,calendar}=projections(rows,date);
  assert.equal(snapshot.days[date].combined,0);
  assert.equal(snapshot.days[date].kings,8);
  assert.equal(dayAvailability(snapshot,date).freeVerified,false);
  const r=review({calendar,request:request(date,'Kings Convoy')});
  assert.equal(r.quotaExempt,true);
  assert.equal(r.observedDailyLimitReached,false);
  assert.equal(r.slotReserved,false);
});
test('Private day view and Discord guidance use same policy without showing a free slot',()=>{
  const date='2027-04-20',record=ref(1,'Partner Convoy',date),
    snapshot=evaluate([record],{dataFresh:true});
  const d=detailProjection({events:[record],dataFresh:true},
    snapshot,date,{guildId:G});
  assert.equal(d.baseLimit,POLICY.weekdayCombinedMax);
  assert.equal(d.remaining,null);
  assert.equal(d.capacityVerified,false);
  assert.match(sanitizeDiscord(d).data.content,/Availability unverified/);
  const msg=messageFor({sourceAvailable:true,
    nowMs:Date.parse('2027-04-20T12:00:00Z')});
  assert.match(msg,/Mon–Thu max 3/);
  assert.match(msg,/Fri–Sun max 5/);
  assert.match(msg,/No approved monthly cap/);
  assert.doesNotMatch(msg,/20 Partner \/ 20 External/);
});
test('Forged legacy monthly policy cannot revive automatic booking checks',()=>{
  const date='2027-04-20';
  const {calendar}=projections([ref(1,'Partner Convoy',date)],date);
  assert.throws(()=>review({calendar:{
    ...calendar,policy:{...calendar.policy,partnerMonthly:20}
  },request:request(date)}));
  assert.equal(review({calendar,request:request(date)}).observedMonthlyLimitReached,false);
});
