'use strict';
// OFFLINE ONLY: segment and encrypt owner-signed historical decisions.
// The caller must persist ciphertext in an independently permissioned PRIVATE
// store and separately retain the returned checkpoint outside that store.
// This codec alone certifies neither complete history nor free Event slots.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {verifyHistoricalJournal}=require('./event-capacity-historical-lifecycle-journal');
const DOMAIN='kings-event-capacity-historical-encrypted-archive-v1';
const ERROR='Kings Event Capacity historical archive invalid or unverified.';
const DIGEST=/^[a-f0-9]{64}$/;
const SNOWFLAKE=/^\d{17,22}$/;
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const MAX_PARTS=512,MAX_ENTRIES=24000,MAX_PART_BYTES=512*1024;
const MAX_TOTAL_BYTES=36*1024*1024,MAX_SECRET_BYTES=4096;
function fail(){throw new Error(ERROR);}
function exact(v,fields){
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.getPrototypeOf(v)!==Object.prototype||
    Object.keys(v).sort().join(',')!==fields.slice().sort().join(','))fail();
}
function scopeOf(scope){
  exact(scope,['guildId','forumId']);
  if(typeof scope.guildId!=='string'||!SNOWFLAKE.test(scope.guildId)||
    typeof scope.forumId!=='string'||!SNOWFLAKE.test(scope.forumId))fail();
  return {guildId:scope.guildId,forumId:scope.forumId};
}
function keyOf(secret,scope){
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32||
    Buffer.byteLength(secret,'utf8')>MAX_SECRET_BYTES)fail();
  return Buffer.from(crypto.hkdfSync('sha256',Buffer.from(secret,'utf8'),
    Buffer.from(DOMAIN+'\0'+scope.guildId+'\0'+scope.forumId),
    Buffer.from('offline-segment-encryption'),32));
}
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function canonicalCheckpoint(manifest){
  return Object.freeze({revision:manifest.revision,tip:manifest.tip,
    archiveDigest:sha(Buffer.from(DOMAIN+'\0'+JSON.stringify(manifest)))});
}
function validateManifest(manifest,scope){
  exact(manifest,['version','scope','createdAt','revision','tip','parts',
    'historicalCoverageCertified','freeSlotsCertified']);
  if(manifest.version!==1||!isDeepStrictEqual(scopeOf(manifest.scope),scope)||
    !Number.isSafeInteger(manifest.revision)||manifest.revision<0||
    manifest.revision>MAX_ENTRIES||!DIGEST.test(manifest.tip)||
    typeof manifest.createdAt!=='string'||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(manifest.createdAt)||
    !Number.isFinite(Date.parse(manifest.createdAt))||
    new Date(manifest.createdAt).toISOString()!==manifest.createdAt||
    !Array.isArray(manifest.parts)||manifest.parts.length>MAX_PARTS||
    manifest.historicalCoverageCertified!==false||
    manifest.freeSlotsCertified!==false)fail();
  let cursor=1,prior=null;
  for(let i=0;i<manifest.parts.length;i++){
    const p=manifest.parts[i];
    exact(p,['index','month','firstRevision','lastRevision','previousTip',
      'tip','ciphertextDigest','byteLength']);
    if(p.index!==i||!MONTH.test(p.month)||
      !Number.isSafeInteger(p.firstRevision)||p.firstRevision!==cursor||
      !Number.isSafeInteger(p.lastRevision)||p.lastRevision<cursor||
      p.lastRevision-cursor>=128||!DIGEST.test(p.previousTip)||
      !DIGEST.test(p.tip)||!DIGEST.test(p.ciphertextDigest)||
      !Number.isSafeInteger(p.byteLength)||p.byteLength<29||
      p.byteLength>MAX_PART_BYTES||
      (prior!==null&&p.previousTip!==prior))fail();
    cursor=p.lastRevision+1;prior=p.tip;
  }
  if(cursor-1!==manifest.revision||
    (manifest.parts.length>0&&prior!==manifest.tip)||
    (manifest.parts.length===0&&manifest.revision!==0))fail();
}
function aad(scope,manifest,meta){
  return Buffer.from(JSON.stringify({domain:DOMAIN,scope,
    createdAt:manifest.createdAt,index:meta.index,month:meta.month,
    firstRevision:meta.firstRevision,lastRevision:meta.lastRevision,
    previousTip:meta.previousTip,tip:meta.tip}));
}
function encryptPart(plaintext,key,aadBytes){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aadBytes);
  const content=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),content]);
}
function decryptPart(bytes,key,aadBytes){
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
  decipher.setAAD(aadBytes);
  decipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
}
function createEncryptedHistoricalArchive({journal,scope,ownerPublicKey,encryptionSecret}={}){
  const scoped=scopeOf(scope),key=keyOf(encryptionSecret,scoped);
  try{
    verifyHistoricalJournal(journal,{scope:scoped,ownerPublicKey});
    const manifest={version:1,scope:scoped,createdAt:journal.createdAt,
      revision:journal.revision,tip:journal.tip,parts:[],
      historicalCoverageCertified:false,freeSlotsCertified:false};
    const parts=[];
    let total=0;
    for(let start=0;start<journal.history.length;){
      const month=journal.history[start].payload.reviewedAt.slice(0,7);
      let end=start+1;
      while(end<journal.history.length&&end-start<128&&
        journal.history[end].payload.reviewedAt.slice(0,7)===month)end++;
      const entries=journal.history.slice(start,end);
      const meta={index:parts.length,month,firstRevision:start+1,
        lastRevision:end,previousTip:entries[0].payload.previousTip,
        tip:entries.at(-1).entryTip};
      const payload=Buffer.from(JSON.stringify({version:1,entries}));
      const bytes=encryptPart(payload,key,aad(scoped,manifest,meta));
      total+=bytes.length;
      if(bytes.length>MAX_PART_BYTES||total>MAX_TOTAL_BYTES||
        parts.length>=MAX_PARTS)fail();
      manifest.parts.push({...meta,ciphertextDigest:sha(bytes),byteLength:bytes.length});
      parts.push(bytes.toString('base64'));
      start=end;
    }
    validateManifest(manifest,scoped);
    return {archive:{manifest,parts},checkpoint:canonicalCheckpoint(manifest),
      historicalCoverageCertified:false,freeSlotsCertified:false};
  }catch{fail();}finally{key.fill(0);}
}
function openEncryptedHistoricalArchive({archive,expectedCheckpoint,scope,
  ownerPublicKey,encryptionSecret}={}){
  const scoped=scopeOf(scope),key=keyOf(encryptionSecret,scoped);
  try{
    exact(archive,['manifest','parts']);
    validateManifest(archive.manifest,scoped);
    exact(expectedCheckpoint,['revision','tip','archiveDigest']);
    const manifest=archive.manifest;
    const actual=canonicalCheckpoint(manifest);
    if(expectedCheckpoint.revision!==actual.revision||
      expectedCheckpoint.tip!==actual.tip||
      !DIGEST.test(expectedCheckpoint.archiveDigest)||
      !crypto.timingSafeEqual(Buffer.from(expectedCheckpoint.archiveDigest,'hex'),
        Buffer.from(actual.archiveDigest,'hex'))||
      !Array.isArray(archive.parts)||archive.parts.length!==manifest.parts.length)fail();
    let total=0;
    const history=[];
    for(let i=0;i<archive.parts.length;i++){
      const value=archive.parts[i],meta=manifest.parts[i];
      if(typeof value!=='string'||value.length%4!==0||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)||
        value.length>Math.ceil(MAX_PART_BYTES/3)*4+4)fail();
      const bytes=Buffer.from(value,'base64');
      if(bytes.length!==meta.byteLength||
        bytes.toString('base64')!==value||sha(bytes)!==meta.ciphertextDigest||
        (total+=bytes.length)>MAX_TOTAL_BYTES)fail();
      const decrypted=decryptPart(bytes,key,aad(scoped,manifest,meta));
      if(decrypted.length>MAX_PART_BYTES)fail();
      const record=JSON.parse(decrypted.toString('utf8'));
      exact(record,['version','entries']);
      if(record.version!==1||!Array.isArray(record.entries)||
        record.entries.length!==meta.lastRevision-meta.firstRevision+1)fail();
      for(const entry of record.entries){
        if(!entry||entry.payload?.reviewedAt?.slice(0,7)!==meta.month)fail();
        history.push(entry);
      }
      if(record.entries[0].payload.previousTip!==meta.previousTip||
        record.entries.at(-1).entryTip!==meta.tip)fail();
    }
    const events={};
    for(let i=0;i<history.length;i++){
      const p=history[i].payload;
      if(typeof p.ref!=='string'||
        !['accept','cancel','reschedule','complete'].includes(p.action))fail();
      events[p.ref]={status:({accept:'Accepted',cancel:'Cancelled',
        reschedule:'Rescheduled',complete:'Completed'})[p.action],
        category:p.category,departureAtUtc:p.departureAtUtc,revision:i+1};
    }
    const journal={version:1,scope:scoped,revision:manifest.revision,
      tip:manifest.tip,createdAt:manifest.createdAt,events,history,
      historicalCoverageCertified:false,freeSlotsCertified:false};
    verifyHistoricalJournal(journal,{scope:scoped,ownerPublicKey});
    return {journal,checkpoint:actual,archiveVerified:true,
      historicalCoverageCertified:false,freeSlotsCertified:false};
  }catch{fail();}finally{key.fill(0);}
}
module.exports={createEncryptedHistoricalArchive,openEncryptedHistoricalArchive};
