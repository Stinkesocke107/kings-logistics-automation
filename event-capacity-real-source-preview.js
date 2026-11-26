'use strict';
// Public GitHub runner: verify real #12 Capacity/Calendar/History staff-review
// integration from the already generated private Convoy Center source files.
// Never export private identities, exact dates, VTCs, routes, or counts.
const {read}=require('./event-history-real-source-preview');
const {buildEventObservation,trustedEventObservation}=require('./event-leadership-observation');
const {observeOperations,operationsWorklist}=require('./event-operations-staff-triage');
function inspectReal(nowMs=Date.now()){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0)
    throw Error('Kings Capacity source unverified');
  const report=read('convoy-check-results.json');
  const overview=read('convoy-overview.json');
  const observed=buildEventObservation(report,overview,nowMs);
  if(trustedEventObservation(observed,nowMs)!==observed||
    observed.historyVerified!==false||observed.freeSlotsCertified!==false||
    observed.staffApprovalsVerified!==false||observed.bookingsCreated!==0||
    observed.futurePartnerMonthsOver20>12||
    observed.futureExternalMonthsOver20>12||
    observed.futureDaysWithShortDepartureGap>observed.futureDaysRequiringReview)
    throw Error('Kings Capacity source claims unverified');
  const triage=observeOperations({eventSourceObservation:observed,nowMs});
  if(triage.eventSource!=='RECONCILED'||triage.readOnly!==true||
    triage.calendarAvailabilityCertified!==false||
    triage.staffDecisionsVerified!==false||triage.bookingsCreated!==0||
    triage.review.eventTypeUnclassified!==observed.futureUnclassified||
    triage.review.calendarDaysNeedingReview!==observed.futureDaysRequiringReview||
    triage.review.daysOverThreeSourceClaims!==observed.futureDaysOverDailyLimit||
    triage.review.partnerMonthsOver20!==observed.futurePartnerMonthsOver20||
    triage.review.externalMonthsOver20!==observed.futureExternalMonthsOver20||
    triage.review.daysWithShortDepartureGap!==observed.futureDaysWithShortDepartureGap||
    triage.review.futureLegacyHoldReview!==observed.historyFutureLegacyHoldReview)
    throw Error('Kings Capacity Staff review source unverified');
  // A real source warning must actually appear in the Staff's worklist.
  // Comparing aggregate counters alone can conceal a disconnected triage.
  const items=operationsWorklist(triage);
  if(!Array.isArray(items))throw Error('Kings Capacity Staff worklist unverified');
  const required=[
    ['REVIEW_EVENT_TYPES',observed.futureUnclassified],
    ['REVIEW_CALENDAR_DAYS',observed.futureDaysRequiringReview],
    ['REVIEW_DAILY_CAP',observed.futureDaysOverDailyLimit],
    ['REVIEW_PARTNER_MONTH_CAP',observed.futurePartnerMonthsOver20],
    ['REVIEW_EXTERNAL_MONTH_CAP',observed.futureExternalMonthsOver20],
    ['REVIEW_DEPARTURE_SPACING',observed.futureDaysWithShortDepartureGap],
    ['REVIEW_FUTURE_LEGACY_HOLDS',observed.historyFutureLegacyHoldReview]
  ];
  if(required.some(([code,count])=>count>0&&!items.some(item=>
    item.code===code&&item.count===count)))
    throw Error('Kings Capacity Staff worklist warning missing');
  // Exactly the reviewed fixed status is returned; not any source count or
  // private record. No effect, no approval, no notification and no booking.
  return Object.freeze({
    status:'CAPACITY_READ_ONLY_SOURCE_RECONCILED',readOnly:true,
    sourceClaimsOnly:true,monthlyKingsUnlimited:true,
    dailyLimit:3,partnerMonthlyLimit:20,externalMonthlyLimit:20,
    separationMinutes:120,staffApprovalsVerified:false,
    freeSlotsCertified:false,bookingsCreated:0,
    privateEventContentLogged:false
  });
}
function main(){
  try{
    const result=inspectReal();
    console.log('Kings Event Capacity: '+result.status);
    console.log('Monthly limits and 2h gaps are Staff review claims only; no free slots, bookings or approvals verified.');
    return result;
  }catch{
    console.error('Kings Event Capacity: SOURCE_UNVERIFIED');
    process.exitCode=1;
    return Object.freeze({status:'SOURCE_UNVERIFIED',readOnly:true,
      freeSlotsCertified:false,bookingsCreated:0,privateEventContentLogged:false});
  }
}
if(require.main===module)main();
module.exports={inspectReal,main};
