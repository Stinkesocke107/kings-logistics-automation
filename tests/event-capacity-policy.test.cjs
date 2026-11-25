'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {POLICY,dailyLimitForUtcDate,reviewDailyCount}
  =require('../event-capacity-policy');
test('Current Kings rule is Mon–Thu 3 and Fri–Sun 5 in UTC',()=>{
  for(const day of ['2027-03-22','2027-03-23','2027-03-24','2027-03-25'])
    assert.equal(dailyLimitForUtcDate(day),3);
  for(const day of ['2027-03-26','2027-03-27','2027-03-28'])
    assert.equal(dailyLimitForUtcDate(day),5);
});
test('Separate partner and external daily limits remain two each',()=>{
  const over=reviewDailyCount({day:'2027-03-27',
    partner:3,external:1,kings:30});
  assert.ok(over.reviewReasons.includes('PARTNER_DAILY_LIMIT_EXCEEDED'));
  assert.equal(over.reviewReasons.includes('COMBINED_DAILY_LIMIT_EXCEEDED'),false);
  assert.equal(over.planningOverLimit,true);
  assert.equal(over.freeSlotsCertified,false);
});
test('Normal weekdays count shared categories but Kings remain quota exempt',()=>{
  const over=reviewDailyCount({day:'2027-03-25',
    partner:2,external:2,kings:300});
  assert.equal(over.combined,4);
  assert.equal(over.limit,3);
  assert.ok(over.reviewReasons.includes('COMBINED_DAILY_LIMIT_EXCEEDED'));
  assert.equal(over.staffApprovalGiven,false);
});
test('Counts at category threshold are warnings for proposed additions, not approved slots',()=>{
  const r=reviewDailyCount({day:'2027-03-26',partner:2,
    external:1,kings:0});
  assert.equal(r.planningOverLimit,false);
  assert.equal(r.observedPlanningLimitReached,true);
  assert.equal(r.actualBookingCapacityCertified,false);
});
test('No current 20+20 monthly quota may be quietly reinstated',()=>{
  assert.equal(POLICY.partnerMonthlyMax,null);
  assert.equal(POLICY.externalMonthlyMax,null);
  assert.equal(POLICY.weekdayCombinedMax,3);
  assert.equal(POLICY.weekendCombinedMax,5);
  assert.equal(POLICY.partnerDailyMax,2);
  assert.equal(POLICY.externalDailyMax,2);
  assert.equal(POLICY.minimumDepartureGapMinutes,120);
  assert.equal(POLICY.recommendedDepartureGapMinutes,180);
  assert.equal(POLICY.canCertifyFreeSlots,false);
});
test('Invalid dates, non-UTC-local guesses or forged numeric totals are refused',()=>{
  for(const day of ['2027-02-29','2027-03-0','2027-13-01',
    '2027-03-25T10:00:00Z','2027-03-25+01:00','0000-01-01'])
    assert.throws(()=>dailyLimitForUtcDate(day));
  for(const n of [-1,0.1,Number.NaN,100000]){
    assert.throws(()=>reviewDailyCount({
      day:'2027-03-25',partner:n,external:0
    }));
  }
});
