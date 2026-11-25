'use strict';
// OFFLINE, no I/O. A separately retained owner-signed receipt is the
// independent floor below which a remote private history MUST NOT regress.
// This code cannot attest that the input was genuinely kept off GitHub;
// caller custody/provenance remains an external human security requirement.
// No automatic checkpoint advancement, event approval or quota certification.
const {verifyHistoricalArchivePin}
  =require('./event-capacity-historical-github-reader');
const {verifyHistoricalJournal}
  =require('./event-capacity-historical-lifecycle-journal');
const {isDeepStrictEqual}=require('node:util');
const ERROR='Kings Event Capacity independent owner highwater comparison failed.';
const HEX=/^[a-f0-9]{64}$/;
function fail(){throw new Error(ERROR);}
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype||
    Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))fail();
}
function pinned(receipt,scope,ownerPublicKey,nowMs){
  return verifyHistoricalArchivePin({receipt,scope,ownerPublicKey,nowMs});
}
function validCheckpoint(v){
  exact(v,['revision','tip','archiveDigest']);
  if(!Number.isSafeInteger(v.revision)||v.revision<0||
    !HEX.test(v.tip)||!HEX.test(v.archiveDigest))fail();
}
function prepareOfflineOwnerHighwaterCard({
  ownerReceipt,scope,ownerPublicKey,nowMs=Date.now()
}={}){
  try{
    const pin=pinned(ownerReceipt,scope,ownerPublicKey,nowMs);
    validCheckpoint(pin);
    // This card is an exportable signed RECEIPT, NOT an independent store.
    // The owner must place it under custody outside GitHub, manually.
    return Object.freeze({
      version:1,kind:'Kings Offline Owner Highwater Card',
      receipt:structuredClone(ownerReceipt),
      privateSigningKeyIncluded:false,
      exportPerformed:false,
      githubWritePerformed:false,
      independentlyRetained:false,
      sourceCompletenessProven:false,
      freeSlotsCertified:false
    });
  }catch{fail();}
}
function compareRemoteHistoryToOfflineHighwater({
  remoteJournal,remoteCheckpoint,remoteOwnerReceipt,
  retainedOwnerCard,scope,ownerPublicKey,
  nowMs=Date.now()
}={}){
  try{
    if(!Number.isFinite(nowMs)||nowMs<0)fail();
    exact(retainedOwnerCard,[
      'version','kind','receipt','privateSigningKeyIncluded',
      'exportPerformed','githubWritePerformed',
      'independentlyRetained','sourceCompletenessProven','freeSlotsCertified'
    ]);
    if(retainedOwnerCard.version!==1||
      retainedOwnerCard.kind!=='Kings Offline Owner Highwater Card'||
      retainedOwnerCard.privateSigningKeyIncluded!==false||
      retainedOwnerCard.githubWritePerformed!==false||
      retainedOwnerCard.sourceCompletenessProven!==false||
      retainedOwnerCard.freeSlotsCertified!==false||
      retainedOwnerCard.independentlyRetained!==false||
      retainedOwnerCard.exportPerformed!==false)fail();
    const retained=pinned(retainedOwnerCard.receipt,scope,
      ownerPublicKey,nowMs);
    const remote=pinned(remoteOwnerReceipt,scope,ownerPublicKey,nowMs);
    validCheckpoint(remoteCheckpoint);
    verifyHistoricalJournal(remoteJournal,{scope,ownerPublicKey});
    if(!isDeepStrictEqual(remoteCheckpoint,remote)||
      remoteJournal.revision!==remote.revision||
      remoteJournal.tip!==remote.tip)fail();
    if(remote.revision<retained.revision)fail();
    // Two separate signed receipts at one revision with changed archive
    // ciphertext or history tip signal a fork/equivocation. Never choose.
    if(remote.revision===retained.revision&&
      (remote.tip!==retained.tip||
       remote.archiveDigest!==retained.archiveDigest))fail();
    // A newer remote archive can exist, but its freshness cannot be
    // authenticated from GitHub alone. Owner reconciliation required.
    let prefixMatched=true;
    if(remote.revision>retained.revision){
      const historicTip=retained.revision===0?
        (remoteJournal.history.length?
          remoteJournal.history[0].payload.previousTip:remoteJournal.tip):
        remoteJournal.history[retained.revision-1]?.entryTip;
      if(historicTip!==retained.tip)fail();
      prefixMatched=historicTip===retained.tip;
    }
    const exactMatch=remote.revision===retained.revision;
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      state:exactMatch?'Remote Matches Retained Signed Owner Floor':
        'Remote Ahead — Independent Owner Review Required',
      retainedRevision:retained.revision,
      remoteRevision:remote.revision,
      retainedHistoricalPrefixVerified:prefixMatched,
      cryptographicOwnerReceiptAndJournalVerified:true,
      signedRemoteCheckpointMatchesArchive:true,
      remoteAtOrAboveRetainedFloor:true,
      currentRetainedReceiptMatchesRemote:exactMatch,
      independentPhysicalCustodyAuthenticatedByCode:false,
      latestRemoteHighwaterIndependentlyConfirmed:false,
      highwaterAdvancedAutomatically:false,
      remoteWritePerformed:false,
      humanReviewRequired:true,
      realHistoricalSourceCompletenessVerified:false,
      historicalCoverageCertified:false,
      freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={prepareOfflineOwnerHighwaterCard,
  compareRemoteHistoryToOfflineHighwater};
