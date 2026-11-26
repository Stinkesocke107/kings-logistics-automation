'use strict';
// Real-source GET-only integration probe for Kings Event systems #12/#14/#15/#16/#18.
// No Staff approvals, slots, bookings, messages, roles, writes or persisted data.
// Only fixed status strings may reach public CI; source contents stay in memory.
const {read}=require('./event-history-real-source-preview');
const {summarizeOperations}=require('./event-history-leadership-bridge');
const {buildEventObservation,trustedEventObservation}=
  require('./event-leadership-observation');
const {readInvitationTracker,trustedInvitationObservation}=
  require('./event-invitation-tracker-source');
const {observeOperations,operationsWorklist}=
  require('./event-operations-staff-triage');

function refuse(){throw Error('Kings Event cross-source integration unverified');}
async function inspect({
  env=process.env,nowMs=Date.now(),readSource=read,
  invitationReader=readInvitationTracker
}={}){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0||
     typeof readSource!=='function'||typeof invitationReader!=='function')refuse();
  const report=readSource('convoy-check-results.json');
  const overview=readSource('convoy-overview.json');
  const history=summarizeOperations({report,overview,nowMs});
  const event=buildEventObservation(report,overview,nowMs);
  if(trustedEventObservation(event,nowMs)!==event||
     history.mode!=='READ_ONLY_SOURCE_HISTORY_REVIEW'||
     history.utcHistoryWindowMonths!==24||history.futureWindowMonths!==12||
     history.original24MonthArchiveVerified!==false||
     history.individualHistoricalDecisionsVerified!==false||
     history.freeSlotsCertified!==false||history.bookingsCreated!==0||
     event.bookingsCreated!==0||event.freeSlotsCertified!==false||
     event.staffApprovalsVerified!==false||
     event.historyMonthsWithClaims!==history.historyMonthsWithSourceClaims||
     event.historyMonthsWithoutClaims!==history.historyMonthsWithoutSourceClaims||
     event.historyPastCenterOutcomeUnresolved!==history.pastCenterOutcomeUnresolved||
     event.historyFutureLegacyHoldReview!==history.futureDatedLegacyHoldReview||
     event.futureDaysOverDailyLimit!==history.futureDaysOverClaimedDailyLimit||
     event.futurePartnerMonthsOver20!==history.partnerMonthsOverClaimedLimit||
     event.futureExternalMonthsOver20!==history.externalMonthsOverClaimedLimit)
    refuse();
  const invite=await invitationReader({
    token:env.DISCORD_BOT_TOKEN,centerReport:report,nowMs,
    tagIds:env.DISCORD_INVITATION_TAG_IDS||null
  });
  if(trustedInvitationObservation(invite,nowMs)!==invite||
     invite.bookingsCreated!==0||invite.staffApprovalsVerified!==false||
     invite.invitationDecisionsVerified!==false||invite.sourceForumVerified!==true)
    refuse();
  const triage=observeOperations({
    eventSourceObservation:event,invitationSourceObservation:invite,nowMs
  });
  const expectedInvitation=invite.tagSchemaVerified===true?
    'RECONCILED':'INVITATIONS_READABLE_TAGS_UNVERIFIED';
  if(triage.mode!=='STAFF_TRIAGE_ONLY'||triage.readOnly!==true||
     triage.eventSource!=='RECONCILED'||
     triage.invitationSource!==expectedInvitation||
     triage.staffDecisionsVerified!==false||
     triage.calendarAvailabilityCertified!==false||
     triage.invitationsSent!==0||triage.bookingsCreated!==0||
     triage.staffAssignmentsChanged!==0||
     triage.review.invitationsMissingEventLinks!==invite.eventLinksMissing||
     triage.review.invitationDuplicateEventLinks!==invite.duplicateConvoyEvents||
     triage.review.invitationDuplicateVtcs!==invite.duplicateVtcReplies||
     triage.review.invitationMalformedReplies!==invite.malformedReplies||
     triage.review.invitationPendingOrUnrecorded!==
       invite.recordedPending+invite.replyNotRecorded)
    refuse();
  const work=operationsWorklist(triage);
  if(!Array.isArray(work))refuse();
  const expected=[
    ['REVIEW_DAILY_CAP',event.futureDaysOverDailyLimit],
    ['REVIEW_PARTNER_MONTH_CAP',event.futurePartnerMonthsOver20],
    ['REVIEW_EXTERNAL_MONTH_CAP',event.futureExternalMonthsOver20],
    ['REVIEW_CALENDAR_DAYS',event.futureDaysRequiringReview],
    ['REVIEW_DEPARTURE_SPACING',event.futureDaysWithShortDepartureGap],
    ['REVIEW_FUTURE_LEGACY_HOLDS',event.historyFutureLegacyHoldReview],
    ['REVIEW_MISSING_EVENT_LINKS',invite.eventLinksMissing],
    ['REVIEW_INVITATION_DUPLICATES',invite.duplicateVtcReplies],
    ['REVIEW_EVENT_LINK_DUPLICATES',invite.duplicateConvoyEvents],
    ['REVIEW_INVITATION_FORMAT',invite.malformedReplies],
    ['REVIEW_PENDING_REPLIES',invite.recordedPending+invite.replyNotRecorded]
  ];
  if(expected.some(([code,count])=>count>0&&
     !work.some(x=>x.code===code&&x.count===count))||
     (invite.tagSchemaVerified!==true&&
      !work.some(x=>x.code==='VERIFY_FORUM_TAG_MAPPING')))
    refuse();
  // Never return source counts, event IDs, invitation records or message IDs.
  return Object.freeze({
    status:invite.tagSchemaVerified===true?
      'EVENT_SOURCE_TO_STAFF_TRIAGE_RECONCILED':
      'INVITATION_TAG_SCHEMA_UNVERIFIED',
    readOnly:true,originalHistoryComplete:false,
    originalStaffDecisionsVerified:false,realNewStaffCommandVerified:false,
    freeSlotsCertified:false,bookingsCreated:0,privateDataLogged:false
  });
}
async function main(){
  try{
    const result=await inspect();
    if(result.status==='INVITATION_TAG_SCHEMA_UNVERIFIED'){
      console.warn('::warning::Kings Event cross-system source: INVITATION_TAG_SCHEMA_UNVERIFIED');
      process.exitCode=1;
    }else console.log('Kings Event cross-system source: '+result.status);
    console.log('Source claims only; no original approvals, new Staff action or bookable capacity certified.');
    return result;
  }catch{
    console.error('Kings Event cross-system source: SOURCE_UNVERIFIED');
    process.exitCode=1;
    return Object.freeze({status:'SOURCE_UNVERIFIED',readOnly:true,
      freeSlotsCertified:false,bookingsCreated:0,privateDataLogged:false});
  }
}
if(require.main===module)main();
module.exports={inspect,main};
