'use strict';
// DRAFT / NOT DEPLOYED. One-owner-approved signed historical transition per
// private GitHub CAS update. Content-addressed encrypted segments are staged
// first; the CURRENT manifest is switched last with SHA compare-and-swap.
// A failed/ambiguous write never retries, resets or reports free slots.
const crypto=require('node:crypto');
const {isDeepStrictEqual,TextDecoder}=require('node:util');
const {createPrivateHistoricalArchiveReader,verifyHistoricalArchivePin}
  =require('./event-capacity-historical-github-reader');
const {openEncryptedHistoricalArchive}
  =require('./event-capacity-historical-encrypted-archive');
const ERROR='Kings Event Capacity historical archive write blocked; reconcile privately.';
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SNOWFLAKE=/^\d{17,22}$/;
const BLOB=/^[a-f0-9]{40}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const INDEX='capacity-history/current.json';
const PREFIX='capacity-history/segments/';
const MAX_INDEX=256*1024,MAX_SEGMENT=512*1024,MAX_RESPONSE=950*1024;
const decoder=new TextDecoder('utf-8',{fatal:true});
function fail(){throw new Error(ERROR);}
function exact(x,keys){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.getPrototypeOf(x)!==Object.prototype||
    Object.keys(x).sort().join(',')!==keys.slice().sort().join(','))fail();
}
function scopeOf(s){
  exact(s,['guildId','forumId']);
  if(typeof s.guildId!=='string'||!SNOWFLAKE.test(s.guildId)||
    typeof s.forumId!=='string'||!SNOWFLAKE.test(s.forumId))fail();
  return {guildId:s.guildId,forumId:s.forumId};
}
function repoOf(name){
  if(typeof name!=='string'||!REPO.test(name)||
    name.toLowerCase()==='stinkesocke107/kings-logistics-automation'||
    name.split('/').some(x=>x==='.'||x==='..'||x.startsWith('.')||
      x.endsWith('.')||x.includes('..')))fail();
  return name;
}
function sha1(data){
  return crypto.createHash('sha1').update('blob '+data.length+'\0')
    .update(data).digest('hex');
}
function sha256(data){return crypto.createHash('sha256').update(data).digest('hex');}
function asBase64(v){
  if(typeof v!=='string'||!v.length||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))fail();
  const b=Buffer.from(v,'base64');
  if(b.toString('base64')!==v)fail();
  return b;
}
async function parseResponse(response){
  if(!response||![200,201].includes(response.status)||
    response.ok!==true||!response.body?.getReader)fail();
  const len=response.headers?.get?.('content-length');
  if(len!==null&&len!==undefined&&
    (!/^\d+$/.test(len)||Number(len)>MAX_RESPONSE))fail();
  const reader=response.body.getReader(),chunks=[];let count=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(!(value instanceof Uint8Array))fail();
      count+=value.byteLength;if(count>MAX_RESPONSE)fail();
      chunks.push(Buffer.from(value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  try{return JSON.parse(decoder.decode(Buffer.concat(chunks,count)));}
  catch{fail();}
}
function unpack(file,path,cap){
  if(!file||file.type!=='file'||file.path!==path||
    !Number.isSafeInteger(file.size)||file.size<1||file.size>cap||
    !BLOB.test(String(file.sha||''))||file.encoding!=='base64'||
    typeof file.content!=='string')fail();
  const b64=file.content.replace(/\n/g,'');
  if(b64.length>Math.ceil(cap/3)*4+4)fail();
  const bytes=asBase64(b64);
  if(bytes.length!==file.size||sha1(bytes)!==file.sha)fail();
  return {sha:file.sha,digest:sha256(bytes),bytes};
}
function createPrivateHistoricalArchiveWriter({
  repository,token,scope,ownerPublicKey,previousOwnerReceipt,
  nextOwnerReceipt,encryptionSecret,transport=fetch,nowMs=()=>Date.now()
}={}){
  const repo=repoOf(repository),scoped=scopeOf(scope);
  if(typeof token!=='string'||token.length<20||token.length>1024||
    /[\r\n]/.test(token)||typeof encryptionSecret!=='string'||
    Buffer.byteLength(encryptionSecret,'utf8')<32||
    typeof transport!=='function'||typeof nowMs!=='function')fail();
  const base='https://api.github.com/repos/'+repo;
  const headers={
    Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Capacity-Historical-One-Revision-CAS'
  };
  async function api(method,route,payload=null,accepted=[200]){
    let response;
    try{
      response=await transport(base+route,{
        method,headers:payload===null?headers:
          {...headers,'Content-Type':'application/json'},
        redirect:'manual',signal:AbortSignal.timeout(15000),
        ...(payload===null?{}:{body:JSON.stringify(payload)})
      });
    }catch{fail();}
    if(!response||!accepted.includes(response.status)||
      (response.status!==404&&response.ok!==true))fail();
    if(response.status===404)return null;
    return parseResponse(response);
  }
  async function confirmPrivate(){
    const metadata=await api('GET','');
    if(!metadata||metadata.full_name!==repo||metadata.private!==true||
      metadata.archived!==false||metadata.disabled===true||
      metadata.default_branch!=='main')fail();
  }
  async function fileAt(path,limit,{allowMissing=false}={}){
    const remote=await api('GET','/contents/'+path+'?ref=main',null,
      allowMissing?[200,404]:[200]);
    return remote===null?null:unpack(remote,path,limit);
  }
  function checkReceipt(receipt){
    return verifyHistoricalArchivePin({receipt,scope:scoped,ownerPublicKey,
      nowMs:nowMs()});
  }
  async function commitOne({archive}={}){
    try{
      // The *new* offline receipt must be signed before ANY network write,
      // using the exact pre-encrypted candidate archive bytes.
      const oldPin=checkReceipt(previousOwnerReceipt);
      const newPin=checkReceipt(nextOwnerReceipt);
      if(newPin.revision!==oldPin.revision+1||
        newPin.tip===oldPin.tip||
        Date.parse(nextOwnerReceipt.payload.issuedAt)<
          Date.parse(previousOwnerReceipt.payload.issuedAt))fail();
      const future=openEncryptedHistoricalArchive({
        archive,expectedCheckpoint:newPin,scope:scoped,
        ownerPublicKey,encryptionSecret
      });
      if(future.journal.revision!==newPin.revision)fail();
      // Fetch authoritative old archive with actual private GitHub metadata,
      // exact prior owner-signed pin and full cryptographic journal replay.
      const previousReader=createPrivateHistoricalArchiveReader({
        repository:repo,token,scope:scoped,ownerPublicKey,
        ownerReceipt:previousOwnerReceipt,encryptionSecret,transport,nowMs
      });
      const prior=await previousReader.read();
      const before=prior.journal,after=future.journal;
      if(!BLOB.test(String(prior.indexSha||''))||
        !DIGEST.test(String(prior.indexDigest||''))||
        !isDeepStrictEqual(prior.checkpoint,oldPin)||
        after.revision!==before.revision+1||
        after.createdAt!==before.createdAt||
        !isDeepStrictEqual(after.scope,before.scope)||
        !isDeepStrictEqual(after.history.slice(0,-1),before.history)||
        !after.history.length||
        after.history.at(-1).payload.previousTip!==before.tip)fail();
      const manifest=archive.manifest;
      exact(archive,['manifest','parts']);
      if(!Array.isArray(archive.parts)||
        archive.parts.length!==manifest.parts.length)fail();
      const current=await fileAt(INDEX,MAX_INDEX);
      if(current.sha!==prior.indexSha||current.digest!==prior.indexDigest)
        fail();
      // Content-addressed files are write-once. Existing exact bytes may
      // be reused, but NEVER overwritten, even by an authorized signer.
      for(let i=0;i<archive.parts.length;i++){
        const part=manifest.parts[i],path=PREFIX+part.ciphertextDigest+'.bin';
        const data=asBase64(archive.parts[i]);
        if(data.length!==part.byteLength||data.length>MAX_SEGMENT||
          sha256(data)!==part.ciphertextDigest)fail();
        const existing=await fileAt(path,MAX_SEGMENT,{allowMissing:true});
        if(existing!==null){
          if(existing.digest!==part.ciphertextDigest||
            !existing.bytes.equals(data))fail();
          continue;
        }
        const result=await api('PUT','/contents/'+path,{
          message:'Store immutable encrypted Kings historical event segment',
          branch:'main',content:data.toString('base64')
        },[201]);
        if(!result||result.content?.sha!==sha1(data)||
          !BLOB.test(String(result.commit?.sha||'')))fail();
        const check=await fileAt(path,MAX_SEGMENT);
        if(check.sha!==sha1(data)||check.digest!==part.ciphertextDigest||
          !check.bytes.equals(data))fail();
      }
      // Last check immediately before atomic manifest pointer switch.
      await confirmPrivate();
      const still=await fileAt(INDEX,MAX_INDEX);
      if(still.sha!==prior.indexSha||still.digest!==prior.indexDigest)fail();
      const index=Buffer.from(JSON.stringify({version:1,manifest}),'utf8');
      if(index.length>MAX_INDEX)fail();
      const response=await api('PUT','/contents/'+INDEX,{
        message:'Advance owner-signed Kings historical event archive',
        branch:'main',sha:prior.indexSha,content:index.toString('base64')
      },[200]);
      if(!response||response.content?.sha!==sha1(index)||
        !BLOB.test(String(response.commit?.sha||'')))fail();
      // If this final verification fails, the remote commit MAY exist:
      // return a generic error and require manual reconciliation, no retry.
      const nextReader=createPrivateHistoricalArchiveReader({
        repository:repo,token,scope:scoped,ownerPublicKey,
        ownerReceipt:nextOwnerReceipt,encryptionSecret,transport,nowMs
      });
      const verified=await nextReader.read();
      if(verified.indexSha!==sha1(index)||
        verified.indexDigest!==sha256(index)||
        !isDeepStrictEqual(verified.checkpoint,newPin)||
        !isDeepStrictEqual(verified.journal,after))fail();
      return Object.freeze({
        state:'StoredPendingIndependentOwnerHighwater',
        repositoryWriteVerified:true,revision:newPin.revision,
        ownerReceiptRetentionRequired:true,
        historicalCoverageCertified:false,
        sourceEvidenceAuthenticityVerified:false,
        freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({commitOne});
}
module.exports={createPrivateHistoricalArchiveWriter};
