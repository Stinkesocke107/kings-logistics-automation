'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {POLICY,dailyLimitForUtcDate,prioritizeUnconfirmedRequests}
  =require('../event-capacity-policy');
const {evaluate,dayAvailability}=require('../event-capacity-core');
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
test('Four mixed source convoys exceed global max 3 on BOTH weekdays and weekends',()=>{
  for(const date of ['2027-04-20','2027-04-25']){
    const rows=[ref(1,'Partner Convoy',date),ref(2,'Kings Convoy',date),
      ref(3,'External Convoy',date),ref(4,'Kings Convoy',date)];
    const {snapshot,month,calendar}=projections(rows,date);
    assert.equal(dailyLimitForUtcDate(date),3);
    assert.equal(snapshot.days[date].combined,4);
    assert.equal(snapshot.days[date].dayLimit,3);
    assert.equal(snapshot.days[date].remaining,null);
    assert.ok(snapshot.warnings.some(x=>x.code==='combined-day-over-limit'));
    assert.equal(month.days.find(x=>x.date===date).status,'Review');
    assert.equal(calendar.days.find(x=>x.utcDate===date).status,
      'Daily Quota Conflict — Human Review');
    for(const kind of POLICY.priorityOrder){
      const r=review({calendar,request:request(date,kind)});
      assert.equal(r.observedDailyLimitReached,true);
      assert.equal(r.quotaExempt,false);
      assert.equal(r.reviewPriority,POLICY.priorityOrder.indexOf(kind)+1);
      assert.equal(r.safeToActivate,false);
      assert.equal(r.slotReserved,false);
    }
  }
});
test('Three Kings alone reach daily cap with no monthly Kings maximum',()=>{
  const date='2027-04-25';
  const rows=Array.from({length:3},(_,i)=>ref(i+1,'Kings Convoy',date));
  const {snapshot,month,calendar}=projections(rows,date);
  assert.equal(snapshot.days[date].combined,3);
  assert.equal(snapshot.days[date].kings,3);
  assert.equal(month.days.find(x=>x.date===date).status,'Unverified');
  assert.equal(dayAvailability(snapshot,date).freeVerified,false);
  const r=review({calendar,request:request(date,'Kings Convoy')});
  assert.equal(r.observedDailyLimitReached,true);
  assert.equal(r.observedMonthlyLimitReached,false);
  assert.equal(r.quotaExempt,false);
});
test('Twenty Partner and twenty External independent monthly limits reached, not booking authorization',()=>{
  const date='2027-04-20',rows=[];
  for(let i=0;i<20;i++){
    const day='2027-04-'+String(i+1).padStart(2,'0');
    rows.push(ref(i+1,'Partner Convoy',day));
    rows.push(ref(100+i,'External Convoy',day));
  }
  const {snapshot,month,calendar}=projections(rows,date);
  assert.equal(snapshot.months['2027-04'].partnerLimitReached,true);
  assert.equal(snapshot.months['2027-04'].externalLimitReached,true);
  assert.equal(month.monthly.partnerLimit,20);
  assert.equal(month.monthly.externalLimit,20);
  const partner=review({calendar,request:request(date,'Partner Convoy')});
  const external=review({calendar,request:request(date,'External Convoy')});
  assert.equal(partner.observedMonthlyLimitReached,true);
  assert.equal(external.observedMonthlyLimitReached,true);
  assert.equal(partner.freeSlotsCertified,false);
  assert.equal(external.freeSlotsCertified,false);
});
test('Private day view and GitHub-only status repeat final policy, never claim free places',()=>{
  const date='2027-04-20',record=ref(1,'Kings Convoy',date),
    snapshot=evaluate([record],{dataFresh:true});
  const d=detailProjection({events:[record],dataFresh:true},
    snapshot,date,{guildId:G});
  assert.equal(d.baseLimit,POLICY.dailyTotalMax);
  assert.equal(d.remaining,null);
  assert.equal(d.monthly.partnerLimit,20);
  assert.equal(d.monthly.externalLimit,20);
  assert.equal(d.capacityVerified,false);
  assert.match(sanitizeDiscord(d).data.content,/Availability unverified/);
  const msg=messageFor({sourceAvailable:true,
    nowMs:Date.parse('2027-04-20T12:00:00Z')});
  assert.match(msg,/max 3 total Convoys every UTC day/);
  assert.match(msg,/Partner 20\/month/);
  assert.match(msg,/External 20\/month/);
  assert.match(msg,/Kings > Partner > External/);
  assert.doesNotMatch(msg,/Fri–Sun max 5/);
});
test('Unconfirmed priority is Kings > Partner > External, never auto-preempts confirmed bookings',()=>{
  const r=prioritizeUnconfirmedRequests([
    {eventType:'External Convoy',privateId:'dont-log'},
    {eventType:'Partner Convoy'},
    {eventType:'Kings Convoy'}
  ]);
  assert.deepEqual(r.requests.map(x=>x.sourceIndex),[2,1,0]);
  assert.equal(r.eventsCancelled,0);
  assert.equal(r.holdsReleased,0);
  assert.equal(r.bookingsChanged,0);
  assert.equal(JSON.stringify(r).includes('dont-log'),false);
});
test('Forged superseded quota or auto-capacity claim never passes Booking check',()=>{
  const date='2027-04-20';
  const {calendar}=projections([ref(1,'Partner Convoy',date)],date);
  for(const policy of [{...calendar.policy,dailyTotal:5},
    {...calendar.policy,partnerMonthly:null},
    {...calendar.policy,kingsConvoysQuotaExempt:true}]){
    assert.throws(()=>review({calendar:{...calendar,policy},request:request(date)}));
  }
  assert.equal(review({calendar,request:request(date)}).observedMonthlyLimitReached,false);
});
