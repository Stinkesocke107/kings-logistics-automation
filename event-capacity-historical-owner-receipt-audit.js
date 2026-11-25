'use strict';
// OFFLINE READ-ONLY owner-receipt continuity inspector for Kings historical
// archives. Valid signatures bind revisions, but do NOT prove independent
// custody, latest highwater freshness or complete original Event evidence.
const {verifyHistoricalJournal}
  =require('./event-capacity-historical-lifecycle-journal');
const {verifyHistoricalArchivePin}
  =require('./event-capacity-historical-github-reader');
const ERROR='Kings Event Capacity historical owner receipt continuity invalid.';
const SHA=/^[0-9a-f]{64}$/;
const MAX_ENTRIES=24000,MAX_RECEIPTS=24001;
function fail(){throw new Error(ERROR);}
function exact(v,names){
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.getPrototypeOf(v)!==Object.prototype||
    Object.keys(v).sort().join(',')!==names.slice().sort().join(','))fail();
}
function inspectHistoricalOwnerReceiptContinuity({
  journal,receipts=[],expectedCheckpoint=null,
  scope,ownerPublicKey,nowMs=Date.now()
}={}){
  try{
    if(!Number.isFinite(nowMs)||nowMs<0||!Array.isArray(receipts)||
      receipts.length>MAX_RECEIPTS)fail();
    verifyHistoricalJournal(journal,{scope,ownerPublicKey});
    if(journal.revision>MAX_ENTRIES)fail();
    if(expectedCheckpoint!==null){
      exact(expectedCheckpoint,['revision','tip','archiveDigest']);
      if(!Number.isSafeInteger(expectedCheckpoint.revision)||
        expectedCheckpoint.revision<0||
        !SHA.test(expectedCheckpoint.tip)||
        !SHA.test(expectedCheckpoint.archiveDigest))fail();
    }
    let previousRevision=-1,lastIssuedAt=-1,latestPin=null;
    const covered=new Set();
    for(const receipt of receipts){
      const pin=verifyHistoricalArchivePin({
        receipt,scope,ownerPublicKey,nowMs
      });
      const revision=pin.revision;
      const issued=Date.parse(receipt.payload.issuedAt);
      if(revision<=previousRevision||revision>journal.revision||
        issued<lastIssuedAt||covered.has(revision))fail();
      const actualTip=revision===0?
        (journal.history.length?journal.history[0].payload.previousTip:journal.tip):
        journal.history[revision-1]?.entryTip;
      if(actualTip!==pin.tip)fail();
      previousRevision=revision;
      lastIssuedAt=issued;
      latestPin=pin;
      covered.add(revision);
    }
    const missing=[];
    for(let rev=1;rev<=journal.revision;rev++){
      if(!covered.has(rev)&&missing.length<100)missing.push(rev);
    }
    const pinnedLatest=latestPin!==null&&
      latestPin.revision===journal.revision&&
      latestPin.tip===journal.tip;
    const checkpointMatches=expectedCheckpoint!==null&&
      expectedCheckpoint.revision===journal.revision&&
      expectedCheckpoint.tip===journal.tip&&
      latestPin!==null&&
      expectedCheckpoint.archiveDigest===latestPin.archiveDigest;
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      state:receipts.length===0?'No Independently Supplied Receipts':
        !pinnedLatest?'Latest Signed Receipt Missing':
        !checkpointMatches?'External Checkpoint Confirmation Missing':
        'Signed Receipt Sequence Structurally Verified',
      signedJournalIntegrityVerified:true,
      validatedOwnerReceipts:receipts.length,
      historicalTransitions:journal.revision,
      missingIntermediateReceiptCount:journal.revision-
        [...covered].filter(rev=>rev>0).length,
      firstMissingRevisionNumbers:missing,
      latestOwnerReceiptMatchesJournal:pinnedLatest,
      suppliedCheckpointMatchesLatestReceipt:checkpointMatches,
      receiptSequenceCryptographicallyVerified:true,
      externalOwnerReceiptCustodyAuthenticated:false,
      latestIndependentOwnerHighwaterVerified:false,
      fullHistoricalSourceCoverageVerified:false,
      historicalCoverageCertified:false,
      automaticApproval:false,freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={inspectHistoricalOwnerReceiptContinuity};
