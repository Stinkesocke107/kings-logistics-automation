'use strict';
// Development-only, GET-only daily backup continuity audit for PRIVATE Kings.
// Never infer a complete event history, guaranteed delivery or 90-day actual
// retention from valid daily samples. No deletes, restores to production or
// automated Discord actions.
const {createPrivateHistoricalBackupVault}
  =require('./event-capacity-historical-github-backup-vault');
const ERROR='Kings Event Capacity private backup continuity cannot be certified.';
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
function fail(){throw new Error(ERROR);}
function checkDay(value){
  if(typeof value!=='string'||!DAY.test(value))fail();
  const ms=Date.parse(value+'T00:00:00.000Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)fail();
  return value;
}
function dateBefore(today,offset){
  return new Date(Date.parse(today+'T00:00:00.000Z')-
    offset*86400000).toISOString().slice(0,10);
}
function createPrivateBackupContinuityAudit({
  repository,dataRepository,witnessRepository,token,scope,
  ownerPublicKey,encryptionSecret,backupSecret,
  transport=fetch,nowMs=()=>Date.now()
}={}){
  if(typeof nowMs!=='function')fail();
  const privateVault=createPrivateHistoricalBackupVault({
    repository,dataRepository,witnessRepository,token,scope,ownerPublicKey,
    encryptionSecret,backupSecret,transport,nowMs
  });
  async function audit({windowDays=90,receipts=[]}={}){
    try{
      const ms=nowMs();
      if(!Number.isFinite(ms)||ms<0||
        !Number.isSafeInteger(windowDays)||windowDays<1||windowDays>90||
        !Array.isArray(receipts)||receipts.length>90)fail();
      const today=new Date(ms).toISOString().slice(0,10);
      const window=Array.from({length:windowDays},(_,i)=>dateBefore(today,
        windowDays-1-i));
      const expected=new Set(window),byDay=new Map();
      for(const entry of receipts){
        if(!entry||typeof entry!=='object'||Array.isArray(entry)||
          Object.keys(entry).sort().join(',')!=='day,ownerReceipt'||
          !expected.has(checkDay(entry.day))||byDay.has(entry.day)||
          !entry.ownerReceipt)fail();
        byDay.set(entry.day,entry.ownerReceipt);
      }
      const days=[];let verified=0,missing=0,unverified=0;
      for(const day of window){
        const receipt=byDay.get(day);
        if(!receipt){
          missing++;
          days.push(Object.freeze({day,status:'Missing Independently Retained Owner Receipt',
            backupVerified:false}));
          continue;
        }
        let valid=false;
        try{
          const result=await privateVault.readDaily({
            day,ownerReceipt:receipt
          });
          valid=result?.state==='EncryptedBackupVerified'&&
            result?.day===day&&result?.offsiteRepoVerifiedPrivate===true&&
            result?.isolatedRestoreVerified===true&&
            result?.freeSlotsCertified===false;
        }catch{valid=false;}
        if(valid)verified++;else unverified++;
        days.push(Object.freeze({day,status:valid?
          'Encrypted Backup Read Verified':'Backup Unverifiable / Review Required',
          backupVerified:valid}));
      }
      return Object.freeze({
        visibility:'PRIVATE_ONLY',readOnly:true,
        auditType:'Daily Encrypted Backup Continuity',
        windowDays,days,
        counts:Object.freeze({verifiedDailyBackups:verified,
          ownerReceiptMissingDays:missing,unverifiableDays:unverified,
          expectedDays:windowDays}),
        allDailyReadChecksPassed:verified===windowDays,
        actualIndependentStorageGovernanceVerified:false,
        independentlyRetainedHighwaterContinuityVerified:false,
        monthlyIsolatedHostRestoreVerified:false,
        retentionDaysPolicy:90,
        retentionEnforced:false,automaticDeletions:0,
        historicalCoverageCertified:false,freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({audit});
}
module.exports={createPrivateBackupContinuityAudit};
