'use strict';
// PUBLIC repository runner: actual Event source reports must never be printed,
// uploaded, persisted or sent to another provider during this diagnostic.
// No approved slots, Staff decisions or historic completeness can be inferred.
const fs=require('node:fs');
const {summarizeOperations}=require('./event-history-leadership-bridge');
function read(name){
  const file='output/'+name;
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size===0||stat.size>12*1024*1024)
    throw Error('Unverified local Event source');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function inspectReal(){
  const report=read('convoy-check-results.json');
  const overview=read('convoy-overview.json');
  const result=summarizeOperations({report,overview});
  if(result.mode!=='READ_ONLY_SOURCE_HISTORY_REVIEW'||
     result.utcHistoryWindowMonths!==24||
     result.futureWindowMonths!==12||
     result.freeSlotsCertified!==false||
     result.original24MonthArchiveVerified!==false||
     result.individualHistoricalDecisionsVerified!==false||
     result.eventInvitationSourceLinked!==false||
     result.historyMonthsCenterOnly+result.historyMonthsLegacyOnly+
       result.historyMonthsBothSources!==result.historyMonthsWithSourceClaims||
     result.historyMonthsWithSourceClaims+result.historyMonthsWithoutSourceClaims!==24||
     !Number.isSafeInteger(result.pastCenterOutcomeUnresolved)||
     result.pastCenterOutcomeUnresolved<0||
     result.pastCenterOutcomeUnresolved>result.datedCenterClaims||
     !Number.isSafeInteger(result.legacyClaimsNeedingOriginalEvidence)||
     result.legacyClaimsNeedingOriginalEvidence<result.datedFrozenLegacyClaims||
     !Number.isSafeInteger(result.futureDatedLegacyHoldReview)||
     result.futureDatedLegacyHoldReview<0||
     result.futureDatedLegacyHoldReview>result.legacyClaimsNeedingOriginalEvidence||
     result.bookingsCreated!==0)
    throw Error('Unverified Event source review');
  return Object.freeze({
    status:'EVENT_HISTORY_CALENDAR_SOURCE_RECONCILED',
    readOnly:true,
    originalHistoryComplete:false,
    staffApprovalsVerified:false,
    bookingsCreated:0,
    publicEventDetailsLogged:false
  });
}
function main(){
  try{
    const result=inspectReal();
    // Fixed, allowlisted wording only. No Event counts, IDs, names, Staff
    // identities, dates, routes or bot tokens in GitHub Actions stdout.
    console.log('Kings Event History / Calendar: '+result.status);
    console.log('Original 24-month history NOT verified; Staff approvals and available slots NOT certified.');
    return result;
  }catch{
    console.error('Kings Event History / Calendar: SOURCE_UNVERIFIED');
    process.exitCode=1;
    return Object.freeze({status:'SOURCE_UNVERIFIED',readOnly:true,
      publicEventDetailsLogged:false,bookingsCreated:0});
  }
}
if(require.main===module)main();
module.exports={read,inspectReal,main};
