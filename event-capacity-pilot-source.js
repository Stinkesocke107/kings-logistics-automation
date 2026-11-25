'use strict';
// Kings Event Capacity — SMALL, GET-ONLY, real Convoy ZIP -> Calendar pilot.
// Designed to land separately from enormous Draft PR #143. Safe even when
// this GitHub repository and its Actions logs are PUBLIC.
// No private Event dates, IDs, Staff identities, totals or ZIP data are logged.
// No Discord, writes, bookings, approvals or free-slot certification.
const {parsePrivateConvoyArchive}=require('./event-capacity-pilot-archive');
const {reconcileSourceInventory}=require('./event-capacity-pilot-reconcile');
const REPO='Stinkesocke107/kings-logistics-automation';
const BASE='https://api.github.com/repos/'+REPO;
const GUILD='1114967437788577792';
const FORUM='1550619824005062697';
const PATH='.github/workflows/convoy-checker.yml';
const NAME='kings-convoy-reports';
const ZIP_MAX=25*1024*1024,JSON_MAX=2*1024*1024;
const AGE=30*60*1000,ID=/^[1-9]\d{5,19}$/,SHA=/^[a-f0-9]{40}$/;
const STATUSES=new Set(['SOURCE_UNVERIFIED','SOURCE_NOT_RECENT',
  'CALENDAR_UNVERIFIED','SOURCE_CALENDAR_READONLY_READY','CONTEXT_REJECTED']);
const VALID=new Set(['Kings Convoy','Partner Convoy','External Convoy']);
function refuse(){throw Error('Kings Calendar pilot source unavailable.');}
function stamp(value){
  if(typeof value!=='string'||!value.trim())return null;
  const n=Date.parse(value);
  return Number.isFinite(n)?n:null;
}
function verdict(status){
  if(!STATUSES.has(status))refuse();
  return Object.freeze({
    status,scope:'PRIVATE_SOURCE',readOnly:true,
    sourceCalendarReady:status==='SOURCE_CALENDAR_READONLY_READY',
    discordAccessed:false,discordMessagesChanged:0,githubWrites:0,
    privateEventContentLogged:false,individualEventIdentifiersReturned:false,
    signedHistoricHoldsVerified:false,staffApprovalsVerified:false,
    freeSlotsCertified:false,bookingsCreated:0,automaticActivationAuthorized:false
  });
}
function contextAllowed(e){
  return e&&e.GITHUB_EVENT_NAME==='workflow_dispatch'&&
    e.GITHUB_REF==='refs/heads/main'&&
    e.GITHUB_REPOSITORY===REPO&&
    e.KINGS_CAPACITY_PILOT_SOURCE==='true'&&
    typeof e.GITHUB_TOKEN==='string'&&e.GITHUB_TOKEN.length>=16&&
    e.GITHUB_TOKEN.length<=1024&&!/[\r\n]/.test(e.GITHUB_TOKEN);
}
function runShape(run){
  return run&&ID.test(String(run.id||''))&&
    ['Kings Convoy Checker','Kings Convoy Checker (live)'].includes(run.name)&&
    run.path===PATH&&run.repository?.full_name===REPO&&
    run.head_repository?.full_name===REPO&&run.head_branch==='main'&&
    run.event==='schedule'&&run.status==='completed'&&
    run.conclusion==='success'&&SHA.test(String(run.head_sha||''))&&
    Number.isSafeInteger(run.run_attempt)&&run.run_attempt>=1&&
    run.run_attempt<=1000&&
    stamp(run.run_started_at)!==null&&stamp(run.updated_at)!==null&&
    stamp(run.run_started_at)<=stamp(run.updated_at)&&
    stamp(run.updated_at)-stamp(run.run_started_at)<=20*60000;
}
function current(run,nowMs){
  return runShape(run)&&stamp(run.updated_at)<=nowMs+60000&&
    nowMs-stamp(run.updated_at)<=AGE;
}
function artifactFor(list,run){
  if(!list||!Array.isArray(list.artifacts)||list.artifacts.length>100||
    !Number.isSafeInteger(list.total_count)||list.total_count<0||
    list.total_count!==list.artifacts.length)refuse();
  const found=list.artifacts.filter(x=>x?.name===NAME);
  if(found.length!==1)refuse();
  const item=found[0];
  if(!ID.test(String(item.id||''))||item.expired!==false||
    !Number.isSafeInteger(item.size_in_bytes)||item.size_in_bytes<1||
    item.size_in_bytes>ZIP_MAX||
    String(item.workflow_run?.id)!==String(run.id)||
    item.workflow_run?.head_branch!=='main'||
    item.workflow_run?.head_sha!==run.head_sha)refuse();
  return item;
}
function monthsFrom(data,nowMs){
  const {report,overview}=data||{};
  if(!report||!overview||report.guildId!==GUILD||overview.guildId!==GUILD||
    report.forumId!==FORUM||overview.forumId!==FORUM||
    !Array.isArray(report.threads)||!Array.isArray(overview.registeredConvoys)||
    reconcileSourceInventory(report,overview).ok!==true)refuse();
  const created=stamp(report.generatedAt);
  const finalized=stamp(report.finalization?.finalizedAt);
  const compiled=stamp(overview.generatedAt);
  if(created===null||finalized===null||compiled===null||
    created>finalized||finalized>compiled||compiled-created>60*60000||
    compiled>nowMs+60000||nowMs-compiled>AGE)refuse();
  // These are merely reported planning claims, not Staff approved
  // decisions. There is NO booking capacity or auto availability here.
  const now=new Date(nowMs);
  const first=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1);
  const starts=Array.from({length:13},(_,i)=>
    Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+i,1));
  const months=Array.from({length:12},()=>({
    centerClaims:0,unclassified:0,pending:0,cancelled:0,scheduled:0,
    // Source-reported accepted status claims only. They are NOT
    // Staff-approved reservations or independently verified free slots.
    kingsClaims:0,partnerClaims:0,externalClaims:0,
    daysRequiringReview:0,legacyDatedKeptSeparate:0
  }));
  const days=Array.from({length:12},()=>new Map());
  let undatedCenter=0,undatedLegacy=0,legacyOutside=0;
  const center=report.threads.filter(x=>x&&!x.ignored&&!x.testThread&&
    !/^\s*\[?test\]?(?:\s|[-_:])/i.test(String(x.name||'')));
  const legacy=overview.registeredConvoys.filter(x=>x?.source==='legacy-calendar');
  for(const x of center){
    const departure=stamp(x.validation?.parsed?.departureAtUtc||
      x.departureAtUtc);
    if(departure===null){undatedCenter++;continue;}
    const idx=starts.findIndex((s,i)=>i<12&&departure>=s&&departure<starts[i+1]);
    if(idx<0)continue;
    const row=months[idx];
    row.centerClaims++;
    const kind=x.validation?.parsed?.eventType;
    const active=['Scheduled','Completed','Rescheduled'].includes(x.status);
    if(!VALID.has(kind))row.unclassified++;
    if(active)row.scheduled++;
    else if(x.status==='Cancelled')row.cancelled++;
    else row.pending++;
    // Count only active, classifiable current-source claims in the
    // planning review. Pending or canceled claims still appear in the
    // informational monthly total, but can NEVER release held capacity.
    const dayKey=new Date(departure).toISOString().slice(0,10);
    let day=days[idx].get(dayKey);
    if(!day){
      day={kings:0,partner:0,external:0,unclassified:0,
        pending:0,cancelled:0,departures:[]};
      days[idx].set(dayKey,day);
    }
    if(active){
      if(kind==='Kings Convoy'){row.kingsClaims++;day.kings++;}
      else if(kind==='Partner Convoy'){row.partnerClaims++;day.partner++;}
      else if(kind==='External Convoy'){row.externalClaims++;day.external++;}
      else day.unclassified++;
      day.departures.push(departure);
    }else if(x.status==='Cancelled')day.cancelled++;
    else day.pending++;
  }
  for(const x of legacy){
    const departure=stamp(x.departureAtUtc);
    if(departure===null){undatedLegacy++;continue;}
    const idx=starts.findIndex((s,i)=>i<12&&departure>=s&&departure<starts[i+1]);
    if(idx<0){legacyOutside++;continue;}
    months[idx].legacyDatedKeptSeparate++;
  }
  if(undatedLegacy+legacyOutside+
    months.reduce((sum,m)=>sum+m.legacyDatedKeptSeparate,0)!==legacy.length)refuse();
  for(let i=0;i<months.length;i++){
    const m=months[i];
    if(m.centerClaims!==m.scheduled+m.pending+m.cancelled||
      m.kingsClaims+m.partnerClaims+m.externalClaims>m.scheduled)refuse();
    for(const [utcDay,day] of days[i]){
      const weekday=new Date(utcDay+'T00:00:00.000Z').getUTCDay();
      const combinedLimit=[0,5,6].includes(weekday)?5:3;
      const combined=day.partner+day.external;
      // REVIEW FLAGS ONLY: incomplete history and absent Staff approval
      // mean we cannot assert any day is actually available.
      day.departures.sort((a,b)=>a-b);
      const spacingConflict=day.departures.some((t,j)=>
        j>0&&t-day.departures[j-1]<120*60000);
      if(combined>combinedLimit||day.partner>2||day.external>2||
        day.unclassified>0||day.pending>0||day.cancelled>0||
        spacingConflict)m.daysRequiringReview++;
    }
  }
  // Internal-only structure — NEVER returned from the public job.
  return {months,undatedCenter,undatedLegacy,legacyClaims:legacy.length,
    sourcePeriod:first,ready:false,freeSlotsCertified:false};
}
function allowedRedirect(raw){
  let u;
  try{u=new URL(raw);}catch{refuse();}
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||
    !['.blob.core.windows.net','.actions.githubusercontent.com',
      '.githubusercontent.com'].some(s=>host.endsWith(s)))refuse();
  return u.href;
}
async function collect(res,max){
  if(!res||res.status!==200||res.ok!==true||
    !res.body||typeof res.body.getReader!=='function')refuse();
  const len=res.headers?.get('content-length');
  if(len!==null&&len!==undefined&&(!/^\d+$/.test(len)||Number(len)>max))
    refuse();
  const r=res.body.getReader(),chunks=[];
  let sum=0;
  try{
    for(;;){
      const {done,value}=await r.read();
      if(done)break;
      if(!(value instanceof Uint8Array))refuse();
      sum+=value.length;
      if(sum>max)refuse();
      chunks.push(Buffer.from(value));
    }
  }catch{try{await r.cancel();}catch{}refuse();}
  return Buffer.concat(chunks,sum);
}
function createReader({token,transport=fetch}={}){
  if(typeof token!=='string'||token.length<16||token.length>1024||
    /[\r\n]/.test(token)||typeof transport!=='function')refuse();
  const auth={
    Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'User-Agent':'Kings-Event-Calendar-Pilot-Read-Only',
    'X-GitHub-Api-Version':'2022-11-28'
  };
  async function api(route){
    const response=await transport(BASE+route,{method:'GET',
      headers:auth,redirect:'manual',signal:AbortSignal.timeout(15000)});
    return response;
  }
  async function json(route){
    const r=await api(route);
    const bytes=await collect(r,JSON_MAX);
    try{return JSON.parse(bytes.toString('utf8'));}catch{refuse();}
  }
  return Object.freeze({
    latest:()=>json('/actions/workflows/convoy-checker.yml/runs?'+
      'branch=main&status=success&event=schedule&per_page=20'),
    run:id=>json('/actions/runs/'+id),
    artifacts:id=>json('/actions/runs/'+id+'/artifacts?per_page=100'),
    zip:async id=>{
      const first=await api('/actions/artifacts/'+id+'/zip');
      if(first?.status===200&&first.ok)return collect(first,ZIP_MAX);
      if(![301,302,303,307,308].includes(first?.status))refuse();
      const url=allowedRedirect(first.headers?.get('location'));
      // Signed CDN URL MUST NOT receive the GitHub token.
      const second=await transport(url,{
        method:'GET',headers:{Accept:'application/zip'},
        redirect:'manual',signal:AbortSignal.timeout(20000)
      });
      return collect(second,ZIP_MAX);
    }
  });
}
async function inspect({reader,nowMs=Date.now()}={}){
  try{
    if(!reader||['latest','run','artifacts','zip']
      .some(k=>typeof reader[k]!=='function')||
      !Number.isSafeInteger(nowMs)||nowMs<0)refuse();
    const list=await reader.latest();
    if(!list||!Array.isArray(list.workflow_runs)||
      list.workflow_runs.length>20)refuse();
    const runs=list.workflow_runs.filter(runShape)
      .sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:1);
    if(!runs.length)return verdict('SOURCE_UNVERIFIED');
    const candidate=runs[0];
    if(!current(candidate,nowMs))return verdict('SOURCE_NOT_RECENT');
    const direct=await reader.run(candidate.id);
    if(!current(direct,nowMs)||direct.id!==candidate.id||
      direct.run_attempt!==candidate.run_attempt||
      direct.head_sha!==candidate.head_sha)refuse();
    const artifact=artifactFor(await reader.artifacts(candidate.id),direct);
    const zip=await reader.zip(artifact.id);
    if(!Buffer.isBuffer(zip)||zip.length!==artifact.size_in_bytes)refuse();
    const data=parsePrivateConvoyArchive(zip);
    try{monthsFrom(data,nowMs);}catch{return verdict('CALENDAR_UNVERIFIED');}
    return verdict('SOURCE_CALENDAR_READONLY_READY');
  }catch{return verdict('SOURCE_UNVERIFIED');}
}
async function main({env=process.env,transport=fetch}={}){
  if(!contextAllowed(env))return verdict('CONTEXT_REJECTED');
  const result=await inspect({reader:createReader({
    token:env.GITHUB_TOKEN,transport
  })});
  // This is a PUBLIC repository. Emit only an allowlisted fixed status.
  console.log('Kings private Event Calendar pilot: '+result.status);
  console.log('ZIP data not published; Discord not contacted; booking disabled.');
  return result;
}
if(require.main===module){
  main().then(r=>{if(!r.sourceCalendarReady)process.exitCode=1;})
    .catch(()=>{console.error('Kings private Event Calendar pilot blocked.');
      process.exitCode=1;});
}
module.exports={inspect,monthsFrom,verdict,contextAllowed,runShape,
  artifactFor,allowedRedirect,createReader,main};
