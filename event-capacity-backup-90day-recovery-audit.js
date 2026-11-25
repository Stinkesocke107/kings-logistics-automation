'use strict';
// DRAFT / OFFLINE / READ-ONLY. Inventory the LAST 90 COMPLETED UTC DAYS
// (never require today's unfinished backup) and claimed monthly restore
// evidence. No actual backup fetch, independent-host proof, deletion or writes.
const ERROR='Kings Event Capacity private backup recovery review unavailable.';
const HASH=/^[a-f0-9]{64}$/;
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
const STAMP=/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MS_DAY=86400000,WINDOW=90,FRESH=30;
function fail(){throw new Error(ERROR);}
function exact(x,fields){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.getPrototypeOf(x)!==Object.prototype||
    Object.keys(x).sort().join(',')!==[...fields].sort().join(','))fail();
}
function day(x){
  if(typeof x!=='string'||!DAY.test(x))fail();
  const t=Date.parse(x+'T00:00:00.000Z');
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==x)fail();
  return x;
}
function utc(x){
  if(typeof x!=='string'||!STAMP.test(x)||
    !Number.isFinite(Date.parse(x))||new Date(x).toISOString()!==x)fail();
  return x;
}
function plusDays(d,n){
  return new Date(Date.parse(day(d)+'T00:00:00.000Z')+n*MS_DAY)
    .toISOString().slice(0,10);
}
function inspectKingsNinetyDayBackupRecovery({
  nowMs=Date.now(),backupClaims=[]
}={}){
  try{
    if(!Number.isSafeInteger(nowMs)||nowMs<0||
      nowMs>8640000000000000||
      !Array.isArray(backupClaims)||backupClaims.length>WINDOW)fail();
    // Closed-day range is deterministic and avoids a false alert for the
    // as-yet-unfinished backup on the date of the inspection.
    const today=new Date(nowMs).toISOString().slice(0,10);
    const end=plusDays(today,-1),start=plusDays(today,-WINDOW);
    const expected=Array.from({length:WINDOW},(_,i)=>plusDays(start,i));
    const allowed=new Set(expected),byDay=new Map();
    for(const claim of backupClaims){
      exact(claim,['day','ciphertextDigest','manifestDigest',
        'retentionReviewOn','legalHold','offsiteCopyClaimed',
        'restoreTestedAt','restoreEvidenceDigest']);
      const d=day(claim.day);
      if(!allowed.has(d)||byDay.has(d)||
        !HASH.test(claim.ciphertextDigest)||
        !HASH.test(claim.manifestDigest)||
        day(claim.retentionReviewOn)!==plusDays(d,WINDOW)||
        typeof claim.legalHold!=='boolean'||
        typeof claim.offsiteCopyClaimed!=='boolean'||
        (claim.restoreTestedAt===null)!==
          (claim.restoreEvidenceDigest===null))fail();
      if(claim.restoreTestedAt!==null){
        const tested=Date.parse(utc(claim.restoreTestedAt));
        if(!HASH.test(claim.restoreEvidenceDigest)||
          tested<Date.parse(d+'T00:00:00.000Z')||
          tested>nowMs+60000)fail();
      }
      byDay.set(d,claim);
    }
    let missing=0,unconfirmedOffsite=0,held=0,
      reportedRestoresLastThirtyDays=0,reviewDue=0;
    const minimumRestoreTime=nowMs-FRESH*MS_DAY;
    const rows=expected.map(d=>{
      const r=byDay.get(d);
      if(!r){
        missing++;
        return Object.freeze({day:d,recordSupplied:false,
          status:'Missing Claimed Daily Backup',
          offsiteStorageIndependentlyVerified:false,
          recoveryProofVerified:false,requiresReview:true});
      }
      if(!r.offsiteCopyClaimed)unconfirmedOffsite++;
      if(r.legalHold)held++;
      if(r.retentionReviewOn<=today)reviewDue++;
      if(r.restoreTestedAt!==null&&
        Date.parse(r.restoreTestedAt)>=minimumRestoreTime)
        reportedRestoresLastThirtyDays++;
      return Object.freeze({
        day:d,recordSupplied:true,
        status:r.legalHold?'Legal Hold — Retain and Review':
          !r.offsiteCopyClaimed?'Offsite Copy Not Claimed':
          'Untrusted Backup Claim — External Verification Pending',
        legalHold:r.legalHold,
        retentionReviewDue:r.retentionReviewOn<=today,
        offsiteStorageIndependentlyVerified:false,
        recoveryProofVerified:false,requiresReview:true
      });
    });
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      auditType:'Last Ninety Completed UTC Days',
      reviewedDayCount:WINDOW,firstCompletedDay:start,
      lastCompletedDay:end,
      counts:Object.freeze({
        missingClaimedBackups:missing,
        suppliedBackupClaims:byDay.size,
        offsiteCopyNotClaimed:unconfirmedOffsite,
        legalHoldDays:held,
        retentionReviewDueDays:reviewDue,
        reportedRecentRestoreClaims:reportedRestoresLastThirtyDays,
        independentRestoreProofsVerified:0
      }),
      days:rows,
      dailyBackupExecutionIndependentlyVerified:false,
      independentOffsiteStorageCustodyVerified:false,
      reportedRestoreIsNotIndependentRestoreProof:true,
      monthlyIndependentRecoveryDrillVerified:false,
      physicalBackupIntegrityVerified:false,
      legalHoldEnforcementVerified:false,
      backupRetentionEnforced:false,
      automaticDeletions:0,backupWritesPerformed:0,
      historyCoverageCertified:false,freeSlotsCertified:false,
      safeToActivate:false
    });
  }catch{fail();}
}
module.exports={inspectKingsNinetyDayBackupRecovery};
