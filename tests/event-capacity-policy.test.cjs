'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {POLICY,dailyLimitForUtcDate,reviewDailyCount,reviewMonthlyCount,
  prioritizeUnconfirmedRequests}=require('../event-capacity-policy');
test('ALL seven weekdays have exactly 3 total Kings/Partner/External convoys per UTC day',()=>{
  for(const d of ['2027-03-22','2027-03-23','2027-03-24','2027-03-25',
    '2027-03-26','2027-03-27','2027-03-28'])
    assert.equal(dailyLimitForUtcDate(d),3);
  assert.equal(POLICY.dailyTotalMax,3);
  assert.equal(POLICY.weeklyMax,null);
  assert.equal(POLICY.categoryDailyMax,null);
  assert.equal(POLICY.kingsQuotaExempt,false);
});
test('Kings count toward 3/day; no other per-category day cap',()=>{
  const r=reviewDailyCount({day:'2027-03-27',kings:3,partner:1,external:0});
  assert.equal(r.combined,4);
  assert.equal(r.planningOverLimit,true);
  assert.deepEqual(r.reviewReasons,['COMBINED_DAILY_LIMIT_EXCEEDED']);
  assert.equal(r.staffApprovalGiven,false);
  assert.equal(r.freeSlotsCertified,false);
  const mix=reviewDailyCount({day:'2027-03-26',kings:1,partner:1,external:1});
  assert.equal(mix.observedPlanningLimitReached,true);
  assert.equal(mix.planningOverLimit,false);
});
test('Kings alone: 3/day acceptable, 4/day requires review on any day',()=>{
  const three=reviewDailyCount({day:'2027-03-25',kings:3,partner:0,external:0});
  assert.equal(three.planningOverLimit,false);
  const four=reviewDailyCount({day:'2027-03-28',kings:4,partner:0,external:0});
  assert.equal(four.planningOverLimit,true);
});
test('Partner and External have independent monthly 20 caps, Kings unlimited',()=>{
  assert.equal(POLICY.partnerMonthlyMax,20);
  assert.equal(POLICY.externalMonthlyMax,20);
  assert.equal(POLICY.kingsMonthlyMax,null);
  const r=reviewMonthlyCount({month:'2027-03',partner:21,
    external:20,kings:100});
  assert.equal(r.partnerLimit,20);
  assert.equal(r.externalLimit,20);
  assert.equal(r.kingsLimit,null);
  assert.equal(r.partnerAtLimit,true);
  assert.equal(r.externalAtLimit,true);
  assert.deepEqual(r.reviewReasons,['PARTNER_MONTHLY_LIMIT_EXCEEDED']);
  assert.equal(r.planningOverLimit,true);
  assert.equal(r.partnerRemainingVerified,null);
  assert.equal(r.staffApprovalGiven,false);
});
test('Monthly limits reset at UTC month boundaries, never rolling weeks',()=>{
  for(const month of ['2027-03','2027-04']){
    const r=reviewMonthlyCount({month,partner:20,external:20,kings:500});
    assert.equal(r.planningOverLimit,false);
    assert.equal(r.partnerAtLimit,true);
    assert.equal(r.externalAtLimit,true);
  }
});
test('Kings first, Partner second, External third — STABLE read-only new-request review',()=>{
  const r=prioritizeUnconfirmedRequests([
    {eventType:'External Convoy',eventId:'private-e'},
    {eventType:'Partner Convoy',eventId:'private-p'},
    {eventType:'Kings Convoy',eventId:'private-k'},
    {eventType:'External Convoy',eventId:'private-e2'}
  ]);
  assert.deepEqual(r.requests.map(x=>x.sourceIndex),[2,1,0,3]);
  assert.deepEqual(r.requests.map(x=>x.priorityRank),[1,2,3,3]);
  assert.equal(r.approvedRequests,0);
  assert.equal(r.eventsCancelled,0);
  assert.equal(r.holdsReleased,0);
  assert.equal(JSON.stringify(r).includes('private-'),false);
});
test('Invalid UTC dates, monthly keys and forged numeric totals fail closed',()=>{
  for(const day of ['2027-02-29','2027-03-0','2027-13-01',
    '2027-03-25T10:00:00Z','2027-03-25+01:00','0000-01-01'])
    assert.throws(()=>dailyLimitForUtcDate(day));
  for(const n of [-1,0.1,Number.NaN,100000]){
    assert.throws(()=>reviewDailyCount({day:'2027-03-25',partner:n,external:0}));
    assert.throws(()=>reviewMonthlyCount({month:'2027-03',partner:n,external:0}));
  }
  assert.throws(()=>reviewMonthlyCount({month:'2027-13',partner:0,external:0}));
});
test('Policy does not authorize booking or claim a free slot',()=>{
  assert.equal(POLICY.minimumDepartureGapMinutes,120);
  assert.equal(POLICY.recommendedDepartureGapMinutes,180);
  assert.equal(POLICY.canCertifyFreeSlots,false);
  assert.equal(POLICY.grantsStaffApproval,false);
});
