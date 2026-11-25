'use strict';
// DRAFT / READ ONLY. Inspect three independently configured PRIVATE GitHub
// repositories with distinct credentials. Does NOT discover repositories,
// grant permissions, provision tokens, create branches, read source records,
// authenticate token grant boundaries, or enable the live Event system.
const {TextDecoder}=require('node:util');
const ERROR='Kings Event Capacity private storage preflight could not be verified.';
const REPO=/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SHA=/^[a-f0-9]{40}$/;
const PUBLIC='stinkesocke107/kings-logistics-automation';
const ROLES=['history','witness','backup'];
const MAX_REPLY=128*1024;
const utf8=new TextDecoder('utf-8',{fatal:true});
function fail(){throw new Error(ERROR);}
function plainObject(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    Object.getPrototypeOf(value)===Object.prototype;
}
function exact(value,keys){
  if(!plainObject(value)||Object.keys(value).sort().join(',')!==
    [...keys].sort().join(','))fail();
}
function repoOf(value){
  if(typeof value!=='string'||!REPO.test(value)||
    value.toLowerCase()===PUBLIC||
    value.split('/').some(p=>p==='.'||p==='..'||p.startsWith('.')||
      p.endsWith('.')||p.includes('..')))fail();
  return value;
}
function tokenOf(value){
  if(typeof value!=='string'||value.length<20||value.length>1024||
    /[\r\n]/.test(value))fail();
  return value;
}
async function parseJson(response){
  if(!response||response.ok!==true||response.status!==200||
    !response.body?.getReader)fail();
  const length=response.headers?.get?.('content-length');
  if(length!==null&&length!==undefined&&
    (!/^\d+$/.test(length)||Number(length)>MAX_REPLY))fail();
  const chunks=[],reader=response.body.getReader();let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(!(value instanceof Uint8Array))fail();
      size+=value.byteLength;
      if(size>MAX_REPLY)fail();
      chunks.push(Buffer.from(value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  let result;
  try{result=JSON.parse(utf8.decode(Buffer.concat(chunks,size)));}
  catch{fail();}
  if(!plainObject(result))fail();
  return result;
}
function metadataOf(value,repository){
  if(value.full_name!==repository||value.private!==true||
    value.archived!==false||value.disabled===true||
    value.default_branch!=='main')fail();
  return Object.freeze({
    full_name:value.full_name,private:true,archived:false,
    disabled:value.disabled??false,default_branch:'main'
  });
}
function branchOf(value){
  if(!plainObject(value)||value.name!=='main'||
    !plainObject(value.commit)||!SHA.test(String(value.commit.sha||''))||
    typeof value.protected!=='boolean')fail();
  return {name:'main',commit:value.commit.sha,
    protectionReported:value.protected};
}
function createPrivateStoragePreflight({
  history,witness,backup,transport=fetch
}={}){
  if(typeof transport!=='function')fail();
  const entries={history,witness,backup};
  const owners=new Set(),tokens=new Set(),configuration={};
  for(const role of ROLES){
    const input=entries[role];
    exact(input,['repository','token']);
    const repo=repoOf(input.repository),token=tokenOf(input.token);
    if(owners.has(repo.toLowerCase())||tokens.has(token))fail();
    owners.add(repo.toLowerCase());tokens.add(token);
    configuration[role]={repo,token};
  }
  async function get(role,route){
    const {repo,token}=configuration[role];
    let response;
    try{
      response=await transport(
        'https://api.github.com/repos/'+repo+route,{
          method:'GET',headers:{
            Authorization:'Bearer '+token,
            Accept:'application/vnd.github+json',
            'X-GitHub-Api-Version':'2022-11-28',
            'User-Agent':'Kings-Capacity-Private-Storage-Preflight'
          },redirect:'manual',signal:AbortSignal.timeout(15000)
        });
    }catch{fail();}
    return parseJson(response);
  }
  async function read(){
    try{
      const results=[];
      for(const role of ROLES){
        const repo=configuration[role].repo;
        const before=metadataOf(await get(role,''),repo);
        const branch=branchOf(await get(role,'/branches/main'));
        const after=metadataOf(await get(role,''),repo);
        const branchAfter=branchOf(await get(role,'/branches/main'));
        if(JSON.stringify(before)!==JSON.stringify(after)||
          JSON.stringify(branch)!==JSON.stringify(branchAfter))fail();
        results.push(Object.freeze({
          role,privateRepositoryObserved:true,
          mainBranchObserved:true,
          branchProtectionReported:branch.protectionReported,
          metadataStableDuringRead:true,
          getRequestsOnly:true
        }));
      }
      return Object.freeze({
        visibility:'PRIVATE_ONLY',readOnly:true,
        storageConfigurationObserved:true,
        distinctRepositoryNamesObserved:true,
        distinctCredentialStringsSupplied:true,
        observedPrivateRepositories:results.length,
        repos:results,
        branchProtectionReportedForAll:
          results.every(x=>x.branchProtectionReported),
        allChecksUsedGetOnly:true,
        credentialGrantIsolationIndependentlyVerified:false,
        branchProtectionRulesIndependentlyInspected:false,
        // GitHub Free does not enforce protected branch/rulesets for
        // PRIVATE repos. Absence of protection is not a preflight failure;
        // it must be compensated with external highwater, manual approvals
        // and separately held credentials instead of falsely claiming safety.
        premiumPrivateBranchRulesAssumed:false,
        githubFreePrivateRepositoryCompatible:true,
        privateBranchProtectionMandatoryForPreflight:false,
        independentOwnerHighwaterRequired:true,
        separatedCredentialCustodyRequired:true,
        ownerOfflineKeyCustodyVerified:false,
        actualHistoricalDataStored:false,
        historicalCoverageCertified:false,
        backupsRetentionEnforced:false,
        safeToActivate:false,
        freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({read});
}
module.exports={createPrivateStoragePreflight};
