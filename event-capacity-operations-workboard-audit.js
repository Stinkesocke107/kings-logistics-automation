'use strict';
// DRAFT / PRIVATE / READ-ONLY. Reconcile an untrusted candidate Event Operations
// handoff with caller-supplied Workboard snapshots, without creating tasks,
// sending reminders, allocating slots, authenticating identities or making
// decisions. No network, secrets, Discord interactions or persisted writes.
const {projectKingsEventOperationsHandoff}
  =require('./event-capacity-operations-handoff');
const {validate,attention}=require('./event-capacity-workboard');
const {TEMPLATES}=require('./event-capacity-preparation');
const ERROR='Kings Event Operations Workboard audit refused.';
const TASK_STATES=new Set(['Open','In Progress','On Hold','Done','Reopened']);
const REQUEST_STATES=new Set(['Pending','Clarification Needed','Accepted',
  'Declined','Completed','Withdrawn']);
const REMINDER_KINDS=['coordination-reminder','leadership-overview',
  'follow-up-due','department-reminder','department-leadership-overview'];
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||
    Object.getPrototypeOf(x)===null);}
function integer(x){if(!Number.isSafeInteger(x)||x<0||x>50000)fail();return x;}
function utc(x){
  if(typeof x!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x))fail();
  const n=Date.parse(x);
  if(!Number.isFinite(n)||new Date(n).toISOString()!==x&&
    new Date(n).toISOString().replace('.000Z','Z')!==x)fail();
  return n;
}
function eventReference(e){
  const id=e?.eventId,thread=e?.threadId;
  if(typeof id==='string'&&id.length>0){
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))fail();
    return 'event:'+id;
  }
  if(typeof thread==='string'&&/^\d{17,22}$/.test(thread))
    return 'thread:'+thread;
  fail();
}
function projectKingsEventOperationsWorkboardAudit({
  calendar,request,event,workboard,nowUtc
}={}){
  try{
    const handoff=projectKingsEventOperationsHandoff({calendar,request,event}),
      ref=eventReference(event),now=utc(nowUtc);
    if(handoff.readOnly!==true||handoff.safeToActivate!==false||
      handoff.freeSlotsCertified!==false||handoff.checklistTasksCreated!==0||
      handoff.staffDecisionsCommitted!==0||handoff.bookingWritten!==false||
      handoff.slotReserved!==false||handoff.preparationReady!==false||
      handoff.originalEventProviderAuthenticated!==false)fail();
    // validate() checks structure/scoping; it does NOT authenticate source
    // custody, signed revisions, effective Discord roles or stored history.
    validate(workboard);
    if(utc(workboard.updatedAt)>now||utc(workboard.createdAt)>now||
      !plain(workboard.scope))fail();
    const defs=TEMPLATES[request.category];
    if(!Array.isArray(defs))fail();
    const expected=new Map(defs.map(([code,,required])=>[code,required]));
    if(expected.size!==defs.length)fail();
    if(handoff.candidateIdentityAndScheduleMatch){
      if(handoff.preparationProposalCodes.length!==expected.size||
        handoff.preparationProposalCodes.some(p=>
          !plain(p)||!expected.has(p.code)||
          expected.get(p.code)!==p.required))fail();
    }else if(handoff.preparationProposalCodes.length!==0)fail();

    const eventTasks=Object.values(workboard.tasks).filter(t=>t.eventRef===ref),
      byCode=new Map(),taskIds=new Set(),issues=new Set();
    for(const t of eventTasks){
      if(!plain(t)||!TASK_STATES.has(t.status)||typeof t.id!=='string'||
        taskIds.has(t.id)||!Array.isArray(t.requestIds)||t.requestIds.length>50)
        fail();
      taskIds.add(t.id);
      const existing=byCode.get(t.code)??[];
      existing.push(t);byCode.set(t.code,existing);
      if(!expected.has(t.code))issues.add('UNEXPECTED_EXISTING_TASK_CODE');
      else if(t.required!==expected.get(t.code))
        issues.add('EXISTING_TASK_REQUIREMENT_CONFLICT');
    }
    let duplicateTaskCodes=0,assigned=0,held=0,done=0,inProgress=0;
    for(const items of byCode.values())
      if(items.length>1){duplicateTaskCodes++;issues.add('DUPLICATE_EVENT_TASK_CODE');}
    for(const t of eventTasks){
      if(t.assignee!==null)assigned++;
      if(t.status==='On Hold')held++;
      if(t.status==='Done')done++;
      if(t.status==='In Progress')inProgress++;
    }
    // A valid link must be bidirectional. A missing or differently owned
    // Department request is a blocked review, never an inferred completed task.
    const linkedRequests=new Set();
    for(const t of eventTasks)for(const id of t.requestIds){
      if(typeof id!=='string'||linkedRequests.has(id))fail();
      linkedRequests.add(id);
      const r=workboard.requests[id];
      if(!plain(r)||r.taskId!==t.id||!REQUEST_STATES.has(r.status))fail();
    }
    const actualRequests=Object.values(workboard.requests)
      .filter(r=>taskIds.has(r.taskId));
    if(actualRequests.length!==linkedRequests.size||
      actualRequests.some(r=>!linkedRequests.has(r.id)))fail();
    const requested=actualRequests.length;
    const departmentPending=actualRequests.filter(r=>
      ['Pending','Clarification Needed','Accepted'].includes(r.status)).length;
    const missing=handoff.candidateIdentityAndScheduleMatch?
      [...expected.entries()].filter(([code])=>!byCode.has(code))
        .map(([code,required])=>Object.freeze({code,required})):[];
    if(handoff.candidateIdentityAndScheduleMatch===false)
      issues.add('EVENT_HANDOFF_BLOCKED');
    // The built-in Workboard attention() returns stable internal keys.
    // NEVER return these keys or actor/assignee/request IDs to a preview.
    const notices=attention(workboard,nowUtc).filter(n=>
      n.taskId?taskIds.has(n.taskId):
        n.requestId?linkedRequests.has(n.requestId):false);
    const keys=new Set(),reminders=Object.fromEntries(
      REMINDER_KINDS.map(kind=>[kind,0]));
    for(const n of notices){
      if(!REMINDER_KINDS.includes(n.kind)||typeof n.key!=='string'||
        keys.has(n.key))fail();
      keys.add(n.key);reminders[n.kind]++;
    }
    const blocking=issues.size>0;
    const missingCodes=Object.freeze(missing);
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      reviewStatus:'STAFF_REVIEW_REQUIRED',utcDate:handoff.utcDate,
      category:handoff.category,workboardRevision:integer(workboard.revision),
      handoffBlockerCount:integer(handoff.handoffBlockers.length),
      matchedIdentityAndSchedule:handoff.candidateIdentityAndScheduleMatch,
      expectedChecklistCount:integer(expected.size),
      missingTaskSuggestions:missingCodes,
      existingTaskCount:integer(eventTasks.length),
      assignedTaskCount:integer(assigned),inProgressTaskCount:integer(inProgress),
      heldTaskCount:integer(held),doneTaskCount:integer(done),
      duplicateTaskCodeGroups:integer(duplicateTaskCodes),
      linkedDepartmentRequestCount:integer(requested),
      departmentRequestsUnresolved:integer(departmentPending),
      reminderProposalCounts:Object.freeze(reminders),
      reviewIssueCodes:Object.freeze([...issues].sort()),
      workboardConflictsRequireHumanReview:blocking,
      callerWorkboardClaimAuthenticated:false,
      originalDiscordSourceAuthenticated:false,
      staffPermissionsVerified:false,
      existingTaskStatusProvenCurrent:false,
      reminderDeliveryVerified:false,
      createdTaskCount:0,remindersSent:0,bookingWritten:false,
      slotReserved:false,staffDecisionsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsEventOperationsWorkboardPreview(r){
  try{
    if(!plain(r)||r.version!==1||r.visibility!=='PRIVATE_ONLY'||
      r.readOnly!==true||r.reviewStatus!=='STAFF_REVIEW_REQUIRED'||
      r.callerWorkboardClaimAuthenticated!==false||
      r.originalDiscordSourceAuthenticated!==false||
      r.staffPermissionsVerified!==false||
      r.existingTaskStatusProvenCurrent!==false||
      r.reminderDeliveryVerified!==false||
      r.createdTaskCount!==0||r.remindersSent!==0||
      r.bookingWritten!==false||r.slotReserved!==false||
      r.staffDecisionsCommitted!==0||r.freeSlotsCertified!==false||
      r.safeToActivate!==false||
      !/^20\d{2}-\d{2}-\d{2}$/.test(r.utcDate)||
      !Object.hasOwn(TEMPLATES,r.category)||
      typeof r.matchedIdentityAndSchedule!=='boolean'||
      !Array.isArray(r.missingTaskSuggestions)||
      !Array.isArray(r.reviewIssueCodes)||
      !plain(r.reminderProposalCounts))fail();
    for(const k of ['workboardRevision','handoffBlockerCount',
      'expectedChecklistCount','existingTaskCount','assignedTaskCount',
      'inProgressTaskCount','heldTaskCount','doneTaskCount',
      'duplicateTaskCodeGroups','linkedDepartmentRequestCount',
      'departmentRequestsUnresolved'])integer(r[k]);
    const valid=new Map(TEMPLATES[r.category].map(([code,,required])=>
      [code,required])),suggestions=r.missingTaskSuggestions;
    if(r.expectedChecklistCount!==valid.size||suggestions.length>valid.size||
      r.assignedTaskCount>r.existingTaskCount||
      r.inProgressTaskCount>r.existingTaskCount||
      r.heldTaskCount>r.existingTaskCount||
      r.doneTaskCount>r.existingTaskCount||
      r.departmentRequestsUnresolved>r.linkedDepartmentRequestCount||
      suggestions.some(x=>!plain(x)||!valid.has(x.code)||
        valid.get(x.code)!==x.required)||
      new Set(suggestions.map(x=>x.code)).size!==suggestions.length||
      r.matchedIdentityAndSchedule===false&&suggestions.length!==0||
      r.handoffBlockerCount===0!==r.matchedIdentityAndSchedule)fail();
    const issueCodes=new Set(['UNEXPECTED_EXISTING_TASK_CODE',
      'EXISTING_TASK_REQUIREMENT_CONFLICT','DUPLICATE_EVENT_TASK_CODE',
      'EVENT_HANDOFF_BLOCKED']);
    if(r.reviewIssueCodes.length>issueCodes.size||
      r.reviewIssueCodes.some(x=>!issueCodes.has(x))||
      new Set(r.reviewIssueCodes).size!==r.reviewIssueCodes.length||
      r.workboardConflictsRequireHumanReview!==
        (r.reviewIssueCodes.length>0)||
      (!r.matchedIdentityAndSchedule)!==
        r.reviewIssueCodes.includes('EVENT_HANDOFF_BLOCKED')||
      r.duplicateTaskCodeGroups>0!==
        r.reviewIssueCodes.includes('DUPLICATE_EVENT_TASK_CODE'))fail();
    let notices=0;
    if(Object.keys(r.reminderProposalCounts).length!==REMINDER_KINDS.length)
      fail();
    for(const k of REMINDER_KINDS)notices+=integer(r.reminderProposalCounts[k]);
    if(notices>50000)fail();
    const content='**Kings Event Operations — PRIVATE Workboard Review**\n'+
      r.category+' | '+r.utcDate+' UTC\n'+
      'Untrusted tasks: '+r.existingTaskCount+
      ' | Assigned '+r.assignedTaskCount+
      ' | On Hold '+r.heldTaskCount+
      ' | Done '+r.doneTaskCount+'\n'+
      'Missing checklist codes: '+suggestions.length+
      ' | Duplicate groups: '+r.duplicateTaskCodeGroups+'\n'+
      'Department requests: '+r.linkedDepartmentRequestCount+
      ' | unresolved '+r.departmentRequestsUnresolved+
      ' | Reminder proposals: '+notices+'\n'+
      'Review issues: '+r.reviewIssueCodes.length+
      '\n**No tasks created, reminders sent, slots reserved or approvals made.**';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{flags:64,allowed_mentions:{parse:[]},
      content,embeds:[]}});
  }catch{fail();}
}
module.exports={projectKingsEventOperationsWorkboardAudit,
  renderKingsEventOperationsWorkboardPreview};
