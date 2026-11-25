'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {createEncryptedOffsiteHistoricalBackup}
  =require('../event-capacity-historical-offsite-backup');
const {packSegmentedEncryptedBackup}
  =require('../event-capacity-historical-segmented-backup');
const {prepareOfflineOwnerHighwaterCard,fingerprintSignedOfflineOwnerFloor}
  =require('../event-capacity-independent-owner-highwater');
const {simulateKingsOfflineSyntheticRecovery}
  =require('../event-capacity-offline-synthetic-recovery-drill');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const SOURCE='synthetic private encryption secret for test only and never production';
const BACKUP='independent synthetic backup secret held away from private source';
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
function scenario(){
  const x=setup();
  const primaryOwnerCard=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:x.nextOwnerReceipt,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  const recoveryOwnerCard=structuredClone(primaryOwnerCard);
  const expectedFingerprint=fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:primaryOwnerCard,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  const envelope=createEncryptedOffsiteHistoricalBackup({
    archive:x.next.archive,ownerReceipt:x.nextOwnerReceipt,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,encryptionSecret:SOURCE,
    backupSecret:BACKUP,nowMs:NOW
  }).envelope;
  const packed=packSegmentedEncryptedBackup({
    envelope,expectedOwnerReceipt:x.nextOwnerReceipt,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,encryptionSecret:SOURCE,
    backupSecret:BACKUP,chunkBytes:1024,nowMs:NOW
  });
  const args={primaryOwnerCard,recoveryOwnerCard,expectedFingerprint,
    manifest:packed.manifest,parts:packed.parts,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,encryptionSecret:SOURCE,
    backupSecret:BACKUP,nowMs:NOW};
  return {x,args,run:(changes={})=>simulateKingsOfflineSyntheticRecovery({
    ...args,...changes
  })};
}
test('Complete offline synthetic restore matches signed externally supplied owner floor',()=>{
  const s=scenario();const output=s.run();
  assert.equal(output.recoveredSignedRevision,2);
  assert.equal(output.recoveredArchiveMatchesSignedOwnerFloor,true);
  assert.equal(output.providedOwnerCopiesAgreeWithExternalFingerprint,true);
  assert.equal(output.syntheticEncryptionAndSignedJournalIntegrityVerified,true);
  assert.ok(output.verifiedEncryptedSegments>1);
  assert.equal(output.productionRestorePerformed,false);
  assert.equal(output.actualMonthlyIsolatedHostRestorePerformed,false);
  assert.equal(output.safeToActivate,false);
  assert.equal(output.freeSlotsCertified,false);
});
test('Restore does not mutate source, manifests, detached card or ciphertext segments',()=>{
  const s=scenario();const before=structuredClone(s.args);
  s.run();
  assert.deepEqual(s.args,before);
});
test('Old owner floor never authorizes restoring newer backup by itself',()=>{
  const s=scenario();
  const old=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:s.x.previousOwnerReceipt,scope:SCOPE,
    ownerPublicKey:s.x.ownerPublicKey,nowMs:NOW
  });
  const oldFingerprint=fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:old,scope:SCOPE,ownerPublicKey:s.x.ownerPublicKey,nowMs:NOW
  });
  assert.throws(()=>s.run({
    primaryOwnerCard:old,recoveryOwnerCard:structuredClone(old),
    expectedFingerprint:oldFingerprint
  }));
});
test('Backup tampering and wrong chunk order abort without partial success report',()=>{
  const s=scenario();
  const parts=[...s.args.parts];parts[0]=Buffer.from('attacker bytes').toString('base64');
  assert.throws(()=>s.run({parts}));
  const reversed=[...s.args.parts].reverse();
  assert.throws(()=>s.run({parts:reversed}));
  const wrong=structuredClone(s.args.manifest);
  wrong.parts[0].ciphertextDigest='0'.repeat(64);
  assert.throws(()=>s.run({manifest:wrong}));
});
test('Missing parts, invalid manifest and malformed scope are rejected',()=>{
  const s=scenario();
  assert.throws(()=>s.run({parts:s.args.parts.slice(1)}));
  assert.throws(()=>s.run({manifest:{...s.args.manifest,capacityAvailable:true}}));
  assert.throws(()=>s.run({scope:{...SCOPE,forumId:'999999999999999999'}}));
});
test('Wrong recovery secret and signing key abort with sanitized errors',()=>{
  const s=scenario();
  for(const overrides of [
    {backupSecret:'completely wrong backup secret never for real use'},
    {encryptionSecret:'unrelated historical archive decryption secret long'}
  ])assert.throws(()=>s.run(overrides),err=>{
    assert.doesNotMatch(String(err),/event:100|Partner Convoy|secret never/);
    return true;
  });
});
test('Stale or altered recovery card cannot pass a matching owner fingerprint',()=>{
  const s=scenario();
  const tampered=structuredClone(s.args.recoveryOwnerCard);
  tampered.receipt.payload.archiveDigest='0'.repeat(64);
  assert.throws(()=>s.run({recoveryOwnerCard:tampered}));
  assert.throws(()=>s.run({expectedFingerprint:'0'.repeat(64)}));
  assert.throws(()=>s.run({recoveryOwnerCard:s.args.primaryOwnerCard}));
});
test('A synthetic restore never reports external acquisition, real history coverage or live readiness',()=>{
  const s=scenario();const result=s.run(),serialized=JSON.stringify(result);
  assert.equal(result.anyExternalBackupActuallyFetched,false);
  assert.equal(result.actualIndependentStorageCustodyVerified,false);
  assert.equal(result.latestOwnerFloorProven,false);
  assert.equal(result.realEventHistoryCompletenessVerified,false);
  assert.equal(result.credentialIssuancePerformed,false);
  assert.equal(result.humanApprovalStillRequired,true);
  for(const secret of [SOURCE,BACKUP,'event:100','Partner Convoy',
    'PRIVATE KEY'])assert.equal(serialized.includes(secret),false);
});
