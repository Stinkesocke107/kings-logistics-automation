'use strict';
// GitHub-only Kings private decision ledger vault (DRAFT, NOT DEPLOYED).
// Data lives in a DIFFERENT, explicitly verified PRIVATE GitHub repository.
// A separately protected durable CAS checkpoint authority is REQUIRED;
// GitHub git SHA is NOT independent rollback protection.
// No Discord messages, automated approvals, public repo writes or logging.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {createEmptyLedger,validateLedger,applyDecision,sealLedger,unsealLedger}
  =require('./event-capacity-decision-ledger');
const ERROR='Kings Event Capacity private GitHub ledger storage unavailable or unsafe.';
const DOMAIN='kings-event-capacity-private-github-vault-v1';
const PATH='capacity-data/decisions.encrypted.json';
const MAX_FILE=850*1024; // GitHub Contents API full-content safety bound.
const MAX_HTTP=2*1024*1024;
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
function checkedRepository(value){
  if(typeof value!=='string'||!REPO.test(value))fail();
  const [owner,name]=value.split('/');
  // Do not let a crafted owner/repo normalize the fixed API URL outside
  // its intended path. Case-insensitive public source rejection follows.
  if([owner,name].some(x=>x==='.'||x==='..'||x.startsWith('.')||
    x.endsWith('.')||x.includes('..')))fail();
  return value;
}
const SNOWFLAKE=/^\d{17,22}$/;
const HEX=/^[a-f0-9]{40}$/;
const HASH=/^[a-f0-9]{64}$/;
function fail(){throw new Error(ERROR);}
function scopeOf(scope){
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
    !SNOWFLAKE.test(String(scope.guildId||''))||
    !SNOWFLAKE.test(String(scope.forumId||'')))fail();
  return {guildId:String(scope.guildId),forumId:String(scope.forumId)};
}
function checkpointShape(x){
  if(x===null)return null;
  if(!x||typeof x!=='object'||Array.isArray(x)||
    !Number.isSafeInteger(x.revision)||x.revision<0||
    !HASH.test(String(x.digest||''))||
    Object.keys(x).sort().join(',')!=='digest,revision')fail();
  return {revision:x.revision,digest:x.digest};
}
function digestOf(bytes){
  return crypto.createHash('sha256').update(DOMAIN+'\0')
    .update(bytes).digest('hex');
}
function gitBlobSha(bytes){
  return crypto.createHash('sha1')
    .update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}
function exact64(text){
  return typeof text==='string'&&text.length>0&&text.length%4===0&&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text);
}
async function responseJson(resp){
  if(!resp||typeof resp.status!=='number'||!resp.body?.getReader)fail();
  const size=resp.headers?.get?.('content-length');
  if(size!==null&&size!==undefined&&
    (!/^\d+$/.test(size)||Number(size)>MAX_HTTP))fail();
  const reader=resp.body.getReader(),parts=[];
  let count=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(!(value instanceof Uint8Array))fail();
      count+=value.byteLength;if(count>MAX_HTTP)fail();
      parts.push(Buffer.from(value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  try{return JSON.parse(Buffer.concat(parts,count).toString('utf8'));}catch{fail();}
}
function createPrivateGitHubLedgerVault({
  repository,token,secret,scope,anchor,transport=fetch
}={}){
  const checked=scopeOf(scope);
  checkedRepository(repository);
  if(repository.toLowerCase()==='stinkesocke107/kings-logistics-automation'||
    typeof token!=='string'||token.length<20||token.length>1024||
    /[\r\n]/.test(token)||
    typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32||
    typeof transport!=='function'||!anchor||
    typeof anchor.load!=='function'||
    typeof anchor.compareAndAdvance!=='function')fail();
  const base='https://api.github.com/repos/'+repository;
  const headers={
    Authorization:'Bearer '+token,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Event-Capacity-Encrypted-Private-Ledger'
  };
  async function api(method,route,body=null,expected=[200]){
    let res;
    try{
      res=await transport(base+route,{
        method,headers:body===null?headers:{...headers,'Content-Type':'application/json'},
        redirect:'manual',signal:AbortSignal.timeout(15000),
        ...(body===null?{}:{body:JSON.stringify(body)})
      });
    }catch{fail();}
    if(!res||!expected.includes(res.status)||res.ok!==true&&res.status!==404)fail();
    if(res.status===404)return {notFound:true};
    const value=await responseJson(res);
    if(!value||typeof value!=='object'||Array.isArray(value))fail();
    return value;
  }
  async function privateRepository(){
    const metadata=await api('GET','');
    if(metadata.full_name!==repository||metadata.private!==true||
      metadata.archived!==false||metadata.disabled===true||
      metadata.default_branch!=='main')fail();
  }
  async function remoteAnchor(){
    try{return checkpointShape(await anchor.load({scope:checked}));}catch{fail();}
  }
  async function compareAndAdvance(previous,next){
    let accepted;
    try{
      accepted=await anchor.compareAndAdvance({
        scope:checked,expected:previous,next
      });
    }catch{fail();}
    if(accepted!==true)fail();
  }
  function decodeFile(data){
    if(!data||data.type!=='file'||data.path!==PATH||
      data.encoding!=='base64'||!HEX.test(String(data.sha||''))||
      !Number.isSafeInteger(data.size)||data.size<1||data.size>MAX_FILE||
      typeof data.content!=='string')fail();
    const normalized=data.content.replace(/\n/g,'');
    if(!exact64(normalized))fail();
    const bytes=Buffer.from(normalized,'base64');
    if(bytes.length!==data.size||bytes.length>MAX_FILE||
      bytes.toString('base64')!==normalized||gitBlobSha(bytes)!==data.sha)fail();
    let envelope,ledger;
    try{
      envelope=JSON.parse(bytes.toString('utf8'));
      ledger=unsealLedger(envelope,secret,checked);
    }catch{fail();}
    validateLedger(ledger,checked);
    return {sha:data.sha,ledger,
      checkpoint:{revision:ledger.revision,digest:digestOf(bytes)}};
  }
  async function fetchFile(){
    const data=await api('GET','/contents/'+PATH+'?ref=main',null,[200,404]);
    return data.notFound===true?null:decodeFile(data);
  }
  async function verified(){
    await privateRepository();
    const first=await fetchFile();
    const highwater=await remoteAnchor();
    const local=first?.checkpoint||null;
    if(!isDeepStrictEqual(local,highwater))fail();
    // A racing GitHub file edit cannot cause mixed-revision reads.
    const second=await fetchFile();
    if(first?.sha!==second?.sha)fail();
    const after=await remoteAnchor();
    if(!isDeepStrictEqual(highwater,after))fail();
    return first;
  }
  async function read(){
    try{
      const item=await verified();
      if(!item)fail(); // explicit bootstrap required, never silent creation
      return Object.freeze({
        sha:item.sha,checkpoint:item.checkpoint,
        ledger:structuredClone(item.ledger)
      });
    }catch{fail();}
  }
  async function write({ledger,previousSha=null,previousCheckpoint=null,message}={}){
    validateLedger(ledger,checked);
    if(previousSha!==null&&!HEX.test(previousSha)||
      typeof message!=='string'||message.length<10||message.length>100||
      !/^[A-Za-z0-9 :,._-]+$/.test(message))fail();
    const raw=Buffer.from(JSON.stringify(sealLedger(ledger,secret)),'utf8');
    if(raw.length>MAX_FILE)fail();
    const newCheckpoint={revision:ledger.revision,digest:digestOf(raw)};
    const nextSha=gitBlobSha(raw);
    const payload={
      message,branch:'main',content:raw.toString('base64'),
      ...(previousSha===null?{}:{sha:previousSha})
    };
    let response;
    try{
      response=await api('PUT','/contents/'+PATH,payload,[200,201]);
    }catch{fail();}
    if(response.content?.sha!==nextSha||
      !HEX.test(String(response.commit?.sha||'')))fail();
    // The GitHub commit can already be durable. If the separate anchor
    // write fails the vault MUST remain inaccessible until reconciliation.
    await compareAndAdvance(previousCheckpoint,newCheckpoint);
    const stored=await verified();
    if(!stored||stored.sha!==nextSha||
      !isDeepStrictEqual(stored.checkpoint,newCheckpoint))fail();
    return Object.freeze({sha:nextSha,checkpoint:newCheckpoint});
  }
  async function initializeEmpty({at}={}){
    try{
      await privateRepository();
      if(await fetchFile()!==null||await remoteAnchor()!==null)fail();
      const ledger=createEmptyLedger(checked,at);
      return await write({ledger,
        message:'Initialize encrypted Kings Event Capacity private ledger'});
    }catch{fail();}
  }
  async function commitDecision({command,actor,at}={}){
    try{
      const old=await read();
      // Pure domain guards still apply. The caller must independently derive
      // current verified roles + identity; this method is NOT directly wired
      // to any Discord text command or arbitrary GitHub Actions input.
      const next=applyDecision(old.ledger,command,actor,at);
      if(next.revision!==old.ledger.revision+1||
        !isDeepStrictEqual(next.history.slice(0,-1),old.ledger.history))
        fail();
      return await write({ledger:next,previousSha:old.sha,
        previousCheckpoint:old.checkpoint,
        message:'Record audited Kings Event Capacity staff decision'});
    }catch{fail();}
  }
  return Object.freeze({read,initializeEmpty,commitDecision});
}
module.exports={createPrivateGitHubLedgerVault};
