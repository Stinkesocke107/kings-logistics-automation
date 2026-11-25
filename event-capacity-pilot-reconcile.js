'use strict';
// Read-only inventory consistency checks against the *actual* shape of Kings
// Convoy Checker and Convoy Overview artifacts. Not a cryptographic proof:
// protected ingestion must authenticate origin/integrity separately.
// Returns safe issue codes and counts only; no names, IDs or event content.
// Standalone copy for minimal pilot PR: no dependency on unfinished
// Capacity booking core. Ignore all unavailable or malformed dates.
function timestamp(value){
  if(typeof value!=='string'||!value.trim())return null;
  const n=Date.parse(value);
  return Number.isFinite(n)?n:null;
}
const CODES=Object.freeze({
  badShape:'inventory-malformed',reportCount:'report-inventory-mismatch',
  overviewCount:'overview-center-inventory-mismatch',
  duplicate:'center-duplicate-thread-id',duplicateEvent:'center-duplicate-event-id',missing:'overview-center-entry-missing',
  orphan:'overview-center-orphan',duplicateCenter:'overview-center-duplicate',
  identity:'overview-center-identity-conflict',
  status:'overview-center-status-conflict',
  departure:'overview-center-departure-conflict',
  legacy:'legacy-coverage-mismatch',
  legacyDuplicate:'legacy-not-suppressed-for-center-id',
  invalidRecord:'inventory-record-malformed',
  reportError:'center-read-errors'
});
const relevant=x=>!!x&&!x.ignored&&!x.testThread&&
  !/^\s*\[?test\]?(?:\s|[-_:])/i.test(String(x.name||''));
const key=x=>x&&x.threadId!==null&&x.threadId!==undefined
  ?String(x.threadId).trim():null;
const eventId=x=>x?.eventId!==undefined&&x?.eventId!==null&&String(x.eventId).trim()
  ?String(x.eventId).trim():null;
function unix(v){
  if(v===null||v===undefined||v==='')return null;
  return timestamp(v);
}
function reconcileSourceInventory(report,overview){
  const issues=[];
  const add=code=>{if(issues.length<1000)issues.push(code);};
  if(!report||!Array.isArray(report.threads)||!overview||
     !Array.isArray(overview.registeredConvoys)){
    return {ok:false,issues:[CODES.badShape],counts:{center:0,legacy:0}};
  }
  const threads=report.threads;
  const all=threads.filter(x=>x&&!x.ignored);
  const real=threads.filter(relevant);
  const active=real.filter(x=>!x.error);
  const overviewCenter=overview.registeredConvoys.filter(x=>x?.source==='convoy-center');
  const overviewLegacy=overview.registeredConvoys.filter(x=>x?.source==='legacy-calendar');
  if(!Number.isSafeInteger(report.summary?.totalThreads)||
     report.summary.totalThreads!==threads.length||
     !Number.isSafeInteger(report.summary?.actualConvoys)||
     report.summary.actualConvoys!==all.length||
     !Number.isSafeInteger(overview.overall?.realConvoySubmissions)||
     overview.overall.realConvoySubmissions!==active.length){
    add(CODES.reportCount);
  }
  const erroneous=all.filter(x=>x.error).length;
  if(erroneous||overview.overall?.convoyReadErrors!==erroneous){
    add(CODES.reportError);
  }
  const knownByThread=new Map();
  const centerEventIds=new Set();
  const eventOwners=new Map();
  for(const source of active){
    const ref=key(source);
    if(!ref){add(CODES.invalidRecord);continue;}
    if(knownByThread.has(ref)){add(CODES.duplicate);continue;}
    knownByThread.set(ref,source);
    const id=eventId(source);
    if(id){
      centerEventIds.add(id);
      if(eventOwners.has(id)&&eventOwners.get(id)!==ref)add(CODES.duplicateEvent);
      eventOwners.set(id,ref);
    }
  }
  const registeredByThread=new Map();
  for(const source of overviewCenter){
    const ref=key(source);
    if(!ref){add(CODES.invalidRecord);continue;}
    if(registeredByThread.has(ref)){add(CODES.duplicateCenter);continue;}
    registeredByThread.set(ref,source);
    const original=knownByThread.get(ref);
    if(!original){add(CODES.orphan);continue;}
    if(eventId(original)!==eventId(source)){add(CODES.identity);continue;}
    if(String(original.status??'Unknown')!==String(source.status??'Unknown'))add(CODES.status);
    const sourceDeparture=unix(original.validation?.parsed?.departureAtUtc||original.departureAtUtc);
    const overviewDeparture=unix(source.departureAtUtc);
    if(sourceDeparture!==overviewDeparture)add(CODES.departure);
  }
  for(const [ref,source] of knownByThread){
    // Convoy Overview deliberately registers Center events with Event ID OR
    // positive staff-Completed status; other submissions remain in reports.
    if((eventId(source)||source.status==='Completed')&&!registeredByThread.has(ref)){
      add(CODES.missing);
    }
  }
  const legacyTotal=overview.overall?.legacyImportedConvoys;
  const suppressed=overview.overall?.legacyDuplicatesSuppressed;
  if(!Number.isSafeInteger(legacyTotal)||legacyTotal<0||
     !Number.isSafeInteger(suppressed)||suppressed<0||
     overviewLegacy.length+suppressed!==legacyTotal)add(CODES.legacy);
  for(const source of overviewLegacy){
    if(eventId(source)&&centerEventIds.has(eventId(source)))add(CODES.legacyDuplicate);
  }
  const allowed=overviewCenter.length+overviewLegacy.length;
  if(allowed!==overview.registeredConvoys.length)add(CODES.overviewCount);
  return {
    ok:issues.length===0,
    issues:[...new Set(issues)].sort(),
    counts:{center:active.length,registeredCenter:overviewCenter.length,
      legacy:overviewLegacy.length,unresolvedCount:issues.length}
  };
}
module.exports={reconcileSourceInventory};
