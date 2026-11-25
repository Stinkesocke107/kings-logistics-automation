'use strict';
// Kings #18 Event Operations: read-only staff triage from already verified
// #12/#13/#14/#15/#16 source observations. No new Discord requests, no
// private identities, no invites, approvals, bookings or assignment writes.
const {trustedEventObservation}=require('./event-leadership-observation');
const {trustedInvitationObservation}=require('./event-invitation-tracker-source');
function observeOperations({eventSourceObservation=null,
  invitationSourceObservation=null,nowMs=Date.now()}={}){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0)
    throw Error('Kings Event Operations time unverified');
  const e=trustedEventObservation(eventSourceObservation,nowMs);
  const i=trustedInvitationObservation(invitationSourceObservation,nowMs);
  const status=Object.freeze({
    version:1,mode:'STAFF_TRIAGE_ONLY',readOnly:true,
    staffDecisionsVerified:false,calendarAvailabilityCertified:false,
    invitationsSent:0,bookingsCreated:0,staffAssignmentsChanged:0,
    eventSource:e?'RECONCILED':'UNAVAILABLE',
    invitationSource:i?(i.tagSchemaVerified?'RECONCILED':'INVITATIONS_READABLE_TAGS_UNVERIFIED'):'UNAVAILABLE',
    review:Object.freeze({
      eventTypeUnclassified:e?e.futureUnclassified:null,
      calendarDaysNeedingReview:e?e.futureDaysRequiringReview:null,
      daysOverThreeSourceClaims:e?e.futureDaysOverDailyLimit:null,
      historyMonthsWithoutClaims:e?e.historyMonthsWithoutClaims:null,
      invitationsMissingEventLinks:i?i.eventLinksMissing:null,
      invitationDuplicateEventLinks:i?i.duplicateConvoyEvents:null,
      invitationDuplicateVtcs:i?i.duplicateVtcReplies:null,
      invitationMalformedReplies:i?i.malformedReplies:null,
      invitationTagIssues:i?i.tagIssues:null,
      invitationPendingOrUnrecorded:i?i.recordedPending+i.replyNotRecorded:null
    })
  });
  return status;
}
function renderOperationsReview(status){
  if(!status||status.version!==1||status.readOnly!==true||
    status.mode!=='STAFF_TRIAGE_ONLY')throw Error('Kings Event Operations source unverified');
  const n=key=>{
    const value=status.review?.[key];
    return Number.isSafeInteger(value)&&value>=0?String(value):'Unavailable';
  };
  const sourceWarning=status.eventSource==='UNAVAILABLE'
    ?'Convoy source UNAVAILABLE — consult current Convoy Center; do not infer an empty calendar.'
    :'Current Convoy Center/Calendar source is reconciled for advisory review, not approvals.';
  const invitationWarning=status.invitationSource==='UNAVAILABLE'
    ?'Invitation source UNAVAILABLE — check private Tracker forum and source access.'
    :status.invitationSource==='INVITATIONS_READABLE_TAGS_UNVERIFIED'
      ?'Invitation replies readable; Forum lifecycle tags UNVERIFIED — Event Coordinators must review actual tag naming manually.'
      :'Private Invitation Tracker source is readable; response labels are NOT independently approved.';
  const text=[
    'Event Coordination / Event Coordination Lead — manual review, no auto approval.',
    sourceWarning,
    'Classify **'+n('eventTypeUnclassified')+'** event types · investigate **'+
      n('calendarDaysNeedingReview')+'** UTC calendar days · review **'+
      n('daysOverThreeSourceClaims')+'** days above 3 source claims.',
    '24-month historical months with no source claims **'+
      n('historyMonthsWithoutClaims')+'** (not proof of no Events).',
    invitationWarning,
    'Tracker issues: missing event links **'+n('invitationsMissingEventLinks')+
      '** · duplicate event links **'+n('invitationDuplicateEventLinks')+
      '** · duplicate VTC replies **'+n('invitationDuplicateVtcs')+
      '** · malformed replies **'+n('invitationMalformedReplies')+
      '** · tag issues **'+n('invitationTagIssues')+'**.',
    'Pending/unrecorded response labels **'+n('invitationPendingOrUnrecorded')+
      '** (manual review, not a confirmed RSVP).',
    'Escalate source access and exceptional policy decisions to authorised leadership; never automatically move confirmed convoys.'
  ].join('\n');
  if(text.length>1024)throw Error('Kings Event Operations field too long');
  return text;
}
module.exports={observeOperations,renderOperationsReview};
