'use strict';
// Single CEO-approved planning policy for Kings Event Systems #12–18.
// This never grants booking, cancels a confirmed convoy, certifies a free
// slot, or reinterprets historical journal signatures from older policies.
const ERROR='Kings Event Capacity policy date or counts invalid.';
const POLICY=Object.freeze({
  policyId:'KINGS-EVENT-QUOTAS-2026-11-FINAL',
  dailyTotalMax:3,                // Every UTC day, all event types COMBINED.
  partnerMonthlyMax:20,           // Independent UTC calendar-month quota.
  externalMonthlyMax:20,
  kingsMonthlyMax:null,           // No monthly Kings maximum, BUT daily cap.
  weeklyMax:null,                 // No weekly limit or week budget.
  categoryDailyMax:null,          // No independent Partner/External daily cap.
  kingsQuotaExempt:false,         // Kings DO count toward daily total of 3.
  priorityOrder:Object.freeze(['Kings Convoy','Partner Convoy',
    'External Convoy']),
  minimumDepartureGapMinutes:120,
  recommendedDepartureGapMinutes:180,
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
function monthKey(month){
  if(typeof month!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month))fail();
  return month;
}
function count(n){
  if(!Number.isSafeInteger(n)||n<0||n>30000)fail();
  return n;
}
function dailyLimitForUtcDate(date){
  dateMs(date);
  return POLICY.dailyTotalMax;
}
function reviewDailyCount({day,partner,external,kings=0}={}){
  const limit=dailyLimitForUtcDate(day);
  count(partner);count(external);count(kings);
  const combined=partner+external+kings;
  const reasons=combined>limit?['COMBINED_DAILY_LIMIT_EXCEEDED']:[];
  return Object.freeze({
    day,limit,partner,external,kings,combined,
    reviewReasons:Object.freeze(reasons),
    observedPlanningLimitReached:combined>=limit,
    planningOverLimit:combined>limit,
    actualBookingCapacityCertified:false,
    staffApprovalGiven:false,freeSlotsCertified:false
  });
}
function reviewMonthlyCount({month,partner,external,kings=0}={}){
  monthKey(month);
  count(partner);count(external);count(kings);
  const reasons=[];
  if(partner>POLICY.partnerMonthlyMax)
    reasons.push('PARTNER_MONTHLY_LIMIT_EXCEEDED');
  if(external>POLICY.externalMonthlyMax)
    reasons.push('EXTERNAL_MONTHLY_LIMIT_EXCEEDED');
  return Object.freeze({
    month,partner,external,kings,
    partnerLimit:POLICY.partnerMonthlyMax,
    externalLimit:POLICY.externalMonthlyMax,kingsLimit:null,
    partnerAtLimit:partner>=POLICY.partnerMonthlyMax,
    externalAtLimit:external>=POLICY.externalMonthlyMax,
    planningOverLimit:reasons.length>0,
    reviewReasons:Object.freeze(reasons),
    partnerRemainingVerified:null,externalRemainingVerified:null,
    freeSlotsCertified:false,staffApprovalGiven:false
  });
}
// Stable category-first review order. Only handle NEW UNCONFIRMED requests;
// never preempt previously approved, committed, or historically held slots.
function prioritizeUnconfirmedRequests(requests){
  if(!Array.isArray(requests)||requests.length>5000)fail();
  const items=requests.map((x,index)=>{
    const type=x?.eventType;
    const rank=POLICY.priorityOrder.indexOf(type);
    return Object.freeze({
      sourceIndex:index,
      eventType:rank<0?'Unclassified':type,
      priorityRank:rank<0?null:rank+1,
      requiresManualClassification:rank<0
    });
  }).sort((a,b)=>(a.priorityRank??4)-(b.priorityRank??4)||
    a.sourceIndex-b.sourceIndex);
  return Object.freeze({
    priorityOrder:POLICY.priorityOrder,
    readOnly:true,candidateReviewOnly:true,
    staffApprovalGiven:false,approvedRequests:0,
    bookingsChanged:0,eventsCancelled:0,holdsReleased:0,
    requests:Object.freeze(items)
  });
}
module.exports={POLICY,dailyLimitForUtcDate,reviewDailyCount,
  reviewMonthlyCount,prioritizeUnconfirmedRequests};
