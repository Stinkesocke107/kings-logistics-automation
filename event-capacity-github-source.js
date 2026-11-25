'use strict';
// Restricted GitHub Actions REST transport for the private Kings import host.
// No calls until the host invokes a method. No secrets/data written or logged.
// GitHub's ZIP redirect receives NO Authorization header; host allowlisted.
const {assertRun}=require('./event-capacity-private-import');
const ERROR='Kings Event Capacity GitHub source read failed.';
const REPO='Stinkesocke107/kings-logistics-automation';
const BASE='https://api.github.com/repos/'+REPO;
const ID=/^[1-9]\d{5,19}$/;
const MAX_ZIP=25*1024*1024,MAX_JSON=2*1024*1024;
function fail(){throw new Error(ERROR);}
function redirectHostAllowed(text){
  let url;
  try{url=new URL(text);}catch{fail();}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
     (!host.endsWith('.blob.core.windows.net')&&
      !host.endsWith('.actions.githubusercontent.com')&&
      !host.endsWith('.githubusercontent.com')))fail();
  return url.href;
}
async function boundedBody(response,limit){
  if(!response||response.ok!==true||typeof response.headers?.get!=='function'||
     !response.body||typeof response.body.getReader!=='function')fail();
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit))fail();
  const reader=response.body.getReader();
  const parts=[];
  let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))fail();
      total+=value.byteLength;
      if(total>limit)fail();
      parts.push(Buffer.from(value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  return Buffer.concat(parts,total);
}
function createPrivateGitHubReader({token,transport=fetch}={}){
  if(typeof token!=='string'||token.length<16||token.length>1024||
     /[\r\n]/.test(token)||typeof transport!=='function')fail();
  const headers=Object.freeze({
    Authorization:'Bearer '+token,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Event-Capacity-Private-Importer'
  });
  async function api(route){
    let response;
    try{
      response=await transport(BASE+route,{
        method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(15000)
      });
    }catch{fail();}
    if(!response||response.status!==200||response.ok!==true)fail();
    return response;
  }
  async function getJson(route){
    const response=await api(route);
    const body=await boundedBody(response,MAX_JSON);
    let data;
    try{data=JSON.parse(body.toString('utf8'));}catch{fail();}
    if(!data||typeof data!=='object'||Array.isArray(data))fail();
    return data;
  }
  function checkRepo(repository){
    if(repository!==REPO)fail();
  }
  async function getRun({repository,runId}={}){
    checkRepo(repository);
    if(!ID.test(String(runId||'')))fail();
    return getJson('/actions/runs/'+runId);
  }
  async function getArtifacts({repository,runId}={}){
    checkRepo(repository);
    if(!ID.test(String(runId||'')))fail();
    const data=await getJson('/actions/runs/'+runId+'/artifacts?per_page=100');
    if(!Array.isArray(data.artifacts)||
       !Number.isSafeInteger(data.total_count)||data.total_count<0||
       data.total_count!==data.artifacts.length||
       data.total_count>100)fail();
    return data.artifacts;
  }
  async function readArtifact({
    repository,runId,runAttempt,artifactId,maxArchiveBytes
  }={}){
    checkRepo(repository);
    if(!ID.test(String(runId||''))||!ID.test(String(artifactId||''))||
       !Number.isInteger(runAttempt)||runAttempt<1||
       maxArchiveBytes!==MAX_ZIP)fail();
    let res;
    try{
      // GitHub API returns a short-lived redirect to its artifact CDN.
      res=await transport(BASE+'/actions/artifacts/'+artifactId+'/zip',{
        method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(15000)
      });
    }catch{fail();}
    if(!res)fail();
    if(res.status===200&&res.ok===true)return boundedBody(res,MAX_ZIP);
    if(![301,302,303,307,308].includes(res.status))fail();
    const destination=redirectHostAllowed(res.headers?.get?.('location'));
    // Crucial: no token, cookies, authentication or host-controlled headers
    // may be forwarded to the signed blob URL.
    let download;
    try{
      download=await transport(destination,{
        method:'GET',headers:{Accept:'application/zip'},
        redirect:'manual',signal:AbortSignal.timeout(20000)
      });
    }catch{fail();}
    if(!download||download.status!==200||download.ok!==true)fail();
    return boundedBody(download,MAX_ZIP);
  }
  async function getLatestScheduledRun({repository,nowMs=Date.now()}={}){
    checkRepo(repository);
    if(!Number.isFinite(nowMs))fail();
    // Discovery is intentionally SCHEDULE-ONLY: manually dispatched runs may
    // be dry-runs unless explicitly reviewed and requested by run ID.
    const results=await getJson('/actions/workflows/convoy-checker.yml/runs'+
      '?branch=main&status=success&event=schedule&per_page=20');
    if(!Number.isSafeInteger(results.total_count)||results.total_count<0||
      !Array.isArray(results.workflow_runs)||results.workflow_runs.length>20)fail();
    const eligible=[];
    for(const run of results.workflow_runs){
      if(run?.event!=='schedule')continue;
      try{
        const verified=assertRun(run,{nowMs});
        eligible.push(verified);
      }catch{
        // A stale, mismatched or incomplete run is not a verified source.
      }
    }
    if(eligible.length===0)fail();
    eligible.sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:BigInt(a.id)<BigInt(b.id)?1:0);
    return Object.freeze({runId:eligible[0].id,attempt:eligible[0].attempt});
  }
  return Object.freeze({getRun,getArtifacts,readArtifact,getLatestScheduledRun});
}
module.exports={createPrivateGitHubReader,redirectHostAllowed};
