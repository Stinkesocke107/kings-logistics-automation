'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {observeOperations,renderOperationsReview,operationsWorklist,
  renderOperationsWorklist,WORK_LABELS}=require('../event-operations-staff-triage');
const {COUNT_FIELDS}=require('../event-leadership-observation');
const {sandbox}=require('./sandbox.cjs');
function observationFixtures(nowMs=Date.now()){
  const observedAt=new Date(nowMs).toISOString();
  const event={
    version:1,observedAt,sourceCompiledAt:new Date(nowMs-5*60*1000).toISOString(),
    sourceReconciled:true,readOnly:true,historyVerified:false,
    staffApprovalsVerified:false,freeSlotsCertified:false,bookingsCreated:0,
    ...Object.fromEntries(COUNT_FIELDS.map(k=>[k,0])),
    tracked:10,scheduled:4,readyForApproval:2,needsInformation:1,completed:2,
    futureUnclassified:3,futureDaysRequiringReview:2,futureDaysOverDailyLimit:1,
    historyMonthsWithClaims:4,historyMonthsWithoutClaims:20,
    historyMonthsCenterOnly:3,historyMonthsLegacyOnly:1,
    historyMonthsBothSources:0,historyCenterClaims:3,historyLegacyClaims:1,
    historyLegacyEvidencePending:1
  };
  const invitation={
    version:1,readOnly:true,sourceForumVerified:true,tagSchemaVerified:true,
    invitationDecisionsVerified:false,staffApprovalsVerified:false,
    bookingsCreated:0,observedAt,
    convoyThreads:3,invitedVtcs:5,ongoingThreads:1,doneThreads:1,
    completedThreads:1,tagIssues:0,malformedReplies:1,
    duplicateVtcReplies:2,eventLinksRecorded:2,eventLinksMissing:1,
    duplicateConvoyEvents:0,linkedToCenter:1,recordedAccepted:1,
    recordedDeclined:1,recordedPending:1,replyNotRecorded:2
  };
  return {eventSourceObservation:event,invitationSourceObservation:invitation,nowMs};
}
test('Kings Event Operations #18 combines #12/#13/#14/#15/#16 advisory source flags without decisions',()=>{
  const o=observeOperations(observationFixtures());
  assert.equal(o.eventSource,'RECONCILED');
  assert.equal(o.invitationSource,'RECONCILED');
  assert.deepEqual(o.review,{
    eventTypeUnclassified:3,
    calendarDaysNeedingReview:2,
    daysOverThreeSourceClaims:1,
    partnerMonthsOver20:0,
    externalMonthsOver20:0,
    daysWithShortDepartureGap:0,
    historyMonthsWithoutClaims:20,
    pastOutcomesUnresolved:0,
    legacyClaimsMissingOriginalEvidence:1,
    futureLegacyHoldReview:0,
    invitationsMissingEventLinks:1,
    invitationDuplicateEventLinks:0,
    invitationDuplicateVtcs:2,
    invitationMalformedReplies:1,
    invitationTagIssues:0,
    invitationPendingOrUnrecorded:3
  });
  const prioritized=operationsWorklist(o);
  assert.deepEqual(prioritized.slice(0,2).map(x=>x.code),
    ['REVIEW_DAILY_CAP','REVIEW_EVENT_TYPES']);
  assert.ok(prioritized.every(x=>x.owner==='Event Coordinators'||
    x.owner==='Event Coordination Lead'));
  assert.equal(prioritized.some(x=>x.owner.includes('CEO')),false);
  const worklist=renderOperationsWorklist(o);
  assert.match(worklist,/HIGH · Event Coordination Lead/);
  assert.match(worklist,/No Staff assignment or automatic decisions/i);
  assert.ok(worklist.length<=1024);
  assert.equal(o.readOnly,true);
  assert.equal(o.bookingsCreated,0);
  assert.equal(o.invitationsSent,0);
  assert.equal(o.staffAssignmentsChanged,0);
  assert.equal(o.staffDecisionsVerified,false);
  const text=renderOperationsReview(o);
  assert.match(text,/Event Coordination/);
  assert.match(text,/Classify \*\*3\*\*/);
  assert.match(text,/days above 3 source claims/);
  assert.match(text,/Pending\/unrecorded response labels \*\*3\*\*/);
  assert.match(text,/manual review, not a confirmed RSVP/);
  assert.ok(text.length<=1024);
  assert.doesNotMatch(JSON.stringify(o)+text,/secret-event|discord-user-id|https:\/\/truckersmp/);
});
test('Event Operations flags readable replies with unverified Forum lifecycle tags',()=>{
  const f=observationFixtures();
  f.invitationSourceObservation.tagSchemaVerified=false;
  // If status tag mapping is unknown, no lifecycle state can be certified.
  f.invitationSourceObservation.ongoingThreads=0;
  f.invitationSourceObservation.doneThreads=0;
  f.invitationSourceObservation.completedThreads=0;
  f.invitationSourceObservation.tagIssues=f.invitationSourceObservation.convoyThreads;
  const ops=observeOperations(f);
  assert.equal(ops.invitationSource,'INVITATIONS_READABLE_TAGS_UNVERIFIED');
  assert.equal(ops.review.invitationDuplicateVtcs,2);
  const text=renderOperationsReview(ops);
  assert.match(text,/Invitation replies readable; Forum lifecycle tags UNVERIFIED/);
  const queue=operationsWorklist(ops);
  assert.ok(queue.some(x=>x.code==='VERIFY_FORUM_TAG_MAPPING'&&
    x.owner==='Event Coordination Lead'));
  assert.match(renderOperationsWorklist(ops),/Reconcile existing Forum tag names manually/);
  assert.doesNotMatch(text,/Private Invitation Tracker source is readable; response labels/);
});
test('missing and stale Event or Invitation source cannot become invented zero work',()=>{
  const f=observationFixtures();
  const missing=observeOperations({nowMs:f.nowMs});
  assert.equal(missing.eventSource,'UNAVAILABLE');
  assert.equal(missing.invitationSource,'UNAVAILABLE');
  assert.equal(missing.review.calendarDaysNeedingReview,null);
  assert.equal(missing.review.partnerMonthsOver20,null);
  assert.equal(missing.review.externalMonthsOver20,null);
  assert.equal(missing.review.daysWithShortDepartureGap,null);
  assert.equal(missing.review.pastOutcomesUnresolved,null);
  assert.equal(missing.review.legacyClaimsMissingOriginalEvidence,null);
  assert.equal(missing.review.futureLegacyHoldReview,null);
  assert.deepEqual(operationsWorklist(missing).map(x=>x.code),[
    'CONVOY_SOURCE_UNAVAILABLE','INVITATION_SOURCE_UNAVAILABLE'
  ]);
  assert.match(renderOperationsWorklist(missing),/BLOCKED · Event Coordination Lead/);
  assert.equal(missing.review.invitationPendingOrUnrecorded,null);
  const text=renderOperationsReview(missing);
  assert.match(text,/Convoy source UNAVAILABLE/);
  assert.match(text,/Invitation source UNAVAILABLE/);
  assert.match(text,/Unavailable/);
  const stale=observeOperations({
    ...f,nowMs:f.nowMs+37*60*60*1000
  });
  assert.equal(stale.eventSource,'UNAVAILABLE');
  assert.equal(stale.invitationSource,'UNAVAILABLE');
  const half=observeOperations({
    eventSourceObservation:f.eventSourceObservation,nowMs:f.nowMs
  });
  assert.equal(half.eventSource,'RECONCILED');
  assert.equal(half.invitationSource,'UNAVAILABLE');
});
test('validated Event Operations triage appears only on existing Event and Management dashboards',()=>{
  const f=observationFixtures();
  const s=sandbox('leadership-dashboard.js');
  const event=s.run('buildEvent('+JSON.stringify({
    eventReports:{eventSourceObservation:f.eventSourceObservation,
      invitationSourceObservation:f.invitationSourceObservation,
      weeklyReports:[],monthlyReports:[]}
  })+','+f.nowMs+')');
  const field=event.fields.find(x=>x.name.includes('Manual Staff Progress'));
  assert.ok(field);
  assert.match(field.value,/Team review only/);
  assert.match(field.value,/Classify missing Kings \/ Partner \/ External event types/);
  assert.doesNotMatch(field.value,/automatic approve|book available/i);
  assert.equal(event.title,'📅 Kings Event Leadership Dashboard');
  const capacity=event.fields.find(x=>x.name.includes('Event Capacity'));
  assert.ok(capacity);
  assert.match(capacity.value,/3 total\/day/);
  assert.match(capacity.value,/Partner months above 20/);
  assert.match(capacity.value,/UTC days with departures <2h apart/);
  assert.match(capacity.value,/No free slots certified/);
  const queue=event.fields.find(x=>x.name.includes('Review Order'));
  assert.ok(queue);
  assert.match(queue.value,/Review UTC days above 3 source-claimed convoys/);
  assert.ok(queue.value.length<=1024);
  const data={
    eventReports:{eventSourceObservation:f.eventSourceObservation,
      invitationSourceObservation:f.invitationSourceObservation},
    driverSummary:{currentDrivers:1,activity:{}},
    hr:{reviews:[]},loa:{leaves:[]},
    staffSummary:{currentStaff:0,changesLast30Days:{}},
    managementWeekly:{publishedWeeks:[]},managementMonthly:{monthlyReports:[]}
  };
  const management=s.run('buildManagement('+JSON.stringify(data)+', {}, {}, {}, {})');
  assert.ok(management.fields.some(x=>x.name.includes('Event Operations')));
  assert.equal(management.title,'👑 Kings Management Leadership Dashboard');
  assert.ok(management.fields.some(x=>x.name.includes('Event Capacity')));
  assert.ok(management.fields.some(x=>x.name.includes('Event History — Evidence Gaps')));
  assert.match(JSON.stringify(management),/Suggested next Staff review/);
  assert.ok(Object.hasOwn(WORK_LABELS,'VERIFY_FORUM_TAG_MAPPING'));
});
test('capacity monthly ceiling and departure-spacing warnings reach priority-ordered Event Operations tasks',()=>{
  const f=observationFixtures();
  f.eventSourceObservation.futurePartnerMonthsOver20=1;
  f.eventSourceObservation.futureExternalMonthsOver20=2;
  f.eventSourceObservation.futureDaysWithShortDepartureGap=1;
  const ops=observeOperations(f);
  assert.equal(ops.eventSource,'RECONCILED');
  assert.equal(ops.review.partnerMonthsOver20,1);
  assert.equal(ops.review.externalMonthsOver20,2);
  assert.equal(ops.review.daysWithShortDepartureGap,1);
  const rows=operationsWorklist(ops);
  assert.deepEqual(rows.slice(0,4).map(x=>x.code),[
    'REVIEW_DAILY_CAP','REVIEW_PARTNER_MONTH_CAP',
    'REVIEW_EXTERNAL_MONTH_CAP','REVIEW_EVENT_TYPES'
  ]);
  assert.ok(rows.some(x=>x.code==='REVIEW_DEPARTURE_SPACING'&&
    x.priority==='NORMAL'&&x.owner==='Event Coordinators'));
  assert.match(renderOperationsReview(ops),/Partner months >20 \*\*1\*\*/);
  assert.match(renderOperationsReview(ops),/External months >20 \*\*2\*\*/);
  assert.match(renderOperationsReview(ops),/UTC days with <2h gap \*\*1\*\*/);
  assert.match(renderOperationsWorklist(ops),/20 Partner convoy claims/);
  assert.equal(ops.bookingsCreated,0);
  assert.equal(ops.staffAssignmentsChanged,0);
  assert.ok(renderOperationsReview(ops).length<=1024);
  assert.ok(renderOperationsWorklist(ops).length<=1024);
});
test('missing past outcomes and future frozen Legacy holds are human-only History/Capacity review tasks',()=>{
  const f=observationFixtures();
  f.eventSourceObservation.historyPastCenterOutcomeUnresolved=2;
  f.eventSourceObservation.historyLegacyEvidencePending=2;
  f.eventSourceObservation.historyFutureLegacyHoldReview=1;
  const ops=observeOperations(f);
  assert.equal(ops.eventSource,'RECONCILED');
  assert.equal(ops.review.pastOutcomesUnresolved,2);
  assert.equal(ops.review.legacyClaimsMissingOriginalEvidence,2);
  assert.equal(ops.review.futureLegacyHoldReview,1);
  const work=operationsWorklist(ops);
  assert.ok(work.some(x=>x.code==='REVIEW_FUTURE_LEGACY_HOLDS'&&
    x.priority==='NORMAL'&&x.owner==='Event Coordination Lead'));
  assert.ok(work.some(x=>x.code==='REVIEW_PAST_OUTCOMES'&&
    x.priority==='FOLLOW_UP'&&x.owner==='Event Coordination Lead'));
  assert.ok(work.some(x=>x.code==='REVIEW_LEGACY_EVIDENCE'&&
    x.priority==='FOLLOW_UP'&&x.owner==='Event Coordination Lead'));
  assert.equal(ops.calendarAvailabilityCertified,false);
  assert.equal(ops.bookingsCreated,0);
  assert.equal(ops.staffDecisionsVerified,false);
  assert.ok(renderOperationsWorklist(ops).length<=1024);
  const s=sandbox('leadership-dashboard.js');
  const event=s.run('buildEvent('+JSON.stringify({
    eventReports:{eventSourceObservation:f.eventSourceObservation,
      invitationSourceObservation:f.invitationSourceObservation}
  })+','+f.nowMs+')');
  const history=event.fields.find(x=>x.name.includes('Decision Evidence Review'));
  assert.ok(history);
  assert.match(history.value,/past Center outcomes unclear \*\*2\*\*/);
  assert.match(history.value,/future dated Legacy holds requiring review \*\*1\*\*/);
  assert.match(history.value,/No free slots certified/);
  assert.ok(history.value.length<=1024);
});
test('Operations module is pure; no privileged writes, notifications or separate systems',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const file=fs.readFileSync(path.join(__dirname,'..','event-operations-staff-triage.js'),'utf8');
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github/workflows/leadership-dashboard.yml'),'utf8');
  assert.match(workflow,/node --check event-operations-staff-triage\.js/);
  assert.doesNotMatch(file,/fetch\(|discord\(|writeFileSync|https:|method:\s*['"](?:POST|PATCH|DELETE)['"]/);
  assert.doesNotMatch(file,/updateMember|sendInvitation|approveBooking|reserveSlot/);
  assert.throws(()=>observeOperations({nowMs:-1}),/time unverified/);
});
