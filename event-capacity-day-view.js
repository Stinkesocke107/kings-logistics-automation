'use strict';
// Pure, read-only Kings Convoy Center day detail. No network, no state writes.
// The caller must authenticate Discord and load an independently attested
// complete private snapshot. Input event IDs are NEVER shown in user text.
const {LIMITS,dayAvailability,timestamp,TYPES}=require('./event-capacity-core');
const {dailyLimitForUtcDate}=require('./event-capacity-policy');
const ERROR='Kings Event Capacity private day data invalid.';
const ACCEPTED=new Set(['Scheduled','Completed','Rescheduled']);
const PENDING=new Set(['Submitted','Needs Information','Ready for Approval','Pending','Tentative']);
const LABELS=Object.freeze({kings:'Kings',partner:'Official Partner',external:'Other External'});
function fail(){throw new Error(ERROR);}
function dateValid(date){
  if(typeof date!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date))return false;
  const t=Date.parse(date+'T00:00:00.000Z');
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===date;
}
function getId(item){
  const id=String(item.eventId??'').trim();
  if(id)return 'event:'+id;
  const thread=String(item.threadId??'').trim();
  return thread?'thread:'+thread:null;
}
function relevantDate(item){
  const time=timestamp(item.departureAtUtc);
  if(time!==null)return new Date(time).toISOString().slice(0,10);
  return dateValid(item.possibleUtcDate)?item.possibleUtcDate:null;
}
function safeLink(guildId,threadId){
  if(!/^\d{17,22}$/.test(String(guildId||''))||
    !/^\d{17,22}$/.test(String(threadId||'')))return null;
  return 'https://discord.com/channels/'+guildId+'/'+threadId;
}
function duplicateKey(item){
  return JSON.stringify([
    item.eventType,item.eventTypeVerified===true,
    item.status,item.statusVerified===true,
    item.rescheduleApproved===true,
    item.departureAtUtc,item.departureVerified===true,
    item.meetingAtUtc,item.plannedEndAtUtc,item.dataConflict===true
  ]);
}
function displayRecord(item,guildId,duplicated){
  const type=TYPES[item.eventType];
  const verifiedType=item.eventTypeVerified===true&&!!type;
  const validStatus=item.statusVerified===true&&
    (ACCEPTED.has(item.status)||PENDING.has(item.status)||item.status==='Cancelled');
  const isConfirmed=validStatus&&ACCEPTED.has(item.status)&&
    item.departureVerified===true&&timestamp(item.departureAtUtc)!==null&&
    verifiedType&&(item.status!=='Rescheduled'||item.rescheduleApproved===true);
  const isPending=validStatus&&PENDING.has(item.status);
  const conflict=duplicated||item.dataConflict===true;
  const state=conflict?'Data Conflict':isConfirmed?'Accepted':
    isPending?'Pending':item.status==='Cancelled'&&validStatus?'Cancelled':'Needs Verification';
  const depart=isConfirmed?timestamp(item.departureAtUtc):null;
  const meeting=isConfirmed?timestamp(item.meetingAtUtc):null;
  const end=isConfirmed?timestamp(item.plannedEndAtUtc):null;
  const warnings=[];
  if(conflict)warnings.push('Data Conflict');
  if(item.departureVerified!==true||depart===null)warnings.push('Departure Needs Verification');
  if(isConfirmed&&meeting===null)warnings.push('Meeting Unknown');
  if(isConfirmed&&end===null)warnings.push('End Time Unknown');
  if(isConfirmed&&item.status==='Completed')warnings.push('Planning Completed (not attendance)');
  if(!verifiedType)warnings.push('Classification Unverified');
  const link=safeLink(guildId,item.threadId);
  return {
    // No free-form external message content. Forum deep link only when safe.
    type:verifiedType?LABELS[type]:'Category Unverified',
    status:validStatus?item.status:'Status Unverified',state,
    counted:isConfirmed,conflict,
    departureUnix:depart===null?null:Math.floor(depart/1000),
    meetingUnix:meeting===null?null:Math.floor(meeting/1000),
    endUnix:end===null?null:Math.floor(end/1000),
    link,warnings
  };
}
function detailProjection(adapter,capacity,day,{guildId,page=1,pageSize=10}={}){
  if(!adapter||!Array.isArray(adapter.events)||adapter.dataFresh!==true&&adapter.dataFresh!==false||
    !capacity||typeof capacity.globalUncertainty!=='boolean'||!Array.isArray(capacity.issues)||
    !dateValid(day)||!Number.isSafeInteger(page)||page<1||page>1000||
    pageSize!==10||!/^\d{17,22}$/.test(String(guildId||'')))fail();
  const capacityDay=dayAvailability(capacity,day);
  const sourceSnapshotVerified=adapter.dataFresh===true&&capacityDay.verified;
  const grouped=new Map();
  let unplaced=0;
  for(const item of adapter.events){
    if(!item||typeof item!=='object'||Array.isArray(item))continue;
    const date=relevantDate(item),id=getId(item);
    if(!date){unplaced++;continue;}
    if(date!==day)continue;
    if(!id){unplaced++;continue;}
    if(!grouped.has(id))grouped.set(id,[]);
    grouped.get(id).push(item);
  }
  const items=[...grouped.values()].map(group=>{
    const duplicate=group.length>1&&group.some(x=>duplicateKey(x)!==duplicateKey(group[0]));
    const row=displayRecord(group[0],guildId,duplicate);
    // Suppress deceptive certainty when multiple source identities disagree.
    if(duplicate){row.counted=false;row.departureUnix=null;row.meetingUnix=null;row.endUnix=null;}
    return row;
  });
  const rank={Accepted:0,Pending:1,'Data Conflict':2,'Needs Verification':3,Cancelled:4};
  items.sort((a,b)=>rank[a.state]-rank[b.state]||
    (a.departureUnix??Number.MAX_SAFE_INTEGER)-(b.departureUnix??Number.MAX_SAFE_INTEGER)||
    a.type.localeCompare(b.type));
  const pages=Math.max(1,Math.ceil(items.length/pageSize));
  if(page>pages)fail();
  // Warning links are private internal artifacts, but status descriptions are
  // synthesized exclusively from fixed enums and trusted time fields.
  const issuesForDay=capacity.issues.filter(issue=>issue.day===day).length;
  const safeWarnings=new Set([
    'combined-day-over-limit','partner-day-over-limit',
    'external-day-over-limit','departure-under-two-hours',
    'meeting-end-overlap'
  ]);
  const dayEventIds=new Set(grouped.keys());
  const knownWarnings=(capacity.warnings||[]).filter(w=>
    safeWarnings.has(w.code)&&(
      w.day===day||
      (w.first&&dayEventIds.has(w.first))||
      (w.second&&dayEventIds.has(w.second))
    ))
    .map(w=>w.code);
  return {
    version:1,visibility:'PRIVATE_ONLY',readOnly:true,
    day,sourceVerified:sourceSnapshotVerified,
    capacityVerified:false,
    combinedUsed:capacityDay.daily.combined,
    baseLimit:dailyLimitForUtcDate(day),
    remaining:null,
    monthly:{
      partnerUsed:capacityDay.monthly.partner,
      partnerLimit:null,
      externalUsed:capacityDay.monthly.external,
      externalLimit:null
    },
    approvedExceptions:capacityDay.daily.approvedExceptions||0,
    partnerAvailableVerified:false,
    externalAvailableVerified:false,
    unplacedSourceRecords:unplaced,
    issuesForDay,warnings:[...new Set(knownWarnings)].sort(),
    total:items.length,page,pages,
    items:items.slice((page-1)*pageSize,page*pageSize)
  };
}
function sanitizeDiscord(response){
  if(!response||response.visibility!=='PRIVATE_ONLY'||!dateValid(response.day)||
    response.capacityVerified!==false||response.remaining!==null||
    response.partnerAvailableVerified!==false||
    response.externalAvailableVerified!==false||
    response.baseLimit!==dailyLimitForUtcDate(response.day)||
    response.monthly?.partnerLimit!==null||
    response.monthly?.externalLimit!==null||
    !Array.isArray(response.items)||response.items.length>10)fail();
  const text=[
    '**Kings Event Capacity | '+response.day+' UTC**',
    'Reported Partner + External: **'+response.combinedUsed+'/'+response.baseLimit+'**'+
      (response.approvedExceptions?' | Approved exceptions: '+response.approvedExceptions:''),
    'Monthly reported: Partner '+response.monthly.partnerUsed+
      ' | External '+response.monthly.externalUsed+
      ' (no approved monthly cap)',
    '**Availability unverified — do not confirm an open slot.**',
    'Status: '+(response.sourceVerified?'Source checked':'Data Outdated / Needs Verification'),
    'Events: '+response.total+' | Page '+response.page+'/'+response.pages
  ];
  if(response.issuesForDay)text.push('Needs Attention: '+response.issuesForDay+' issue(s) on this UTC date.');
  if(response.unplacedSourceRecords)text.push(
    'Some source events have no reliable UTC date and could not be assigned to this day.'
  );
  if(response.warnings.length)text.push('Scheduling warnings: '+response.warnings.join(', '));
  text.push('Planning status is not proof of event participation. No event was modified.');
  const summary=text.join('\n');
  if(summary.length>2000)fail();
  const fields=response.items.map((row,index)=>{
    const num=(response.page-1)*10+index+1;
    const time=row.departureUnix===null?'time unverified':'<t:'+row.departureUnix+':F>';
    const location=row.link?'[Convoy Center]('+row.link+')':null;
    const details=[
      row.status+' · Departure '+time,
      row.meetingUnix!==null?'Meeting <t:'+row.meetingUnix+':t>':null,
      row.endUnix!==null?'Planned End <t:'+row.endUnix+':t>':null,
      row.warnings.length?'Checks: '+row.warnings.join(', '):null,
      location
    ].filter(Boolean).join('\n');
    if(details.length>1024)fail();
    return {name:String(num)+'. '+row.type+' | '+row.state,value:details,inline:false};
  });
  return {
    type:4,data:{
      flags:64,allowed_mentions:{parse:[]},content:summary,
      embeds:[{
        title:'Kings Convoy Center | '+response.day+' UTC',
        description:'Private scheduled, pending and conflicting records. Times use your Discord local timezone.',
        color:1584639,
        fields,
        footer:{text:'PRIVATE / READ ONLY · Max. 10 records per page'}
      }]
    }
  };
}
module.exports={detailProjection,sanitizeDiscord,dateValid};
