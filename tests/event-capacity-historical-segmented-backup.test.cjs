'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {createEncryptedOffsiteHistoricalBackup}
  =require('../event-capacity-historical-offsite-backup');
const {packSegmentedEncryptedBackup,inspectSegmentedEncryptedBackup}
  =require('../event-capacity-historical-segmented-backup');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const SOURCE='synthetic private encryption secret for test only and never production';
const BACKUP='independent synthetic backup secret held away from private source';
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
function fixtures(){
  const x=setup();
  const envelope=createEncryptedOffsiteHistoricalBackup({
    archive:x.next.archive,ownerReceipt:x.nextOwnerReceipt,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:SOURCE,backupSecret:BACKUP,nowMs:NOW
  }).envelope;
  const base={envelope,expectedOwnerReceipt:x.nextOwnerReceipt,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:SOURCE,backupSecret:BACKUP,nowMs:NOW};
  const pack=(overrides={})=>packSegmentedEncryptedBackup({
    ...base,chunkBytes:1024,...overrides
  });
  const result=pack();
  const restore=(overrides={})=>inspectSegmentedEncryptedBackup({
    ...base,manifest:result.manifest,parts:result.parts,...overrides
  });
  return {x,base,result,pack,restore};
}
test('Large logical encrypted offsite payload splits into bounded immutable ciphertext chunks',()=>{
  const x=fixtures();
  const {manifest,parts}=x.result;
  assert.ok(parts.length>1);
  assert.equal(manifest.parts.length,parts.length);
  assert.equal(manifest.format,'kings-historical-encrypted-offsite-segments-v1');
  assert.equal(manifest.chunkBytes,1024);
  assert.ok(manifest.parts.every((p,i)=>p.index===i&&
    p.byteLength<=1024&&p.byteLength>0));
  assert.equal(manifest.historicalCoverageCertified,false);
  assert.equal(x.result.offsiteStoragePerformed,false);
  assert.equal(x.result.freeSlotsCertified,false);
  const serialized=JSON.stringify(x.result);
  assert.doesNotMatch(serialized,/event:100|Partner Convoy|evidenceDigest|-----BEGIN PRIVATE KEY-----/);
});
test('Reassembled parts decrypt and verify original historical signed archive',()=>{
  const x=fixtures(),verified=x.restore();
  assert.equal(verified.journal.revision,2);
  assert.equal(verified.journal.events['event:100'].status,'Rescheduled');
  assert.equal(verified.encryptedChunksVerified,x.result.parts.length);
  assert.equal(verified.segmentedRestoreVerified,true);
  assert.equal(verified.productionRestorePerformed,false);
  assert.equal(verified.offsiteStoragePerformed,false);
  assert.equal(verified.freeSlotsCertified,false);
});
test('Swapped, missing, added or repeated ciphertext chunk fails closed',()=>{
  const x=fixtures(),base=x.result.parts;
  for(const parts of [
    [base[1],base[0],...base.slice(2)],
    base.slice(0,-1),
    [...base,base[0]],
    [base[0],base[0],...base.slice(2)]
  ])assert.throws(()=>x.restore({parts}));
});
test('Changed ciphertext chunks, chunk digests and manifest sizes are not accepted',()=>{
  const x=fixtures(),p=x.result.parts;
  const corrupt=[...p];corrupt[0]=Buffer.from('fake').toString('base64');
  assert.throws(()=>x.restore({parts:corrupt}));
  const wrong=structuredClone(x.result.manifest);
  wrong.parts[0].ciphertextDigest='0'.repeat(64);
  assert.throws(()=>x.restore({manifest:wrong}));
  const size=structuredClone(x.result.manifest);
  size.totalBytes++;
  assert.throws(()=>x.restore({manifest:size}));
});
test('Forged retention date, scope and ciphertext root digest are rejected',()=>{
  const x=fixtures();
  for(const change of [
    {retentionReviewOn:'2027-08-17'},
    {day:'2027-02-30'},
    {scope:{...SCOPE,forumId:'999999999999999999'}},
    {ciphertextDigest:'0'.repeat(64)},
    {freeSlotsCertified:true}
  ])assert.throws(()=>x.restore({
    manifest:{...x.result.manifest,...change}
  }));
});
test('Owner signature, separate encryption secret and source key are required',()=>{
  const x=fixtures();
  assert.throws(()=>x.restore({expectedOwnerReceipt:x.x.previousOwnerReceipt}));
  assert.throws(()=>x.restore({backupSecret:'synthetic completely wrong alternate backup secret'}));
  assert.throws(()=>x.restore({encryptionSecret:'synthetic different source key from attacker'}));
  assert.throws(()=>x.pack({expectedOwnerReceipt:x.x.previousOwnerReceipt}));
});
test('Too-small or oversized chunk sizes reject without storage side effects',()=>{
  const x=fixtures();
  for(const chunkBytes of [0,10,512,512*1024+1,1.5,NaN])
    assert.throws(()=>x.pack({chunkBytes}));
  assert.equal(x.result.offsiteStoragePerformed,false);
});
test('Malformed manifests, extra metadata and invalid base64 abort safely',()=>{
  const x=fixtures();
  const result=x.result;
  assert.throws(()=>x.restore({manifest:{...result.manifest,
    forgedReadAuthorized:true}}));
  assert.throws(()=>x.restore({parts:[...result.parts.slice(0,-1),'@bad@']}));
  assert.throws(()=>x.restore({parts:null}));
  const gap=structuredClone(result.manifest);
  gap.parts[0].index=3;
  assert.throws(()=>x.restore({manifest:gap}));
});
test('Default production-sized chunks never exceed 512 KiB per ciphertext object',()=>{
  const x=fixtures();
  const packed=x.pack({chunkBytes:256*1024});
  assert.equal(packed.manifest.parts.length,1);
  assert.ok(packed.manifest.parts[0].byteLength<=512*1024);
  const result=x.restore({manifest:packed.manifest,parts:packed.parts});
  assert.equal(result.segmentedRestoreVerified,true);
});
