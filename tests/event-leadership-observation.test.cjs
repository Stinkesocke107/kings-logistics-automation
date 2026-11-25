'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildEventObservation,trustedEventObservation}=require('../event-leadership-observation');
const {encryptEventState}=require('../event-leadership-state');
const {sandbox}=require('./sandbox.cjs');
const NOW=Date.parse('2027-03-20T12:00:00Z');
const G='1114967437788577792',F='1550619824005062697';
function fixture(){
  const future={
    eventId:'synthetic-private-future',threadId:'777777777777777777',
    name:'SECRET FUTURE INVITATION',status:'Scheduled',ignored:false,
    validation:{parsed:{eventType:'Partner Convoy',departureAtUtc:'2027-03-24T18:00:00Z'}}
  };
  const past={
    eventId:'synthetic-private-past',threadId:'777777777777777778',
    name:'SECRET PAST EVENT',status:'Completed',ignored:false,
    validation:{parsed:{eventType:'Kings Convoy',departureAtUtc:'2026-09-18T18:00:00Z'}}
  };
  const report={guildId:G,forumId:F,mode:'READ_ONLY',
    generatedAt:'2027-03-20T11:50:00Z',
    finalization:{finalizedAt:'2027-03-20T11:55:00Z'},
    summary:{totalThreads:2,actualConvoys:2},threads:[future,past]};
  const legacy={source:'legacy-calendar',threadId:'888888888888888888',
    eventId:'synthetic-private-legacy',status:'Legacy Past',
    departureAtUtc:'2026-11-20T18:00:00Z'};
  const overview={guildId:G,forumId:F,generatedAt:'2027-03-20T11:56:00Z',
    overall:{realConvoySubmissions:2,convoyReadErrors:0,
      legacyImportedConvoys:1,legacyDuplicatesSuppressed:0},
    registeredConvoys:report.threads.map(x=>({
      source:'convoy-center',threadId:x.threadId,eventId:x.eventId,
      status:x.status,departureAtUtc:x.validation.parsed.departureAtUtc
    })).concat(legacy)};
  return {report,overview};
}
test('reconciled read-only observation joins #14 History and #16 Calendar without private event fields',()=>{
  const observed=buildEventObservation(...Object.values(fixture()),NOW);
  assert.equal(observed.tracked,2);
  assert.equal(observed.scheduled,1);
  assert.equal(observed.completed,1);
  assert.equal(observed.historyMonthsWithClaims,2);
  assert.equal(observed.historyMonthsWithoutClaims,22);
  assert.equal(observed.historyMonthsCenterOnly,1);
  assert.equal(observed.historyMonthsLegacyOnly,1);
  assert.equal(observed.historyMonthsBothSources,0);
  assert.equal(observed.historyPastCenterOutcomeUnresolved,0);
  assert.equal(observed.historyLegacyEvidencePending,1);
  assert.equal(observed.historyFutureLegacyHoldReview,0);
  assert.ok(Array.isArray(observed.reviewAgenda));
  assert.ok(observed.reviewAgenda.every(x=>
    Object.keys(x).sort().join(',')==='code,count,utcMonth'));
  assert.equal(observed.historyLegacyClaims,1);
  assert.equal(observed.historyVerified,false);
  assert.equal(observed.freeSlotsCertified,false);
  assert.equal(observed.staffApprovalsVerified,false);
  assert.equal(observed.bookingsCreated,0);
  assert.equal(trustedEventObservation(observed,NOW),observed);
  const output=JSON.stringify(observed);
  for(const secret of ['SECRET','synthetic-private','777777777777777777',G,F,'2027-03-24'])
    assert.equal(output.includes(secret),false,'Private event information must stay in memory');
});
test('capacity observation exports aggregate UTC spacing conflicts and refuses an impossible source counter',()=>{
  const f=fixture();
  const extra={
    eventId:'synthetic-private-gap',threadId:'777777777777777779',
    name:'CONFIDENTIAL GAP EVENT',status:'Scheduled',ignored:false,
    validation:{parsed:{eventType:'External Convoy',
      departureAtUtc:'2027-03-24T19:00:00Z'}}
  };
  f.report.threads.push(extra);
  f.report.summary.totalThreads=3;
  f.report.summary.actualConvoys=3;
  f.overview.registeredConvoys.splice(2,0,{
    source:'convoy-center',threadId:extra.threadId,eventId:extra.eventId,
    status:extra.status,departureAtUtc:extra.validation.parsed.departureAtUtc
  });
  f.overview.overall.realConvoySubmissions=3;
  const observation=buildEventObservation(f.report,f.overview,NOW);
  assert.equal(observation.futureDaysWithShortDepartureGap,1);
  assert.equal(observation.futureDaysRequiringReview,1);
  assert.equal(observation.futureDaysOverDailyLimit,0);
  assert.equal(observation.futurePartnerMonthsOver20,0);
  assert.equal(observation.futureExternalMonthsOver20,0);
  assert.equal(trustedEventObservation(observation,NOW),observation);
  for(const invalid of [
    {futurePartnerMonthsOver20:13},
    {futureExternalMonthsOver20:13},
    {futureDaysWithShortDepartureGap:2},
    {futureDaysOverDailyLimit:2}
  ])assert.equal(trustedEventObservation({...observation,...invalid},NOW),null);
  assert.ok(!JSON.stringify(observation).includes('CONFIDENTIAL'));
  assert.ok(!JSON.stringify(observation).includes('synthetic-private-gap'));
});
test('unverified, stale and internally inconsistent Event source is unavailable, not zero',()=>{
  const f=fixture();
  const observation=buildEventObservation(f.report,f.overview,NOW);
  assert.equal(trustedEventObservation(observation,NOW+37*60*60*1000),null);
  for(const patch of [
    {sourceReconciled:false},{readOnly:false},{historyVerified:true},
    {staffApprovalsVerified:true},{freeSlotsCertified:true},
    {bookingsCreated:1},{historyMonthsWithoutClaims:23},
    {futurePartnerMonthsOver20:13},{futureExternalMonthsOver20:13},
    {historyMonthsCenterOnly:7},{historyMonthsLegacyOnly:7},
    {historyMonthsBothSources:7},{historyPastCenterOutcomeUnresolved:3},
    {historyLegacyEvidencePending:0},{historyFutureLegacyHoldReview:2},
    {reviewAgenda:[{code:'HISTORY_NO_RECORDS',utcMonth:'2027-03',count:null}]},
    {reviewAgenda:[{code:'PAST_CENTER_OUTCOME',utcMonth:'2027-03',
      count:1,threadId:'PRIVATE_THREAD'}]},
    {scheduled:1000},{historyCenterClaims:-1},
    {sourceCompiledAt:'2027-03-01T00:00:00Z'},
    {observedAt:'2027-04-01T00:00:00Z'}
  ])assert.equal(trustedEventObservation({...observation,...patch},NOW),null);
  f.overview.registeredConvoys[0].status='Cancelled';
  assert.throws(()=>buildEventObservation(f.report,f.overview,NOW),/unavailable|Unverified/i);
});
test('consolidated Leadership decrypts real AES Event container, never treats ciphertext as empty state',()=>{
  const observed=buildEventObservation(...Object.values(fixture()),NOW);
  const privateState={
    version:1,createdAt:'2027-03-20T00:00:00Z',updatedAt:'2027-03-20T11:56:00Z',
    lastSnapshot:[{threadId:'777777777777777777',name:'SECRET PRIVATE LEADERSHIP'}],
    changeLog:[],publishedDailyKeys:[],publishedWeeklyKeys:[],
    publishedMonthlyKeys:[],weeklyReports:[],monthlyReports:[],
    eventSourceObservation:observed
  };
  const sealed=encryptEventState(privateState,'x'.repeat(32));
  const s=sandbox('leadership-dashboard.js',{files:{
    'data/event-leadership-report-state.json':JSON.stringify(sealed)
  }});
  assert.equal(s.run('readPrivateEventReports().lastSnapshot[0].name'),'SECRET PRIVATE LEADERSHIP');
  const event=s.run('buildEvent({eventReports:readPrivateEventReports()},'+NOW+')');
  assert.match(JSON.stringify(event),/Reconciled/);
  assert.match(JSON.stringify(event),/months with claims/);
  assert.match(JSON.stringify(event),/Event History — Decision Evidence Review/);
  assert.match(JSON.stringify(event),/frozen Legacy claims requiring original Staff records/);
  assert.match(JSON.stringify(event),/Event History — Monthly Staff Review Order/);
  assert.match(JSON.stringify(event),/2026-11/);
  assert.doesNotMatch(JSON.stringify(event),/SECRET PRIVATE LEADERSHIP/);
  assert.doesNotMatch(JSON.stringify(sealed),/SECRET PRIVATE LEADERSHIP/);
  const stale=s.run('buildEvent({eventReports:readPrivateEventReports()},'+(NOW+37*3600000)+')');
  assert.match(JSON.stringify(stale),/Unavailable/);
  assert.doesNotMatch(JSON.stringify(stale),/Tracked \*\*0\*\*/);
});
test('missing or tampered Event state fails closed instead of announcing empty Event operations',()=>{
  const missing=sandbox('leadership-dashboard.js');
  const empty=missing.run('buildEvent({eventReports:readPrivateEventReports()},'+NOW+')');
  assert.match(JSON.stringify(empty),/Unavailable/);
  assert.doesNotMatch(JSON.stringify(empty),/Tracked \*\*0\*\*/);
  const bad=sandbox('leadership-dashboard.js',{files:{
    'data/event-leadership-report-state.json':JSON.stringify({
      version:1,encrypted:true,algorithm:'aes-256-gcm',iv:'bad',authTag:'bad',ciphertext:'bad'
    })
  }});
  assert.throws(()=>bad.run('readPrivateEventReports()'),/integrity check failed/);
  const plain=sandbox('leadership-dashboard.js',{files:{
    'data/event-leadership-report-state.json':JSON.stringify({
      version:1,lastSnapshot:[],changeLog:[]
    })
  }});
  assert.throws(()=>plain.run('readPrivateEventReports()'),/not encrypted/);
});
test('suppressed legacy Event messages can refresh encrypted observations without false publish keys',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const root=path.resolve(__dirname,'..');
  const reports=fs.readFileSync(path.join(root,'event-leadership-reports.js'),'utf8');
  const dashboard=fs.readFileSync(path.join(root,'leadership-dashboard.js'),'utf8');
  assert.equal((reports.match(/if \(sourceUpdated \|\| invitationUpdated\) saveState\(state\);/g)||[]).length,3);
  assert.match(reports,/Legacy Leadership publication suppressed/);
  assert.match(reports,/readInvitationTracker\(/);
  assert.match(reports,/invitationSourceObservation/);
  assert.match(dashboard,/eventReports: readPrivateEventReports\(\)/);
  assert.match(dashboard,/trustedEventObservation\(data\.eventReports\?\.eventSourceObservation\)/);
  assert.doesNotMatch(dashboard,/eventReports: readJson\(FILES\.eventReports, \{\}\)/);
});
