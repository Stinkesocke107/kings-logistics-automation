'use strict';
// Pure private monthly/annual Event Capacity reporting. No public posting.
// Reported attendance requires independent verified proof; planning completion
// alone is NEVER attendance evidence. Deployment must encrypt report history.
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity reporting input unverified.';
const CATEGORIES={'Kings Convoy':'kings','Partner Convoy':'partner','External Convoy':'external'};
const PENDING=new Set(['Submitted','Needs Information','Ready for Approval','Pending','Tentative']);
const ACCEPTED=new Set(['Scheduled','Completed','Rescheduled']);
function fail(){throw new Error(ERROR);}
function date(s){if(timestamp(s)===null)fail();return new Date(timestamp(s)).toISOString();}
function periodRange(kind,period){
  if(!['month','year'].includes(kind)||typeof period!=='string')fail();
  if(kind==='month'&&!/^20\d\d-(?:0[1-9]|1[0-2])$/.test(period))fail();
  if(kind==='year'&&!/^20\d\d$/.test(period))fail();
  const start=Date.parse(period+(kind==='month'?'-01':'-01-01')+'T00:00:00Z');
  if(!Number.isFinite(start))fail();
  const end=kind==='month'?
    Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),1):
    Date.UTC(Number(period)+1,0,1);
  return {start,end};
}
function ref(item){
  const id=String(item?.eventId||'').trim(),thread=String(item?.threadId||'').trim();
  return id?'event:'+id:thread?'thread:'+thread:null;
}
function blank(){
  return {kings:0,partner:0,external:0,accepted:0,scheduled:0,completed:0,
    rescheduled:0,cancelled:0,pending:0,exceptions:0,
    conflicts:0,attendanceVerified:0};
}
function summarize({events,dataFresh=false,kind,period,attendanceEvidence={}}={}){
  if(!Array.isArray(events)||events.length>100000||!attendanceEvidence||
    typeof attendanceEvidence!=='object')fail();
  const {start,end}=periodRange(kind,period);
  const counts=blank(),problems=new Set(),seen=new Set();
  let globalUnverified=dataFresh!==true;
  for(const item of events){
    if(!item||typeof item!=='object'||item.ignored)continue;
    const key=ref(item);
    if(!key){globalUnverified=true;problems.add('unknown-identity');continue;}
    if(seen.has(key)){globalUnverified=true;problems.add('duplicate-identity');continue;}
    seen.add(key);
    const departure=timestamp(item.departureAtUtc);
    if(departure===null||item.departureVerified!==true){
      // Cannot determine whether an accepted item belongs to this period.
      if(ACCEPTED.has(item.status)||item.statusVerified!==true){
        globalUnverified=true;problems.add('unverified-departure');
      }
      continue;
    }
    if(departure<start||departure>=end)continue;
    const status=item.status;
    if(item.statusVerified!==true){
      globalUnverified=true;problems.add('unverified-status');continue;
    }
    if(item.dataConflict===true){counts.conflicts++;globalUnverified=true;problems.add('data-conflict');}
    if(status==='Cancelled'){counts.cancelled++;continue;}
    if(PENDING.has(status)){counts.pending++;continue;}
    if(!ACCEPTED.has(status)){globalUnverified=true;problems.add('unknown-status');continue;}
    const category=item.eventTypeVerified===true?CATEGORIES[item.eventType]:null;
    if(!category){globalUnverified=true;problems.add('unverified-category');continue;}
    if(status==='Rescheduled'&&item.rescheduleApproved!==true){
      globalUnverified=true;problems.add('unapproved-reschedule');continue;
    }
    counts.accepted++;counts[category]++;
    if(status==='Scheduled')counts.scheduled++;
    if(status==='Completed')counts.completed++;
    if(status==='Rescheduled')counts.rescheduled++;
    if(category!=='kings'&&['CEO','Event Management'].includes(item.exceptionApprovedBy))
      counts.exceptions++;
    // The evidence is a distinct, permission-controlled source. A planning
    // Completed state does not infer presence or actual Kings participation.
    if(attendanceEvidence[key]?.verified===true&&
      typeof attendanceEvidence[key].evidenceRef==='string'&&
      attendanceEvidence[key].evidenceRef.trim())counts.attendanceVerified++;
  }
  return {
    version:1,visibility:'PRIVATE_ONLY',kind,period,
    sourceStatus:globalUnverified?'Unverified':'Verified',
    counts,issues:[...problems].sort(),
    attendanceInferred:false,rangeStart:new Date(start).toISOString(),
    rangeEndExclusive:new Date(end).toISOString()
  };
}
function duePeriods(now){
  const iso=date(now),day=iso.slice(8,10),clock=iso.slice(11,16);
  const current=iso.slice(0,7),year=Number(iso.slice(0,4));
  const result=[];
  if(day==='02'&&clock>='09:00'){
    const previous=new Date(Date.UTC(year,Number(iso.slice(5,7))-2,1))
      .toISOString().slice(0,7);
    result.push({kind:'month',period:previous,dedupeKey:'month:'+previous});
  }
  if(iso.slice(5,10)==='01-03'&&clock>='09:00'){
    result.push({kind:'year',period:String(year-1),dedupeKey:'year:'+(year-1)});
  }
  // Only a due proposal; the protected sender tracks deliveries and retries.
  return result;
}
function versionReport(history,report,{at,actorId,evidenceRef}={}){
  if(!Array.isArray(history)||history.length>500||
    !report||report.visibility!=='PRIVATE_ONLY'||report.sourceStatus!=='Verified'||
    !['month','year'].includes(report.kind))fail();
  const createdAt=date(at);
  if(!(/^\d{5,25}$/).test(String(actorId||''))||
    typeof evidenceRef!=='string'||!evidenceRef.trim()||evidenceRef.length>256)fail();
  const next=structuredClone(history);
  const same=next.filter(x=>x.kind===report.kind&&x.period===report.period);
  const version=same.length+1;
  for(const x of next){
    if(x.kind===report.kind&&x.period===report.period&&x.status==='Current')
      x.status='Superseded';
  }
  next.push({kind:report.kind,period:report.period,version,status:'Current',
    createdAt,createdBy:actorId,evidenceRef,summary:structuredClone(report)});
  // Retention/deletion is the private backend's responsibility; no in-memory
  // pruning can prove deletion propagation into encrypted backups.
  return next;
}
function aggregateCsv(report){
  if(!report||report.visibility!=='PRIVATE_ONLY'||!['month','year'].includes(report.kind)||
    !['Unverified','Verified'].includes(report.sourceStatus))fail();
  const cols=['kings','partner','external','accepted','scheduled','completed',
    'rescheduled','cancelled','pending','exceptions','conflicts','attendanceVerified'];
  if(cols.some(k=>!Number.isSafeInteger(report.counts?.[k])||report.counts[k]<0))fail();
  // Never export personal identifiers, private event references or untrusted CSV cells.
  return ['kind,period,sourceStatus,'+cols.join(','),
    [report.kind,report.period,report.sourceStatus,...cols.map(x=>report.counts[x])].join(',')
  ].join('\n')+'\n';
}
module.exports={summarize,duePeriods,versionReport,aggregateCsv};
