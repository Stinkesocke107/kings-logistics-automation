'use strict';
// DRAFT / OFFLINE. Read-only, bounded inspection of an ambiguous historical
// GitHub CAS write. NEVER retry a write or clean orphan ciphertext here.
// Two signed owner receipts are supplied from independently retained custody.
const {createPrivateHistoricalArchiveReader,verifyHistoricalArchivePin}
  =require('./event-capacity-historical-github-reader');
const ERROR='Kings Event Capacity historical write reconciliation unavailable.';
function fail(){throw new Error(ERROR);}
function safeRead(input){
  return createPrivateHistoricalArchiveReader(input).read();
}
function createHistoricalArchiveRecoveryInspector({
  repository,token,scope,ownerPublicKey,encryptionSecret,
  previousOwnerReceipt,nextOwnerReceipt,transport=fetch,
  nowMs=()=>Date.now()
}={}){
  if(typeof nowMs!=='function'||typeof transport!=='function')fail();
  function pinned(receipt){
    return verifyHistoricalArchivePin({receipt,scope,ownerPublicKey,
      nowMs:nowMs()});
  }
  async function inspect(){
    try{
      // Verify BOTH independently signed claims before any network access.
      const before=pinned(previousOwnerReceipt);
      const after=pinned(nextOwnerReceipt);
      if(after.revision!==before.revision+1||after.tip===before.tip||
        Date.parse(nextOwnerReceipt.payload.issuedAt)<
          Date.parse(previousOwnerReceipt.payload.issuedAt))fail();
      const base={repository,token,scope,ownerPublicKey,
        encryptionSecret,transport,nowMs};
      let latest=null;
      try{latest=await safeRead({...base,ownerReceipt:nextOwnerReceipt});}
      catch{latest=null;}
      if(latest!==null){
        if(latest.checkpoint.revision!==after.revision||
          latest.checkpoint.tip!==after.tip||
          latest.journal?.revision!==after.revision||
          latest.journal.history?.at(-1)?.payload?.previousTip!==before.tip||
          latest.freeSlotsCertified!==false)fail();
        return Object.freeze({
          state:'CANDIDATE_ARCHIVED_OWNER_HIGHWATER_PENDING',
          observedRevision:after.revision,readOnly:true,
          humanReconciliationRequired:true,ownerHighwaterUpdateRequired:true,
          originalSourceVerified:false,historicalCoverageCertified:false,
          freeSlotsCertified:false
        });
      }
      let previous=null;
      try{previous=await safeRead({...base,ownerReceipt:previousOwnerReceipt});}
      catch{previous=null;}
      if(previous!==null){
        if(previous.checkpoint.revision!==before.revision||
          previous.checkpoint.tip!==before.tip||
          previous.freeSlotsCertified!==false)fail();
        return Object.freeze({
          state:'PREVIOUS_ARCHIVE_OBSERVED_REVIEW_STAGED_SEGMENTS',
          observedRevision:before.revision,readOnly:true,
          humanReconciliationRequired:true,ownerHighwaterUpdateRequired:false,
          originalSourceVerified:false,historicalCoverageCertified:false,
          freeSlotsCertified:false
        });
      }
      return Object.freeze({
        state:'RECONCILIATION_REQUIRED',observedRevision:null,
        readOnly:true,humanReconciliationRequired:true,
        ownerHighwaterUpdateRequired:null,
        originalSourceVerified:false,historicalCoverageCertified:false,
        freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({inspect});
}
module.exports={createHistoricalArchiveRecoveryInspector};
