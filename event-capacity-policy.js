'use strict';
// Canonical Kings Event Coordination DAILY planning policy as of Nov 2026.
// This is a planning/quota-review policy, NOT a booking authorization.
// Historical signed data from earlier policy versions must never be
// silently reinterpreted or used to release old-date holds.
const ERROR='Kings Event Capacity policy date or counts invalid.';
const POLICY=Object.freeze({
  policyId:'KINGS-EVENT-DAILY-2026-11',
  weekdayCombinedMax:3,       // Mon–Thu (UTC)
  weekendCombinedMax:5,       // Fri–Sun (UTC)
  partnerDailyMax:2,
  externalDailyMax:2,
  kingsQuotaExempt:true,
  minimumDepartureGapMinutes:120,
  recommendedDepartureGapMinutes:180,
  // No replacement monthly quota has been adopted. Never silently
  // enforce the retired 20+20 monthly caps or certify monthly free slots.
  partnerMonthlyMax:null,
  externalMonthlyMax:null,
  dailyCapIsPlanningOnly:true,
  grantsStaffApproval:false,
  canCertifyFreeSlots:false
});
function fail(){throw Error(ERROR);}
function dateMs(date){
  if(typeof date!=='string'||
    !/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date))fail();
  const time=Date.parse(date+'T00:00:00.000Z');
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==date)fail();
  return time;
}
function dailyLimitForUtcDate(date){
  const weekday=new Date(dateMs(date)).getUTCDay();
  return weekday===0||weekday===5||weekday===6?
    POLICY.weekendCombinedMax:POLICY.weekdayCombinedMax;
}
function reviewDailyCount({day,partner,external,kings=0}={}){
  const maxCombined=dailyLimitForUtcDate(day);
  for(const n of [partner,external,kings])
    if(!Number.isSafeInteger(n)||n<0||n>30000)fail();
  const combined=partner+external;
  const reasons=[];
  if(combined>maxCombined)reasons.push('COMBINED_DAILY_LIMIT_EXCEEDED');
  if(partner>POLICY.partnerDailyMax)
    reasons.push('PARTNER_DAILY_LIMIT_EXCEEDED');
  if(external>POLICY.externalDailyMax)
    reasons.push('EXTERNAL_DAILY_LIMIT_EXCEEDED');
  return Object.freeze({day,limit:maxCombined,partner,external,kings,combined,
    reviewReasons:Object.freeze(reasons),
    observedPlanningLimitReached:combined>=maxCombined||
      partner>=POLICY.partnerDailyMax||
      external>=POLICY.externalDailyMax,
    planningOverLimit:reasons.length>0,
    actualBookingCapacityCertified:false,
    staffApprovalGiven:false,
    freeSlotsCertified:false});
}
module.exports={POLICY,dailyLimitForUtcDate,reviewDailyCount};
