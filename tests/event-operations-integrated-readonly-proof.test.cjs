'use strict';
// Synthetic only. No real Event records, Discord access or secret material.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(ROOT,'event-operations-integrated-readonly-proof.js'),'utf8');
const PRIVATE='PRIVATE_KINGS_EVENT_VTC_OR_STAFF_CONTENT_MUST_NEVER_LOG';
const NOW=Date.parse('2026-11-27T12:00:00.000Z');
function simulate({tagVerified=true,invalidHistory=false,failSource=false,
  missingWorklist=false,invalidInvitation=false,badTriage=false}={}){
  const logs=[],warn=[],errors=[],calls=[],process={exitCode:0,env:{DISCORD_BOT_TOKEN:'MOCK_PRIVATE_BOT_SECRET'}};
  const event={
    version:1,sourceReconciled:true,readOnly:true,
    freeSlotsCertified:false,staffApprovalsVerified:false,bookingsCreated:0,
    historyMonthsWithClaims:3,historyMonthsWithoutClaims:21,
    historyPastCenterOutcomeUnresolved:1,historyFutureLegacyHoldReview:1,
    futureDaysOverDailyLimit:1,futurePartnerMonthsOver20:1,
    futureExternalMonthsOver20:0,futureDaysRequiringReview:1,
    futureDaysWithShortDepartureGap:1,futureUnclassified:1,
    historyLegacyEvidencePending:1,
    privateMarker:PRIVATE
  };
  const history={
    mode:'READ_ONLY_SOURCE_HISTORY_REVIEW',utcHistoryWindowMonths:24,
    futureWindowMonths:12,original24MonthArchiveVerified:invalidHistory,
    individualHistoricalDecisionsVerified:false,freeSlotsCertified:false,
    bookingsCreated:0,historyMonthsWithSourceClaims:3,
    historyMonthsWithoutSourceClaims:21,pastCenterOutcomeUnresolved:1,
    futureDatedLegacyHoldReview:1,futureDaysOverClaimedDailyLimit:1,
    partnerMonthsOverClaimedLimit:1,externalMonthsOverClaimedLimit:0
  };
  const invite={
    version:1,readOnly:true,sourceForumVerified:true,
    tagSchemaVerified:tagVerified,staffApprovalsVerified:false,
    invitationDecisionsVerified:invalidInvitation,bookingsCreated:0,
    eventLinksMissing:1,duplicateConvoyEvents:0,duplicateVtcReplies:1,
    malformedReplies:1,recordedPending:1,replyNotRecorded:1,
    privateMarker:PRIVATE
  };
  const report={mode:'READ_ONLY',sourceMarker:PRIVATE};
  const overview={sourceMarker:PRIVATE};
  const review={
    eventTypeUnclassified:1,calendarDaysNeedingReview:1,
    daysOverThreeSourceClaims:1,partnerMonthsOver20:1,externalMonthsOver20:0,
    daysWithShortDepartureGap:1,historyMonthsWithoutClaims:21,
    pastOutcomesUnresolved:1,legacyClaimsMissingOriginalEvidence:1,
    futureLegacyHoldReview:1,
    invitationsMissingEventLinks:1,invitationDuplicateEventLinks:0,
    invitationDuplicateVtcs:1,invitationMalformedReplies:1,
    invitationPendingOrUnrecorded:badTriage?0:2
  };
  const work=[
    ['REVIEW_EVENT_TYPES',1],['REVIEW_HISTORY_GAPS',21],
    ['REVIEW_PAST_OUTCOMES',1],['REVIEW_LEGACY_EVIDENCE',1],
    ['REVIEW_DAILY_CAP',1],['REVIEW_PARTNER_MONTH_CAP',1],
    ['REVIEW_CALENDAR_DAYS',1],['REVIEW_DEPARTURE_SPACING',1],
    ['REVIEW_FUTURE_LEGACY_HOLDS',1],['REVIEW_MISSING_EVENT_LINKS',1],
    ['REVIEW_INVITATION_DUPLICATES',1],['REVIEW_INVITATION_FORMAT',1],
    ['REVIEW_PENDING_REPLIES',2],
    ...(!tagVerified?[['VERIFY_FORUM_TAG_MAPPING',null]]:[])
  ].filter(x=>!missingWorklist||x[0]!=='REVIEW_MISSING_EVENT_LINKS')
   .map(([code,count])=>({code,count}));
  const modules={
    './event-history-real-source-preview':{
      read:name=>{calls.push('read:'+name);
        if(failSource)throw Error(PRIVATE);
        return name==='convoy-check-results.json'?report:overview;}
    },
    './event-history-leadership-bridge':{
      summarizeOperations:()=>history
    },
    './event-leadership-observation':{
      buildEventObservation:()=>event,
      trustedEventObservation:x=>x
    },
    './event-invitation-tracker-source':{
      readInvitationTracker:async args=>{
        calls.push('GET_INVITATION');
        assert.equal(args.centerReport,report);
        return invite;
      },
      trustedInvitationObservation:x=>x
    },
    './event-operations-staff-triage':{
      observeOperations:()=>({
        mode:'STAFF_TRIAGE_ONLY',readOnly:true,
        eventSource:'RECONCILED',
        invitationSource:tagVerified?'RECONCILED':'INVITATIONS_READABLE_TAGS_UNVERIFIED',
        staffDecisionsVerified:false,calendarAvailabilityCertified:false,
        invitationsSent:0,bookingsCreated:0,staffAssignmentsChanged:0,review
      }),
      operationsWorklist:()=>work
    }
  };
  const module={exports:{}};
  const requireFn=name=>{if(!Object.hasOwn(modules,name))throw Error('Unexpected module '+name);return modules[name];};
  requireFn.main=null;
  vm.runInNewContext(source,{module,require:requireFn,process,Date,
    console:{log:x=>logs.push(String(x)),warn:x=>warn.push(String(x)),
      error:x=>errors.push(String(x))}});
  return {module,process,logs,warn,errors,calls};
}
test('all five Event source stages produce one bounded safe advisory status',async()=>{
  const x=simulate();
  const result=await x.module.exports.inspect({
    nowMs:NOW,env:x.process.env,
    readSource:name=>{x.calls.push('direct:'+name);return name==='convoy-check-results.json'?
      {mode:'READ_ONLY',sourceMarker:PRIVATE}:{sourceMarker:PRIVATE};},
    invitationReader:async()=>({
      sourceForumVerified:true,tagSchemaVerified:true,bookingsCreated:0,
      invitationDecisionsVerified:false,staffApprovalsVerified:false,
      eventLinksMissing:1,duplicateConvoyEvents:0,duplicateVtcReplies:1,
      malformedReplies:1,recordedPending:1,replyNotRecorded:1
    })
  });
  assert.equal(result.status,'EVENT_SOURCE_TO_STAFF_TRIAGE_RECONCILED');
  assert.equal(result.originalHistoryComplete,false);
  assert.equal(result.originalStaffDecisionsVerified,false);
  assert.equal(result.realNewStaffCommandVerified,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.bookingsCreated,0);
  assert.ok(!JSON.stringify(result).includes(PRIVATE));
});
test('Forum tag mismatch is still incomplete even with readable invitations',async()=>{
  const x=simulate({tagVerified:false});
  const result=await x.module.exports.main();
  assert.equal(result.status,'INVITATION_TAG_SCHEMA_UNVERIFIED');
  assert.equal(x.process.exitCode,1);
  assert.match(x.warn.join(' '),/INVITATION_TAG_SCHEMA_UNVERIFIED/);
  assert.doesNotMatch(x.warn.join(' '),new RegExp(PRIVATE));
});
test('every unsafe or inconsistent source fails closed and redacts private content',async()=>{
  for(const scenario of [
    {invalidHistory:true},{failSource:true},{missingWorklist:true},
    {invalidInvitation:true},{badTriage:true}
  ]){
    const x=simulate(scenario);
    const result=await x.module.exports.main();
    assert.equal(result.status,'SOURCE_UNVERIFIED');
    assert.equal(x.process.exitCode,1);
    assert.match(x.errors.join(' '),/SOURCE_UNVERIFIED/);
    assert.doesNotMatch(x.errors.join(' '),new RegExp(PRIVATE));
    assert.doesNotMatch(x.logs.join(' '),new RegExp(PRIVATE));
    assert.equal(result.bookingsCreated,0);
  }
});
test('integrated source job is main-only, GET-only and never changes Staff, Events or Git state',()=>{
  const flow=fs.readFileSync(path.join(ROOT,'.github/workflows/event-leadership-reports.yml'),'utf8');
  assert.match(flow,/options:\s*\n\s*- invitation-check\s*\n\s*- capacity-check\s*\n\s*- integration-check/);
  const start=flow.indexOf('  event_integrated_source_verify:');
  const end=flow.indexOf('\n  report:',start);
  assert.ok(start>0&&end>start);
  const job=flow.slice(start,end);
  assert.match(job,/github\.ref == 'refs\/heads\/main'/);
  assert.match(job,/contents: read/);
  assert.match(job,/DISCORD_WRITE_MODE: 'false'/);
  assert.match(job,/CONVOY_FINALIZE_WRITE_MODE: 'false'/);
  assert.ok(job.includes('node "$script" >/dev/null 2>&1'));
  assert.match(job,/node event-operations-integrated-readonly-proof\.js/);
  assert.doesNotMatch(job,/gh workflow run|git push|git commit|workflow_dispatch.*roles/);
  assert.doesNotMatch(source,/writeFileSync|appendFileSync|method:\s*['"](?:POST|PATCH|PUT|DELETE)/);
  assert.ok(flow.includes("inputs.report != 'integration-check'"));
});
