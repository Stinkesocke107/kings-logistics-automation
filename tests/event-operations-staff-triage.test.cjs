'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {observeOperations,renderOperationsReview}
  =require('../event-operations-staff-triage');
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
    historyMonthsWithClaims:4,historyMonthsWithoutClaims:20
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
    historyMonthsWithoutClaims:20,
    invitationsMissingEventLinks:1,
    invitationDuplicateEventLinks:0,
    invitationDuplicateVtcs:2,
    invitationMalformedReplies:1,
    invitationTagIssues:0,
    invitationPendingOrUnrecorded:3
  });
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
  const ops=observeOperations(f);
  assert.equal(ops.invitationSource,'INVITATIONS_READABLE_TAGS_UNVERIFIED');
  assert.equal(ops.review.invitationDuplicateVtcs,2);
  const text=renderOperationsReview(ops);
  assert.match(text,/Invitation replies readable; Forum lifecycle tags UNVERIFIED/);
  assert.doesNotMatch(text,/Private Invitation Tracker source is readable; response labels/);
});
test('missing and stale Event or Invitation source cannot become invented zero work',()=>{
  const f=observationFixtures();
  const missing=observeOperations({nowMs:f.nowMs});
  assert.equal(missing.eventSource,'UNAVAILABLE');
  assert.equal(missing.invitationSource,'UNAVAILABLE');
  assert.equal(missing.review.calendarDaysNeedingReview,null);
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
  const field=event.fields.find(x=>x.name.includes('Event Operations'));
  assert.ok(field);
  assert.match(field.value,/Classify \*\*3\*\*/);
  assert.doesNotMatch(field.value,/automatic approve|book available/i);
  assert.equal(event.title,'📅 Kings Event Leadership Dashboard');
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
