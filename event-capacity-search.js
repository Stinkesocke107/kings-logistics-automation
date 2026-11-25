'use strict';
// Pure private Event Capacity search. No network, Discord writes, public logs,
// untrusted organizer names, guessed UTC dates or inferred attendance.
const {timestamp,TYPES}=require('./event-capacity-core');
const {dateValid}=require('./event-capacity-day-view');
const ERROR='Kings Event Capacity private search input invalid.';
const TYPE=new Set(['Kings Convoy','Partner Convoy','External Convoy','Unverified']);
const STATUS=new Set(['Scheduled','Completed','Rescheduled','Cancelled','Submitted',
  'Needs Information','Ready for Approval','Pending','Tentative','Unverified']);
const QUALITY=new Set(['Verified','Needs Verification','Data Conflict']);
const BOOLEAN=new Set(['yes','no','any']);
const SORT=new Set(['upcoming','date','priority','status']);
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const SNOWFLAKE=/^\d{17,22}$/;
const ACCEPTED=new Set(['Scheduled','Completed','Rescheduled']);
const PENDING=new Set(['Submitted','Needs Information','Ready for Approval','Pending','Tentative']);
function fail(){throw new Error(ERROR);}
function normDate(e){
  const t=timestamp(e.departureAtUtc);
  if(t!==null)return new Date(t).toISOString().slice(0,10);
  return dateValid(e.possibleUtcDate)?e.possibleUtcDate:null;
}
function eventRef(e){
  const id=String(e.eventId||'').trim(),thread=String(e.threadId||'').trim();
  const ref=id?'event:'+id:thread?'thread:'+thread:null;
  if(!ref||!ID.test(ref.split(':')[1]))return null;
  return ref;
}
function safeLink(guildId,threadId){
  return SNOWFLAKE.test(String(guildId||''))&&SNOWFLAKE.test(String(threadId||''))?
    'https://discord.com/channels/'+guildId+'/'+threadId:null;
}
function validateFilters(filters){
  if(!filters||typeof filters!=='object'||Array.isArray(filters))fail();
  const allowed=new Set(['dateFrom','dateTo','type','status','quality',
    'conflict','exception','eventId','sort']);
  if(Object.keys(filters).some(key=>!allowed.has(key)))fail();
  for(const field of ['dateFrom','dateTo']){
    if(filters[field]!==undefined&&!dateValid(filters[field]))fail();
  }
  if(filters.dateFrom&&filters.dateTo&&filters.dateFrom>filters.dateTo)fail();
  if(filters.type!==undefined&&!TYPE.has(filters.type))fail();
  if(filters.status!==undefined&&!STATUS.has(filters.status))fail();
  if(filters.quality!==undefined&&!QUALITY.has(filters.quality))fail();
  for(const k of ['conflict','exception'])
    if(filters[k]!==undefined&&!BOOLEAN.has(filters[k]))fail();
  if(filters.eventId!==undefined&&!ID.test(filters.eventId))fail();
  if(filters.sort!==undefined&&!SORT.has(filters.sort))fail();
  return filters;
}
function statusOf(e){
  if(e.statusVerified!==true||!STATUS.has(e.status)||e.status==='Unverified')
    return 'Unverified';
  return e.status;
}
function typeOf(e){
  return e.eventTypeVerified===true&&Object.hasOwn(TYPES,e.eventType)?
    e.eventType:'Unverified';
}
function project(adapter,capacity,{guildId,filters={},page=1,nowMs=Date.now()}={}){
  if(!adapter||!Array.isArray(adapter.events)||typeof adapter.dataFresh!=='boolean'||
    !capacity||!Array.isArray(capacity.issues)||!Array.isArray(capacity.warnings)||
    typeof capacity.globalUncertainty!=='boolean'||
    !SNOWFLAKE.test(String(guildId||''))||
    !Number.isSafeInteger(page)||page<1||page>1000||
    !Number.isFinite(nowMs))fail();
  validateFilters(filters);
  if(adapter.events.length>50000)fail();
  // Any duplicate identity is shown as an unresolved conflict; do not
  // silently treat identical snapshots as two separate accepted Convoys.
  const groups=new Map();
  let unknownIdentity=0;
  for(const e of adapter.events){
    if(!e||typeof e!=='object'||Array.isArray(e))continue;
    const ref=eventRef(e);
    if(!ref){unknownIdentity++;continue;}
    if(!groups.has(ref))groups.set(ref,[]);
    groups.get(ref).push(e);
  }
  const rows=[];
  for(const [ref,group] of groups){
    const e=group[0],duplicate=group.length>1,conflict=duplicate||
      group.some(x=>x.dataConflict===true);
    const type=typeOf(e),status=statusOf(e);
    const time=timestamp(e.departureAtUtc),date=normDate(e);
    const timeVerified=e.departureVerified===true&&time!==null;
    const quality=conflict?'Data Conflict':
      adapter.dataFresh!==true||capacity.globalUncertainty||
      !timeVerified||type==='Unverified'||status==='Unverified'||
      status==='Rescheduled'&&e.rescheduleApproved!==true?
        'Needs Verification':'Verified';
    const exception=['CEO','Event Management'].includes(e.exceptionApprovedBy)&&
      type!=='Kings Convoy';
    if(filters.dateFrom&&(!date||date<filters.dateFrom))continue;
    if(filters.dateTo&&(!date||date>filters.dateTo))continue;
    if(filters.type&&type!==filters.type)continue;
    if(filters.status&&status!==filters.status)continue;
    if(filters.quality&&quality!==filters.quality)continue;
    if(filters.conflict==='yes'&&!conflict||filters.conflict==='no'&&conflict)continue;
    if(filters.exception==='yes'&&!exception||
      filters.exception==='no'&&exception)continue;
    if(filters.eventId&&String(e.eventId||'')!==filters.eventId)continue;
    const accepted=ACCEPTED.has(status)&&quality==='Verified';
    rows.push({
      ref,sortKey:date||'9999-99-99',timestamp:timeVerified?time:null,
      type,status,quality,conflict,exception,accepted,
      phase:status==='Cancelled'?'Cancelled':
        PENDING.has(status)?'Pending':accepted?'Accepted':'Needs Verification',
      departureUnix:timeVerified?Math.floor(time/1000):null,
      date:date||'Date Unverified',link:safeLink(guildId,e.threadId),
      warnings:quality==='Verified'?[]:['Availability Not Confirmed']
    });
  }
  const priorities={'Kings Convoy':0,'Partner Convoy':1,'External Convoy':2,Unverified:3};
  const sort=filters.sort||'upcoming';
  rows.sort((a,b)=>{
    if(sort==='priority'){
      const p=priorities[a.type]-priorities[b.type];if(p)return p;
    }
    if(sort==='status'){
      const p=a.status.localeCompare(b.status);if(p)return p;
    }
    if(sort==='upcoming'){
      // Show upcoming departures first, ordered ascending; past history
      // remains visible and chronological (not dropped).
      const aUp=a.timestamp!==null&&a.timestamp>=nowMs;
      const bUp=b.timestamp!==null&&b.timestamp>=nowMs;
      if(aUp!==bUp)return aUp?-1:1;
    }
    return a.sortKey.localeCompare(b.sortKey)||a.ref.localeCompare(b.ref);
  });
  const pages=Math.max(1,Math.ceil(rows.length/10));
  if(page>pages)fail();
  return {
    version:1,visibility:'PRIVATE_ONLY',readOnly:true,
    sourceVerified:adapter.dataFresh===true&&!capacity.globalUncertainty&&
      unknownIdentity===0,
    issueCount:capacity.issues.length,unknownIdentity,
    // Searches may filter existing, uncertain event dates but cannot
    // certify OPEN slots. Use the separate capacity policy engine for that.
    availabilityCertified:false,filters:{...filters},
    total:rows.length,page,pages,items:rows.slice((page-1)*10,page*10)
  };
}
function discordResponse(result){
  if(!result||result.visibility!=='PRIVATE_ONLY'||
    !Array.isArray(result.items)||result.items.length>10||
    !Number.isSafeInteger(result.page)||!Number.isSafeInteger(result.pages))fail();
  const fields=result.items.map((r,index)=>{
    const count=(result.page-1)*10+index+1;
    const dep=r.departureUnix===null?'Unverified':'<t:'+r.departureUnix+':F>';
    const parts=[r.status+' · Departure '+dep,
      r.quality+' · '+(r.exception?'Approved Exception':'No exception displayed'),
      r.link?'[Convoy Center]('+r.link+')':null].filter(Boolean);
    const value=parts.join('\n');
    if(value.length>1024)fail();
    return {name:count+'. '+r.type+' | '+r.phase,value,inline:false};
  });
  const content='**Kings Event Capacity | Private Event Search**\n'+
    'Results: '+result.total+' | Page '+result.page+'/'+result.pages+'\n'+
    (result.sourceVerified?'Source checked':'Data Outdated / Needs Verification')+
    '\nSearch results do not certify free slots or prove attendance. No event was modified.';
  if(content.length>2000)fail();
  return {type:4,data:{flags:64,allowed_mentions:{parse:[]},content,
    embeds:[{title:'Kings Convoy Center | Private Search',color:1584639,
      description:'Verified UTC information only. Unknown classifications and conflicting records remain flagged.',
      fields,footer:{text:'PRIVATE / READ ONLY · 10 results per page'}}]}};
}
module.exports={project,discordResponse,validateFilters};
