'use strict';
// Pure PRIVATE task/dept-request state. Draft only; no Discord or storage writes.
// The host must independently authenticate every actor and transact revisions.
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity private workboard validation failed.';
const KEY=/^[a-zA-Z0-9_.:-]{1,128}$/;
const DEPARTMENTS=new Set(['HR','Events','Creative','Driver Services','Development']);
const HOLD_REASONS=new Set(['Organizer Response','Management Decision','Missing Event Information','Scheduling Coordination','Other']);
const REQUEST_STATES=new Set(['Pending','Clarification Needed','Accepted','Declined','Completed','Withdrawn']);
const COORD=new Set(['Event Coordination','Event Leadership','CEO']);
const LEAD=new Set(['Event Leadership','CEO']);
function fail(){throw new Error(ERROR);}
function iso(v){const t=timestamp(v);if(t===null)fail();return new Date(t).toISOString();}
function str(v,max=200){if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f]/.test(v))fail();return v.trim();}
function scopeOf(s){
  if(!s||typeof s!=='object'||!(/^\d{5,25}$/).test(String(s.guildId||''))||
    !(/^\d{5,25}$/).test(String(s.forumId||'')))fail();
  return {guildId:String(s.guildId),forumId:String(s.forumId)};
}
function validate(state,scope){
  if(!state||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0||
    !state.tasks||typeof state.tasks!=='object'||Array.isArray(state.tasks)||
    !state.requests||typeof state.requests!=='object'||Array.isArray(state.requests)||
    !Array.isArray(state.history)||state.history.length!==state.revision||
    timestamp(state.createdAt)===null||timestamp(state.updatedAt)===null||
    Object.keys(state.tasks).length>10000||Object.keys(state.requests).length>10000)fail();
  const s=scopeOf(state.scope);
  if(scope){const e=scopeOf(scope);if(e.guildId!==s.guildId||e.forumId!==s.forumId)fail();}
  for(const [id,t] of Object.entries(state.tasks)){
    if(!KEY.test(id)||!t||!KEY.test(t.eventRef)||!KEY.test(t.code)||
      !['Open','In Progress','On Hold','Done','Reopened'].includes(t.status)||
      typeof t.required!=='boolean'||!t.title||timestamp(t.updatedAt)===null||
      (t.status==='Done'&&!t.proof)||!Array.isArray(t.requestIds))fail();
  }
  for(const [id,r] of Object.entries(state.requests)){
    if(!KEY.test(id)||!r||!state.tasks[r.taskId]||!DEPARTMENTS.has(r.department)||
      !REQUEST_STATES.has(r.status)||timestamp(r.updatedAt)===null)fail();
  }
  return state;
}
function empty(scope,at){
  const s=scopeOf(scope),time=iso(at);
  return {version:1,scope:s,revision:0,createdAt:time,updatedAt:time,
    tasks:Object.create(null),requests:Object.create(null),history:[]};
}
function actorRole(actor,allowed){
  // The flag is a contract, NOT authentication by itself.
  if(!actor||actor.source!=='trusted-server-gateway'||
    typeof actor.id!=='string'||!(/^\d{5,25}$/).test(actor.id)||
    !Array.isArray(actor.verifiedRoles)||actor.verifiedRoles.length>30||
    !Array.isArray(actor.verifiedDepartments||[]))fail();
  const role=['CEO','Event Leadership','Event Coordination'].find(x=>
    allowed.has(x)&&actor.verifiedRoles.includes(x));
  if(!role)fail();
  return role;
}
function deptActor(actor,department){
  if(!actor||actor.source!=='trusted-server-gateway'||
    !(/^\d{5,25}$/).test(String(actor.id||''))||
    !Array.isArray(actor.verifiedDepartments)||!actor.verifiedDepartments.includes(department)||
    !DEPARTMENTS.has(department))fail();
}
function apply(input,command,actor,at){
  validate(input);
  if(!command||typeof command!=='object'||Array.isArray(command)||
    !Number.isSafeInteger(command.expectedRevision)||command.expectedRevision!==input.revision)fail();
  const time=iso(at),s=structuredClone(input),action=command.action,id=command.taskId;
  let role=null,task=id?s.tasks[id]:null,request=null;
  if(action==='create-task'){
    role=actorRole(actor,command.required===true?LEAD:COORD);
    if(!KEY.test(command.taskId||'')||!KEY.test(command.eventRef||'')||
      !KEY.test(command.code||'')||s.tasks[command.taskId])fail();
    if(Object.values(s.tasks).some(t=>t.eventRef===command.eventRef&&t.code===command.code))fail();
    const title=str(command.title,120);
    s.tasks[command.taskId]={id:command.taskId,eventRef:command.eventRef,code:command.code,
      title,required:command.required===true,status:'Open',assignee:null,
      holdReason:null,followUpAt:null,proof:null,waiver:null,
      requestIds:[],createdAt:time,updatedAt:time};
  }else if(['claim-task','release-task','assign-task','hold-task','finish-task','reopen-task','mark-na'].includes(action)){
    if(!KEY.test(id||'')||!task)fail();
    role=actorRole(actor,action==='assign-task'?LEAD:
      (action==='mark-na'&&task.required?LEAD:COORD));
    if(action==='claim-task'){
      if(!['Open','Reopened'].includes(task.status)||task.assignee)fail();
      task.assignee=actor.id;task.status='In Progress';
    }else if(action==='release-task'){
      if(task.assignee!==actor.id&&!LEAD.has(role))fail();
      if(!['In Progress','On Hold'].includes(task.status))fail();
      task.assignee=null;task.status='Open';task.holdReason=null;task.followUpAt=null;
    }else if(action==='assign-task'){
      if(['Done'].includes(task.status))fail();
      task.assignee=str(command.assignee,25);
      if(!(/^\d{5,25}$/).test(task.assignee))fail();
      task.status='In Progress';task.holdReason=null;task.followUpAt=null;
    }else if(action==='hold-task'){
      if(task.status==='Done'||!HOLD_REASONS.has(command.reason))fail();
      if(task.assignee&&task.assignee!==actor.id&&!LEAD.has(role))fail();
      let date=null;
      if(command.followUpDays!==null&&command.followUpDays!==undefined){
        if(![1,3,7].includes(command.followUpDays)&&
          !(Number.isSafeInteger(command.followUpDays)&&command.followUpDays>=1&&command.followUpDays<=90))fail();
        date=new Date(timestamp(time)+command.followUpDays*86400000).toISOString();
      }
      task.status='On Hold';task.holdReason=command.reason;task.followUpAt=date;
    }else if(action==='finish-task'){
      if(task.status==='Done'||(task.assignee&&task.assignee!==actor.id&&!LEAD.has(role)))fail();
      task.proof=str(command.evidenceRef,256);
      task.status='Done';task.holdReason=null;task.followUpAt=null;
    }else if(action==='reopen-task'){
      if(task.status!=='Done'||!str(command.evidenceRef,256))fail();
      task.status='Reopened';task.proof=null;task.waiver=null;task.assignee=null;
    }else if(action==='mark-na'){
      if(task.status==='Done'||!str(command.evidenceRef,256))fail();
      task.waiver={approvedByRole:role,evidenceRef:command.evidenceRef,at:time};
      task.status='Done';task.proof=task.required?
        'authorized-required-not-applicable':'optional-not-applicable';
    }
    task.updatedAt=time;
  }else if(action==='request-department'){
    role=actorRole(actor,COORD);
    if(!KEY.test(id||'')||!task||!KEY.test(command.requestId||'')||
      !DEPARTMENTS.has(command.department)||s.requests[command.requestId]||
      task.status==='Done')fail();
    if(task.requestIds.some(rid=>{const r=s.requests[rid];return r.department===command.department&&
      ['Pending','Clarification Needed','Accepted'].includes(r.status);}))fail();
    request={id:command.requestId,taskId:id,department:command.department,
      status:'Pending',createdAt:time,updatedAt:time,
      evidenceRef:null,requestedBy:actor.id};
    s.requests[request.id]=request;
    task.requestIds.push(request.id);
    task.updatedAt=time;
  }else if(action==='respond-department'){
    if(!KEY.test(command.requestId||''))fail();
    request=s.requests[command.requestId];
    if(!request||!REQUEST_STATES.has(command.value))fail();
    if(command.value==='Withdrawn'){
      role=actorRole(actor,COORD);
      if(!['Pending','Clarification Needed','Accepted'].includes(request.status))fail();
    }else{
      deptActor(actor,request.department);
      role='Department Leadership';
      const allowed={
        Pending:new Set(['Clarification Needed','Accepted','Declined']),
        'Clarification Needed':new Set(['Accepted','Declined']),
        Accepted:new Set(['Completed','Declined'])
      };
      if(!allowed[request.status]?.has(command.value))fail();
    }
    if(command.value==='Completed')request.evidenceRef=str(command.evidenceRef,256);
    request.status=command.value;request.updatedAt=time;
    s.tasks[request.taskId].updatedAt=time;
    // Completing a department assistance request NEVER closes its parent task.
  }else fail();
  s.revision++;s.updatedAt=time;
  s.history.push({revision:s.revision,action,taskId:id||command.taskId||null,
    requestId:command.requestId||null,actorId:actor.id,actorRole:role,at:time});
  return validate(s,input.scope);
}
function attention(state,now){
  validate(state);
  const at=timestamp(now);if(at===null)fail();
  const notices=[];
  for(const t of Object.values(state.tasks)){
    if(t.status==='Done')continue;
    if(t.status==='On Hold'){
      if(t.followUpAt&&timestamp(t.followUpAt)<=at)
        notices.push({key:'task:'+t.id+':followup:'+t.followUpAt,kind:'follow-up-due',taskId:t.id});
      continue;
    }
    const elapsed=at-timestamp(t.updatedAt);
    if(t.status==='Open'||t.status==='Reopened'){
      if(elapsed>=24*3600000)notices.push({key:'task:'+t.id+':24h:'+t.updatedAt,
        kind:'coordination-reminder',taskId:t.id});
      if(elapsed>=48*3600000)notices.push({key:'task:'+t.id+':48h:'+t.updatedAt,
        kind:'leadership-overview',taskId:t.id});
    }
  }
  for(const r of Object.values(state.requests)){
    if(r.status!=='Pending')continue;
    const elapsed=at-timestamp(r.updatedAt);
    if(elapsed>=24*3600000)notices.push({key:'request:'+r.id+':24h:'+r.updatedAt,
      kind:'department-reminder',requestId:r.id});
    if(elapsed>=48*3600000)notices.push({key:'request:'+r.id+':48h:'+r.updatedAt,
      kind:'department-leadership-overview',requestId:r.id});
  }
  // Proposals only. The protected host must persist sent-notice IDs for dedupe.
  return notices;
}
module.exports={empty,validate,apply,attention,DEPARTMENTS};
