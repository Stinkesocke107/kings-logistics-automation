'use strict';
// Kings Event Operations #18: encrypted human review journal.
// Neither a booking system nor proof of original Staff approval. Only the
// existing Event Leadership encrypted state may store these records.
const crypto=require('node:crypto');
const {observeOperations,operationsWorklist,WORK_LABELS}=
  require('./event-operations-staff-triage');
const {trustedEventObservation}=require('./event-leadership-observation');
const {trustedInvitationObservation}=require('./event-invitation-tracker-source');
const {trustedReviewAgenda,CODES}=require('./event-history-review-agenda');
const STATES=Object.freeze(['OPEN','IN_REVIEW','NEEDS_EVIDENCE','STAFF_CHECK_RECORDED']);
const ACTIONS=Object.freeze({
  start:'IN_REVIEW',block:'NEEDS_EVIDENCE',
  record_check:'STAFF_CHECK_RECORDED',reopen:'OPEN'
});
const EVIDENCE=Object.freeze(['NONE','ORIGINAL_DISCORD','ORIGINAL_EVENT_PAGE','STAFF_RECORD']);
const MONTH=/^\d{4}-(?:0[1-9]|1[0-2])$/;
const ACTOR=/^[a-zA-Z\d](?:[a-zA-Z\d-]{0,37}[a-zA-Z\d])?$/;
const MAX_RECORDS=120,MAX_AUDIT=12,RECHECK_MS=7*86400000;
function fail(){throw Error('Kings Event Operations manual review unverified');}
function validTime(value){
  return typeof value==='string'&&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
    Number.isFinite(Date.parse(value))&&
    new Date(Date.parse(value)).toISOString()===value;
}
function keyOf(scope,code,month){
  if(!['worklist','history'].includes(scope)||
    typeof code!=='string'||
    !(scope==='worklist'?Object.hasOwn(WORK_LABELS,code):
      Object.hasOwn(CODES,code))||
    (scope==='worklist'&&month!==null)||
    (scope==='history'&&!(month===null||MONTH.test(month)))||
    (scope==='history'&&
      ((code==='UNDATED_CENTER'||code==='UNDATED_LEGACY')!==(month===null))))
    fail();
  return scope+':'+code+':'+(month||'UNDATED_OR_ALL');
}
function digestOf(scope,code,month,count){
  if(!(count===null||Number.isSafeInteger(count)&&count>=0))fail();
  return crypto.createHash('sha256').update(
    JSON.stringify([scope,code,month,count])).digest('hex');
}
function taskFromSources({state,scope,code,month=null,nowMs=Date.now()}){
  keyOf(scope,code,month);
  if(!Number.isSafeInteger(nowMs)||nowMs<=0)fail();
  const event=trustedEventObservation(state?.eventSourceObservation,nowMs);
  const operations=observeOperations({
    eventSourceObservation:state?.eventSourceObservation,
    invitationSourceObservation:state?.invitationSourceObservation,
    nowMs
  });
  if(scope==='worklist'){
    const row=operationsWorklist(operations).find(x=>x.code===code);
    if(!row)return null;
    return Object.freeze({scope,code,month:null,count:row.count,
      priority:row.priority,reviewer:row.owner,
      sourceReady:!code.endsWith('SOURCE_UNAVAILABLE')});
  }
  if(!event||!trustedReviewAgenda(event.reviewAgenda))return null;
  const row=event.reviewAgenda.find(x=>x.code===code&&x.utcMonth===month);
  return row?Object.freeze({scope,code,month,count:row.count,
    priority:'MANUAL',reviewer:'Event Coordination Lead',sourceReady:true}):null;
}
function trustedRecords(records){
  if(records===undefined)return [];
  if(!Array.isArray(records)||records.length>MAX_RECORDS)fail();
  const seen=new Set();
  for(const rec of records){
    if(!rec||Array.isArray(rec)||typeof rec!=='object'||
      Object.keys(rec).sort().join(',')!==
        'actor,audit,code,createdAt,evidenceKind,key,month,scope,sourceDigest,status,updatedAt,version'||
      rec.version!==1||
      typeof rec.code!=='string'||typeof rec.scope!=='string'||
      !STATES.includes(rec.status)||!EVIDENCE.includes(rec.evidenceKind)||
      !validTime(rec.updatedAt)||!validTime(rec.createdAt)||
      Date.parse(rec.updatedAt)<Date.parse(rec.createdAt)||
      typeof rec.sourceDigest!=='string'||!/^[a-f\d]{64}$/.test(rec.sourceDigest)||
      !ACTOR.test(rec.actor)||!Array.isArray(rec.audit)||
      rec.audit.length<1||rec.audit.length>MAX_AUDIT||
      (rec.status==='STAFF_CHECK_RECORDED'&&rec.evidenceKind==='NONE'))
      fail();
    if(rec.audit[rec.audit.length-1].status!==rec.status||
      rec.audit[rec.audit.length-1].at!==rec.updatedAt||
      rec.audit[rec.audit.length-1].actor!==rec.actor)
      fail();
    const key=keyOf(rec.scope,rec.code,rec.month);
    if(rec.key!==key||seen.has(key))fail();
    seen.add(key);
    let precedingAt=Date.parse(rec.createdAt);
    for(const step of rec.audit){
      if(!step||Array.isArray(step)||typeof step!=='object'||
        Object.keys(step).sort().join(',')!==
          'action,actor,at,evidenceKind,status'||
        !STATES.includes(step.status)||!ACTOR.test(step.actor)||
        !validTime(step.at)||!Object.hasOwn(ACTIONS,step.action)||
        ACTIONS[step.action]!==step.status||
        !EVIDENCE.includes(step.evidenceKind))fail();
      const at=Date.parse(step.at);
      if(at<precedingAt||at>Date.parse(rec.updatedAt))fail();
      precedingAt=at;
    }
    if(rec.evidenceKind!==rec.audit[rec.audit.length-1].evidenceKind)fail();
  }
  return records;
}
function hasAuthorizedActor({actor,triggeringActor,allowlist,eventName,ref}){
  if(eventName!=='workflow_dispatch'||ref!=='refs/heads/main'||
    typeof actor!=='string'||!ACTOR.test(actor)||
    typeof triggeringActor!=='string'||
    actor.toLowerCase()!==triggeringActor.toLowerCase()||
    typeof allowlist!=='string'||allowlist.length<1||
    allowlist.length>4096)return false;
  const names=allowlist.split(',').map(x=>x.trim());
  return names.length<=40&&names.every(x=>ACTOR.test(x))&&
    new Set(names.map(x=>x.toLowerCase())).size===names.length&&
    names.some(x=>x.toLowerCase()===actor.toLowerCase());
}
function applyManualReview({state,scope,code,month=null,action,
  actor,evidenceKind='NONE',confirmation='',nowMs=Date.now()}={}){
  const checked=trustedRecords(state?.operationReviews);
  const task=taskFromSources({state,scope,code,month,nowMs});
  if(!task||!Object.hasOwn(ACTIONS,action)||!ACTOR.test(actor)||
    !EVIDENCE.includes(evidenceKind)||
    (action!=='record_check'&&evidenceKind!=='NONE')||
    (action==='record_check'&&
      (!task.sourceReady||evidenceKind==='NONE'||
       confirmation!=='ORIGINAL_RECORDS_CHECKED'))||
    (action!=='record_check'&&confirmation!==''))
    fail();
  const now=new Date(nowMs).toISOString(),id=keyOf(scope,code,month);
  const fingerprint=digestOf(scope,code,month,task.count);
  const index=checked.findIndex(x=>x.key===id),old=checked[index]||null;
  const stillCurrent=old&&old.sourceDigest===fingerprint&&
    nowMs-Date.parse(old.updatedAt)<=RECHECK_MS&&
    nowMs>=Date.parse(old.updatedAt);
  if(action==='record_check'&&(!stillCurrent||
    old.status!=='IN_REVIEW'))fail();
  if(action==='reopen'&&(!old||old.status==='OPEN'))fail();
  // Preserve a completed human evidence check until an explicit reopen.
  // A second start cannot silently erase this status in the dashboard.
  if(action==='start'&&old?.status==='STAFF_CHECK_RECORDED')fail();
  if((action==='block'||action==='start')&&
    old?.status===ACTIONS[action]&&stillCurrent)fail();
  const status=ACTIONS[action];
  const audit=Object.freeze([...(old?.audit||[]),Object.freeze({
    at:now,actor,action,status,evidenceKind
  })].slice(-MAX_AUDIT));
  const next=Object.freeze({
    version:1,key:id,scope,code,month,status,
    sourceDigest:fingerprint,actor,
    evidenceKind:action==='record_check'?evidenceKind:'NONE',
    createdAt:old?.createdAt||now,updatedAt:now,audit
  });
  const arr=checked.slice();
  if(index>=0)arr[index]=next;else{
    if(arr.length>=MAX_RECORDS)fail();
    arr.push(next);
  }
  trustedRecords(arr);
  return Object.freeze({...state,operationReviews:arr,updatedAt:now});
}
function currentReviewRows(state,nowMs){
  const operations=observeOperations({
    eventSourceObservation:state?.eventSourceObservation,
    invitationSourceObservation:state?.invitationSourceObservation,
    nowMs
  });
  const current=[
    ...operationsWorklist(operations).map(row=>({
      scope:'worklist',code:row.code,month:null,count:row.count
    }))
  ];
  const history=trustedEventObservation(state?.eventSourceObservation,nowMs);
  if(history&&trustedReviewAgenda(history.reviewAgenda))
    current.push(...history.reviewAgenda.map(row=>({
      scope:'history',code:row.code,month:row.utcMonth,count:row.count
    })));
  return current;
}
function reviewRowsWithStatus(state,nowMs=Date.now()){
  const records=trustedRecords(state?.operationReviews);
  const current=currentReviewRows(state,nowMs);
  const live=current.map(row=>{
    const key=keyOf(row.scope,row.code,row.month);
    const recorded=records.find(x=>x.key===key);
    let status='OPEN';
    if(recorded){
      const currentDigest=digestOf(row.scope,row.code,row.month,row.count);
      status=(recorded.sourceDigest!==currentDigest||
        nowMs-Date.parse(recorded.updatedAt)>RECHECK_MS||
        nowMs<Date.parse(recorded.updatedAt))?'RECHECK_REQUIRED':recorded.status;
    }
    return Object.freeze({...row,status});
  });
  const order={NEEDS_EVIDENCE:0,RECHECK_REQUIRED:1,IN_REVIEW:2,
    STAFF_CHECK_RECORDED:3,OPEN:4};
  return Object.freeze({
    records,
    live:Object.freeze([...live].sort((a,b)=>order[a.status]-order[b.status])),
    noLongerActive:records.filter(x=>!current.some(y=>
      x.key===keyOf(y.scope,y.code,y.month))).length
  });
}
function reviewSummary(state,nowMs=Date.now()){
  let result;
  try{result=reviewRowsWithStatus(state,nowMs);}catch{
    return Object.freeze({valid:false,lines:['Unavailable — protected Staff review journal is invalid.']});
  }
  const {live,noLongerActive}=result;
  return Object.freeze({valid:true,active:live.length,
    inReview:live.filter(x=>x.status==='IN_REVIEW').length,
    needsEvidence:live.filter(x=>x.status==='NEEDS_EVIDENCE').length,
    staffChecksRecorded:live.filter(x=>x.status==='STAFF_CHECK_RECORDED').length,
    recheck:live.filter(x=>x.status==='RECHECK_REQUIRED').length,
    noLongerActive,
    // Show human-progress items first so active checks never hide behind
    // untouched source categories.
    lines:live.slice(0,5).map(x=>x.status+' · '+
      (x.scope==='history'?(x.month||'Undated')+' · ':'')+
      (x.scope==='history'?CODES[x.code]:WORK_LABELS[x.code]))
  });
}
function renderReviewSummary(state,nowMs=Date.now()){
  const s=reviewSummary(state,nowMs);
  if(!s.valid)return s.lines[0];
  const names={
    OPEN:'⚪ Not started',IN_REVIEW:'🔵 In progress',
    NEEDS_EVIDENCE:'🟠 Evidence needed',
    STAFF_CHECK_RECORDED:'✅ Original record check logged',
    RECHECK_REQUIRED:'🔄 Recheck needed'
  };
  const simplified=s.lines.map(line=>{
    const match=/^(OPEN|IN_REVIEW|NEEDS_EVIDENCE|STAFF_CHECK_RECORDED|RECHECK_REQUIRED) · (.*)$/.exec(line);
    return match?names[match[1]]+' — '+match[2]:line;
  });
  const msg=[
    'Team review only — no automatic Event approvals or free slots.',
    'Items **'+s.active+'** · In review **'+s.inReview+
      '** · Evidence needed **'+s.needsEvidence+
      '** · Checks logged **'+s.staffChecksRecorded+
      '** · Recheck **'+s.recheck+'**.',
    ...(simplified.length?simplified:['Nothing currently needs a Staff source review.']),
    ...(s.noLongerActive?['Earlier entries no longer on the current source list: **'+s.noLongerActive+'**.']:[]),
    'Source warnings remain visible until their original records are verified. Starting a review does not clear a BLOCKED source.'
  ].join('\n');
  if(msg.length>1024)fail();
  return msg;
}

// Opaque, short-lived review selector. Only a private Leadership field
// contains the mapping from token to reviewed UTC month / reason. The public
// workflow_dispatch input cannot disclose the category or historical month.
const TOKEN=/^KR[a-f0-9]{24}$/;
const TOKEN_DOMAIN='kings-event-operations-private-review-token-v1';
function issueToken(state,row,secret,nowMs){
  if(!row||typeof secret!=='string'||
    Buffer.byteLength(secret,'utf8')<32||!Number.isSafeInteger(nowMs)||
    nowMs<=0)fail();
  keyOf(row.scope,row.code,row.month);
  if(!(row.count===null||Number.isSafeInteger(row.count)&&row.count>=0))fail();
  const event=trustedEventObservation(state?.eventSourceObservation,nowMs);
  const invite=trustedInvitationObservation(state?.invitationSourceObservation,nowMs);
  const stamp=[
    event?.observedAt||'UNAVAILABLE',
    invite?.observedAt||'UNAVAILABLE',
    new Date(nowMs).toISOString().slice(0,10)
  ];
  const keyed=crypto.createHmac('sha256',secret).update(TOKEN_DOMAIN).digest();
  return 'KR'+crypto.createHmac('sha256',keyed).update(
    JSON.stringify([row.scope,row.code,row.month,row.count,stamp])).digest('hex').slice(0,24);
}
function resolvePrivateToken({state,token,secret,nowMs=Date.now()}={}){
  if(typeof token!=='string'||!TOKEN.test(token))fail();
  const rows=reviewRowsWithStatus(state,nowMs).live;
  let found=null;
  for(const row of rows){
    const expected=issueToken(state,row,secret,nowMs);
    if(crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(token))){
      if(found)fail();
      found=row;
    }
  }
  if(!found)fail(); // expired/unknown token or source changed: no writes.
  return Object.freeze({scope:found.scope,code:found.code,
    month:found.month,sourceStatus:found.status});
}
function renderPrivateReviewTokens(state,secret,nowMs=Date.now()){
  try{
    const all=reviewRowsWithStatus(state,nowMs).live;
    let rows=all.slice(0,5);
    // Keep a future/history month selectable even when broad worklist
    // categories are numerous; no new task source or user assignment.
    if(!rows.some(x=>x.scope==='history')){
      const firstHistory=all.find(x=>x.scope==='history');
      if(firstHistory)rows=[...rows.slice(0,4),firstHistory];
    }
    if(!rows.length)return 'No source review issue selected. No Staff decisions verified.';
    const lines=[
      'For an OPEN item, copy the whole command to private #event-operations:',
      ...rows.map(row=>{
        const name=(row.scope==='history'?(row.month||'Undated')+' — ':'')+
          (row.scope==='history'?CODES[row.code]:WORK_LABELS[row.code]);
        const token=issueToken(state,row,secret,nowMs);
        const startable=row.status==='OPEN'||row.status==='RECHECK_REQUIRED';
        return name+' — '+(startable
          ? '`!kings-review '+token+' start`'
          : 'Status '+row.status+' · Review code: '+token);
      }),
      'Codes expire with source updates or a new UTC day. They never approve Events.'
    ];
    const text=lines.join('\n');
    if(text.length>1024)fail();
    return text;
  }catch{
    return 'Unavailable - private review code source or key is missing, stale or invalid.';
  }
}
module.exports={STATES,ACTIONS,EVIDENCE,RECHECK_MS,MAX_RECORDS,
  keyOf,trustedRecords,hasAuthorizedActor,taskFromSources,
  applyManualReview,reviewSummary,renderReviewSummary,
  resolvePrivateToken,renderPrivateReviewTokens};
