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
// Read-only worklist for Event Coordinators. The "owner" is the proposed
// function responsible for review, not an assignment to a Discord member.
const WORK_LABELS=Object.freeze({
  CONVOY_SOURCE_UNAVAILABLE:'Review Convoy Center source access / freshness',
  INVITATION_SOURCE_UNAVAILABLE:'Review private Invitation Tracker source access',
  REVIEW_DAILY_CAP:'Review UTC days above 3 source-claimed convoys',
  REVIEW_EVENT_TYPES:'Classify missing Kings / Partner / External event types',
  REVIEW_CALENDAR_DAYS:'Review unresolved UTC calendar days',
  VERIFY_FORUM_TAG_MAPPING:'Reconcile existing Forum tag names manually',
  REVIEW_INVITATION_DUPLICATES:'Review duplicate VTC invitation replies',
  REVIEW_EVENT_LINK_DUPLICATES:'Review duplicate event links across threads',
  REVIEW_INVITATION_FORMAT:'Review malformed invitation reply records',
  REVIEW_MISSING_EVENT_LINKS:'Match missing event links to current Convoy Center',
  REVIEW_PENDING_REPLIES:'Follow up on recorded pending/undocumented replies',
  REVIEW_HISTORY_GAPS:'Inspect months without historical source claims'
});
const ORDER=Object.freeze({BLOCKED:0,HIGH:1,NORMAL:2,FOLLOW_UP:3});
function operationsWorklist(status){
  if(!status||status.version!==1||status.mode!=='STAFF_TRIAGE_ONLY'||
     status.readOnly!==true||!status.review)
    throw Error('Kings Event Operations source unverified');
  const result=[];
  function add(priority,code,owner,count,active){
    if(!active)return;
    if(!Object.hasOwn(WORK_LABELS,code)||
       (count!==null&&(!Number.isSafeInteger(count)||count<0)))
      throw Error('Kings Event Operations worklist unverified');
    result.push(Object.freeze({priority,code,owner,count}));
  }
  const q=status.review;
  add('BLOCKED','CONVOY_SOURCE_UNAVAILABLE','Event Coordination Lead',null,
    status.eventSource==='UNAVAILABLE');
  add('BLOCKED','INVITATION_SOURCE_UNAVAILABLE','Event Coordination Lead',null,
    status.invitationSource==='UNAVAILABLE');
  add('HIGH','REVIEW_DAILY_CAP','Event Coordination Lead',
    q.daysOverThreeSourceClaims,Number.isInteger(q.daysOverThreeSourceClaims)&&
    q.daysOverThreeSourceClaims>0);
  add('HIGH','REVIEW_EVENT_TYPES','Event Coordinators',q.eventTypeUnclassified,
    Number.isInteger(q.eventTypeUnclassified)&&q.eventTypeUnclassified>0);
  add('NORMAL','REVIEW_CALENDAR_DAYS','Event Coordination Lead',
    q.calendarDaysNeedingReview,
    Number.isInteger(q.calendarDaysNeedingReview)&&q.calendarDaysNeedingReview>0);
  add('NORMAL','VERIFY_FORUM_TAG_MAPPING','Event Coordination Lead',null,
    status.invitationSource==='INVITATIONS_READABLE_TAGS_UNVERIFIED');
  add('NORMAL','REVIEW_INVITATION_DUPLICATES','Event Coordinators',
    q.invitationDuplicateVtcs,Number.isInteger(q.invitationDuplicateVtcs)&&
    q.invitationDuplicateVtcs>0);
  add('NORMAL','REVIEW_EVENT_LINK_DUPLICATES','Event Coordinators',
    q.invitationDuplicateEventLinks,
    Number.isInteger(q.invitationDuplicateEventLinks)&&
    q.invitationDuplicateEventLinks>0);
  add('NORMAL','REVIEW_INVITATION_FORMAT','Event Coordinators',
    q.invitationMalformedReplies,
    Number.isInteger(q.invitationMalformedReplies)&&q.invitationMalformedReplies>0);
  add('NORMAL','REVIEW_MISSING_EVENT_LINKS','Event Coordinators',
    q.invitationsMissingEventLinks,
    Number.isInteger(q.invitationsMissingEventLinks)&&
    q.invitationsMissingEventLinks>0);
  add('FOLLOW_UP','REVIEW_PENDING_REPLIES','Event Coordinators',
    q.invitationPendingOrUnrecorded,
    Number.isInteger(q.invitationPendingOrUnrecorded)&&
    q.invitationPendingOrUnrecorded>0);
  add('FOLLOW_UP','REVIEW_HISTORY_GAPS','Event Coordination Lead',
    q.historyMonthsWithoutClaims,
    Number.isInteger(q.historyMonthsWithoutClaims)&&
    q.historyMonthsWithoutClaims>0);
  return Object.freeze(result.sort((a,b)=>ORDER[a.priority]-ORDER[b.priority]));
}
function renderOperationsWorklist(status){
  const items=operationsWorklist(status);
  const visible=items.slice(0,7);
  const lines=[
    'Suggested manual review order; no Staff assignment or automatic decisions.',
    ...(visible.length?visible.map(item=>
      item.priority+' · '+item.owner+': '+WORK_LABELS[item.code]+
      (item.count===null?' (source/status check)':' ('+item.count+')')):
      ['No currently observed source-review items. This does not certify event approvals.']),
    ...(items.length>visible.length?
      ['Additional review categories: '+(items.length-visible.length)+
        ' · see existing Event source review fields.']:[]),
    'Keep confirmed convoys and invitation decisions under authorised human control.'
  ];
  const output=lines.join('\n');
  if(output.length>1024)throw Error('Kings Event Operations worklist too long');
  return output;
}
module.exports={observeOperations,renderOperationsReview,
  operationsWorklist,renderOperationsWorklist,WORK_LABELS};
