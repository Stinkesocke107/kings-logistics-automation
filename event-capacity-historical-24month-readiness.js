'use strict';
// DRAFT/OFFLINE, 24-CALENDAR-MONTH HISTORY REVIEW WORKBOARD INPUT.
// The caller's claimed checkboxes are NOT authenticated source history.
// Never certify available Event slots or independently completed evidence.
const ERROR='Kings Event Capacity 24-month historical evidence review invalid.';
const PERIOD=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const REQUIRED=Object.freeze([
  'sourceInventoryReviewed',
  'acceptedCancelledRescheduledReviewed',
  'completedNotUsedAsAttendance',
  'archivedDeletedThreadsReconciled',
  'legacyEventsReconciled',
  'signedOwnerJournalCompared',
  'separateStaffReviewerChecked'
]);
function fail(){throw new Error(ERROR);}
function plain(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.getPrototypeOf(v)===Object.prototype;}
function exact(v,fields){if(!plain(v)||
  Object.keys(v).sort().join(',')!==[...fields].sort().join(','))fail();}
function ym(v){
  if(typeof v!=='string'||!PERIOD.test(v))fail();
  return v;
}
function plusMonth(month,n){
  const date=new Date(ym(month)+'-01T00:00:00.000Z');
  date.setUTCMonth(date.getUTCMonth()+n);
  return date.toISOString().slice(0,7);
}
function auditKings24MonthHistoricalReadiness({
  firstMonth,monthlyClaims=[],asOfMs=Date.now()
}={}){
  try{
    ym(firstMonth);
    if(!Number.isSafeInteger(asOfMs)||asOfMs<0||
      asOfMs>8640000000000000||
      !Array.isArray(monthlyClaims)||monthlyClaims.length>24)fail();
    const months=Array.from({length:24},(_,i)=>plusMonth(firstMonth,i));
    if(months.at(-1)>new Date(asOfMs).toISOString().slice(0,7))fail();
    const expected=new Set(months),provided=new Map();
    for(const claim of monthlyClaims){
      exact(claim,['month',...REQUIRED,'unresolvedReviewItems']);
      if(!expected.has(ym(claim.month))||provided.has(claim.month)||
        !Number.isSafeInteger(claim.unresolvedReviewItems)||
        claim.unresolvedReviewItems<0||
        claim.unresolvedReviewItems>10000||
        REQUIRED.some(key=>typeof claim[key]!=='boolean'))fail();
      provided.set(claim.month,claim);
    }
    const rows=[];let missing=0,flagged=0,claimedComplete=0,unresolved=0;
    for(const month of months){
      const claim=provided.get(month);
      if(!claim){
        missing++;
        rows.push(Object.freeze({month,claimSubmitted:false,
          reviewState:'No Monthly Evidence Submission',
          missingChecks:[...REQUIRED],
          unresolvedReviewItems:null,realEvidenceAuthenticated:false,
          availableSlotsCertified:false}));
        continue;
      }
      const checks=REQUIRED.filter(key=>claim[key]!==true);
      unresolved+=claim.unresolvedReviewItems;
      if(checks.length||claim.unresolvedReviewItems){
        flagged++;
      }else claimedComplete++;
      rows.push(Object.freeze({month,claimSubmitted:true,
        reviewState:checks.length||claim.unresolvedReviewItems?
          'Human Evidence Review Incomplete':
          'All Claims Submitted — Independent Source Verification Pending',
        missingChecks:checks,
        unresolvedReviewItems:claim.unresolvedReviewItems,
        realEvidenceAuthenticated:false,availableSlotsCertified:false}));
    }
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      firstMonth,finalMonth:months.at(-1),monthsRequired:24,
      counts:Object.freeze({
        monthsWithoutClaim:missing,monthsWithOpenChecks:flagged,
        monthsWithAllClaimsSubmitted:claimedComplete,
        unresolvedHumanReviewItems:unresolved,
        monthsIndependentlyAuthenticated:0
      }),
      rows,monthlyClaimsAreUntrustedUntilSourceAuthenticated:true,
      deletedAndArchivedEvidenceCompletenessProven:false,
      ongoing24MonthOriginalSourceHistoryVerified:false,
      independentlySignedOwnerHighwaterLatestnessVerified:false,
      realEventAttendanceInferred:false,
      realSourceAvailabilityCertified:false,
      requiresSourceAndOwnerReview:true,
      realHistoryImported:false,
      safeToActivate:false,freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={REQUIRED,auditKings24MonthHistoricalReadiness};
