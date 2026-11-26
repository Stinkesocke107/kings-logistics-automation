'use strict';
// Private, aggregate-only Kings Event Center -> Calendar/History observation.
// This is NOT an Invitation Tracker, a booking engine or an approval source.
const {summarizeOperations}=require('./event-history-leadership-bridge');
const {trustedReviewAgenda}=require('./event-history-review-agenda');
const MAX_AGE_MS=36*60*60*1000;
const MAX_CLOCK_SKEW_MS=5*60*1000;
const COUNT_FIELDS=Object.freeze([
  'tracked','scheduled','readyForApproval','needsInformation','completed',
  'futureUnclassified','futureDaysRequiringReview',
  'futureDaysOverDailyLimit','futureDaysWithShortDepartureGap',
  'futurePartnerMonthsOver20','futureExternalMonthsOver20',
  'historyCenterClaims','historyLegacyClaims',
  'historyMonthsWithClaims','historyMonthsWithoutClaims',
  'historyMonthsCenterOnly','historyMonthsLegacyOnly','historyMonthsBothSources',
  'historyPastCenterOutcomeUnresolved','historyLegacyEvidencePending',
  'historyFutureLegacyHoldReview',
  'historyUndatedClaims','historyReadErrors'
]);
function eligible(item){
  return item&&!item.ignored&&!item.testThread&&!item.error&&
    !/^\s*\[?test\]?(?:\s|[-_:])/i.test(String(item.name||''));
}
function buildEventObservation(report,overview,nowMs=Date.now()){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0)
    throw Error('Kings Event source unavailable');
  const review=summarizeOperations({report,overview,nowMs});
  const real=report.threads.filter(eligible);
  const count=status=>real.filter(e=>e.status===status).length;
  const observation=Object.freeze({
    version:1,observedAt:new Date(nowMs).toISOString(),
    sourceCompiledAt:overview.generatedAt,
    sourceReconciled:true,readOnly:true,
    historyVerified:false,staffApprovalsVerified:false,
    freeSlotsCertified:false,bookingsCreated:0,
    tracked:real.length,
    scheduled:count('Scheduled'),
    readyForApproval:count('Ready for Approval'),
    needsInformation:count('Needs Information'),
    completed:count('Completed'),
    futureUnclassified:review.unclassifiedFutureCenterClaims,
    futureDaysRequiringReview:review.futureDaysRequiringStaffReview,
    futureDaysOverDailyLimit:review.futureDaysOverClaimedDailyLimit,
    futureDaysWithShortDepartureGap:review.futureDaysWithShortDepartureGap,
    futurePartnerMonthsOver20:review.partnerMonthsOverClaimedLimit,
    futureExternalMonthsOver20:review.externalMonthsOverClaimedLimit,
    historyCenterClaims:review.datedCenterClaims,
    historyLegacyClaims:review.datedFrozenLegacyClaims,
    historyMonthsWithClaims:review.historyMonthsWithSourceClaims,
    historyMonthsWithoutClaims:review.historyMonthsWithoutSourceClaims,
    historyMonthsCenterOnly:review.historyMonthsCenterOnly,
    historyMonthsLegacyOnly:review.historyMonthsLegacyOnly,
    historyMonthsBothSources:review.historyMonthsBothSources,
    historyPastCenterOutcomeUnresolved:review.pastCenterOutcomeUnresolved,
    historyLegacyEvidencePending:review.legacyClaimsNeedingOriginalEvidence,
    historyFutureLegacyHoldReview:review.futureDatedLegacyHoldReview,
    historyUndatedClaims:review.undatedHistoricalSourceClaims,
    historyReadErrors:review.historySourceReadErrors,
    reviewAgenda:review.reviewAgenda
  });
  if(!trustedEventObservation(observation,nowMs))
    throw Error('Kings Event source integrity unavailable');
  return observation;
}
function trustedEventObservation(value,nowMs=Date.now()){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0||
    !value||typeof value!=='object'||Array.isArray(value)||
    value.version!==1||value.sourceReconciled!==true||
    value.readOnly!==true||value.historyVerified!==false||
    value.staffApprovalsVerified!==false||value.freeSlotsCertified!==false||
    value.bookingsCreated!==0)return null;
  const observed=Date.parse(value.observedAt);
  const compiled=Date.parse(value.sourceCompiledAt);
  if(!Number.isFinite(observed)||!Number.isFinite(compiled)||
    !/Z$/.test(String(value.observedAt))||
    !/Z$/.test(String(value.sourceCompiledAt))||
    observed>nowMs+MAX_CLOCK_SKEW_MS||
    nowMs-observed>MAX_AGE_MS||
    compiled>observed+MAX_CLOCK_SKEW_MS||
    observed-compiled>30*60*1000)return null;
  // Older encrypted observations may not have a monthly agenda. Do not
  // invent an empty agenda; the dashboard marks it Unavailable until refresh.
  // Any supplied agenda is validated against the exact allowlisted schema
  // so private Event details cannot enter the encrypted aggregate.
  if(value.reviewAgenda!==undefined&&
    !trustedReviewAgenda(value.reviewAgenda))return null;
  if(COUNT_FIELDS.some(field=>!Number.isSafeInteger(value[field])||
    value[field]<0||value[field]>100000))return null;
  if(value.historyMonthsWithClaims+value.historyMonthsWithoutClaims!==24||
    value.historyMonthsCenterOnly+value.historyMonthsLegacyOnly+
      value.historyMonthsBothSources!==value.historyMonthsWithClaims||
    value.historyPastCenterOutcomeUnresolved>value.historyCenterClaims||
    value.historyLegacyEvidencePending<value.historyLegacyClaims||
    value.historyFutureLegacyHoldReview>value.historyLegacyEvidencePending||
    value.futurePartnerMonthsOver20>12||value.futureExternalMonthsOver20>12||
    value.futureDaysOverDailyLimit>value.futureDaysRequiringReview||
    value.futureDaysWithShortDepartureGap>value.futureDaysRequiringReview||
    value.readyForApproval>value.tracked||value.scheduled>value.tracked||
    value.needsInformation>value.tracked||value.completed>value.tracked||
    value.readyForApproval+value.scheduled+
      value.needsInformation+value.completed>value.tracked||
    value.historyReadErrors!==0)return null;
  return value;
}
module.exports={buildEventObservation,trustedEventObservation,
  MAX_AGE_MS,COUNT_FIELDS};
