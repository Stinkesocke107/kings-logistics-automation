'use strict';
// DRAFT / OFFLINE / PRIVATE-ONLY. Cross-check an OWNER-SIGNED lifecycle journal
// against CALLER-SUPPLIED original-source evidence claims over exactly 24 UTC
// calendar months. Signed history is not proof that every source Event existed;
// source records and digests are NOT authenticated by this function.
// No network, raw identity output, ingestion, event availability or write.
const crypto=require('node:crypto');
const {verifyHistoricalJournal}
  =require('./event-capacity-historical-lifecycle-journal');
const ERROR='Kings Event Capacity historical evidence crosscheck unavailable.';
const REF=/^(?:event:[A-Za-z0-9_-]{1,64}|thread:\d{17,22})$/;
const SHA=/^[a-f0-9]{64}$/;
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const STATUS=new Set(['Scheduled','Rescheduled','Completed','Cancelled','Unknown']);
const KINDS=new Set(['current','archived','deleted','legacy']);
const CATEGORIES=new Set(['Kings Convoy','Partner Convoy','External Convoy']);
const MAX_RECORDS=5000,MAX_ISSUES=20000,MAX_DIGESTS=80;
function fail(){throw new Error(ERROR);}
function exact(x,fields){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.getPrototypeOf(x)!==Object.prototype||
    Object.keys(x).sort().join(',')!==[...fields].sort().join(','))fail();
}
function stamp(x){
  if(typeof x!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)||
    !Number.isFinite(Date.parse(x))||
    new Date(x).toISOString()!==x)fail();
  return x;
}
function monthOf(x){
  if(typeof x!=='string'||!MONTH.test(x))fail();
  return x;
}
function nextMonth(m,n){
  const d=new Date(monthOf(m)+'-01T00:00:00.000Z');
  d.setUTCMonth(d.getUTCMonth()+n);
  return d.toISOString().slice(0,7);
}
function secretOf(value){
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')<32||
    Buffer.byteLength(value,'utf8')>4096)fail();
  return value;
}
function readRecord(r,months){
  exact(r,['ref','sourceKind','sourceStatus','category',
    'departureAtUtc','sourceDigest','evidenceDigests']);
  if(!REF.test(r.ref)||!KINDS.has(r.sourceKind)||
    !STATUS.has(r.sourceStatus)||!CATEGORIES.has(r.category)||
    !SHA.test(r.sourceDigest)||!Array.isArray(r.evidenceDigests)||
    r.evidenceDigests.length>MAX_DIGESTS)fail();
  const date=stamp(r.departureAtUtc);
  if(!months.has(date.slice(0,7)))fail();
  const seen=new Set();
  for(const d of r.evidenceDigests){
    if(typeof d!=='string'||!SHA.test(d)||seen.has(d))fail();
    seen.add(d);
  }
  return {ref:r.ref,month:date.slice(0,7),status:r.sourceStatus,
    kind:r.sourceKind,category:r.category,date,digests:seen};
}
function crosscheckKingsHistoricalEvidenceClaims({
  firstMonth,sourceRecords=[],journal,scope,ownerPublicKey,
  reviewSecret,nowMs=Date.now()
}={}){
  try{
    const month=monthOf(firstMonth),key=secretOf(reviewSecret);
    if(!Number.isSafeInteger(nowMs)||nowMs<0||
      nowMs>8640000000000000||
      !Array.isArray(sourceRecords)||sourceRecords.length>MAX_RECORDS)fail();
    const end=nextMonth(month,23);
    if(end>new Date(nowMs).toISOString().slice(0,7))fail();
    const months=Array.from({length:24},(_,i)=>nextMonth(month,i));
    const allowed=new Set(months);
    const verified=verifyHistoricalJournal(journal,{scope,ownerPublicKey});
    if(verified.verified!==true||verified.historicalCoverageCertified!==false||
      verified.freeSlotsCertified!==false)fail();
    // Issues are HMAC keyed and contain no user-supplied event IDs or source
    // hashes; stable enough for private review board deduplication.
    const issues=new Map();
    const perMonth=new Map(months.map(m=>[m,{
      sourceRecords:0,signedJournalEvents:0,gaps:0,
      archivedOrDeletedClaims:0,legacyClaims:0
    }]));
    function issue(reason,ref,month){
      if(!allowed.has(month))fail();
      const keyId=crypto.createHmac('sha256',key)
        .update(['kings-capacity-historical-evidence-v1',scope.guildId,
          scope.forumId,reason,ref,month].join('\0'))
        .digest('hex').slice(0,40);
      if(issues.has(keyId))return;
      if(issues.size>=MAX_ISSUES)fail();
      issues.set(keyId,Object.freeze({
        reviewKey:'capacity-history:'+keyId,month,reason,
        priority:reason==='source-status-conflict'||
          reason==='source-category-conflict'||
          reason==='source-departure-conflict'?'Urgent':'Review',
        staffReviewRequired:true,automaticallyResolved:false,
        capacityChanged:false
      }));
      perMonth.get(month).gaps++;
    }
    const source=new Map();
    for(const raw of sourceRecords){
      const r=readRecord(raw,allowed);
      if(source.has(r.ref))fail(); // ambiguous alias must be adjudicated
      source.set(r.ref,r);
      perMonth.get(r.month).sourceRecords++;
      if(r.kind==='archived'||r.kind==='deleted')
        perMonth.get(r.month).archivedOrDeletedClaims++;
      if(r.kind==='legacy')perMonth.get(r.month).legacyClaims++;
      if(r.kind==='legacy')issue('legacy-source-needs-independent-review',r.ref,r.month);
      if(r.kind==='deleted')issue('deleted-source-needs-original-evidence',r.ref,r.month);
      if(r.kind==='archived')issue('archived-source-needs-original-evidence',r.ref,r.month);
      if(r.status==='Unknown')issue('source-status-unknown',r.ref,r.month);
    }
    const lifecycleByRef=new Map(),inWindowLifecycleByRef=new Map();
    for(const entry of journal.history){
      const p=entry.payload,ref=p.ref;
      // Signature validity alone is not enough: a claimed owner review
      // dated after the inspection cannot justify today's history.
      if(Date.parse(p.reviewedAt)>nowMs+60000)fail();
      if(!lifecycleByRef.has(ref))lifecycleByRef.set(ref,[]);
      lifecycleByRef.get(ref).push(p);
      // An originally accepted event may later be rescheduled OUTSIDE the
      // audit window. Its old in-window reservation must still be reviewed.
      const transitionMonth=stamp(p.departureAtUtc).slice(0,7);
      if(allowed.has(transitionMonth)&&!inWindowLifecycleByRef.has(ref))
        inWindowLifecycleByRef.set(ref,transitionMonth);
    }
    const signed=new Map();
    for(const [ref,final] of Object.entries(journal.events)){
      const historicalMonth=stamp(final.departureAtUtc).slice(0,7);
      if(!allowed.has(historicalMonth)){
        // Never silently drop an event that occupied an in-window date
        // before a later signed move. Original allocation disposition
        // requires authorized human reconciliation.
        const formerMonth=inWindowLifecycleByRef.get(ref);
        if(formerMonth){
          perMonth.get(formerMonth).signedJournalEvents++;
          issue('signed-event-moved-outside-review-window',ref,formerMonth);
        }
        continue;
      }
      signed.set(ref,final);
      perMonth.get(historicalMonth).signedJournalEvents++;
      const r=source.get(ref);
      if(!r){issue('signed-event-missing-from-source-inventory',ref,historicalMonth);
        continue;}
      const dateMismatch=r.date!==final.departureAtUtc;
      const categoryMismatch=r.category!==final.category;
      const expected=final.status==='Accepted'?'Scheduled':final.status;
      const statusMismatch=r.status!==expected;
      // Do NOT silently equate Scheduled and Rescheduled. A move requires
      // a distinct authorized signed transition, even when displayed
      // source labels are ambiguous or dates currently match.
      if(dateMismatch)issue('source-departure-conflict',ref,historicalMonth);
      if(categoryMismatch)issue('source-category-conflict',ref,historicalMonth);
      if(statusMismatch)issue('source-status-conflict',ref,historicalMonth);
      const originalDigests=lifecycleByRef.get(ref)||[];
      for(const transition of originalDigests){
        if(!r.digests.has(transition.evidenceDigest))
          issue('signed-transition-missing-original-evidence',ref,historicalMonth);
      }
      const signedDigests=new Set(originalDigests.map(p=>p.evidenceDigest));
      for(const digest of r.digests){
        if(!signedDigests.has(digest))
          issue('source-evidence-not-in-signed-history',ref,historicalMonth);
      }
    }
    for(const [ref,r] of source){
      if(!signed.has(ref))
        issue('source-record-without-signed-history',ref,r.month);
    }
    const rows=months.map(m=>{
      const r=perMonth.get(m);
      return Object.freeze({
        month:m,...r,originalSourceInventoryAuthenticated:false,
        archivedDeletedCoverageProven:false,monthlyHistoryComplete:false,
        freeSlotsCertified:false
      });
    });
    const sorted=[...issues.values()].sort((a,b)=>
      a.month.localeCompare(b.month)||
      (a.priority==='Urgent'?-1:1)-(b.priority==='Urgent'?-1:1)||
      a.reviewKey.localeCompare(b.reviewKey));
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      reviewWindowMonths:24,firstMonth:month,finalMonth:end,
      signedJournalIntegrityVerified:true,
      originalSourceRecordsIndependentlyAuthenticated:false,
      sourceDigestEvidenceCryptographicallyAuthenticatedHere:false,
      sourceInventoryCompletenessVerified:false,
      deletedArchivedEventCaptureVerified:false,
      realAttendanceInferred:false,
      historicalCoverageCertified:false,freeSlotsCertified:false,
      counters:Object.freeze({
        sourceRecords:source.size,signedJournalEventsInWindow:signed.size,
        unresolvedEvidenceGaps:issues.size,
        urgentGaps:sorted.filter(i=>i.priority==='Urgent').length,
        monthsWithClaimedSourceRecords:rows.filter(r=>r.sourceRecords>0).length,
        monthsIndependentlySourceVerified:0
      }),
      months:rows,issues:sorted,
      anyEventDecisionCommitted:false,
      reviewItemsCreatedInDiscord:0,
      safeToActivate:false
    });
  }catch{fail();}
}
module.exports={crosscheckKingsHistoricalEvidenceClaims};
