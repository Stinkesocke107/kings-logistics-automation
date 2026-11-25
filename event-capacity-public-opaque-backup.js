'use strict';
// OFFLINE EXPERIMENT ONLY. Opaque, doubly authenticated AES-256-GCM wrapper
// around an ALREADY VERIFIED encrypted Kings historical archive backup.
// Absolutely NO public GitHub upload or live workflows. Outer key and both
// source/backup keys must be independent and NEVER appear in the repository.
// Any future public release of ciphertext needs separate privacy/security
// approval: GitHub history is publicly copyable and effectively permanent.
const crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const {inspectEncryptedOffsiteHistoricalBackup}
  =require('./event-capacity-historical-offsite-backup');
const DOMAIN='kings-capacity-public-opaque-offline-v1';
const ERROR='Kings Event Capacity public opaque archive verification unavailable.';
const DIGEST=/^[a-f0-9]{64}$/;
const B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_CLEAR=38*1024*1024;
const MAX_BYTES=MAX_CLEAR+1024;
const decoder=new TextDecoder('utf-8',{fatal:true});
function fail(){throw new Error(ERROR);}
function exact(x,keys){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.getPrototypeOf(x)!==Object.prototype||
    Object.keys(x).sort().join(',')!==keys.slice().sort().join(','))fail();
}
function independent(secret,sourceSecret,backupSecret){
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32||
    Buffer.byteLength(secret,'utf8')>4096||secret===sourceSecret||
    secret===backupSecret||sourceSecret===backupSecret)fail();
}
function digest(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function key(secret,salt){
  return crypto.scryptSync(secret,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
function decode(base64){
  if(typeof base64!=='string'||base64.length>Math.ceil(MAX_BYTES/3)*4+4||
    !B64.test(base64))fail();
  const b=Buffer.from(base64,'base64');
  if(b.length>MAX_BYTES||b.toString('base64')!==base64)fail();
  return b;
}
function packOpaquePublicBackup({
  envelope,expectedOwnerReceipt,scope,ownerPublicKey,
  encryptionSecret,backupSecret,offlineOuterSecret,nowMs=Date.now()
}={}){
  try{
    independent(offlineOuterSecret,encryptionSecret,backupSecret);
    const proof=inspectEncryptedOffsiteHistoricalBackup({
      envelope,expectedOwnerReceipt,scope,ownerPublicKey,
      encryptionSecret,backupSecret,nowMs
    });
    if(proof.freeSlotsCertified!==false)fail();
    const plaintext=Buffer.from(JSON.stringify(envelope),'utf8');
    if(plaintext.length>MAX_CLEAR)fail();
    const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
    const k=key(offlineOuterSecret,salt);
    let bytes;
    try{
      const cipher=crypto.createCipheriv('aes-256-gcm',k,iv);
      cipher.setAAD(Buffer.from(DOMAIN,'utf8'));
      const c=Buffer.concat([cipher.update(plaintext),cipher.final()]);
      bytes=Buffer.concat([salt,iv,cipher.getAuthTag(),c]);
    }finally{k.fill(0);}
    if(bytes.length>MAX_BYTES)fail();
    return Object.freeze({
      artifact:Object.freeze({
        version:1,
        format:'KINGS_OPAQUE_OFFLINE_CIPHERTEXT_V1',
        digest:digest(bytes),
        payload:bytes.toString('base64')
      }),
      entirelyOpaqueToPublicReader:true,
      sourceArchiveWasOwnerVerified:true,
      encryptionKeysPublished:false,
      publishedToGitHub:false,
      publicReleaseApproved:false,
      historyCompletenessCertified:false,
      freeSlotsCertified:false
    });
  }catch{fail();}
}
function inspectOpaquePublicBackup({
  artifact,expectedOwnerReceipt,scope,ownerPublicKey,
  encryptionSecret,backupSecret,offlineOuterSecret,nowMs=Date.now()
}={}){
  try{
    independent(offlineOuterSecret,encryptionSecret,backupSecret);
    exact(artifact,['version','format','digest','payload']);
    if(artifact.version!==1||
      artifact.format!=='KINGS_OPAQUE_OFFLINE_CIPHERTEXT_V1'||
      typeof artifact.digest!=='string'||!DIGEST.test(artifact.digest))fail();
    const bytes=decode(artifact.payload);
    if(bytes.length<45||digest(bytes)!==artifact.digest)fail();
    const salt=bytes.subarray(0,16),iv=bytes.subarray(16,28),
      tag=bytes.subarray(28,44),ciphertext=bytes.subarray(44);
    const k=key(offlineOuterSecret,salt);
    let plaintext;
    try{
      const decipher=crypto.createDecipheriv('aes-256-gcm',k,iv);
      decipher.setAAD(Buffer.from(DOMAIN,'utf8'));
      decipher.setAuthTag(tag);
      plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
    }finally{k.fill(0);}
    if(plaintext.length>MAX_CLEAR)fail();
    let envelope;
    try{envelope=JSON.parse(decoder.decode(plaintext));}
    catch{fail();}
    const proof=inspectEncryptedOffsiteHistoricalBackup({
      envelope,expectedOwnerReceipt,scope,ownerPublicKey,
      encryptionSecret,backupSecret,nowMs
    });
    if(proof.freeSlotsCertified!==false)fail();
    return Object.freeze({
      doubleEncryptionVerified:true,
      innerOwnerSignedArchiveVerified:true,
      originalJournalRevision:proof.journal.revision,
      originalArchiveCheckpointVerified:true,
      keysPublished:false,githubUploadPerformed:false,
      independentKeyCustodyVerified:false,
      publicReleaseApproved:false,
      historicalCoverageCertified:false,
      freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={packOpaquePublicBackup,inspectOpaquePublicBackup};
