'use strict';
// SEPARATELY PERMISSIONED GitHub-only checkpoint witness (DRAFT).
// This is NOT an intrinsically append-only, irrevocable monotonic authority:
// jointly rewinding BOTH private repos can bypass a two-repo witness without
// a separately retained, independently controlled highwater receipt.
// No bot process, Discord writes, automatic incident recovery or public data.
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const ERROR='Kings Event Capacity independent GitHub checkpoint cannot be verified.';
const DOMAIN='kings-event-capacity-private-github-checkpoint-v1';
const PATH='capacity-control/ledger-checkpoint.json';
const SNOWFLAKE=/^\d{17,22}$/;
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const SHA=/^[a-f0-9]{40}$/;
const MAX_FILE=4096;
const MAX_HTTP=32768;
function fail(){throw new Error(ERROR);}
function repositoryName(name){
  if(typeof name!=='string'||!REPO.test(name))fail();
  if(name.toLowerCase()==='stinkesocke107/kings-logistics-automation')fail();
  for(const part of name.split('/')){
    if(part==='.'||part==='..'||part.startsWith('.')||
      part.endsWith('.')||part.includes('..'))fail();
  }
  return name;
}
function scopeOf(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
    !SNOWFLAKE.test(String(v.guildId||''))||
    !SNOWFLAKE.test(String(v.forumId||'')))fail();
  return {guildId:String(v.guildId),forumId:String(v.forumId)};
}
function checkpoint(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).sort().join(',')!=='digest,revision'||
    !Number.isSafeInteger(v.revision)||v.revision<0||
    !DIGEST.test(v.digest))fail();
  return {revision:v.revision,digest:v.digest};
}
function sha(bytes){
  return crypto.createHash('sha1')
    .update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}
function mac(key,scope,record){
  const message=[DOMAIN,scope.guildId,scope.forumId,
    String(record.revision),record.digest,
    record.previousDigest===null?'GENESIS':record.previousDigest].join('\0');
  return crypto.createHmac('sha256',key).update(message).digest('hex');
}
function exactly64(value){
  return typeof value==='string'&&value.length>0&&
    value.length%4===0&&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}
async function readJson(response){
  if(!response||typeof response.status!=='number'||!response.body?.getReader)
    fail();
  const len=response.headers?.get?.('content-length');
  if(len!==null&&len!==undefined&&
    (!/^\d+$/.test(len)||Number(len)>MAX_HTTP))fail();
  const reader=response.body.getReader(),chunks=[];
  let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))fail();
      total+=value.length;
      if(total>MAX_HTTP)fail();
      chunks.push(Buffer.from(value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  try{return JSON.parse(Buffer.concat(chunks,total).toString('utf8'));}
  catch{fail();}
}
function createPrivateGitHubCheckpoint({
  repository,dataRepository,token,dataToken,signingSecret,scope,
  transport=fetch
}={}){
  const checked=scopeOf(scope);
  const witness=repositoryName(repository);
  const data=repositoryName(dataRepository);
  if(witness.toLowerCase()===data.toLowerCase()||
    typeof token!=='string'||token.length<20||token.length>1024||
    typeof dataToken!=='string'||dataToken.length<20||
    token===dataToken||/[\r\n]/.test(token)||/[\r\n]/.test(dataToken)||
    typeof signingSecret!=='string'||
    Buffer.byteLength(signingSecret,'utf8')<32||
    typeof transport!=='function')fail();
  const key=crypto.createHash('sha256')
    .update(DOMAIN+'\0').update(signingSecret).digest();
  const base='https://api.github.com/repos/'+witness;
  const headers={
    Authorization:'Bearer '+token,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Event-Capacity-Private-Checkpoint'
  };
  async function request(method,route,body=null,expected=[200]){
    let response;
    try{
      response=await transport(base+route,{
        method,headers:body===null?headers:{
          ...headers,'Content-Type':'application/json'
        },redirect:'manual',signal:AbortSignal.timeout(15000),
        ...(body===null?{}:{body:JSON.stringify(body)})
      });
    }catch{fail();}
    if(!response||!expected.includes(response.status)||
      (response.ok!==true&&response.status!==404))fail();
    if(response.status===404)return {notFound:true};
    const value=await readJson(response);
    if(!value||typeof value!=='object'||Array.isArray(value))fail();
    return value;
  }
  async function verifyRepository(){
    const meta=await request('GET','');
    if(meta.full_name!==witness||meta.private!==true||
      meta.archived!==false||meta.disabled===true||
      meta.default_branch!=='main')fail();
  }
  function encode(next,previous){
    const n=checkpoint(next);
    const record={version:1,scope:checked,revision:n.revision,
      digest:n.digest,previousDigest:previous?.digest||null};
    if(previous===null&&n.revision!==0||
      previous!==null&&n.revision!==previous.revision+1)fail();
    record.signature=mac(key,checked,record);
    const bytes=Buffer.from(JSON.stringify(record),'utf8');
    if(bytes.length>MAX_FILE)fail();
    return bytes;
  }
  function decode(meta){
    if(!meta||meta.type!=='file'||meta.path!==PATH||
      !SHA.test(String(meta.sha||''))||meta.encoding!=='base64'||
      !Number.isSafeInteger(meta.size)||meta.size<1||meta.size>MAX_FILE||
      typeof meta.content!=='string')fail();
    const b64=meta.content.replace(/\n/g,'');
    if(!exactly64(b64))fail();
    const bytes=Buffer.from(b64,'base64');
    if(bytes.length!==meta.size||bytes.length>MAX_FILE||
      bytes.toString('base64')!==b64||sha(bytes)!==meta.sha)fail();
    let record;
    try{record=JSON.parse(bytes.toString('utf8'));}catch{fail();}
    if(!record||Object.keys(record).sort().join(',')!==
      'digest,previousDigest,revision,scope,signature,version'||
      record.version!==1||!isDeepStrictEqual(record.scope,checked)||
      !DIGEST.test(String(record.signature||''))||
      !(record.previousDigest===null||DIGEST.test(record.previousDigest)))
      fail();
    const value=checkpoint({revision:record.revision,digest:record.digest});
    if(record.revision===0&&record.previousDigest!==null||
      record.revision>0&&record.previousDigest===null)fail();
    const expectedMac=mac(key,checked,record);
    if(!crypto.timingSafeEqual(
      Buffer.from(record.signature,'hex'),Buffer.from(expectedMac,'hex')))fail();
    return {sha:meta.sha,checkpoint:value,previousDigest:record.previousDigest};
  }
  async function fetchRecord(){
    const data=await request('GET','/contents/'+PATH+'?ref=main',
      null,[200,404]);
    return data.notFound===true?null:decode(data);
  }
  async function load({scope}={}){
    try{
      if(!isDeepStrictEqual(scopeOf(scope),checked))fail();
      await verifyRepository();
      const first=await fetchRecord();
      const second=await fetchRecord();
      if(first?.sha!==second?.sha)fail();
      return first===null?null:Object.freeze({...first.checkpoint});
    }catch{fail();}
  }
  async function compareAndAdvance({scope,expected,next}={}){
    try{
      if(!isDeepStrictEqual(scopeOf(scope),checked))fail();
      const prior=expected===null?null:checkpoint(expected);
      const future=checkpoint(next);
      await verifyRepository();
      const current=await fetchRecord();
      if(!isDeepStrictEqual(current?.checkpoint||null,prior))return false;
      // Even before the GitHub compare-and-swap, ensure predecessor digest
      // matches and revisions advance exactly once.
      const content=encode(future,prior);
      const newSha=sha(content);
      const payload={
        message:'Record Kings Event Capacity independent checkpoint',
        branch:'main',content:content.toString('base64'),
        ...(current===null?{}:{sha:current.sha})
      };
      let response;
      try{
        response=await request('PUT','/contents/'+PATH,payload,[200,201]);
      }catch{fail();}
      if(response.content?.sha!==newSha||
        !SHA.test(String(response.commit?.sha||'')))fail();
      const after=await fetchRecord();
      if(!after||after.sha!==newSha||
        !isDeepStrictEqual(after.checkpoint,future)||
        after.previousDigest!==(prior?.digest||null))fail();
      return true;
    }catch{fail();}
  }
  return Object.freeze({load,compareAndAdvance});
}
module.exports={createPrivateGitHubCheckpoint};
