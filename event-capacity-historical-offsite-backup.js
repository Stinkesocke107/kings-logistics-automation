'use strict';
// DRAFT/NO I/O. Independently encrypted backup envelope for private, signed
// historical event archives. Does NOT write to offsite storage, delete files,
// certify real source completeness, or restore any production system.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {verifyHistoricalArchivePin}
  =require('./event-capacity-historical-github-reader');
const {openEncryptedHistoricalArchive}
  =require('./event-capacity-historical-encrypted-archive');
const DOMAIN='kings-capacity-historical-offsite-backup-v1';
const ERROR='Kings Event Capacity offsite historical backup invalid.';
const SNOWFLAKE=/^\d{17,22}$/;
const DIGEST=/^[0-9a-f]{64}$/;
const DATE=/^20\d{2}-\d{2}-\d{2}$/;
const MAX_BYTES=38*1024*1024;
function fail(){throw new Error(ERROR);}
function exact(v,keys){
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.getPrototypeOf(v)!==Object.prototype||
    Object.keys(v).sort().join(',')!==keys.slice().sort().join(','))fail();
}
function scopeOf(s){
  exact(s,['guildId','forumId']);
  if(typeof s.guildId!=='string'||!SNOWFLAKE.test(s.guildId)||
    typeof s.forumId!=='string'||!SNOWFLAKE.test(s.forumId))fail();
  return {guildId:s.guildId,forumId:s.forumId};
}
function secretOf(value){
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')<32||
    Buffer.byteLength(value,'utf8')>4096)fail();
  return value;
}
function dayOf(value){
  if(typeof value!=='string'||!DATE.test(value)||
    !Number.isFinite(Date.parse(value+'T00:00:00.000Z'))||
    new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value)fail();
  return value;
}
function reviewDay(day){
  return new Date(Date.parse(day+'T00:00:00.000Z')+
    90*86400000).toISOString().slice(0,10);
}
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function keyOf(secret,scope){
  return Buffer.from(crypto.hkdfSync('sha256',Buffer.from(secret),
    Buffer.from(DOMAIN+'\0'+scope.guildId+'\0'+scope.forumId),
    Buffer.from('offsite-private-backup'),32));
}
function aad(scope,day,reviewOn){
  return Buffer.from(DOMAIN+'\0'+scope.guildId+'\0'+scope.forumId+
    '\0'+day+'\0'+reviewOn);
}
function validated(receipt,scope,ownerPublicKey,nowMs){
  return verifyHistoricalArchivePin({receipt,scope,ownerPublicKey,nowMs});
}
function createEncryptedOffsiteHistoricalBackup({archive,ownerReceipt,scope,
  ownerPublicKey,encryptionSecret,backupSecret,nowMs=Date.now()}={}){
  const sc=scopeOf(scope);
  secretOf(encryptionSecret);secretOf(backupSecret);
  if(encryptionSecret===backupSecret||!Number.isFinite(nowMs))fail();
  const day=new Date(nowMs).toISOString().slice(0,10),reviewOn=reviewDay(day);
  const checkpoint=validated(ownerReceipt,sc,ownerPublicKey,nowMs);
  const recovered=openEncryptedHistoricalArchive({archive,scope:sc,
    expectedCheckpoint:checkpoint,ownerPublicKey,encryptionSecret});
  if(recovered.freeSlotsCertified!==false)fail();
  const clear=Buffer.from(JSON.stringify({version:1,scope:sc,day,
    ownerReceipt,archive}),'utf8');
  if(clear.length>MAX_BYTES)fail();
  const key=keyOf(backupSecret,sc);
  try{
    const iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(aad(sc,day,reviewOn));
    const sealed=Buffer.concat([cipher.update(clear),cipher.final()]);
    const ciphertext=Buffer.concat([iv,cipher.getAuthTag(),sealed]);
    if(ciphertext.length>MAX_BYTES)fail();
    return Object.freeze({
      envelope:{version:1,scope:sc,day,retentionReviewOn:reviewOn,
        ciphertextDigest:sha(ciphertext),ciphertextBase64:ciphertext.toString('base64')},
      encrypted:true,offsiteStoragePerformed:false,
      archivalCompletenessCertified:false,freeSlotsCertified:false
    });
  }catch{fail();}finally{key.fill(0);}
}
function inspectEncryptedOffsiteHistoricalBackup({envelope,expectedOwnerReceipt,
  scope,ownerPublicKey,encryptionSecret,backupSecret,nowMs=Date.now()}={}){
  const sc=scopeOf(scope);
  secretOf(encryptionSecret);secretOf(backupSecret);
  if(encryptionSecret===backupSecret||!Number.isFinite(nowMs))fail();
  exact(envelope,['version','scope','day','retentionReviewOn',
    'ciphertextDigest','ciphertextBase64']);
  if(envelope.version!==1||!isDeepStrictEqual(scopeOf(envelope.scope),sc)||
    !DIGEST.test(envelope.ciphertextDigest)||
    reviewDay(dayOf(envelope.day))!==dayOf(envelope.retentionReviewOn)||
    Date.parse(envelope.day+'T00:00:00.000Z')>nowMs+86400000||
    typeof envelope.ciphertextBase64!=='string'||
    envelope.ciphertextBase64.length>Math.ceil(MAX_BYTES/3)*4+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope.ciphertextBase64))fail();
  const checkpoint=validated(expectedOwnerReceipt,sc,ownerPublicKey,nowMs);
  const bytes=Buffer.from(envelope.ciphertextBase64,'base64');
  if(bytes.length<29||bytes.length>MAX_BYTES||
    bytes.toString('base64')!==envelope.ciphertextBase64||
    sha(bytes)!==envelope.ciphertextDigest)fail();
  const key=keyOf(backupSecret,sc);
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
    decipher.setAAD(aad(sc,envelope.day,envelope.retentionReviewOn));
    decipher.setAuthTag(bytes.subarray(12,28));
    const raw=Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
    if(raw.length>MAX_BYTES)fail();
    const data=JSON.parse(raw.toString('utf8'));
    exact(data,['version','scope','day','ownerReceipt','archive']);
    if(data.version!==1||!isDeepStrictEqual(scopeOf(data.scope),sc)||
      data.day!==envelope.day||
      !isDeepStrictEqual(data.ownerReceipt,expectedOwnerReceipt))fail();
    const recovered=openEncryptedHistoricalArchive({archive:data.archive,
      expectedCheckpoint:checkpoint,scope:sc,ownerPublicKey,encryptionSecret});
    return Object.freeze({
      journal:recovered.journal,checkpoint:recovered.checkpoint,
      isolatedRestoreVerified:true,productionRestorePerformed:false,
      retentionReviewOn:envelope.retentionReviewOn,
      archivalCompletenessCertified:false,sourceEvidenceAuthenticityVerified:false,
      freeSlotsCertified:false
    });
  }catch{fail();}finally{key.fill(0);}
}
module.exports={createEncryptedOffsiteHistoricalBackup,
  inspectEncryptedOffsiteHistoricalBackup};
