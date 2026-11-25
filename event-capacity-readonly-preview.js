'use strict';
// Kings Event Capacity: independent and deliberately metadata-only readiness.
// PUBLIC SAFE: Never load a Convoy ZIP, Discord secret, Staff message,
// data repository, user identities, or call POST/PATCH/PUT/DELETE.
// This file is the ONLY code the optional main workflow preview invokes.
const REPO='Stinkesocke107/kings-logistics-automation';
const BASE='https://api.github.com/repos/'+REPO;
const LIST='/actions/workflows/convoy-checker.yml/runs?branch=main&status=success&event=schedule&per_page=20';
const MAX_BYTES=512*1024,MAX_AGE=30*60*1000;
const ID=/^[1-9]\d{5,19}$/;
const SHA=/^[0-9a-f]{40}$/;
const SAFE=Object.freeze({
  mode:'KINGS_CAPACITY_METADATA_PREVIEW',
  githubMetadataOnly:true,discordContacted:false,
  artifactDownloaded:false,privateLedgerRead:false,
  eventChanged:false,staffDecisionCommitted:false,
  freeSlotsCertified:false
});
function contextAllowed(env){
  if(!env||env.GITHUB_REPOSITORY!==REPO||
    env.KINGS_CAPACITY_READONLY_PREVIEW!=='true'||
    typeof env.GITHUB_TOKEN!=='string'||
    env.GITHUB_TOKEN.length<16||
    /[\r\n]/.test(env.GITHUB_TOKEN))return false;
  // Do not accept arbitrary GITHUB_* input masquerading as a trusted job.
  const dispatch=env.GITHUB_EVENT_NAME==='workflow_dispatch'&&
    env.GITHUB_REF==='refs/heads/main'&&
    env.GITHUB_INPUT_CAPACITY_PREVIEW==='true';
  const pr=env.GITHUB_EVENT_NAME==='pull_request'&&
    env.GITHUB_BASE_REF==='main'&&
    env.GITHUB_HEAD_REF===
      'feature/event-capacity-readonly-main-preview-2026-11'&&
    env.GITHUB_HEAD_REPOSITORY===REPO&&
    /^refs\/pull\/[1-9]\d*\/merge$/.test(env.GITHUB_REF||'');
  return dispatch||pr;
}
function validateRun(run,nowMs){
  if(!run||run.name!=='Kings Convoy Checker (live)'||
    run.path!=='.github/workflows/convoy-checker.yml'||
    run.repository?.full_name!==REPO||
    run.head_repository?.full_name!==REPO||
    run.head_branch!=='main'||run.event!=='schedule'||
    run.status!=='completed'||run.conclusion!=='success'||
    !ID.test(String(run.id||''))||!SHA.test(String(run.head_sha||''))||
    !Number.isSafeInteger(run.run_attempt)||run.run_attempt<1||
    run.run_attempt>1000)return false;
  const start=Date.parse(run.run_started_at||'');
  const end=Date.parse(run.updated_at||'');
  return Number.isFinite(start)&&Number.isFinite(end)&&
    start<=end&&end-start<=20*60*1000&&
    end<=nowMs+60000&&nowMs-end<=MAX_AGE;
}
async function limitedJson(response){
  if(!response||response.ok!==true||response.status!==200||
    typeof response.body?.getReader!=='function')throw Error('unverified');
  const len=response.headers?.get('content-length');
  if(len!==null&&len!==undefined&&
    (!/^\d+$/.test(len)||Number(len)>MAX_BYTES))throw Error('unverified');
  const reader=response.body.getReader(),parts=[];
  let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))throw Error('unverified');
      total+=value.length;
      if(total>MAX_BYTES)throw Error('unverified');
      parts.push(Buffer.from(value));
    }
  }catch{
    try{await reader.cancel();}catch{}
    throw Error('unverified');
  }
  try{
    const obj=JSON.parse(Buffer.concat(parts,total).toString('utf8'));
    if(!obj||typeof obj!=='object'||Array.isArray(obj))
      throw Error('unverified');
    return obj;
  }catch{throw Error('unverified');}
}
function createMetadataReader({token,transport=fetch}={}){
  if(typeof token!=='string'||token.length<16||token.length>1024||
    /[\r\n]/.test(token)||typeof transport!=='function')
    throw Error('unverified');
  const headers={
    Authorization:'Bearer '+token,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Capacity-Read-Only-Metadata-Preview'
  };
  async function get(route){
    const r=await transport(BASE+route,{
      method:'GET',headers,redirect:'manual',
      signal:AbortSignal.timeout(10000)
    });
    return limitedJson(r);
  }
  return {get};
}
async function preview({env=process.env,nowMs=Date.now(),transport=fetch}={}){
  const context=contextAllowed(env);
  if(!context)
    return Object.freeze({...SAFE,status:'CONTEXT_REJECTED',githubVerified:false});
  try{
    if(!Number.isFinite(nowMs))throw Error('unverified');
    const reader=createMetadataReader({token:env.GITHUB_TOKEN,transport});
    const list=await reader.get(LIST);
    if(!Array.isArray(list.workflow_runs)||
      list.workflow_runs.length>20||
      !Number.isSafeInteger(list.total_count)||
      list.total_count<list.workflow_runs.length)
      throw Error('unverified');
    const eligible=list.workflow_runs.filter(x=>validateRun(x,nowMs))
      .sort((a,b)=>BigInt(a.id)<BigInt(b.id)?1:-1);
    if(eligible.length===0)throw Error('unverified');
    const latest=eligible[0];
    const repeated=await reader.get('/actions/runs/'+latest.id);
    if(!validateRun(repeated,nowMs)||
      String(repeated.id)!==String(latest.id)||
      repeated.head_sha!==latest.head_sha||
      repeated.run_attempt!==latest.run_attempt)
      throw Error('unverified');
    return Object.freeze({...SAFE,status:'SCHEDULED_SOURCE_METADATA_VERIFIED',
      githubVerified:true});
  }catch{
    // No raw errors: token, URL, run ID, or source content must not reach logs.
    return Object.freeze({...SAFE,status:'SCHEDULED_SOURCE_METADATA_UNVERIFIED',
      githubVerified:false});
  }
}
async function main(){
  const result=await preview();
  console.log('Kings Event Capacity read-only preview: '+result.status);
  console.log('Discord NOT_CONTACTED; ZIP NOT_DOWNLOADED; EVENT_WRITES DISABLED; FREE_SLOTS UNVERIFIED');
  if(result.status==='CONTEXT_REJECTED')process.exitCode=1;
  return result;
}
if(require.main===module)
  main().catch(()=>{console.error('Read-only preview blocked.');process.exitCode=1;});
module.exports={preview,contextAllowed,validateRun};
