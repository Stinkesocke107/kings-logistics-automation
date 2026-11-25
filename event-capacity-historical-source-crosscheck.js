'use strict';
// PRIVATE, READ-ONLY: audit owner-signed historical states against the current
// Convoy Center snapshot. A fresh current snapshot and signed journal cannot
// establish that ALL historical events were captured. No quota certification.
const crypto=require('node:crypto');
const {verifyHistoricalJournal}
  =require('./event-capacity-historical-lifecycle-journal');
const {planHistoricalReview}
  =require('./event-capacity-github-historical-review');
const {timestamp}=require('./event-capacity-core');
const ERROR='Kings Event Capacity signed-history reconciliation incomplete or invalid.';
const REF=/^(?:event:[A-Za-z0-9_-]{1,64}|thread:\d{17,22})$/;
const SNOWFLAKE=/^\d{17,22}$/;
const TYPES=new Set(['Kings Convoy','Partner Convoy','External Convoy']);
const ACCEPTED=new Set(['Scheduled','Completed','Rescheduled']);
const REASONS=new Set([
  'historical-signed-event-not-in-current-source',
  'current-accepted-event-without-signed-history',
  'current-source-cancelled-without-signed-cancellation',
  'signed-history-status-conflict',
  'signed-history-category-conflict',
  'signed-history-departure-conflict',
  'signed-history-ambiguous-identity',
  'current-source-duplicate-identity',
  'current-source-unknown-status',
  'current-source-missing-verified-departure',
  'current-source-missing-verified-category',
  'legacy-event-requires-historical-review'
]);
const URGENT=new Set(['signed-history-status-conflict',
  'signed-history-category-conflict','signed-history-departure-conflict',
  'signed-history-ambiguous-identity','current-source-duplicate-identity']);
const MAX_ISSUES=10000;
function fail(){throw new Error(ERROR);}
function canonicalUtc(value){
  const n=timestamp(value);
  return n===null?null:new Date(n).toISOString();
}
function ident(item){
  const id=item?.eventId===null||item?.eventId===undefined?
    null:String(item.eventId).trim();
  const thread=item?.threadId===null||item?.threadId===undefined?
    null:String(item.threadId).trim();
  return {
    main:id&&REF.test('event:'+id)?'event:'+id:
      thread&&SNOWFLAKE.test(thread)?'thread:'+thread:null,
    refs:[
      ...(id&&REF.test('event:'+id)?['event:'+id]:[]),
      ...(thread&&SNOWFLAKE.test(thread)?['thread:'+thread]:[])
    ]
  };
}
function sourceStatus(status){
  return typeof status==='string'?status:null;
}
function hasHistoricStatus(signed,live){
  if(signed==='Cancelled')return live==='Cancelled';
  if(signed==='Completed')return live==='Completed';
  if(signed==='Accepted')return ACCEPTED.has(live);
  if(signed==='Rescheduled')return ACCEPTED.has(live);
  return false;
}
function reconcileSignedHistoricalSource({
  source,ledger,journal,scope,ownerPublicKey,taskSecret,
  nowMs=Date.now()
}={}){
  if(!scope||!SNOWFLAKE.test(scope.guildId)||!SNOWFLAKE.test(scope.forumId)||
    typeof taskSecret!=='string'||Buffer.byteLength(taskSecret)<32||
    !Number.isFinite(nowMs)||nowMs<0)fail();
  try{
    const reviewed=planHistoricalReview({
      source,ledger,scope,taskSecret,nowMs,page:1
    });
    verifyHistoricalJournal(journal,{scope,ownerPublicKey});
    const last=journal.history.at(-1)?.payload?.reviewedAt;
    if(last&&Date.parse(last)>nowMs+60000)fail();
    const entryMap=new Map();
    const eligible=source.report.threads.filter(item=>
      item&&!item.ignored&&!item.testThread&&
      !/^\s*\[?test\]?(?:\s|[-_:])/i.test(String(item.name||'')));
    let duplicateSourceIdentities=0;
    const issues=new Map();
    const add=(reason,ref)=>{
      if(!REASONS.has(reason)||typeof ref!=='string')fail();
      const key='capacity-crosscheck:'+crypto.createHmac('sha256',taskSecret)
        .update(['kings-capacity-signed-history-crosscheck-v1',
          scope.guildId,scope.forumId,reason,ref].join('\0'))
        .digest('hex').slice(0,40);
      if(!issues.has(key)){
        if(issues.size>=MAX_ISSUES)fail();
        issues.set(key,Object.freeze({
          taskKey:key,reason,priority:URGENT.has(reason)?'Urgent':'Review',
          humanReviewRequired:true,autoResolved:false,capacityChanged:false
        }));
      }
    };
    for(const item of eligible){
      const identity=ident(item);
      if(identity.refs.length===0)fail();
      for(const ref of identity.refs){
        if(entryMap.has(ref)){
          duplicateSourceIdentities++;
          add('current-source-duplicate-identity',ref);
        }else{
          entryMap.set(ref,item);
        }
      }
    }
    const seenSignedSource=new Map(),signedEvents=Object.entries(journal.events);
    for(const [ref,record] of signedEvents){
      if(!REF.test(ref)||!record||!TYPES.has(record.category))fail();
      const item=entryMap.get(ref);
      if(!item){
        add('historical-signed-event-not-in-current-source',ref);
        continue;
      }
      const identity=ident(item),stable=identity.main;
      const seen=seenSignedSource.get(stable);
      if(seen&&seen!==ref){
        add('signed-history-ambiguous-identity',stable);
      }else{
        seenSignedSource.set(stable,ref);
      }
      const live=sourceStatus(item.status);
      if(!hasHistoricStatus(record.status,live))
        add('signed-history-status-conflict',ref);
      const category=item.validation?.parsed?.eventType??item.eventType??null;
      if(category===null) add('current-source-missing-verified-category',ref);
      else if(!TYPES.has(category)||category!==record.category)
        add('signed-history-category-conflict',ref);
      const departure=canonicalUtc(
        item.validation?.parsed?.departureAtUtc??item.departureAtUtc??null);
      if(departure===null)
        add('current-source-missing-verified-departure',ref);
      else if(departure!==record.departureAtUtc)
        add('signed-history-departure-conflict',ref);
    }
    let acceptedWithoutProof=0;
    const seenCurrent=new Set();
    for(const item of eligible){
      const identity=ident(item);
      const primary=identity.main;
      if(seenCurrent.has(primary))continue;
      seenCurrent.add(primary);
      if(!ACCEPTED.has(item.status)&&item.status!=='Cancelled'){
        if(item.status!=='Submitted'&&item.status!=='Pending'&&
          item.status!=='Tentative'&&item.status!=='Needs Information'&&
          item.status!=='Ready for Approval')
          add('current-source-unknown-status',primary);
        continue;
      }
      const hasJournalRecord=identity.refs.some(x=>journal.events[x]);
      if(!hasJournalRecord){
        if(ACCEPTED.has(item.status)){
          acceptedWithoutProof++;
          add('current-accepted-event-without-signed-history',primary);
        }else{
          add('current-source-cancelled-without-signed-cancellation',primary);
        }
      }
    }
    let legacyNeedsReview=0;
    for(const [index,item] of source.overview.registeredConvoys.entries()){
      if(item?.source!=='legacy-calendar')continue;
      legacyNeedsReview++;
      add('legacy-event-requires-historical-review',
        ident(item).main||'legacy-index:'+index);
    }
    const items=[...issues.values()].sort((a,b)=>
      (a.priority==='Urgent'?0:1)-(b.priority==='Urgent'?0:1)||
      a.taskKey.localeCompare(b.taskKey));
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      signedJournalIntegrityVerified:true,
      currentSourceStructureChecked:true,
      sourceProvenanceTrustedByThisPureFunction:false,
      historicalSourcesComplete:false,
      historicalCoverageCertified:false,
      freeSlotsCertified:false,calendarMutated:false,
      staffDecisionsCommitted:false,slotReleaseInferred:false,
      counts:Object.freeze({
        signedHistoricEvents:signedEvents.length,
        currentNonTestThreads:eligible.length,
        acceptedCurrentWithoutSignedProof:acceptedWithoutProof,
        duplicateSourceIdentities,
        legacyRowsNeedingReview:legacyNeedsReview,
        preexistingReviewIssues:reviewed.counts.total,
        newCrosscheckIssues:items.length,
        urgentCrosscheckIssues:items.filter(x=>x.priority==='Urgent').length
      }),
      issues:items
    });
  }catch{fail();}
}
module.exports={reconcileSignedHistoricalSource};
