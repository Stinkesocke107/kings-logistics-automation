'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {createEncryptedOffsiteHistoricalBackup,
  inspectEncryptedOffsiteHistoricalBackup}
  =require('../event-capacity-historical-offsite-backup');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const WRONG={guildId:'999999999999999999',forumId:SCOPE.forumId};
const CIPHER='synthetic private encryption secret for test only and never production';
const BACKUP='independent synthetic backup key never to be stored with the source';
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
function setupBackup(){
  const x=setup();
  const args={archive:x.next.archive,ownerReceipt:x.nextOwnerReceipt,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:CIPHER,backupSecret:BACKUP,nowMs:NOW};
  const created=createEncryptedOffsiteHistoricalBackup(args);
  const restore=(changes={})=>inspectEncryptedOffsiteHistoricalBackup({
    envelope:created.envelope,expectedOwnerReceipt:x.nextOwnerReceipt,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:CIPHER,backupSecret:BACKUP,nowMs:NOW,...changes});
  return {x,args,created,restore};
}
test('Encrypted offsite backup is private and independently restored using owner receipt',()=>{
  const {x,created,restore}=setupBackup();
  const text=JSON.stringify(created.envelope);
  assert.doesNotMatch(text,/event:100|Partner Convoy|evidenceDigest/);
  assert.equal(created.offsiteStoragePerformed,false);
  assert.equal(created.freeSlotsCertified,false);
  assert.equal(created.envelope.retentionReviewOn,'2027-08-18');
  const restored=restore();
  assert.equal(restored.isolatedRestoreVerified,true);
  assert.equal(restored.productionRestorePerformed,false);
  assert.equal(restored.freeSlotsCertified,false);
  assert.equal(restored.sourceEvidenceAuthenticityVerified,false);
  assert.equal(restored.journal.revision,x.next.checkpoint.revision);
  assert.equal(restored.journal.events['event:100'].status,'Rescheduled');
});
test('Backup ciphertext cannot be tampered or silently truncated',()=>{
  const {created,restore}=setupBackup();
  const base=created.envelope;
  const changed={...base,ciphertextBase64:base.ciphertextBase64.slice(4)};
  assert.throws(()=>restore({envelope:changed}));
  assert.throws(()=>restore({envelope:{...base,ciphertextDigest:'0'.repeat(64)}}));
  assert.throws(()=>restore({envelope:{...base,ciphertextBase64:'@invalid'}}));
});
test('Separately retained Ed25519 owner receipt is mandatory for isolated restore',()=>{
  const {x,restore}=setupBackup();
  assert.throws(()=>restore({expectedOwnerReceipt:null}));
  const bogus=structuredClone(x.nextOwnerReceipt);
  bogus.payload.archiveDigest='0'.repeat(64);
  assert.throws(()=>restore({expectedOwnerReceipt:bogus}));
  assert.throws(()=>restore({expectedOwnerReceipt:x.previousOwnerReceipt}));
});
test('Wrong offsite encryption secret and source archive secret are refused',()=>{
  const {restore}=setupBackup();
  assert.throws(()=>restore({backupSecret:'different backup secret long enough for test'}));
  assert.throws(()=>restore({encryptionSecret:'different original archive encryption secret'}));
});
test('Offsite backup key cannot simply reuse private source archive secret',()=>{
  const {args,restore}=setupBackup();
  assert.throws(()=>createEncryptedOffsiteHistoricalBackup({...args,backupSecret:CIPHER}));
  assert.throws(()=>restore({backupSecret:CIPHER,encryptionSecret:CIPHER}));
});
test('Cryptographic scope binding prevents wrong guild and shifted retention dates',()=>{
  const {created,restore}=setupBackup();
  assert.throws(()=>restore({scope:WRONG}));
  assert.throws(()=>restore({envelope:{...created.envelope,scope:WRONG}}));
  assert.throws(()=>restore({envelope:{...created.envelope,retentionReviewOn:'2027-08-19'}}));
});
test('A future-dated backup and invalid calendar dates fail closed',()=>{
  const {created,restore}=setupBackup();
  assert.throws(()=>restore({envelope:{...created.envelope,day:'2027-02-30'}}));
  assert.throws(()=>restore({envelope:{...created.envelope,day:'2027-06-20'}}));
  assert.throws(()=>restore({envelope:{...created.envelope,day:'invalid'}}));
});
test('Backup refuses a different owner-signed archive before encryption',()=>{
  const {x,args}=setupBackup();
  assert.throws(()=>createEncryptedOffsiteHistoricalBackup({...args,
    archive:x.prior.archive}));
});
test('Backup inspection itself makes no storage mutation or production restore',()=>{
  const {created,restore}=setupBackup();
  const prior=JSON.stringify(created.envelope);
  const value=restore();
  assert.equal(JSON.stringify(created.envelope),prior);
  assert.equal(value.productionRestorePerformed,false);
  assert.equal(value.archivalCompletenessCertified,false);
});
