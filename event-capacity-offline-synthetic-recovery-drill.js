'use strict';
// DRAFT/OFFLINE SYNTHETIC ONLY. Composite recovery rehearsal using externally
// provided copies; never reads GitHub, loads secrets from env, writes files,
// validates independent physical storage or restores a production system.
const {isDeepStrictEqual}=require('node:util');
const {inspectOfflineOwnerRecoveryCopies}
  =require('./event-capacity-independent-owner-highwater');
const {verifyHistoricalArchivePin}
  =require('./event-capacity-historical-github-reader');
const {inspectSegmentedEncryptedBackup}
  =require('./event-capacity-historical-segmented-backup');
const ERROR='Kings Event Capacity offline synthetic recovery drill failed.';
function fail(){throw new Error(ERROR);}
function simulateKingsOfflineSyntheticRecovery({
  primaryOwnerCard,recoveryOwnerCard,expectedFingerprint,
  manifest,parts,scope,ownerPublicKey,encryptionSecret,backupSecret,
  nowMs=Date.now()
}={}){
  try{
    if(!Number.isFinite(nowMs)||nowMs<0||!Array.isArray(parts))fail();
    // Signed floor and detached fingerprint must agree BEFORE backup decrypt.
    const copies=inspectOfflineOwnerRecoveryCopies({
      primaryCard:primaryOwnerCard,recoveryCard:recoveryOwnerCard,
      expectedFingerprint,scope,ownerPublicKey,nowMs
    });
    if(copies.bothSignedCopiesCryptographicallyVerified!==true||
      copies.bothCopiesMatchRecordedFingerprint!==true||
      copies.independentMediaCustodyProvenByCode!==false)fail();
    const pin=verifyHistoricalArchivePin({
      receipt:primaryOwnerCard.receipt,scope,ownerPublicKey,nowMs
    });
    // Detect any mutations by the injected/decryption components. Synthetic
    // inputs are caller-owned, and this operation must be inspection-only.
    const originalManifest=structuredClone(manifest);
    const originalParts=structuredClone(parts);
    const restore=inspectSegmentedEncryptedBackup({
      manifest,parts,expectedOwnerReceipt:primaryOwnerCard.receipt,
      scope,ownerPublicKey,encryptionSecret,backupSecret,nowMs
    });
    if(!isDeepStrictEqual(manifest,originalManifest)||
      !isDeepStrictEqual(parts,originalParts)||restore.segmentedRestoreVerified!==true||
      restore.productionRestorePerformed!==false||
      restore.offsiteStoragePerformed!==false||
      restore.freeSlotsCertified!==false||
      !isDeepStrictEqual(restore.checkpoint,pin)||
      restore.journal?.revision!==pin.revision||
      restore.journal?.tip!==pin.tip)fail();
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      state:'Synthetic Encrypted Recovery Verified Against Signed Owner Floor',
      recoveredSignedRevision:pin.revision,
      verifiedEncryptedSegments:restore.encryptedChunksVerified,
      providedOwnerCopiesAgreeWithExternalFingerprint:true,
      recoveredArchiveMatchesSignedOwnerFloor:true,
      syntheticEncryptionAndSignedJournalIntegrityVerified:true,
      sourceRepositoryAccessUsed:false,
      anyExternalBackupActuallyFetched:false,
      actualIndependentStorageCustodyVerified:false,
      latestOwnerFloorProven:false,
      actualMonthlyIsolatedHostRestorePerformed:false,
      realEventHistoryCompletenessVerified:false,
      humanApprovalStillRequired:true,
      productionRestorePerformed:false,
      credentialIssuancePerformed:false,
      safeToActivate:false,freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={simulateKingsOfflineSyntheticRecovery};
