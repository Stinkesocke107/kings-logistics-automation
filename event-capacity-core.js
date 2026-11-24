'use strict';
// Kings Event Capacity v1: pure, read-only and fail-closed. NOT wired to live jobs.
// Input is a normalized adapter snapshot; *_Verified fields must be established
// by authorized upstream sources, never inferred from a public host or name.
const LIMITS=Object.freeze({combinedDaily:2,partnerMonthly:20,externalMonthly:20,departureGapMinutes:120});
const TYPES=Object.freeze({'Kings Convoy':'kings','Partner Convoy':'partner','External Convoy':'external'});
const PENDING=new Set(['Submitted','Needs Information','Ready for Approval','Pending','Tentative']);
const ACCEPTED=new Set(['Scheduled','Completed','Rescheduled']);

function timestamp(value){
  if(typeof value!=='string')return null;
  // Require explicit timezone; parsing an unzoned time depends on host settings.
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value.trim());
  if(!m)return null;
  const [y,mo,d,h,mi,s]=m.slice(1,7).map(Number);
  const ms=Number((m[7]||'').padEnd(3,'0'));
  const raw=Date.UTC(y,mo-1,d,h,mi,s,ms);
  const check=new Date(raw);
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d||
     check.getUTCHours()!==h||check.getUTCMinutes()!==mi||check.getUTCSeconds()!==s)return null;
  let offset=0;
  if(m[8]!=='Z'){
    const oh=Number(m[10]),om=Number(m[11]);
    if(oh>14||om>59||(oh===14&&om!==0))return null;
    offset=(m[9]==='-'?-1:1)*(oh*60+om);
  }
  const instant=raw-offset*60000;
  return Number.isFinite(instant)?instant:null;
}
function utcDate(ms){return new Date(ms).toISOString().slice(0,10);}
function dateHint(item){
  const t=timestamp(item?.departureAtUtc);
  if(t!==null)return utcDate(t);
  return /^\d{4}-\d{2}-\d{2}$/.test(item?.possibleUtcDate||'')?item.possibleUtcDate:null;
}
function idFor(item){
  if(item?.eventId!==undefined&&String(item.eventId).trim())return 'event:'+String(item.eventId).trim();
  if(item?.threadId!==undefined&&String(item.threadId).trim())return 'thread:'+String(item.threadId).trim();
  return null;
}
function duplicateSignature(item){
  return JSON.stringify([
    item?.eventType||null,item?.eventTypeVerified===true,
    item?.status||null,item?.statusVerified===true,item?.rescheduleApproved===true,
    item?.departureAtUtc||null,item?.departureVerified===true,
    item?.meetingAtUtc||null,item?.plannedEndAtUtc||null,
    item?.dataConflict===true
  ]);
}
function evaluate(input,options={}){
  if(!Array.isArray(input))throw new TypeError('Expected normalized event array');
  const issues=[],warnings=[],pending=[],days={},months={},counted=[];
  const uncertainDates=new Set(),uncertainMonths=new Set();
  let globalUncertainty=options.dataFresh===false;
  function issue(code,id,day=null){
    issues.push({code,id,day:day||null});
    if(day){uncertainDates.add(day);uncertainMonths.add(day.slice(0,7));}
    else globalUncertainty=true;
  }
  const groups=new Map();
  for(const item of input){
    if(!item||item.ignored||item.testThread)continue;
    const id=idFor(item);
    if(!id){issue('missing-event-identity',null,dateHint(item));continue;}
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(item);
  }
  for(const [id,items] of groups){
    if(items.length>1&&!items.every(item=>duplicateSignature(item)===duplicateSignature(items[0]))){
      for(const item of items)issue('conflicting-duplicate',id,dateHint(item));
      continue;
    }
    const item=items[0];
    const status=item.status;
    if(item.statusVerified!==true||(!ACCEPTED.has(status)&&!PENDING.has(status)&&status!=='Cancelled')){
      issue('unverified-status',id,dateHint(item));continue;
    }
    if(status==='Cancelled')continue;
    if(PENDING.has(status)){pending.push({id,status});continue;}
    if(status==='Rescheduled'&&item.rescheduleApproved!==true){
      issue('reschedule-awaiting-approval',id,dateHint(item));continue;
    }
    const type=TYPES[item.eventType];
    if(!type||item.eventTypeVerified!==true){
      issue('unverified-event-type',id,dateHint(item));continue;
    }
    const departure=timestamp(item.departureAtUtc);
    if(departure===null||item.departureVerified!==true){
      issue('unverified-departure',id,dateHint(item));continue;
    }
    const day=utcDate(departure),month=day.slice(0,7);
    const dayCounts=(days[day]??={kings:0,partner:0,external:0,combined:0,approvedExceptions:0});
    const monthCounts=(months[month]??={kings:0,partner:0,external:0,approvedExceptions:0});
    dayCounts[type]++;monthCounts[type]++;
    if(type!=='kings')dayCounts.combined++;
    // This field is evidence provided by the trusted adapter: approval must
    // be role-checked and logged upstream; the evaluator never grants it.
    if(type!=='kings'&&item.exceptionApprovedBy==='Event Management'||type!=='kings'&&item.exceptionApprovedBy==='CEO'){
      dayCounts.approvedExceptions++;monthCounts.approvedExceptions++;
    }
    if(item.dataConflict===true)issue('data-conflict',id,day);
    const meeting=timestamp(item.meetingAtUtc),end=timestamp(item.plannedEndAtUtc);
    if(meeting===null)issue('meeting-time-unknown',id,day);
    if(end===null)issue('end-time-unknown',id,day);
    if(meeting!==null&&end!==null&&(meeting>end||departure<meeting||departure>end)){
      issue('inconsistent-time-window',id,day);
    }
    counted.push({id,type,status,day,month,departure,meeting,end});
  }
  for(const [day,c] of Object.entries(days)){
    c.overLimit=c.combined>LIMITS.combinedDaily;
    c.remaining=Math.max(0,LIMITS.combinedDaily-c.combined);
    c.approvedExceptions=Math.min(c.approvedExceptions,c.combined);
    if(c.overLimit)warnings.push({code:'combined-day-over-limit',day,count:c.combined,limit:LIMITS.combinedDaily,approvedExceptions:c.approvedExceptions});
  }
  for(const [month,c] of Object.entries(months)){
    c.partnerRemaining=Math.max(0,LIMITS.partnerMonthly-c.partner);
    c.externalRemaining=Math.max(0,LIMITS.externalMonthly-c.external);
    if(c.partner>LIMITS.partnerMonthly)warnings.push({code:'partner-month-over-limit',month,count:c.partner,limit:LIMITS.partnerMonthly});
    if(c.external>LIMITS.externalMonthly)warnings.push({code:'external-month-over-limit',month,count:c.external,limit:LIMITS.externalMonthly});
  }
  const timed=[...counted].sort((a,b)=>a.departure-b.departure);
  for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){
    const a=timed[i],b=timed[j],gap=b.departure-a.departure;
    if(gap<LIMITS.departureGapMinutes*60000){
      warnings.push({code:'departure-under-two-hours',first:a.id,second:b.id,minutesApart:Math.floor(gap/60000)});
    }
    if(a.meeting!==null&&a.end!==null&&b.meeting!==null&&b.end!==null&&
       a.meeting<b.end&&b.meeting<a.end){
      const rank={kings:3,partner:2,external:1};
      warnings.push({code:'meeting-end-overlap',first:a.id,second:b.id,priorityConflict:rank[a.type]!==rank[b.type]});
    }
  }
  return {
    version:1,mode:'read-only',limits:LIMITS,days,months,warnings,issues,pending,
    counted:counted.length,uncertainDates:[...uncertainDates].sort(),
    uncertainMonths:[...uncertainMonths].sort(),globalUncertainty,
    // Never infer real participation from Completed.
    attendanceInferred:false
  };
}
function dayAvailability(result,day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new TypeError('Expected UTC date YYYY-MM-DD');
  const month=day.slice(0,7);
  const daily=result.days[day]||{kings:0,partner:0,external:0,combined:0,approvedExceptions:0,remaining:LIMITS.combinedDaily};
  const monthly=result.months[month]||{partner:0,external:0,kings:0,partnerRemaining:LIMITS.partnerMonthly,externalRemaining:LIMITS.externalMonthly};
  const verified=!(result.globalUncertainty||result.uncertainDates.includes(day)||result.uncertainMonths.includes(month));
  const remaining=Math.max(0,LIMITS.combinedDaily-daily.combined);
  return {day,month,verified,daily,monthly,remaining,freeVerified:verified&&remaining>0&&
    monthly.partnerRemaining>0&&monthly.externalRemaining>0};
}
module.exports={LIMITS,TYPES,timestamp,evaluate,dayAvailability};
