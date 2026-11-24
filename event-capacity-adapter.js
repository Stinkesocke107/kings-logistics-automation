'use strict';
// Read-only bridge from the existing Kings Convoy Center reports to the new
// capacity engine. No Discord, network, filesystem, write or publish access.
// All output is PRIVATE event data; do not commit report results to public Git.
const {timestamp,evaluate}=require('./event-capacity-core');
const {reconcileSourceInventory}=require('./event-capacity-source-reconcile');
const TYPES=new Set(['Kings Convoy','Partner Convoy','External Convoy']);
const CLASSIFICATION_APPROVERS=new Set(['Event Coordination','Event Leadership','CEO']);
const EXCEPTION_APPROVERS=new Set(['Event Management','CEO']);
const STATUS_PENDING=new Set(['Submitted','Needs Information','Ready for Approval','Pending','Tentative']);
const STATUS_ACCEPTED=new Set(['Scheduled','Completed','Rescheduled']);

function iso(value){
  const ms=timestamp(value);
  return ms===null?null:new Date(ms).toISOString();
}
function validAge(value,now,maxAge){
  const t=timestamp(value);
  return t!==null&&t<=now+60000&&now-t<=maxAge;
}
function refFor(item){
  const id=String(item?.eventId||'').trim();
  if(id)return 'event:'+id;
  const thread=String(item?.threadId||item?.legacyId||'').trim();
  return thread?'thread:'+thread:null;
}
function sourceIssue(issues,code,ref){
  issues.push({code,ref:ref||null});
}
function approvedDecision(decision){
  return decision&&typeof decision==='object'&&decision.approved===true&&
    CLASSIFICATION_APPROVERS.has(decision.approvedByRole)&&typeof decision.evidenceRef==='string'&&
    decision.evidenceRef.trim().length>0;
}
function verifiedException(decision){
  // Exception approval is independent of event classification. Never promote
  // a coordinator's classification attestation to an over-quota approval.
  const exception=decision?.exception;
  return !!(exception?.approved===true&&
    EXCEPTION_APPROVERS.has(exception.approvedByRole)&&
    typeof exception.evidenceRef==='string'&&exception.evidenceRef.trim());
}
function trustedStaffStatus(item){
  const staff=item?.staffStatus;
  return !!(staff&&typeof staff.authorId==='string'&&staff.authorId.trim()&&
    Array.isArray(staff.matchedRoleIds)&&staff.matchedRoleIds.length>0&&
    ['message.member','guild-member-lookup'].includes(staff.roleSource)&&
    typeof staff.status==='string');
}
function trustedTmp(item,now,maxAge){
  const sync=item?.truckersmpSync;
  const event=item?.truckersmp;
  return !!(sync?.ok===true&&sync?.authoritative===true&&
    event&&String(event.id||'')===String(item.eventId||'')&&
    event.authoritative&&validAge(sync.syncedAt,now,maxAge));
}
function normalizedCenter(item,decisions,now,maxAge,issues){
  const ref=refFor(item),parsed=item.validation?.parsed||{},privateDecision=decisions?.[ref]||null;
  const manual=approvedDecision(privateDecision);
  const staffTrusted=trustedStaffStatus(item);
  const apiTrusted=trustedTmp(item,now,maxAge);
  let status=String(item.status||'').trim(),statusVerified=false;
  if(staffTrusted&&item.staffStatus.status===status&&
      (STATUS_ACCEPTED.has(status)||status==='Cancelled'||STATUS_PENDING.has(status))){
    statusVerified=true;
  }else if(status==='Cancelled'&&apiTrusted&&item.truckersmp.publicCancelled===true){
    statusVerified=true;
  }else if(STATUS_PENDING.has(status)&&!staffTrusted){
    // An authenticated, fresh Convoy Center report may show "not yet accepted".
    statusVerified=true;
  }else if(status==='Rescheduled'&&manual&&privateDecision.status==='Rescheduled'&&
    privateDecision.rescheduleApproved===true){
    statusVerified=true;
  }else{
    sourceIssue(issues,'unverified-or-conflicting-staff-status',ref);
  }
  if(staffTrusted&&item.staffStatus.status!==status){
    sourceIssue(issues,'staff-status-vs-derived-status-conflict',ref);
    statusVerified=false;
  }
  if(manual&&typeof privateDecision.status==='string'&&privateDecision.status!==status){
    sourceIssue(issues,'private-decision-status-conflict',ref);
    statusVerified=false;
  }
  const declaredType=parsed.eventType||item.eventType||null;
  const approvedType=manual&&TYPES.has(privateDecision.eventType)?privateDecision.eventType:null;
  const typeVerified=!!approvedType;
  if(!typeVerified&&status!=='Cancelled'&&!STATUS_PENDING.has(status)){
    sourceIssue(issues,'classification-needs-event-coordination-verification',ref);
  }
  let dataConflict=item.dataConflict===true||item.duplicateEventId===true;
  if(approvedType&&declaredType&&declaredType!==approvedType){
    sourceIssue(issues,'staff-classification-vs-attested-decision',ref);
    dataConflict=true;
  }
  const apiDeparture=apiTrusted?iso(item.truckersmp?.startAtUtc):null;
  const parsedDeparture=iso(parsed.departureAtUtc||item.departureAtUtc);
  if(apiDeparture&&parsedDeparture&&apiDeparture!==parsedDeparture){
    dataConflict=true;
    sourceIssue(issues,'departure-source-conflict',ref);
  }
  let departureAtUtc=null,departureVerified=false;
  if(manual&&privateDecision.departureVerified===true&&iso(privateDecision.departureAtUtc)){
    departureAtUtc=iso(privateDecision.departureAtUtc);
    departureVerified=true;
    if(apiDeparture&&apiDeparture!==departureAtUtc){
      dataConflict=true;sourceIssue(issues,'approved-departure-vs-external-conflict',ref);
    }
  }else if(apiDeparture){
    departureAtUtc=apiDeparture;
    departureVerified=true;
  }else{
    departureAtUtc=parsedDeparture||null;
    sourceIssue(issues,'departure-unverified',ref);
  }
  let meetingAtUtc=null;
  if(manual&&privateDecision.meetingVerified===true){
    meetingAtUtc=iso(privateDecision.meetingAtUtc);
  }else if(apiTrusted){
    meetingAtUtc=iso(item.truckersmp?.meetupAtUtc);
  }
  const plannedEndAtUtc=manual&&privateDecision.endVerified===true
    ?iso(privateDecision.plannedEndAtUtc):null;
  if(!plannedEndAtUtc&&STATUS_ACCEPTED.has(status)){
    sourceIssue(issues,'planned-end-time-needs-verification',ref);
  }
  if(item.truckersmpSync?.ok===false&&STATUS_ACCEPTED.has(status)){
    sourceIssue(issues,'external-sync-unavailable',ref);
  }
  if(item.duplicateEventId===true){
    sourceIssue(issues,'source-reported-duplicate-event-id',ref);
  }
  return {
    eventId:item.eventId||null,threadId:item.threadId||null,
    status,statusVerified,eventType:approvedType||declaredType,
    eventTypeVerified:typeVerified,
    departureAtUtc,departureVerified,meetingAtUtc,plannedEndAtUtc,
    possibleUtcDate:departureAtUtc?departureAtUtc.slice(0,10):null,
    rescheduleApproved:manual&&privateDecision.rescheduleApproved===true,
    dataConflict,
    // A verified exception is a distinct protected decision, never inferred.
    exceptionApprovedBy:verifiedException(privateDecision)
      ?privateDecision.exception.approvedByRole:null
  };
}
function normalizedLegacy(item,issues){
  const ref=refFor(item);
  sourceIssue(issues,'legacy-requires-manual-reconciliation',ref);
  const value=iso(item.departureAtUtc);
  return {
    eventId:item.eventId||null,
    threadId:item.threadId||item.sourceThreadId||null,
    status:item.status||'Unknown',statusVerified:false,
    eventType:item.eventType||'Legacy Calendar',eventTypeVerified:false,
    departureAtUtc:value,departureVerified:false,
    meetingAtUtc:null,plannedEndAtUtc:null,
    possibleUtcDate:value?value.slice(0,10):null
  };
}
function adaptConvoyReports(report,overview,options={}){
  if(!report||typeof report!=='object'||!Array.isArray(report.threads))throw new TypeError('Convoy report threads required');
  if(!overview||typeof overview!=='object'||!Array.isArray(overview.registeredConvoys))throw new TypeError('Convoy overview with legacy coverage required');
  const now=Number.isFinite(options.nowMs)?options.nowMs:Date.now();
  const maxAge=Number.isFinite(options.maxAgeMs)&&options.maxAgeMs>0?options.maxAgeMs:30*60000;
  const issues=[];
  const sourceTrusted=options.trustedSource===true;
  // This flag is NOT itself a security attestation: only a trusted, authorized
  // pipeline is permitted to set it. Production needs secure ingestion/RBAC.
  const sameScope=typeof options.expectedGuildId==='string'&&options.expectedGuildId===report.guildId&&
    options.expectedGuildId===overview.guildId&&typeof options.expectedForumId==='string'&&
    options.expectedForumId===report.forumId&&options.expectedForumId===overview.forumId;
  const countThreads=report.threads.length;
  const nonIgnored=report.threads.filter(x=>x&&!x.ignored);
  const nonTest=nonIgnored.filter(x=>!x.testThread&&
    !/^\s*\[?test\]?(?:\s|[-_:])/i.test(String(x.name||'')));
  const legacyRecords=overview.registeredConvoys.filter(x=>x&&x.source==='legacy-calendar');
  const sourceReconciliation=reconcileSourceInventory(report,overview);
  for(const code of sourceReconciliation.issues)sourceIssue(issues,code,null);
  const coverageVerified=Number.isSafeInteger(report.summary?.totalThreads)&&
    report.summary.totalThreads===countThreads&&
    Number.isSafeInteger(report.summary?.actualConvoys)&&
    report.summary.actualConvoys===nonIgnored.length&&
    Number.isSafeInteger(overview.overall?.realConvoySubmissions)&&
    overview.overall.realConvoySubmissions===nonTest.length&&
    Number.isSafeInteger(overview.overall?.legacyImportedConvoys)&&
    overview.overall.legacyImportedConvoys>=legacyRecords.length;
  const fresh=sourceTrusted&&sameScope&&coverageVerified&&sourceReconciliation.ok&&
    validAge(report.finalization?.finalizedAt,now,maxAge)&&
    validAge(overview.generatedAt,now,maxAge)&&
    timestamp(overview.generatedAt)>=timestamp(report.finalization?.finalizedAt)&&
    !report.threads.some(x=>!x?.ignored&&!x?.testThread&&x?.error)&&
    Number(overview.overall?.convoyReadErrors||0)===0;
  if(!fresh)sourceIssue(issues,'source-not-verified-fresh-or-complete',null);
  const decisions=options.classifications||Object.create(null);
  const normalized=[];
  for(const item of report.threads){
    if(!item||item.ignored||item.testThread||/^\s*\[?test\]?(?:\s|[-_:])/i.test(String(item.name||'')))continue;
    if(item.error){
      normalized.push({
        eventId:item.eventId||null,threadId:item.threadId||null,
        status:'Unknown',statusVerified:false,
        eventType:null,eventTypeVerified:false,
        departureAtUtc:null,departureVerified:false,
        meetingAtUtc:null,plannedEndAtUtc:null,
        possibleUtcDate:null
      });
      continue;
    }
    normalized.push(normalizedCenter(item,decisions,now,maxAge,issues));
  }
  // Frozen legacy data has inferred status/type: include it to expose
  // uncertainties, never secretly count inferred legacy acceptance.
  const legacy=legacyRecords;
  for(const item of legacy)normalized.push(normalizedLegacy(item,issues));
  if(Number(overview.overall?.legacyImportedConvoys??legacy.length)<legacy.length){
    sourceIssue(issues,'legacy-source-coverage-contradiction',null);
  }
  // Never expose the raw input report or original staff/person identifiers.
  const counts={
    center:normalized.length-legacy.length,legacy:legacy.length,
    pendingVerification:issues.length
  };
  const dataFresh=fresh&&!issues.some(x=>x.code==='legacy-source-coverage-contradiction');
  return {events:normalized,issues,counts,dataFresh,sourceGeneratedAt:report.finalization?.finalizedAt||null};
}
function evaluateConvoyReports(report,overview,options={}){
  const input=adaptConvoyReports(report,overview,options);
  return {adapter:{counts:input.counts,issues:input.issues,dataFresh:input.dataFresh},
    capacity:evaluate(input.events,{dataFresh:input.dataFresh})};
}
module.exports={adaptConvoyReports,evaluateConvoyReports,normalizedCenter,normalizedLegacy};
