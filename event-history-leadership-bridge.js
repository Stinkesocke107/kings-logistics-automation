'use strict';
// Kings Event History #14 / Event Calendar #16 integration.
// Pure, in-memory, read-only: never approves, reserves, publishes or edits.
const {monthsFrom}=require('./event-capacity-pilot-source');
const HISTORY_MONTHS=24;
function utcInstant(value){
  if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim()))return null;
  const millis=Date.parse(value);
  return Number.isFinite(millis)&&millis>0?millis:null;
}
function historyMonthKey(time){
  return new Date(time).toISOString().slice(0,7);
}
function relevantCenter(x){
  return x&&!x.ignored&&!x.testThread&&!x.error&&
    !/^\s*\[?test\]?(?:\s|[-_:])/i.test(String(x.name||''));
}
function summarizeOperations({report,overview,nowMs=Date.now()}={}){
  const calendar=monthsFrom({report,overview},nowMs);
  if(report?.mode!=='READ_ONLY'||calendar?.ready!==false||
    calendar.freeSlotsCertified!==false||calendar.months?.length!==12)
    throw Error('Unverified Kings Event source');
  const currentCenter=report.threads.filter(relevantCenter);
  const frozenLegacy=overview.registeredConvoys.filter(x=>x?.source==='legacy-calendar');
  const now=new Date(nowMs);
  const months=Array.from({length:HISTORY_MONTHS},(_,index)=>({
    utcMonth:new Date(Date.UTC(now.getUTCFullYear(),
      now.getUTCMonth()-(HISTORY_MONTHS-1-index),1)).toISOString().slice(0,7),
    centerClaims:0,legacyClaims:0,
    completedClaims:0,cancelledClaims:0,rescheduledClaims:0
  }));
  const lookup=new Map(months.map(m=>[m.utcMonth,m]));
  let undatedCenter=0,undatedLegacy=0,otherPeriods=0;
  const observed=new Set();
  function ingest(item,source){
    const date=utcInstant(source==='center'?
      (item.validation?.parsed?.departureAtUtc||item.departureAtUtc):
      item.departureAtUtc);
    if(date===null){
      if(source==='center')undatedCenter++;else undatedLegacy++;
      return;
    }
    // A future convoy in the current UTC month belongs to the forward
    // Calendar review, never the historical completed-month observation.
    if(date>nowMs){otherPeriods++;return;}
    const row=lookup.get(historyMonthKey(date));
    if(!row){otherPeriods++;return;}
    const id=String(item.threadId||item.legacyId||item.eventId||'');
    const key=source+':'+id;
    if(!id||observed.has(key))throw Error('Duplicate or unidentified Kings Event history source');
    observed.add(key);
    if(source==='center')row.centerClaims++;else row.legacyClaims++;
    if(item.status==='Completed')row.completedClaims++;
    if(item.status==='Cancelled'||item.status==='Canceled')row.cancelledClaims++;
    if(item.status==='Rescheduled')row.rescheduledClaims++;
  }
  for(const x of currentCenter)ingest(x,'center');
  for(const x of frozenLegacy)ingest(x,'legacy');
  // Source coverage is deliberately only an inventory of observed claims.
  // A month without claims is a review gap, not proof that no convoy occurred.
  // A month with claims is NOT proof that all convoys were imported.
  const historyMonthsWithSourceClaims=months.filter(m=>
    m.centerClaims+m.legacyClaims>0).length;
  const historyMonthsWithoutSourceClaims=HISTORY_MONTHS-
    historyMonthsWithSourceClaims;
  const undatedHistoricalSourceClaims=undatedCenter+undatedLegacy;
  const historySourceReadErrors=report.threads.filter(x=>x&&!x.ignored&&
    !x.testThread&&x.error).length;
  const future=calendar.months;
  return {
    mode:'READ_ONLY_SOURCE_HISTORY_REVIEW',
    utcHistoryWindowMonths:HISTORY_MONTHS,history:months,
    datedCenterClaims:months.reduce((n,m)=>n+m.centerClaims,0),
    datedFrozenLegacyClaims:months.reduce((n,m)=>n+m.legacyClaims,0),
    undatedCenterClaims:undatedCenter,
    undatedLegacyClaims:undatedLegacy,
    undatedHistoricalSourceClaims,
    historyMonthsWithSourceClaims,
    historyMonthsWithoutSourceClaims,
    historySourceReadErrors,
    outsideHistoryWindowClaims:otherPeriods,
    futureWindowMonths:12,
    unclassifiedFutureCenterClaims:future.reduce((n,m)=>n+m.unclassified,0),
    futureDaysRequiringStaffReview:future.reduce((n,m)=>n+m.daysRequiringReview,0),
    futureDaysOverClaimedDailyLimit:future.reduce((n,m)=>n+m.daysOverDailyLimit,0),
    futureDaysWithShortDepartureGap:future.reduce((n,m)=>n+m.daysWithDepartureSpacingWarning,0),
    partnerMonthsOverClaimedLimit:future.filter(m=>m.monthlyPartnerOverLimit).length,
    externalMonthsOverClaimedLimit:future.filter(m=>m.monthlyExternalOverLimit).length,
    separateFrozenLegacyClaims:calendar.legacyClaims,
    original24MonthArchiveVerified:false,
    individualHistoricalDecisionsVerified:false,
    eventInvitationSourceLinked:false,
    freeSlotsCertified:false,eventChangesMade:0,bookingsCreated:0
  };
}
function compactLeadershipSection(report,overview,nowMs=Date.now()){
  let result;
  try{result=summarizeOperations({report,overview,nowMs});}
  catch{return '🗓️ **Calendar / Event History:** Source unverified. No available slots certified.';}
  return [
    '🗓️ **12-month Calendar review:** Unclassified: **'+
      result.unclassifiedFutureCenterClaims+'** · UTC days needing review: **'+
      result.futureDaysRequiringStaffReview+'** · >3/day: **'+
      result.futureDaysOverClaimedDailyLimit+'** · 2h spacing review **'+
      result.futureDaysWithShortDepartureGap+'** · Partner months >20 **'+
      result.partnerMonthsOverClaimedLimit+'** · External months >20 **'+
      result.externalMonthsOverClaimedLimit+'**. Advisory source only.',
    '📚 **24-month Event History:** Source claims: Center **'+
      result.datedCenterClaims+'**, Legacy **'+
      result.datedFrozenLegacyClaims+'** · months with claims **'+
      result.historyMonthsWithSourceClaims+'/24** · months without source claims **'+
      result.historyMonthsWithoutSourceClaims+'** · undated **'+
      result.undatedHistoricalSourceClaims+'** · read errors **'+
      result.historySourceReadErrors+'**. Source inventory only; full historical coverage **not verified**. No available slots certified.'
  ].join('\n');
}
function appendPrivateLeadershipReview(content,report,overview,nowMs=Date.now()){
  if(typeof content!=='string')throw Error('Invalid Event Leadership content');
  const full=content+'\n\n'+compactLeadershipSection(report,overview,nowMs);
  if(full.length<=1900)return full;
  const short='\n\n🗓️ Calendar / Event History: source review only; no available slots certified.';
  return content.length+short.length<=1900?content+short:content;
}
module.exports={summarizeOperations,compactLeadershipSection,
  appendPrivateLeadershipReview,utcInstant,historyMonthKey};
