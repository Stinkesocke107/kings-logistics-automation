'use strict';
// Verified private Event Capacity milestone view + reminder proposals.
// No Discord interactions, pings, or staff decisions are performed here.
const {timestamp}=require('./event-capacity-core');
const {milestoneTag}=require('./event-capacity-preparation');
const ERROR='Kings Event Capacity milestone data unavailable.';
const ACCEPTED=new Set(['Scheduled','Rescheduled']);
const VISIBLE=new Set(['Scheduled','Rescheduled','Pending','Submitted','Ready for Approval']);
function fail(){throw new Error(ERROR);}
function eventRef(e){
  const raw=e?.eventId?'event:'+String(e.eventId):
    e?.threadId?'thread:'+String(e.threadId):null;
  if(!raw||!(/^(?:event|thread):[A-Za-z0-9_-]{1,100}$/).test(raw))fail();
  return raw;
}
function validEvent(e){
  return !!(e&&e.statusVerified===true&&VISIBLE.has(e.status)&&
    (e.status!=='Rescheduled'||e.rescheduleApproved===true)&&
    e.departureVerified===true&&timestamp(e.departureAtUtc)!==null);
}
function upcoming({events,milestones={},nowMs=Date.now(),page=1,sourceVerified=false}={}){
  if(!Array.isArray(events)||events.length>50000||
    !milestones||typeof milestones!=='object'||Array.isArray(milestones)||
    !Number.isFinite(nowMs)||!Number.isSafeInteger(page)||page<1||page>1000)fail();
  const rows=[],seen=new Set(),conflicts=new Set();
  for(const e of events){
    if(!validEvent(e))continue;
    let ref;
    try{ref=eventRef(e);}catch{continue;}
    const tag=milestoneTag(milestones[ref]);
    if(!tag)continue;
    if(seen.has(ref)){conflicts.add(ref);continue;}
    seen.add(ref);
    const depart=timestamp(e.departureAtUtc);
    if(depart<nowMs)continue;
    rows.push({eventRef:ref,milestone:tag,status:e.status,
      departureUnix:Math.floor(depart/1000),
      sourceVerified:sourceVerified===true&&e.dataConflict!==true});
  }
  const cleaned=rows.filter(x=>!conflicts.has(x.eventRef));
  cleaned.sort((a,b)=>a.departureUnix-b.departureUnix||
    a.eventRef.localeCompare(b.eventRef));
  const pages=Math.max(1,Math.ceil(cleaned.length/10));
  if(page>pages)fail();
  return {visibility:'PRIVATE_ONLY',readOnly:true,sourceVerified:sourceVerified===true&&
    conflicts.size===0,conflictCount:conflicts.size,
    page,pages,total:cleaned.length,
    items:cleaned.slice((page-1)*10,page*10)};
}
function reminders({
  events,milestones={},preparationByEvent={},nowMs=Date.now(),
  sourceVerified=false,sentKeys=[]
}={}){
  if(!Array.isArray(events)||!milestones||typeof milestones!=='object'||
    !preparationByEvent||typeof preparationByEvent!=='object'||
    !Number.isFinite(nowMs)||!Array.isArray(sentKeys))fail();
  if(sourceVerified!==true)return [];
  const notices=[],sent=new Set(sentKeys),seen=new Set(),duplicates=new Set();
  const valid=[];
  for(const e of events){
    if(!validEvent(e)||!ACCEPTED.has(e.status)||e.dataConflict===true)continue;
    let ref;
    try{ref=eventRef(e);}catch{continue;}
    const tag=milestoneTag(milestones[ref]);
    if(!tag)continue;
    if(seen.has(ref)){duplicates.add(ref);continue;}
    seen.add(ref);
    valid.push({e,ref,tag});
  }
  for(const {e,ref,tag} of valid){
    if(duplicates.has(ref))continue;
    const prep=preparationByEvent[ref];
    if(!prep||!['Needs Attention','In Progress','Not Started'].includes(prep.status)||
      prep.archived===true)continue;
    const departure=timestamp(e.departureAtUtc);
    if(departure<=nowMs)continue;
    const remainingDays=(departure-nowMs)/86400000;
    if(remainingDays>14)continue;
    const phase=remainingDays<=3?'3d':'14d';
    const key=['milestone',ref,e.departureAtUtc,tag.type,phase].join(':');
    if(sent.has(key))continue;
    notices.push({kind:'milestone-preparation-reminder',key,eventRef:ref,
      phase,privateOnly:true,
      targetGroups:['Assigned Event Coordination','Event Leadership'],
      // The protected sender must verify current roles, actual assignment,
      // durable delivery idempotency and event revisions before issuing messages.
      verifiedDepartureUnix:Math.floor(departure/1000)});
  }
  return notices;
}
module.exports={upcoming,reminders};
