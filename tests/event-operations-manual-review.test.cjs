'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {COUNT_FIELDS}=require('../event-leadership-observation');
const {encryptEventState,decryptEventState}=require('../event-leadership-state');
const {STATES,keyOf,trustedRecords,hasAuthorizedActor,applyManualReview,
  taskFromSources,reviewSummary,renderReviewSummary}=require('../event-operations-manual-review-state');
const {run}=require('../event-operations-manual-review');
const {sandbox}=require('./sandbox.cjs');
const NOW=Date.parse('2026-11-26T13:00:00.000Z');
const SECRET='SYNTHETIC_KEY_'.repeat(4);
function makeState(now=NOW){
  const at=new Date(now).toISOString();
  return {
    version:1,createdAt:at,updatedAt:at,lastSnapshot:null,changeLog:[],
    publishedDailyKeys:[],publishedWeeklyKeys:[],publishedMonthlyKeys:[],
    weeklyReports:[],monthlyReports:[],
    eventSourceObservation:{
      version:1,observedAt:at,
      sourceCompiledAt:new Date(now-5*60000).toISOString(),
      sourceReconciled:true,readOnly:true,historyVerified:false,
      staffApprovalsVerified:false,freeSlotsCertified:false,
      bookingsCreated:0,...Object.fromEntries(COUNT_FIELDS.map(k=>[k,0])),
      tracked:4,scheduled:2,readyForApproval:1,needsInformation:1,
      historyCenterClaims:2,historyLegacyClaims:1,
      historyMonthsWithClaims:3,historyMonthsWithoutClaims:21,
      historyMonthsCenterOnly:2,historyMonthsLegacyOnly:1,
      historyLegacyEvidencePending:1,
      futureDaysOverDailyLimit:1,futureDaysRequiringReview:1,
      reviewAgenda:[{code:'FUTURE_LEGACY_HOLD',utcMonth:'2026-12',count:1}]
    }
  };
}
const base={scope:'worklist',code:'REVIEW_DAILY_CAP',month:null,actor:'EventLead'};
function change(state,action,now=NOW,opts={}){
  return applyManualReview({state,...base,action,nowMs:now,...opts});
}
test('GitHub actor allowlist must be configured; reruns, outsiders and wrong branch fail closed',()=>{
  const ok={actor:'EventLead',triggeringActor:'eventlead',
    allowlist:'EventLead, CoordinatorTwo',eventName:'workflow_dispatch',
    ref:'refs/heads/main'};
  assert.equal(hasAuthorizedActor(ok),true);
  for(const bad of [
    {allowlist:''},{allowlist:'OtherStaff'},
    {triggeringActor:'OtherStaff'},
    {eventName:'push'},{ref:'refs/heads/feature'},
    {allowlist:'EventLead,EventLead'},
    {allowlist:'EventLead, invalid account'}
  ])assert.equal(hasAuthorizedActor({...ok,...bad}),false);
});
test('manual review status changes require a fresh real source task and a two-stage human check',()=>{
  const original=makeState();
  assert.ok(taskFromSources({...base,state:original,nowMs:NOW}));
  assert.equal(trustedRecords(original.operationReviews).length,0);
  assert.throws(()=>change(original,'record_check',NOW,{
    confirmation:'ORIGINAL_RECORDS_CHECKED',evidenceKind:'STAFF_RECORD'
  }),/unverified/);
  const started=change(original,'start');
  assert.equal(started.operationReviews[0].status,'IN_REVIEW');
  assert.equal(started.operationReviews[0].audit.length,1);
  assert.equal(original.operationReviews,undefined);
  const blocked=change(started,'block',NOW+60000);
  assert.equal(blocked.operationReviews[0].status,'NEEDS_EVIDENCE');
  const resumed=change(blocked,'start',NOW+120000);
  assert.equal(resumed.operationReviews[0].status,'IN_REVIEW');
  const checked=change(resumed,'record_check',NOW+180000,{
    evidenceKind:'ORIGINAL_DISCORD',confirmation:'ORIGINAL_RECORDS_CHECKED'
  });
  assert.equal(checked.operationReviews[0].status,'STAFF_CHECK_RECORDED');
  assert.equal(checked.operationReviews[0].evidenceKind,'ORIGINAL_DISCORD');
  assert.equal(checked.operationReviews[0].audit.length,4);
  assert.deepEqual(checked.operationReviews[0].audit.map(x=>x.action),[
    'start','block','start','record_check'
  ]);
  assert.equal(reviewSummary(checked,NOW+180000).staffChecksRecorded,1);
  assert.match(renderReviewSummary(checked,NOW+180000),/source conflicts remain/i);
  assert.equal(checked.eventSourceObservation.staffApprovalsVerified,false);
  assert.equal(checked.eventSourceObservation.freeSlotsCertified,false);
  assert.equal(checked.eventSourceObservation.bookingsCreated,0);
  const reopened=change(checked,'reopen',NOW+240000);
  assert.equal(reopened.operationReviews[0].status,'OPEN');
  assert.equal(reopened.operationReviews[0].audit.length,5);
  assert.deepEqual(STATES,['OPEN','IN_REVIEW','NEEDS_EVIDENCE','STAFF_CHECK_RECORDED']);
});
test('a recorded check becomes RECHECK_REQUIRED when aggregate count changes or Staff evidence ages',()=>{
  const original=makeState();
  let state=change(original,'start',NOW);
  state=change(state,'record_check',NOW+60000,{
    evidenceKind:'STAFF_RECORD',confirmation:'ORIGINAL_RECORDS_CHECKED'
  });
  const newCount=structuredClone(state);
  newCount.eventSourceObservation.futureDaysOverDailyLimit=2;
  newCount.eventSourceObservation.futureDaysRequiringReview=2;
  const summary=reviewSummary(newCount,NOW+120000);
  assert.equal(summary.staffChecksRecorded,0);
  assert.equal(summary.recheck,1);
  assert.match(renderReviewSummary(newCount,NOW+120000),/RECHECK_REQUIRED/);
  const later=NOW+8*86400000;
  const refreshed=structuredClone(state);
  refreshed.eventSourceObservation.observedAt=new Date(later).toISOString();
  refreshed.eventSourceObservation.sourceCompiledAt=new Date(later-5*60000).toISOString();
  assert.equal(reviewSummary(refreshed,later).recheck,1);
  // A source finding disappearing does not automatically "close" a review.
  const gone=structuredClone(state);
  gone.eventSourceObservation.futureDaysOverDailyLimit=0;
  gone.eventSourceObservation.futureDaysRequiringReview=0;
  assert.equal(reviewSummary(gone,NOW+120000).noLongerActive,1);
  assert.equal(reviewSummary(gone,NOW+120000).staffChecksRecorded,0);
  assert.throws(()=>change(gone,'reopen',NOW+120000),/unverified/);
});
test('monthly historical evidence review is only for an actual allowlisted source month',()=>{
  const state=makeState();
  const opts={scope:'history',code:'FUTURE_LEGACY_HOLD',
    month:'2026-12',actor:'EventLead'};
  assert.equal(taskFromSources({...opts,state,nowMs:NOW}).count,1);
  const started=applyManualReview({state,...opts,action:'start',nowMs:NOW});
  assert.equal(started.operationReviews[0].key,'history:FUTURE_LEGACY_HOLD:2026-12');
  assert.match(renderReviewSummary(started,NOW),/2026-12/);
  assert.throws(()=>applyManualReview({state,...opts,month:'2026-11',
    action:'start',nowMs:NOW}),/unverified/);
  assert.throws(()=>applyManualReview({state,...opts,month:'2026-12-01',
    action:'start',nowMs:NOW}),/unverified/);
  assert.throws(()=>applyManualReview({state,...opts,code:'OTHER',
    action:'start',nowMs:NOW}),/unverified/);
  assert.throws(()=>change(state,'start',NOW,{
    scope:'worklist',month:'2026-11'
  }),/unverified/);
});
test('encrypted state accepts only exact review schema and never leaks actor or private source evidence',()=>{
  const state=change(makeState(),'start');
  const encrypted=encryptEventState(state,SECRET);
  assert.equal(encrypted.encrypted,true);
  assert.ok(!JSON.stringify(encrypted).includes('EventLead'));
  assert.equal(decryptEventState(encrypted,SECRET).operationReviews[0].status,'IN_REVIEW');
  for(const invalid of [
    [{...state.operationReviews[0],privateEventName:'SENSITIVE EVENT'}],
    [{...state.operationReviews[0],audit:[{...state.operationReviews[0].audit[0],link:'PRIVATE_LINK'}]}],
    [{...state.operationReviews[0],status:'BOOKED'}],
    [{...state.operationReviews[0],key:'worklist:INVALID:ALL'}],
    [{...state.operationReviews[0],sourceDigest:'garbage'}]
  ]){
    assert.throws(()=>encryptEventState({...state,operationReviews:invalid},SECRET),
      /unverified/);
  }
});
test('authorized run persists the journal ONLY to existing encrypted Event state; unauthorized run writes nothing',()=>{
  const original=makeState();
  const container=encryptEventState(original,SECRET);
  const writes=[];
  const env={
    DRIVER_STATE_KEY:SECRET,
    GITHUB_ACTOR:'EventLead',GITHUB_TRIGGERING_ACTOR:'EventLead',
    GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    KINGS_EVENT_REVIEW_OPERATORS:'EventLead,CoordinatorTwo',
    INPUT_SCOPE:'worklist',INPUT_CODE:'REVIEW_DAILY_CAP',
    INPUT_MONTH:'UNDATED',INPUT_ACTION:'start',
    INPUT_EVIDENCE_KIND:'NONE',INPUT_CONFIRMATION:''
  };
  const options={
    env,nowMs:NOW,read:()=>JSON.stringify(container),
    write:(file,content)=>writes.push({file,content})
  };
  const result=run(options);
  assert.equal(result.status,'MANUAL_REVIEW_JOURNAL_SAVED');
  assert.equal(result.discordWrites,0);
  assert.equal(result.bookingsCreated,0);
  assert.equal(writes.length,1);
  assert.ok(writes[0].file.endsWith('data/event-leadership-report-state.json'));
  assert.ok(!writes[0].content.includes('EventLead'));
  assert.ok(!writes[0].content.includes('REVIEW_DAILY_CAP'));
  const parsed=decryptEventState(JSON.parse(writes[0].content),SECRET);
  assert.equal(parsed.operationReviews.length,1);
  assert.deepEqual(parsed.eventSourceObservation,original.eventSourceObservation);
  assert.throws(()=>run({...options,env:{...env,
    KINGS_EVENT_REVIEW_OPERATORS:''}}),/not authorised/);
  assert.equal(writes.length,1);
  assert.throws(()=>run({...options,env:{...env,
    INPUT_ACTION:'record_check',INPUT_EVIDENCE_KIND:'ORIGINAL_EVENT_PAGE',
    INPUT_CONFIRMATION:''}}),/unverified/);
  assert.equal(writes.length,1);
});
test('existing private Leadership dashboards show manual progress without treating checks as Event approvals',()=>{
  const state=change(makeState(),'start');
  const s=sandbox('leadership-dashboard.js');
  const event=s.run('buildEvent('+JSON.stringify({eventReports:state})+','+NOW+')');
  const progress=event.fields.find(x=>x.name.includes('Manual Staff Progress'));
  assert.ok(progress);
  assert.match(progress.value,/In review \*\*1\*\*/);
  assert.match(progress.value,/no.*approval/i);
  assert.doesNotMatch(JSON.stringify(event),/EventLead/);
  assert.equal(event.fields.find(x=>x.name.includes('Review Order'))!==undefined,true);
  const management=s.run('buildManagement('+JSON.stringify({
    eventReports:state,driverSummary:{currentDrivers:1,activity:{}},
    staffSummary:{currentStaff:0,changesLast30Days:{}},
    hr:{reviews:[]},loa:{leaves:[]},
    managementWeekly:{publishedWeeks:[]},managementMonthly:{monthlyReports:[]}
  })+', {}, {}, {}, {})');
  assert.match(JSON.stringify(management),/Manual checks recorded/);
  assert.doesNotMatch(JSON.stringify(management),/EventLead/);
});
test('manual workflow requires private actor allowlist and never accepts raw evidence links or Discord writes',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,'..',
    '.github/workflows/event-operations-manual-review.yml'),'utf8');
  const code=fs.readFileSync(path.join(__dirname,'..',
    'event-operations-manual-review.js'),'utf8');
  assert.match(workflow,/KINGS_EVENT_REVIEW_OPERATORS: \$\{\{ secrets\.KINGS_EVENT_REVIEW_OPERATORS \}\}/);
  assert.match(workflow,/DRIVER_STATE_KEY: \$\{\{ secrets\.DRIVER_STATE_KEY \}\}/);
  assert.match(workflow,/concurrency:\s*\n\s*group: kings-event-leadership-reports/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/bash scripts\/git-safe-push\.sh main/);
  assert.match(workflow,/git add data\/event-leadership-report-state\.json/);
  assert.doesNotMatch(workflow,/DISCORD_BOT_TOKEN|DISCORD_WRITE_MODE|evidence_url|event_id|person_name/);
  assert.doesNotMatch(code,/discord\.com|fetch\(|POST|PATCH|DELETE/);
  assert.doesNotMatch(code,/console\.[a-z]+\([^\n]*(?:state|actor|env|err\.message)/);
});
