'use strict';
// READ-ONLY OFFLINE policy view. Never automatically delete archive records,
// backups or legal holds. Submitted review metadata is not proof of source
// completeness, independent storage, successful restore or available slots.
const ERROR='Kings Event Capacity private retention inventory incomplete or invalid.';
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_BACKUPS=10000;
function fail(){throw new Error(ERROR);}
function exact(x,keys){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.getPrototypeOf(x)!==Object.prototype||
    Object.keys(x).sort().join(',')!==keys.slice().sort().join(','))fail();
}
function validDay(v){
  if(typeof v!=='string'||!DAY.test(v))fail();
  const n=Date.parse(v+'T00:00:00.000Z');
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)fail();
  return v;
}
function validTime(t){
  if(typeof t!=='string'||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t)||
    !Number.isFinite(Date.parse(t))||new Date(t).toISOString()!==t)fail();
  return t;
}
function plusDays(v,n){
  return new Date(Date.parse(v+'T00:00:00.000Z')+n*86400000)
    .toISOString().slice(0,10);
}
function months(now){
  const date=new Date(now),y=date.getUTCFullYear(),m=date.getUTCMonth();
  return Array.from({length:24},(_,i)=>new Date(Date.UTC(y,m-23+i,1))
    .toISOString().slice(0,7));
}
function planHistoricalRetention({nowMs=Date.now(),backups=[],monthReviews=[]}={}){
  if(!Number.isFinite(nowMs)||!Array.isArray(backups)||
    backups.length>MAX_BACKUPS||!Array.isArray(monthReviews)||
    monthReviews.length>24)fail();
  const nowDay=new Date(nowMs).toISOString().slice(0,10);
  const currentMonth=nowDay.slice(0,7);
  const window=months(nowMs),allowedMonths=new Set(window);
  const registeredMonths=new Set();
  for(const review of monthReviews){
    exact(review,['month','reviewedAt','evidenceDigest']);
    if(!MONTH.test(review.month)||!allowedMonths.has(review.month)||
      registeredMonths.has(review.month)||!HASH.test(review.evidenceDigest)||
      Date.parse(validTime(review.reviewedAt))>nowMs+60000)fail();
    registeredMonths.add(review.month);
  }
  const ids=new Set(),retentionCandidates=[];
  let reportedRestoresThisMonth=0,held=0;
  for(const item of backups){
    exact(item,['backupId','day','retentionReviewOn','ciphertextDigest',
      'legalHold','restoreTestAt']);
    const day=validDay(item.day);
    if(typeof item.backupId!=='string'||!HASH.test(item.backupId)||
      ids.has(item.backupId)||!HASH.test(item.ciphertextDigest)||
      validDay(item.retentionReviewOn)!==plusDays(day,90)||
      typeof item.legalHold!=='boolean'||
      Date.parse(day+'T00:00:00.000Z')>nowMs+86400000)fail();
    ids.add(item.backupId);
    if(item.legalHold)held++;
    if(item.restoreTestAt!==null){
      const stamp=validTime(item.restoreTestAt);
      if(Date.parse(stamp)<Date.parse(day+'T00:00:00.000Z')||
        Date.parse(stamp)>nowMs+60000)fail();
      if(stamp.slice(0,7)===currentMonth)reportedRestoresThisMonth++;
    }
    if(item.retentionReviewOn<=nowDay){
      retentionCandidates.push({backupId:item.backupId,
        reviewReason:item.legalHold?'Legal Hold / No Deletion':
          'Retention Review Only / No Automatic Deletion'});
    }
  }
  const missingMonthReviews=window.filter(m=>!registeredMonths.has(m));
  return Object.freeze({
    historyReviewWindowMonths:24,backupReviewAfterDays:90,
    monthWindow:window,recordedMonthReviewCount:registeredMonths.size,
    missingMonthReviews,backupsExamined:backups.length,
    retentionReviewCandidates:retentionCandidates,
    legalHoldBackupCount:held,
    monthlyRestoreEvidenceRecorded:reportedRestoresThisMonth>0,
    monthlyRestoreIndependentProofVerified:false,
    retentionActionsAutomated:false,deletedBackups:0,
    historyCompletenessCertified:false,freeSlotsCertified:false
  });
}
module.exports={planHistoricalRetention};
