'use strict';
// PRIVATE GITHUB DAILY BACKUP VAULT — development-only, not wired to Actions.
// Immutable once-per-UTC-day Contents creation and independently verified read.
// No retention deletes, automated source decisions, Discord I/O or restoration.
const crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const {inspectEncryptedOffsiteHistoricalBackup}
  =require('./event-capacity-historical-offsite-backup');
const ERROR='Kings Event Capacity private backup vault unavailable; reconcile manually.';
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SHA=/^[0-9a-f]{40}$/;
const DATE=/^20\d{2}-\d{2}-\d{2}$/;
const MAX_FILE=850*1024,MAX_HTTP=2*1024*1024;
const utf8=new TextDecoder('utf-8',{fatal:true});
function fail(){throw new Error(ERROR);}
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype||
    Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))fail();
}
function validRepo(repo){
  if(typeof repo!=='string'||!REPO.test(repo)||
    repo.toLowerCase()==='stinkesocke107/kings-logistics-automation'||
    repo.split('/').some(x=>x==='.'||x==='..'||x.startsWith('.')||
      x.endsWith('.')||x.includes('..')))fail();
  return repo;
}
function date(value){
  if(typeof value!=='string'||!DATE.test(value)||
    !Number.isFinite(Date.parse(value+'T00:00:00.000Z'))||
    new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)!==value)
    fail();
  return value;
}
function blobSha(bytes){
  return crypto.createHash('sha1').update('blob '+bytes.length+'\0')
    .update(bytes).digest('hex');
}
function pathFor(day){return 'capacity-backups/'+date(day)+'.enc.json';}
async function readJson(response,allowed){
  if(!response||!allowed.includes(response.status)||
    !response.ok||!response.body?.getReader)fail();
  const header=response.headers?.get?.('content-length');
  if(header!==null&&header!==undefined&&
    (!/^\d+$/.test(header)||Number(header)>MAX_HTTP))fail();
  const reader=response.body.getReader(),chunks=[];let len=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(!(value instanceof Uint8Array))fail();
      len+=value.length;if(len>MAX_HTTP)fail();
      chunks.push(Buffer.from(value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  try{return JSON.parse(utf8.decode(Buffer.concat(chunks,len)));}catch{fail();}
}
function decode(meta,path){
  if(!meta||meta.type!=='file'||meta.path!==path||
    meta.encoding!=='base64'||!SHA.test(String(meta.sha||''))||
    !Number.isSafeInteger(meta.size)||meta.size<1||meta.size>MAX_FILE||
    typeof meta.content!=='string')fail();
  const raw=meta.content.replace(/\n/g,'');
  if(raw.length>Math.ceil(MAX_FILE/3)*4+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))fail();
  const bytes=Buffer.from(raw,'base64');
  if(bytes.length!==meta.size||bytes.toString('base64')!==raw||
    blobSha(bytes)!==meta.sha)fail();
  let parsed;
  try{parsed=JSON.parse(utf8.decode(bytes));}catch{fail();}
  exact(parsed,['version','envelope']);
  if(parsed.version!==1)fail();
  return {bytes,sha:meta.sha,envelope:parsed.envelope};
}
function createPrivateHistoricalBackupVault({
  repository,dataRepository,witnessRepository,token,
  scope,ownerPublicKey,encryptionSecret,backupSecret,
  transport=fetch,nowMs=()=>Date.now()
}={}){
  const repo=validRepo(repository);
  const data=validRepo(dataRepository),witness=validRepo(witnessRepository);
  if(new Set([repo.toLowerCase(),data.toLowerCase(),witness.toLowerCase()])
      .size!==3||typeof token!=='string'||token.length<20||
    token.length>1024||/[\r\n]/.test(token)||
    typeof encryptionSecret!=='string'||typeof backupSecret!=='string'||
    encryptionSecret===backupSecret||typeof transport!=='function'||
    typeof nowMs!=='function')fail();
  const base='https://api.github.com/repos/'+repo;
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Capacity-Independent-Backup-Vault'};
  async function request(method,route,body=null,allowed=[200]){
    let response;
    try{
      response=await transport(base+route,{method,
        headers:body===null?headers:{...headers,'Content-Type':'application/json'},
        redirect:'manual',signal:AbortSignal.timeout(15000),
        ...(body===null?{}:{body:JSON.stringify(body)})});
    }catch{fail();}
    if(!response||!allowed.includes(response.status)||
      (response.status!==404&&!response.ok))fail();
    if(response.status===404)return null;
    return readJson(response,allowed);
  }
  async function verifyPrivate(){
    const data=await request('GET','');
    if(!data||data.full_name!==repo||data.private!==true||
      data.archived!==false||data.disabled===true||
      data.default_branch!=='main')fail();
  }
  async function fetchFile(day,{missing=false}={}){
    const path=pathFor(day);
    const result=await request('GET','/contents/'+path+'?ref=main',
      null,missing?[200,404]:[200]);
    return result===null?null:decode(result,path);
  }
  function inspect(envelope,ownerReceipt){
    return inspectEncryptedOffsiteHistoricalBackup({envelope,
      expectedOwnerReceipt:ownerReceipt,scope,ownerPublicKey,
      encryptionSecret,backupSecret,nowMs:nowMs()});
  }
  async function readDaily({day,ownerReceipt}={}){
    try{
      const d=date(day);
      await verifyPrivate();
      const first=await fetchFile(d);
      if(first.envelope.day!==d)fail();
      const verified=inspect(first.envelope,ownerReceipt);
      const again=await fetchFile(d);
      if(first.sha!==again.sha||!again.bytes.equals(first.bytes))fail();
      await verifyPrivate();
      return Object.freeze({state:'EncryptedBackupVerified',
        day:d,revision:verified.journal.revision,
        ownerCheckpoint:verified.checkpoint,
        offsiteRepoVerifiedPrivate:true,
        isolatedRestoreVerified:true,productionRestorePerformed:false,
        historicalCoverageCertified:false,freeSlotsCertified:false});
    }catch{fail();}
  }
  async function writeDailyOnce({envelope,ownerReceipt}={}){
    try{
      if(!envelope||typeof envelope!=='object')fail();
      const d=date(envelope.day),time=nowMs();
      if(!Number.isFinite(time)||
        new Date(time).toISOString().slice(0,10)!==d)fail();
      // Authenticate ciphertext and the externally signed owner checkpoint
      // BEFORE touching remote state; public logs never include plaintext.
      const verified=inspect(envelope,ownerReceipt);
      if(verified.productionRestorePerformed!==false)fail();
      const bytes=Buffer.from(JSON.stringify({version:1,envelope}),'utf8');
      if(bytes.length>MAX_FILE)fail(); // GitHub Contents has small-file bounds.
      await verifyPrivate();
      // A missing file is required; a same-day backup cannot be overwritten.
      if(await fetchFile(d,{missing:true})!==null)fail();
      const path=pathFor(d);
      const response=await request('PUT','/contents/'+path,{
        branch:'main',
        message:'Store immutable encrypted Kings historical daily backup',
        content:bytes.toString('base64')
      },[201]);
      if(response?.content?.sha!==blobSha(bytes)||
        !SHA.test(String(response?.commit?.sha||'')))fail();
      // A remote write may persist even if response/verification fails.
      // Do not retry or delete automatically: operator must read/reconcile.
      const actual=await fetchFile(d);
      if(actual.sha!==blobSha(bytes)||!actual.bytes.equals(bytes))fail();
      await verifyPrivate();
      return Object.freeze({state:'StoredPendingIndependentRetentionAudit',
        day:d,revision:verified.journal.revision,
        encrypted:true,privateRepositoryChecked:true,
        offsiteBackupStored:true,retentionEnforced:false,
        monthlyRestoreIndependentlyVerified:false,
        historicalCoverageCertified:false,freeSlotsCertified:false});
    }catch{fail();}
  }
  return Object.freeze({readDaily,writeDailyOnce});
}
module.exports={createPrivateHistoricalBackupVault};
