'use strict';
// DRAFT PRIVATE SEGMENTED BACKUP STORAGE ADAPTER (NO LIVE WORKFLOW IMPORT).
// Encrypt and validate BEFORE network access, stage immutable SHA256-labelled
// chunks, publish the daily manifest LAST without an overwrite SHA, re-read
// full AES-GCM archive. Never retry ambiguous requests or delete orphans.
const crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const {packSegmentedEncryptedBackup,inspectSegmentedEncryptedBackup}
  =require('./event-capacity-historical-segmented-backup');
const ERROR='Kings Event Capacity private segmented backup unavailable; operator reconciliation required.';
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const SHA=/^[a-f0-9]{64}$/;
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
const SNOW=/^\d{17,22}$/;
const MAX_SEGMENT=512*1024,MAX_MANIFEST=96*1024,MAX_RESPONSE=950*1024;
const decoder=new TextDecoder('utf-8',{fatal:true});
function fail(){throw new Error(ERROR);}
function repoOf(value){
  if(typeof value!=='string'||!REPO.test(value)||
    value.toLowerCase()==='stinkesocke107/kings-logistics-automation'||
    value.split('/').some(x=>x==='.'||x==='..'||x.startsWith('.')||
      x.endsWith('.')||x.includes('..')))fail();
  return value;
}
function dayOf(s){
  if(typeof s!=='string'||!DAY.test(s))fail();
  const ms=Date.parse(s+'T00:00:00.000Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==s)fail();
  return s;
}
function scopeOf(scope){
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
    !SNOW.test(scope.guildId)||!SNOW.test(scope.forumId))fail();
  return {guildId:scope.guildId,forumId:scope.forumId};
}
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function blob(bytes){
  return crypto.createHash('sha1').update('blob '+bytes.length+'\0')
    .update(bytes).digest('hex');
}
function datePath(day){
  return 'capacity-backups/daily/'+dayOf(day)+'.manifest.json';
}
function partPath(digest){
  if(!SHA.test(String(digest)))fail();
  return 'capacity-backups/segments/'+digest+'.bin';
}
function base64Of(value,limit){
  if(typeof value!=='string'||value.length>Math.ceil(limit/3)*4+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail();
  const bytes=Buffer.from(value,'base64');
  if(bytes.length>limit||bytes.toString('base64')!==value)fail();
  return bytes;
}
async function json(response,allowed){
  if(!response||!response.ok||!allowed.includes(response.status)||
    !response.body?.getReader)fail();
  const len=response.headers?.get?.('content-length');
  if(len!==null&&len!==undefined&&
    (!/^\d+$/.test(len)||Number(len)>MAX_RESPONSE))fail();
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))fail();
      bytes+=value.length;
      if(bytes>MAX_RESPONSE)fail();
      chunks.push(Buffer.from(value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  let out;
  try{out=JSON.parse(decoder.decode(Buffer.concat(chunks,bytes)));}
  catch{fail();}
  if(!out||typeof out!=='object'||Array.isArray(out))fail();
  return out;
}
function fileOf(meta,path,limit){
  if(!meta||meta.type!=='file'||meta.path!==path||
    meta.encoding!=='base64'||!GIT_SHA.test(String(meta.sha||''))||
    !Number.isSafeInteger(meta.size)||meta.size<1||meta.size>limit||
    typeof meta.content!=='string')fail();
  const b64=meta.content.replace(/\n/g,'');
  const bytes=base64Of(b64,limit);
  if(bytes.length!==meta.size||blob(bytes)!==meta.sha)fail();
  return {bytes,sha:meta.sha,digest:hash(bytes)};
}
function createPrivateSegmentedHistoricalBackupVault({
  repository,dataRepository,witnessRepository,token,
  scope,ownerPublicKey,encryptionSecret,backupSecret,
  transport=fetch,nowMs=()=>Date.now()
}={}){
  const repo=repoOf(repository),data=repoOf(dataRepository),
    witness=repoOf(witnessRepository),sc=scopeOf(scope);
  if(new Set([repo.toLowerCase(),data.toLowerCase(),witness.toLowerCase()])
      .size!==3||typeof token!=='string'||token.length<20||
    token.length>1024||/[\r\n]/.test(token)||
    typeof encryptionSecret!=='string'||typeof backupSecret!=='string'||
    encryptionSecret===backupSecret||typeof transport!=='function'||
    typeof nowMs!=='function')fail();
  const root='https://api.github.com/repos/'+repo;
  const headers={Authorization:'Bearer '+token,
    Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Capacity-Private-Partitioned-Backup'};
  async function request(method,route,payload=null,allowed=[200]){
    let response;
    try{
      response=await transport(root+route,{
        method,headers:payload===null?headers:
          {...headers,'Content-Type':'application/json'},
        redirect:'manual',signal:AbortSignal.timeout(15000),
        ...(payload===null?{}:{body:JSON.stringify(payload)})
      });
    }catch{fail();}
    if(!response||!allowed.includes(response.status)||
      (response.status!==404&&!response.ok))fail();
    if(response.status===404)return null;
    return json(response,allowed);
  }
  async function privateRepo(){
    const meta=await request('GET','');
    if(!meta||meta.full_name!==repo||meta.private!==true||
      meta.archived!==false||meta.disabled===true||
      meta.default_branch!=='main')fail();
  }
  async function getFile(path,limit,optional=false){
    const record=await request('GET','/contents/'+path+'?ref=main',
      null,optional?[200,404]:[200]);
    return record===null?null:fileOf(record,path,limit);
  }
  async function createFile(path,bytes,message){
    const res=await request('PUT','/contents/'+path,{
      branch:'main',message,content:bytes.toString('base64')
    },[201]);
    if(!res||res.content?.sha!==blob(bytes)||
      !GIT_SHA.test(String(res.commit?.sha||'')))fail();
  }
  async function readDaily({day,ownerReceipt}={}){
    try{
      const current=dayOf(day);
      await privateRepo();
      const path=datePath(current),first=await getFile(path,MAX_MANIFEST);
      let manifest;
      try{manifest=JSON.parse(decoder.decode(first.bytes));}
      catch{fail();}
      if(!manifest||manifest.day!==current||
        !Array.isArray(manifest.parts)||manifest.parts.length>256)fail();
      const parts=[];
      for(const p of manifest.parts){
        const raw=await getFile(partPath(p.ciphertextDigest),MAX_SEGMENT);
        if(raw.digest!==p.ciphertextDigest||raw.bytes.length!==p.byteLength)fail();
        parts.push(raw.bytes.toString('base64'));
      }
      const verified=inspectSegmentedEncryptedBackup({
        manifest,parts,expectedOwnerReceipt:ownerReceipt,scope:sc,
        ownerPublicKey,encryptionSecret,backupSecret,nowMs:nowMs()
      });
      const last=await getFile(path,MAX_MANIFEST);
      if(last.sha!==first.sha||!last.bytes.equals(first.bytes))fail();
      await privateRepo();
      return Object.freeze({
        state:'Private Segmented Backup Read Verified',
        day:current,revision:verified.journal.revision,
        segmentCount:parts.length,manifestDigest:first.digest,
        encryptedArchiveVerified:true,repositoryVerifiedPrivate:true,
        ownerReceiptIndependentlyHeldHere:false,
        offsiteStorageGovernanceVerified:false,
        retentionEnforced:false,productionRestorePerformed:false,
        historicalCoverageCertified:false,freeSlotsCertified:false
      });
    }catch{fail();}
  }
  async function writeDailyOnce({
    envelope,ownerReceipt,chunkBytes=256*1024
  }={}){
    try{
      const current=dayOf(envelope?.day);
      const now=nowMs();
      if(!Number.isFinite(now)||
        new Date(now).toISOString().slice(0,10)!==current)fail();
      // Strong offline archive verification precedes ANY network write.
      const packed=packSegmentedEncryptedBackup({
        envelope,expectedOwnerReceipt:ownerReceipt,scope:sc,
        ownerPublicKey,encryptionSecret,backupSecret,chunkBytes,nowMs:now
      });
      const path=datePath(current);
      const index=Buffer.from(JSON.stringify(packed.manifest),'utf8');
      if(index.length>MAX_MANIFEST)fail();
      await privateRepo();
      if(await getFile(path,MAX_MANIFEST,true)!==null)fail();
      for(let i=0;i<packed.parts.length;i++){
        const meta=packed.manifest.parts[i],p=partPath(meta.ciphertextDigest);
        const bytes=base64Of(packed.parts[i],MAX_SEGMENT);
        if(bytes.length!==meta.byteLength||hash(bytes)!==meta.ciphertextDigest)
          fail();
        const old=await getFile(p,MAX_SEGMENT,true);
        if(old){
          if(old.digest!==meta.ciphertextDigest||
            !old.bytes.equals(bytes))fail();
        }else{
          // Create only, no sha overwrite argument. Conflict or uncertain
          // success => no retry; orphan segments need private human review.
          await createFile(p,bytes,'Store immutable encrypted Kings backup segment');
          const verified=await getFile(p,MAX_SEGMENT);
          if(!verified.bytes.equals(bytes)||verified.digest!==meta.ciphertextDigest)
            fail();
        }
      }
      await privateRepo();
      if(await getFile(path,MAX_MANIFEST,true)!==null)fail();
      await createFile(path,index,'Publish immutable Kings daily encrypted backup manifest');
      // This may throw even if the remote manifest did commit: no retry.
      const result=await readDaily({day:current,ownerReceipt});
      if(result.manifestDigest!==hash(index)||
        result.segmentCount!==packed.parts.length||
        result.state!=='Private Segmented Backup Read Verified')fail();
      return Object.freeze({
        state:'StoredPendingIndependentOwnerAndRetentionAudit',
        day:current,revision:result.revision,
        segmentCount:result.segmentCount,
        immutableManifestVerified:true,
        offsiteBackupStored:true,
        ownerReceiptCustodyVerified:false,
        retentionEnforced:false,monthlyIsolatedHostRestoreVerified:false,
        historicalCoverageCertified:false,freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({readDaily,writeDailyOnce});
}
module.exports={createPrivateSegmentedHistoricalBackupVault};
