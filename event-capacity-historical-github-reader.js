'use strict';
// OFFLINE DEVELOPMENT ONLY. Read and verify an encrypted signed historical
// archive from a separately configured PRIVATE GitHub repository. No writes,
// discovery, Discord traffic, runtime integration or free-slot certification.
// The owner's Ed25519 signing PRIVATE key must remain offline.
const crypto=require('node:crypto');
const {isDeepStrictEqual,TextDecoder}=require('node:util');
const {openEncryptedHistoricalArchive}=require('./event-capacity-historical-encrypted-archive');
const DOMAIN='kings-capacity-historical-github-archive-pin-v1';
const ERROR='Kings Event Capacity private historical archive unavailable or unverified.';
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SNOWFLAKE=/^\d{17,22}$/;
const HASH=/^[0-9a-f]{64}$/;
const BLOB=/^[0-9a-f]{40}$/;
const SIGNATURE=/^[A-Za-z0-9+/]{86}==$/;
const INDEX='capacity-history/current.json';
const SEGMENTS='capacity-history/segments/';
const MAX_INDEX_BYTES=256*1024;
const MAX_SEGMENT_BYTES=512*1024;
const MAX_HTTP_BYTES=950*1024;
const MAX_PARTS=512;
const decoder=new TextDecoder('utf-8',{fatal:true});
function fail(){throw new Error(ERROR);}
function exact(v,names){
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.getPrototypeOf(v)!==Object.prototype||
    Object.keys(v).sort().join(',')!==names.slice().sort().join(','))fail();
}
function scoped(s){
  exact(s,['guildId','forumId']);
  if(typeof s.guildId!=='string'||!SNOWFLAKE.test(s.guildId)||
    typeof s.forumId!=='string'||!SNOWFLAKE.test(s.forumId))fail();
  return {guildId:s.guildId,forumId:s.forumId};
}
function validRepo(value){
  if(typeof value!=='string'||!REPO.test(value)||
    value.toLowerCase()==='stinkesocke107/kings-logistics-automation'||
    value.split('/').some(p=>p==='.'||p==='..'||p.startsWith('.')||
      p.endsWith('.')||p.includes('..')))fail();
  return value;
}
function validUtc(time){
  if(typeof time!=='string'||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(time)||
    !Number.isFinite(Date.parse(time))||new Date(time).toISOString()!==time)fail();
  return time;
}
function pinPayload(pin){
  exact(pin,['version','scope','revision','tip','archiveDigest','issuedAt']);
  const s=scoped(pin.scope);
  if(pin.version!==1||!Number.isSafeInteger(pin.revision)||pin.revision<0||
    !HASH.test(pin.tip)||!HASH.test(pin.archiveDigest))fail();
  validUtc(pin.issuedAt);
  return {version:1,scope:s,revision:pin.revision,tip:pin.tip,
    archiveDigest:pin.archiveDigest,issuedAt:pin.issuedAt};
}
function pinMessage(payload){
  return Buffer.from(DOMAIN+'\0'+JSON.stringify(payload),'utf8');
}
function ed25519Key(value,privateKey){
  if(typeof value!=='string'||
    !value.startsWith(privateKey?'-----BEGIN PRIVATE KEY-----\n':
      '-----BEGIN PUBLIC KEY-----\n'))fail();
  try{
    const key=privateKey?crypto.createPrivateKey(value):crypto.createPublicKey(value);
    if(key.asymmetricKeyType!=='ed25519')fail();
    return key;
  }catch{fail();}
}
function issueHistoricalArchivePinOffline({scope,checkpoint,issuedAt,ownerPrivateKey}={}){
  // Invoke with a separately controlled OFFLINE signing key only.
  const s=scoped(scope);
  exact(checkpoint,['revision','tip','archiveDigest']);
  const payload=pinPayload({version:1,scope:s,...checkpoint,issuedAt});
  const signature=crypto.sign(null,pinMessage(payload),
    ed25519Key(ownerPrivateKey,true)).toString('base64');
  return {payload,signature};
}
function verifyHistoricalArchivePin({receipt,scope,ownerPublicKey,nowMs=Date.now()}={}){
  exact(receipt,['payload','signature']);
  if(!SIGNATURE.test(receipt.signature)||!Number.isFinite(nowMs))fail();
  const payload=pinPayload(receipt.payload);
  if(!isDeepStrictEqual(payload.scope,scoped(scope))||
    Date.parse(payload.issuedAt)>nowMs+60000)fail();
  const signature=Buffer.from(receipt.signature,'base64');
  if(signature.length!==64||signature.toString('base64')!==receipt.signature||
    !crypto.verify(null,pinMessage(payload),
      ed25519Key(ownerPublicKey,false),signature))fail();
  return Object.freeze({revision:payload.revision,tip:payload.tip,
    archiveDigest:payload.archiveDigest});
}
function blobSha(bytes){
  return crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes)
    .digest('hex');
}
function decodeContents(value,path,cap){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype)fail();
  if(value.type!=='file'||value.path!==path||
    !Number.isSafeInteger(value.size)||value.size<1||value.size>cap||
    !BLOB.test(value.sha)||value.encoding!=='base64'||
    typeof value.content!=='string')fail();
  const base64=value.content.replace(/\n/g,'');
  if(base64.length>Math.ceil(cap/3)*4+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))fail();
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length!==value.size||bytes.toString('base64')!==base64||
    blobSha(bytes)!==value.sha)fail();
  return {sha:value.sha,bytes};
}
async function readResponse(resp){
  if(!resp||resp.status!==200||resp.ok!==true||!resp.body?.getReader)fail();
  const len=resp.headers?.get?.('content-length');
  if(len!==null&&len!==undefined&&
    (!/^\d+$/.test(len)||Number(len)>MAX_HTTP_BYTES))fail();
  const reader=resp.body.getReader();
  const chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))fail();
      size+=value.length;
      if(size>MAX_HTTP_BYTES)fail();
      chunks.push(Buffer.from(value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  try{return JSON.parse(decoder.decode(Buffer.concat(chunks,size)));}catch{fail();}
}
function indexOf(file){
  let value;
  try{value=JSON.parse(decoder.decode(file.bytes));}catch{fail();}
  exact(value,['version','manifest']);
  if(value.version!==1)fail();
  const m=value.manifest;
  if(!m||m.version!==1||!Array.isArray(m.parts)||
    m.parts.length>MAX_PARTS||m.historicalCoverageCertified!==false||
    m.freeSlotsCertified!==false)fail();
  for(let i=0;i<m.parts.length;i++){
    const part=m.parts[i];
    if(!part||part.index!==i||!HASH.test(part.ciphertextDigest)||
      !Number.isSafeInteger(part.byteLength)||part.byteLength<29||
      part.byteLength>MAX_SEGMENT_BYTES)fail();
  }
  return value;
}
function createPrivateHistoricalArchiveReader({
  repository,token,scope,ownerPublicKey,ownerReceipt,
  encryptionSecret,transport=fetch,nowMs=()=>Date.now()
}={}){
  const repo=validRepo(repository),s=scoped(scope);
  if(typeof token!=='string'||token.length<20||token.length>1024||
    /[\r\n]/.test(token)||typeof transport!=='function'||
    typeof nowMs!=='function'||typeof encryptionSecret!=='string'||
    Buffer.byteLength(encryptionSecret,'utf8')<32)fail();
  // The PIN is signed by the offline owner: caller-supplied flags alone cannot
  // authenticate source archive metadata or an owner highwater.
  const base='https://api.github.com/repos/'+repo;
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Capacity-Private-History-ReadOnly'};
  async function request(path){
    let response;
    try{response=await transport(base+path,{method:'GET',headers,
      redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{fail();}
    return readResponse(response);
  }
  async function readFile(path,limit){
    const json=await request('/contents/'+path+'?ref=main');
    return decodeContents(json,path,limit);
  }
  async function privateRepo(){
    const info=await request('');
    if(!info||info.full_name!==repo||info.private!==true||
      info.archived!==false||info.disabled===true||
      info.default_branch!=='main')fail();
  }
  async function read(){
    try{
      const pinned=verifyHistoricalArchivePin({receipt:ownerReceipt,scope:s,
        ownerPublicKey,nowMs:nowMs()});
      await privateRepo();
      const first=await readFile(INDEX,MAX_INDEX_BYTES);
      const {manifest}=indexOf(first);
      if(!isDeepStrictEqual(scoped(manifest.scope),s)||
        manifest.revision!==pinned.revision||manifest.tip!==pinned.tip)fail();
      const parts=[];
      for(const part of manifest.parts){
        const path=SEGMENTS+part.ciphertextDigest+'.bin';
        const file=await readFile(path,MAX_SEGMENT_BYTES);
        if(file.bytes.length!==part.byteLength||
          crypto.createHash('sha256').update(file.bytes).digest('hex')!==
            part.ciphertextDigest)fail();
        parts.push(file.bytes.toString('base64'));
      }
      const verified=openEncryptedHistoricalArchive({
        archive:{manifest,parts},expectedCheckpoint:pinned,
        scope:s,ownerPublicKey,encryptionSecret
      });
      // Catch manifest updates between segment downloads and the final check.
      const second=await readFile(INDEX,MAX_INDEX_BYTES);
      if(second.sha!==first.sha||!second.bytes.equals(first.bytes))fail();
      await privateRepo();
      verifyHistoricalArchivePin({receipt:ownerReceipt,scope:s,
        ownerPublicKey,nowMs:nowMs()});
      return Object.freeze({journal:verified.journal,
        checkpoint:verified.checkpoint,repositoryVerifiedPrivate:true,
        encryptedArchiveIntegrityVerified:true,
        historicalCoverageCertified:false,sourceEvidenceAuthenticityVerified:false,
        freeSlotsCertified:false});
    }catch{fail();}
  }
  return Object.freeze({read});
}
module.exports={issueHistoricalArchivePinOffline,verifyHistoricalArchivePin,
  createPrivateHistoricalArchiveReader};
