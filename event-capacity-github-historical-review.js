'use strict';
// GitHub Actions-only HISTORICAL REVIEW PLANNER (not a quota approval).
// A current Convoy Checker snapshot cannot attest every historical event.
// Do not infer a cancellation release, an accepted event, or a free slot from
// an incomplete ledger. All references and task keys are PRIVATE ONLY.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {createAuthenticatedKingsSource}
  =require('./event-capacity-github-authenticated-source');
const {checkedReport}=require('./event-capacity-github-decision-evidence');
const {validateLedger}=require('./event-capacity-decision-ledger');
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity historical review cannot be trusted.';
const GUILD='1114967437788577792';
const FORUM='1550619824005062697';
const SNOWFLAKE=/^\d{17,22}$/;
const REF=/^(?:event:[A-Za-z0-9_-]{1,128}|thread:\d{17,22})$/;
const ID=/^[1-9]\d{5,19}$/;
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const ACCEPTED=new Set(['Scheduled','Completed','Rescheduled']);
const PENDING=new Set(['Submitted','Needs Information','Ready for Approval','Pending','Tentative']);
const TYPES=new Set(['Kings Convoy','Partner Convoy','External Convoy']);
const REASONS=new Set([
  'legacy-record-unreconciled',
  'historical-status-evidence-required',
  'classification-evidence-required',
  'classification-conflict',
  'departure-evidence-required',
  'departure-conflict',
  'meeting-evidence-required',
  'planned-end-evidence-required',
  'reschedule-history-required',
  'cancellation-release-evidence-required',
  'ledger-only-record-review',
  'unknown-event-identity',
  'unknown-source-status',
  'source-entry-conflict',
  'legacy-duplicate-identity'
]);
const PRIORITY={
  'source-entry-conflict':'Urgent',
  'classification-conflict':'Urgent',
  'departure-conflict':'Urgent',
  'cancellation-release-evidence-required':'Review',
  'reschedule-history-required':'Review'
};
function fail(){throw new Error(ERROR);}
function scopeOf(s){
  if(!s||s.guildId!==GUILD||s.forumId!==FORUM)fail();
  return {guildId:GUILD,forumId:FORUM};
}
function safeRef(item){
  const id=String(item?.eventId??'').trim();
  if(id&&REF.test('event:'+id))return 'event:'+id;
  const thread=String(item?.threadId??item?.sourceThreadId??'').trim();
  if(SNOWFLAKE.test(thread))return 'thread:'+thread;
  return null;
}
function departure(item){
  const raw=item?.validation?.parsed?.departureAtUtc||
    item?.departureAtUtc||null;
  const ms=timestamp(raw);
  return ms===null?null:new Date(ms).toISOString();
}
function verifiedStaff(item,status){
  const staff=item?.staffStatus;
  return !!(staff&&staff.status===status&&
    typeof staff.authorId==='string'&&staff.authorId.trim()&&
    Array.isArray(staff.matchedRoleIds)&&staff.matchedRoleIds.length>0&&
    ['message.member','guild-member-lookup'].includes(staff.roleSource));
}
function taskKey(scope,secret,ref,reason){
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32||
    !REASONS.has(reason))fail();
  // HMAC prevents guesses of private sequential Event IDs from task keys.
  return 'capacity-history:'+crypto.createHmac('sha256',secret)
    .update(['kings-event-capacity-historical-task-v1',
      scope.guildId,scope.forumId,ref||'unknown',reason].join('\0'))
    .digest('hex').slice(0,32);
}
function validateSource(s,nowMs){
  if(!s||s.sourceKind!=='authenticated-kings-convoy-checker'||
    !ID.test(String(s.runId||''))||
    !Number.isSafeInteger(s.attempt)||s.attempt<1||s.attempt>100||
    !ID.test(String(s.artifactId||''))||
    !SHA40.test(String(s.headSha||''))||
    !SHA64.test(String(s.archiveDigest||''))||
    !Number.isFinite(nowMs))fail();
  checkedReport(s.report,s.overview,nowMs);
  const generated=timestamp(s.report.generatedAt),
    finalized=timestamp(s.report.finalization?.finalizedAt),
    overview=timestamp(s.overview.generatedAt);
  if(generated===null||finalized===null||overview===null||
    generated>finalized||finalized>overview||
    finalized>nowMs+60000||nowMs-finalized>30*60000)fail();
  return [String(s.runId),s.attempt,String(s.artifactId),
    s.headSha,s.archiveDigest];
}
function planHistoricalReview({
  source,ledger,scope,taskSecret,nowMs=Date.now(),
  page=1,pageSize=25,existingTaskKeys=[]
}={}){
  const sc=scopeOf(scope);
  validateSource(source,nowMs);
  validateLedger(ledger,sc);
  if(!Number.isSafeInteger(page)||page<1||page>100000||
    pageSize!==25||!Array.isArray(existingTaskKeys)||
    existingTaskKeys.length>10000||
    existingTaskKeys.some(k=>typeof k!=='string'||
      !/^capacity-history:[a-f0-9]{32}$/.test(k)))fail();
  const linked=new Set(existingTaskKeys);
  const report=source.report,overview=source.overview;
  const seen=new Map(),raw=[];
  const add=(ref,reason,kind,day=null,discriminator=null)=>{
    if(!REASONS.has(reason)||!['convoy-center','legacy','ledger'].includes(kind))
      fail();
    // A source item without an Event/thread ID is still distinct from other
    // unidentified items. Its HMAC fingerprint is a PRIVATE review key only.
    const stable=ref||('unknown:'+crypto.createHmac('sha256',taskSecret)
      .update(String(discriminator??'')).digest('hex'));
    const key=taskKey(sc,taskSecret,stable,reason);
    if(seen.has(key))return;
    const possibleDay=day&&/^20\d{2}-\d{2}-\d{2}$/.test(day)?day:null;
    const task=Object.freeze({
      taskKey:key,reason,priority:PRIORITY[reason]||'Review',
      ref:ref||null,source:kind,possibleUtcDate:possibleDay,
      alreadyLinked:linked.has(key),decisionApplied:false,
      status:'Needs Human Review',autoResolved:false
    });
    seen.set(key,task);raw.push(task);
  };
  const currentRefs=new Set();
  for(const [index,item] of report.threads.entries()){
    if(!item||item.ignored||item.testThread||
      /^\s*\[?test\]?(?:\s|[-_:])/i.test(String(item.name||'')))continue;
    const ref=safeRef(item);
    const date=departure(item)?.slice(0,10)||null;
    if(!ref){
      add(null,'unknown-event-identity','convoy-center',date,
        JSON.stringify(item)+'|'+String(index));
      continue;
    }
    currentRefs.add(ref);
    const privateEntry=ledger.entries[ref]||null;
    const status=String(item.status||'');
    if(item.error||item.dataConflict===true||
      item.duplicateEventId===true)
      add(ref,'source-entry-conflict','convoy-center',date);
    if(!ACCEPTED.has(status)&&!PENDING.has(status)&&status!=='Cancelled'){
      add(ref,'unknown-source-status','convoy-center',date);
      continue;
    }
    if(status==='Cancelled'){
      // A recent Cancelled status does not prove when/whether a historical
      // accepted allocation was released. Never auto-approve a release.
      add(ref,'cancellation-release-evidence-required','convoy-center',date);
      if(!verifiedStaff(item,status))
        add(ref,'historical-status-evidence-required','convoy-center',date);
      continue;
    }
    if(PENDING.has(status))continue;
    if(!verifiedStaff(item,status))
      add(ref,'historical-status-evidence-required','convoy-center',date);
    if(!privateEntry||privateEntry.approved!==true||
      !TYPES.has(privateEntry.eventType)){
      add(ref,'classification-evidence-required','convoy-center',date);
    }else{
      const parsed=item.validation?.parsed?.eventType||item.eventType||null;
      if(parsed&&parsed!==privateEntry.eventType)
        add(ref,'classification-conflict','convoy-center',date);
    }
    const original=departure(item);
    const pinned=timestamp(privateEntry?.departureAtUtc);
    if(!privateEntry||privateEntry.departureVerified!==true||pinned===null)
      add(ref,'departure-evidence-required','convoy-center',date);
    else if(original&&new Date(pinned).toISOString()!==original)
      add(ref,'departure-conflict','convoy-center',date);
    if(privateEntry?.meetingVerified!==true||
      timestamp(privateEntry?.meetingAtUtc)===null)
      add(ref,'meeting-evidence-required','convoy-center',date);
    if(privateEntry?.endVerified!==true||
      timestamp(privateEntry?.plannedEndAtUtc)===null)
      add(ref,'planned-end-evidence-required','convoy-center',date);
    if(status==='Rescheduled'&&(!privateEntry||
      privateEntry.rescheduleApproved!==true||
      privateEntry.status!=='Rescheduled'||
      !Array.isArray(privateEntry.rescheduleHistory)||
      privateEntry.rescheduleHistory.length===0||
      original===null||pinned===null||
      new Date(pinned).toISOString()!==original))
      add(ref,'reschedule-history-required','convoy-center',date);
    if(status==='Completed'&&!privateEntry?.approved)
      add(ref,'historical-status-evidence-required','convoy-center',date);
  }
  let legacyCount=0;
  const legacyRefs=new Set();
  for(const [index,item] of overview.registeredConvoys.entries()){
    if(item?.source!=='legacy-calendar')continue;
    legacyCount++;
    const ref=safeRef(item);
    const date=departure(item)?.slice(0,10)||null;
    if(ref&&legacyRefs.has(ref))
      add(ref,'legacy-duplicate-identity','legacy',date);
    if(ref)legacyRefs.add(ref);
    // A source-only legacy row must be manually linked and its historical
    // acceptance/cancellation independently confirmed. A matching Event ID
    // does NOT auto-upgrade or remove this work.
    add(ref,'legacy-record-unreconciled','legacy',date,
      JSON.stringify(item)+'|'+String(index));
  }
  for(const ref of Object.keys(ledger.entries)){
    if(!REF.test(ref))fail();
    if(currentRefs.has(ref))continue;
    // Ledger-only entries can represent legitimate older accepted convoys,
    // cancelled convoys, deleted threads or obsolete records. Do not drop.
    add(ref,'ledger-only-record-review','ledger',null);
  }
  const ranks={Urgent:0,Review:1,Advisory:2};
  raw.sort((a,b)=>ranks[a.priority]-ranks[b.priority]||
    (a.possibleUtcDate||'9999-99-99').localeCompare(
      b.possibleUtcDate||'9999-99-99')||
    a.taskKey.localeCompare(b.taskKey));
  const pages=Math.max(1,Math.ceil(raw.length/pageSize));
  if(page>pages)fail();
  const counts={urgent:raw.filter(x=>x.priority==='Urgent').length,
    review:raw.filter(x=>x.priority==='Review').length,
    linked:raw.filter(x=>x.alreadyLinked).length,
    new:raw.filter(x=>!x.alreadyLinked).length,
    legacy:legacyCount,
    centerReviewed:currentRefs.size,
    ledgerEntries:Object.keys(ledger.entries).length,
    total:raw.length};
  return Object.freeze({
    version:1,visibility:'PRIVATE_ONLY',readOnly:true,
    planStatus:'Historical Review Required',
    sourceStructureChecked:true,ledgerStructureChecked:true,
    sourceAuthenticatedByGateway:false,ownerPinCheckedByGateway:false,
    historicCoverageCertified:false,freeSlotsCertified:false,
    acceptanceChanged:false,cancellationsChanged:false,
    decisionsCommitted:false,staffTaskCreated:false,
    ledgerRevision:ledger.revision,sourceRunId:String(source.runId),
    sourceAttempt:source.attempt,sourceDigest:source.archiveDigest,
    counts,page,pages,pageSize,items:raw.slice((page-1)*pageSize,page*pageSize)
  });
}
function createGithubOnlyHistoricalReviewReader({
  githubToken,githubTransport=fetch,ownerPinnedVault,
  scope,taskSecret,nowMs=()=>Date.now()
}={}){
  const sc=scopeOf(scope);
  if(!ownerPinnedVault||typeof ownerPinnedVault.read!=='function'||
    typeof nowMs!=='function')fail();
  let readSource;
  try{readSource=createAuthenticatedKingsSource({
    githubToken,transport:githubTransport,nowMs
  });}catch{fail();}
  return async function readHistoricalReview({page=1,existingTaskKeys=[]}={}){
    try{
      const at=nowMs();
      if(!Number.isFinite(at))fail();
      const before=await ownerPinnedVault.read();
      const first=await readSource();
      const fingerprint=validateSource(first,at);
      if(!before?.checkpoint||!before?.ledger||
        before.checkpoint.revision!==before.ledger.revision)fail();
      const plan=planHistoricalReview({source:first,ledger:before.ledger,
        scope:sc,taskSecret,nowMs:at,page,existingTaskKeys});
      const second=await readSource();
      const after=await ownerPinnedVault.read();
      if(!isDeepStrictEqual(fingerprint,validateSource(second,at))||
        !isDeepStrictEqual(first.report,second.report)||
        !isDeepStrictEqual(first.overview,second.overview)||
        !isDeepStrictEqual(before.ledger,after?.ledger)||
        !isDeepStrictEqual(before.checkpoint,after?.checkpoint))fail();
      return Object.freeze({...plan,
        sourceAuthenticatedByGateway:true,ownerPinCheckedByGateway:true});
    }catch{fail();}
  };
}
module.exports={planHistoricalReview,createGithubOnlyHistoricalReviewReader};
