'use strict';
// DRAFT / PRIVATE / PURE / READ-ONLY: connect candidate Booking preflight to
// Event Operations preparation templates. Caller evidence is NOT authenticated.
// NEVER create Workboard tasks, reserve slots or certify actual Event approval.
const {projectKingsEventBookingSafetyReview}
  =require('./event-capacity-booking-safety-review');
const {POLICY}=require('./event-capacity-policy');
const {proposedChecklist}
  =require('./event-capacity-preparation');
const ERROR='Kings Event Operations handoff refused.';
const LIVE=new Set(['Scheduled','Rescheduled']);
const STATUS=new Set(['Scheduled','Rescheduled','Completed','Cancelled',
  'Pending','Submitted','Needs Information','Ready for Approval','Unknown']);
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||
    Object.getPrototypeOf(x)===null);}
function normalizedUtc(x){
  if(x===null||x===undefined)return null;
  if(typeof x!=='string'||
    !/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/.test(x))fail();
  const n=Date.parse(x);
  if(!Number.isFinite(n)||n<0)fail();
  const normalized=new Date(n).toISOString();
  if(normalized!==x&&normalized.replace('.000Z','Z')!==x)fail();
  return normalized;
}
function candidateEvent(e){
  if(!plain(e)||!STATUS.has(e.status))fail();
  const id=typeof e.eventId==='string'?e.eventId:null;
  const thread=typeof e.threadId==='string'?e.threadId:null;
  if(!(id&&/^[A-Za-z0-9_-]{1,80}$/.test(id))&&
    !(thread&&/^[0-9]{17,22}$/.test(thread)))fail();
  if(e.statusVerified!==true&&e.statusVerified!==false||
    e.eventTypeVerified!==true&&e.eventTypeVerified!==false||
    e.departureVerified!==true&&e.departureVerified!==false||
    e.rescheduleApproved!==undefined&&
    e.rescheduleApproved!==true&&e.rescheduleApproved!==false||
    e.dataConflict!==undefined&&
    e.dataConflict!==true&&e.dataConflict!==false)fail();
  return e;
}
function projectKingsEventOperationsHandoff({calendar,request,event}={}){
  try{
    // This independently validates the month/day/quota and booking request.
    const booking=projectKingsEventBookingSafetyReview({calendar,request});
    const e=candidateEvent(event);
    const mismatches=[];
    if(e.eventType!==request.category)mismatches.push('CATEGORY_MISMATCH');
    if(normalizedUtc(e.departureAtUtc)!==request.departureAtUtc)
      mismatches.push('DEPARTURE_MISMATCH');
    if(normalizedUtc(e.meetingAtUtc)!==request.meetingAtUtc)
      mismatches.push('MEETING_MISMATCH');
    if(normalizedUtc(e.plannedEndAtUtc)!==request.plannedEndAtUtc)
      mismatches.push('END_MISMATCH');
    if(e.statusVerified!==true||e.eventTypeVerified!==true||
      e.departureVerified!==true)mismatches.push('UNVERIFIED_EVENT_FIELDS');
    if(e.dataConflict===true)mismatches.push('EVENT_SOURCE_CONFLICT');
    if(e.status==='Rescheduled'&&e.rescheduleApproved!==true)
      mismatches.push('RESCHEDULE_NOT_APPROVED');
    if(!LIVE.has(e.status))mismatches.push('EVENT_NOT_CURRENTLY_ACCEPTED');
    const allowProposals=mismatches.length===0;
    // NEVER pass caller-supplied ready/verified facts or existing tasks.
    // Verified Task state and permission need a protected, authenticated host.
    const prep=allowProposals?proposedChecklist(e,{
      sourceVerified:false,existingTasks:[],verifiedFacts:{},
      milestone:null,criticalConflict:true
    }):null;
    if(prep&&(prep.readOnly!==true||
      prep.status==='Ready'||prep.status==='Historical'||
      prep.items.length!==prep.createProposals.length))fail();
    const codes=prep?prep.items.map(x=>{
      if(typeof x.code!=='string'||!/^[a-z-]{1,40}$/.test(x.code)||
        typeof x.required!=='boolean'||x.status!=='Open')fail();
      return Object.freeze({code:x.code,required:x.required});
    }):[];
    if(new Set(codes.map(x=>x.code)).size!==codes.length)fail();
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      reviewStatus:'STAFF_REVIEW_REQUIRED',
      utcDate:booking.utcDate,category:booking.category,
      candidatePriorityRank:booking.reviewPriority,
      newUnconfirmedRequestPriorityOnly:true,
      confirmedEventsNeverAutoPreempted:true,
      bookingReviewReasonCount:booking.reviewReasons.length,
      bookingObservedDailyLimitReached:booking.observedDailyLimitReached,
      bookingObservedMonthlyLimitReached:booking.observedMonthlyLimitReached,
      bookingHistoricalDailyHoldAtLimit:
        booking.provisionalHistoricalDailyHoldAtLimit,
      bookingHistoricalMonthlyHoldAtLimit:
        booking.provisionalHistoricalMonthlyHoldAtLimit,
      eventClaimStatus:e.status,
      candidateIdentityAndScheduleMatch:allowProposals,
      preparationProposalCodes:Object.freeze(codes),
      preparationRequiredCount:codes.filter(x=>x.required).length,
      preparationOptionalCount:codes.filter(x=>!x.required).length,
      handoffBlockers:Object.freeze(mismatches),
      callerClaimsUntrusted:true,
      originalEventProviderAuthenticated:false,
      verifiedExistingWorkboardStateRead:false,
      verifiedStaffRolesChecked:false,
      preparationReady:false,
      checklistTasksCreated:0,bookingWritten:false,slotReserved:false,
      staffDecisionsCommitted:0,discordMessagesSent:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsEventOperationsHandoffPreview(r){
  try{
    if(!plain(r)||r.version!==1||
      r.visibility!=='PRIVATE_ONLY'||r.readOnly!==true||
      r.reviewStatus!=='STAFF_REVIEW_REQUIRED'||
      r.callerClaimsUntrusted!==true||
      r.originalEventProviderAuthenticated!==false||
      r.verifiedExistingWorkboardStateRead!==false||
      r.verifiedStaffRolesChecked!==false||
      r.preparationReady!==false||
      r.checklistTasksCreated!==0||r.bookingWritten!==false||
      r.slotReserved!==false||r.staffDecisionsCommitted!==0||
      r.discordMessagesSent!==0||r.freeSlotsCertified!==false||
      r.safeToActivate!==false||
      !Number.isSafeInteger(r.bookingReviewReasonCount)||
      r.bookingReviewReasonCount<4||r.bookingReviewReasonCount>20||
      !Array.isArray(r.preparationProposalCodes)||
      !Array.isArray(r.handoffBlockers)||
      typeof r.utcDate!=='string'||
      !/^20\d{2}-\d{2}-\d{2}$/.test(r.utcDate)||
      !POLICY.priorityOrder.includes(r.category)||
      r.candidatePriorityRank!==POLICY.priorityOrder.indexOf(r.category)+1||
      r.newUnconfirmedRequestPriorityOnly!==true||
      r.confirmedEventsNeverAutoPreempted!==true)
      fail();
    const codes=r.preparationProposalCodes;
    if(codes.length>20||r.handoffBlockers.length>15||
      codes.some(x=>!plain(x)||typeof x.code!=='string'||
        !/^[a-z-]{1,40}$/.test(x.code)||typeof x.required!=='boolean')||
      r.handoffBlockers.some(x=>typeof x!=='string'||
        !/^[A-Z_]{3,45}$/.test(x))||
      new Set(codes.map(x=>x.code)).size!==codes.length||
      r.preparationRequiredCount!==codes.filter(x=>x.required).length||
      r.preparationOptionalCount!==codes.filter(x=>!x.required).length||
      r.candidateIdentityAndScheduleMatch!==(r.handoffBlockers.length===0))
      fail();
    const content='**Kings Events — Operations Handoff (OFFLINE REVIEW)**\n'+
      r.category+' | '+r.utcDate+' UTC\n'+
      'NEW request priority '+r.candidatePriorityRank+
      '/3 (Kings > Partner > External); confirmed events not displaced.\n'+
      'Booking review flags: '+r.bookingReviewReasonCount+
      ' | Handoff blockers: '+r.handoffBlockers.length+'\n'+
      'Unverified checklist suggestions: required '+
      r.preparationRequiredCount+' | optional '+r.preparationOptionalCount+
      '\n**No booking, checklist task, approval or free slot created.**';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{flags:64,
      allowed_mentions:{parse:[]},content,embeds:[]}});
  }catch{fail();}
}
module.exports={projectKingsEventOperationsHandoff,
  renderKingsEventOperationsHandoffPreview};
