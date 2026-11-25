'use strict';
// OFFLINE ONLY: split already-authenticated AES-GCM offsite backups into
// content-addressed encrypted chunks small enough for GitHub Contents.
// NOT a GitHub writer/reader, not a deletion worker or production restore.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {inspectEncryptedOffsiteHistoricalBackup}
  =require('./event-capacity-historical-offsite-backup');
const ERROR='Kings Event Capacity segmented encrypted backup invalid.';
const FORMAT='kings-historical-encrypted-offsite-segments-v1';
const SHA=/^[a-f0-9]{64}$/;
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
const SNOW=/^\d{17,22}$/;
const MIN_CHUNK=1024,MAX_CHUNK=512*1024,DEFAULT_CHUNK=256*1024;
const MAX_BYTES=38*1024*1024,MAX_PARTS=256,MAX_MANIFEST=96*1024;
function fail(){throw new Error(ERROR);}
function exact(value,names){
  if(value===null||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype||
    Object.keys(value).sort().join(',')!==names.slice().sort().join(','))fail();
}
function scopeOf(scope){
  exact(scope,['guildId','forumId']);
  if(typeof scope.guildId!=='string'||!SNOW.test(scope.guildId)||
    typeof scope.forumId!=='string'||!SNOW.test(scope.forumId))fail();
  return {guildId:scope.guildId,forumId:scope.forumId};
}
function checkDay(value){
  if(typeof value!=='string'||!DAY.test(value))fail();
  const ms=Date.parse(value+'T00:00:00.000Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)fail();
  return value;
}
function checkChunk(value){
  if(!Number.isSafeInteger(value)||value<MIN_CHUNK||value>MAX_CHUNK)fail();
  return value;
}
function hash(bytes){
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function decoded(base64,limit){
  if(typeof base64!=='string'||base64.length>Math.ceil(limit/3)*4+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))fail();
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length>limit||bytes.toString('base64')!==base64)fail();
  return bytes;
}
function inspected(envelope,expectedOwnerReceipt,sc,
  ownerPublicKey,encryptionSecret,backupSecret,nowMs){
  return inspectEncryptedOffsiteHistoricalBackup({
    envelope,expectedOwnerReceipt,scope:sc,ownerPublicKey,
    encryptionSecret,backupSecret,nowMs
  });
}
function packSegmentedEncryptedBackup({
  envelope,expectedOwnerReceipt,scope,ownerPublicKey,
  encryptionSecret,backupSecret,chunkBytes=DEFAULT_CHUNK,
  nowMs=Date.now()
}={}){
  try{
    const sc=scopeOf(scope),chunk=checkChunk(chunkBytes);
    if(!Number.isFinite(nowMs)||nowMs<0)fail();
    const inspectedBackup=inspected(envelope,expectedOwnerReceipt,sc,
      ownerPublicKey,encryptionSecret,backupSecret,nowMs);
    if(inspectedBackup.freeSlotsCertified!==false)fail();
    const bytes=decoded(envelope.ciphertextBase64,MAX_BYTES);
    if(bytes.length<29||bytes.length>MAX_BYTES||
      hash(bytes)!==envelope.ciphertextDigest)fail();
    const count=Math.ceil(bytes.length/chunk);
    if(count<1||count>MAX_PARTS)fail();
    const parts=[],records=[];
    for(let i=0;i<count;i++){
      const segment=bytes.subarray(i*chunk,Math.min(bytes.length,(i+1)*chunk));
      records.push({index:i,ciphertextDigest:hash(segment),
        byteLength:segment.length});
      parts.push(segment.toString('base64'));
    }
    const manifest={
      version:1,format:FORMAT,scope:sc,
      day:checkDay(envelope.day),retentionReviewOn:checkDay(envelope.retentionReviewOn),
      ciphertextDigest:envelope.ciphertextDigest,
      totalBytes:bytes.length,chunkBytes:chunk,parts:records,
      historicalCoverageCertified:false,freeSlotsCertified:false
    };
    if(Buffer.byteLength(JSON.stringify(manifest),'utf8')>MAX_MANIFEST)fail();
    return Object.freeze({
      manifest,parts,encrypted:true,offsiteStoragePerformed:false,
      independentlyHeldOwnerHighwaterVerified:false,
      historicalCoverageCertified:false,freeSlotsCertified:false
    });
  }catch{fail();}
}
function inspectSegmentedEncryptedBackup({
  manifest,parts,expectedOwnerReceipt,scope,ownerPublicKey,
  encryptionSecret,backupSecret,nowMs=Date.now()
}={}){
  try{
    const sc=scopeOf(scope);
    exact(manifest,['version','format','scope','day','retentionReviewOn',
      'ciphertextDigest','totalBytes','chunkBytes','parts',
      'historicalCoverageCertified','freeSlotsCertified']);
    if(manifest.version!==1||manifest.format!==FORMAT||
      !isDeepStrictEqual(scopeOf(manifest.scope),sc)||
      !SHA.test(manifest.ciphertextDigest)||
      !Number.isSafeInteger(manifest.totalBytes)||
      manifest.totalBytes<29||manifest.totalBytes>MAX_BYTES||
      manifest.historicalCoverageCertified!==false||
      manifest.freeSlotsCertified!==false||
      !Number.isFinite(nowMs)||nowMs<0||
      !Array.isArray(manifest.parts)||!Array.isArray(parts)||
      manifest.parts.length<1||manifest.parts.length>MAX_PARTS||
      parts.length!==manifest.parts.length||
      Buffer.byteLength(JSON.stringify(manifest),'utf8')>MAX_MANIFEST)
      fail();
    const day=checkDay(manifest.day),reviewOn=checkDay(manifest.retentionReviewOn);
    const chunk=checkChunk(manifest.chunkBytes);
    if(manifest.parts.length!==Math.ceil(manifest.totalBytes/chunk))fail();
    const buffers=[];
    for(let i=0;i<parts.length;i++){
      const record=manifest.parts[i];
      exact(record,['index','ciphertextDigest','byteLength']);
      const expectedSize=i===parts.length-1?
        manifest.totalBytes-i*chunk:chunk;
      if(record.index!==i||!SHA.test(record.ciphertextDigest)||
        record.byteLength!==expectedSize||
        expectedSize<1||expectedSize>MAX_CHUNK)fail();
      const bytes=decoded(parts[i],MAX_CHUNK);
      if(bytes.length!==expectedSize||
        hash(bytes)!==record.ciphertextDigest)fail();
      buffers.push(bytes);
    }
    const ciphertext=Buffer.concat(buffers,manifest.totalBytes);
    if(hash(ciphertext)!==manifest.ciphertextDigest)fail();
    const verified=inspected({
      version:1,scope:sc,day,retentionReviewOn:reviewOn,
      ciphertextDigest:manifest.ciphertextDigest,
      ciphertextBase64:ciphertext.toString('base64')
    },expectedOwnerReceipt,sc,ownerPublicKey,encryptionSecret,backupSecret,nowMs);
    return Object.freeze({
      journal:verified.journal,checkpoint:verified.checkpoint,
      encryptedChunksVerified:parts.length,
      segmentedRestoreVerified:true,
      productionRestorePerformed:false,
      offsiteStoragePerformed:false,
      historicalCoverageCertified:false,
      sourceEvidenceAuthenticityVerified:false,
      freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={packSegmentedEncryptedBackup,inspectSegmentedEncryptedBackup};
