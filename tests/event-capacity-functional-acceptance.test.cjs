'use strict';
// Evidence-based system #12 acceptance tests. All Convoy identities below
// are synthetic. Checks the genuine planning->Calendar->Event Leadership->#18
// path but does NOT claim real original Staff sign-off or free Event capacity.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,LIMITS}=require('../convoy-planning-limits');
const {monthsFrom}=require('../event-capacity-pilot-source');
const {reconcileSourceInventory}=require('../event-capacity-pilot-reconcile');
const {summarizeOperations}=require('../event-history-leadership-bridge');
const {buildEventObservation,trustedEventObservation}=
  require('../event-leadership-observation');
const {observeOperations,operationsWorklist}=
  require('../event-operations-staff-triage');
const NOW=Date.parse('2027-03-31T12:00:00.000Z');
const G='1114967437788577792',F='1550619824005062697';
const BASE=700000000000000000n;
function synthetic(id,kind,time,status='Scheduled'){
  const eventId=String(500000+id),threadId=String(BASE+BigInt(id));
  return {eventId,threadId,name:'Synthetic Event '+id,status,
    ignored:false,testThread:false,
    validation:{parsed:{eventType:kind,eventDate:time.slice(0,10),
      departureAtUtc:time}}};
}
function fixtures(){
  const threads=[];
  let n=1;
  for(let day=1;day<=21;day++){
    const date='2027-04-'+String(day).padStart(2,'0');
    threads.push(synthetic(n++,'Partner Convoy',date+'T16:00:00Z'));
    threads.push(synthetic(n++,'External Convoy',date+'T18:30:00Z'));
  }
  threads.push(synthetic(n++,'Kings Convoy','2027-03-31T23:30:00Z'));
  threads.push(synthetic(n++,'Kings Convoy','2027-04-01T00:30:00Z'));
  threads.push(synthetic(n++,'Kings Convoy','2027-04-01T19:30:00Z'));
  const report={
    mode:'READ_ONLY',guildId:G,forumId:F,
    generatedAt:'2027-03-31T11:50:00Z',
    finalization:{finalizedAt:'2027-03-31T11:55:00Z'},
    summary:{totalThreads:threads.length,actualConvoys:threads.length},
    threads
  };
  const overview={
    guildId:G,forumId:F,generatedAt:'2027-03-31T11:56:00Z',
    overall:{realConvoySubmissions:threads.length,convoyReadErrors:0,
      legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
    registeredConvoys:threads.map(t=>({
      source:'convoy-center',eventId:t.eventId,threadId:t.threadId,
      status:t.status,departureAtUtc:t.validation.parsed.departureAtUtc
    }))
  };
  assert.equal(reconcileSourceInventory(report,overview).ok,true);
  return {report,overview};
}
test('#12 capacity thresholds agree across operational planner, real-shape Calendar and encrypted Leadership observation',()=>{
  const {report,overview}=fixtures();
  const planning=evaluate(report.threads);
  assert.deepEqual({...LIMITS},{dailyTotal:3,partnerMonthly:20,
    externalMonthly:20,kingsMonthly:null,separationMinutes:120});
  assert.equal(planning.mode,'advisory-only');
  assert.equal(planning.months['2027-04'].partner,21);
  assert.equal(planning.months['2027-04'].external,21);
  assert.equal(planning.months['2027-04'].kings,2);
  assert.equal(planning.days['2027-04-01'].total,4);
  for(const code of ['partner-month-over-limit','external-month-over-limit',
    'total-day-over-limit','departure-under-two-hours'])
    assert.ok(planning.warnings.some(w=>w.code===code),code);
  assert.ok(planning.warnings.some(w=>
    w.code==='departure-under-two-hours'&&w.period==='2027-04-01'&&
    w.minutesApart===60));
  assert.equal(planning.freeSlotsCertified,false);
  assert.equal(planning.historicalApprovalsVerified,false);
  const calendar=monthsFrom({report,overview},NOW);
  assert.equal(calendar.months.length,12);
  assert.equal(calendar.dailyTotalLimit,3);
  assert.equal(calendar.weeklyLimitApplied,false);
  assert.equal(calendar.freeSlotsCertified,false);
  assert.equal(calendar.ready,false);
  const apr=calendar.months[1];
  assert.equal(apr.partnerClaims,21);
  assert.equal(apr.externalClaims,21);
  assert.equal(apr.kingsClaims,2);
  assert.equal(apr.monthlyPartnerOverLimit,true);
  assert.equal(apr.monthlyExternalOverLimit,true);
  assert.equal(apr.daysOverDailyLimit,1);
  assert.equal(apr.daysWithDepartureSpacingWarning,1);
  assert.equal(apr.partnerMonthlyLimit,20);
  assert.equal(apr.externalMonthlyLimit,20);
  assert.equal(apr.kingsMonthlyLimit,null);
  assert.equal(apr.monthlyRemainingVerified,null);
  const history=summarizeOperations({report,overview,nowMs:NOW});
  assert.equal(history.partnerMonthsOverClaimedLimit,1);
  assert.equal(history.externalMonthsOverClaimedLimit,1);
  assert.equal(history.futureDaysOverClaimedDailyLimit,1);
  assert.equal(history.futureDaysWithShortDepartureGap,1);
  assert.equal(history.original24MonthArchiveVerified,false);
  assert.equal(history.freeSlotsCertified,false);
  const observed=buildEventObservation(report,overview,NOW);
  assert.equal(trustedEventObservation(observed,NOW),observed);
  const review=observeOperations({eventSourceObservation:observed,nowMs:NOW});
  assert.equal(review.eventSource,'RECONCILED');
  assert.equal(review.review.partnerMonthsOver20,1);
  assert.equal(review.review.externalMonthsOver20,1);
  assert.equal(review.review.daysOverThreeSourceClaims,1);
  assert.equal(review.review.daysWithShortDepartureGap,1);
  const codes=operationsWorklist(review).map(x=>x.code);
  for(const code of ['REVIEW_DAILY_CAP','REVIEW_PARTNER_MONTH_CAP',
    'REVIEW_EXTERNAL_MONTH_CAP','REVIEW_DEPARTURE_SPACING'])
    assert.ok(codes.includes(code),code);
  assert.equal(review.staffDecisionsVerified,false);
  assert.equal(review.calendarAvailabilityCertified,false);
  assert.equal(review.bookingsCreated,0);
});
test('frozen Legacy future holds remain independent review tasks and cannot release capacity',()=>{
  const {report,overview}=fixtures();
  const legacy={source:'legacy-calendar',eventId:'555555',
    threadId:String(BASE+100n),status:'Legacy Past',
    departureAtUtc:'2027-04-06T09:00:00Z'};
  overview.registeredConvoys.push(legacy);
  overview.overall.legacyImportedConvoys=1;
  assert.equal(reconcileSourceInventory(report,overview).ok,true);
  const cal=monthsFrom({report,overview},NOW);
  assert.equal(cal.months[1].legacyDatedKeptSeparate,1);
  assert.equal(cal.months[1].partnerClaims,21);
  assert.equal(cal.months[1].externalClaims,21);
  assert.equal(cal.months[1].monthlyRemainingVerified,null);
  assert.equal(cal.freeSlotsCertified,false);
  const observed=buildEventObservation(report,overview,NOW);
  assert.equal(observed.historyFutureLegacyHoldReview,1);
  const ops=observeOperations({eventSourceObservation:observed,nowMs:NOW});
  assert.ok(operationsWorklist(ops).some(x=>x.code==='REVIEW_FUTURE_LEGACY_HOLDS'));
  assert.equal(ops.bookingsCreated,0);
  assert.equal(ops.calendarAvailabilityCertified,false);
});
test('tampered, stale and inconsistent Capacity source never becomes available or bookable',()=>{
  for(const change of [
    d=>{d.overview.registeredConvoys[0].eventId='tampered';},
    d=>{d.overview.registeredConvoys[1].departureAtUtc='2027-04-20T16:00:00Z';},
    d=>{d.report.summary.actualConvoys++;},
    d=>{d.overview.guildId='other';}
  ]){
    const data=fixtures();
    change(data);
    assert.throws(()=>monthsFrom(data,NOW),/unavailable/);
    assert.throws(()=>summarizeOperations({...data,nowMs:NOW}),/unavailable|unverified/);
  }
  const stale=fixtures();
  assert.throws(()=>monthsFrom(stale,NOW+40*60*1000),/unavailable/);
  const honest=evaluate([synthetic(400,'Unclassified',
    '2027-04-01T17:00:00Z')]);
  assert.equal(honest.unknownTypes.length,1);
  assert.equal(honest.freeSlotsCertified,false);
  assert.equal(honest.counted,0);
});
