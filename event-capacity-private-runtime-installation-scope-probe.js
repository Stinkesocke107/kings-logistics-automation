'use strict';
// DRAFT / EXPLICITLY INVOKED / GET-ONLY. The GitHub App installation-token
// endpoint can show repositories visible to a caller-supplied token. This
// cannot prove permission levels, provenance of an injected transport, secret
// isolation, ability to write, CEO approval or independent owner key custody.
// NEVER import into production workflows or pass setup/admin credentials.
const {TextDecoder}=require('node:util');
const {REPOS}=require('./event-capacity-private-runtime-grant-policy');
const ERROR='Kings Event Capacity isolated installation scope probe refused.';
const MAX_REPLY=128*1024,MAX_TOKEN=1024;
const decoder=new TextDecoder('utf-8',{fatal:true});
function fail(){throw new Error(ERROR);}
function plain(o){return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype;}
function checkRole(role){if(!Object.hasOwn(REPOS,role))fail();}
function tokenOf(token){
  if(typeof token!=='string'||token.length<20||token.length>MAX_TOKEN||
    !/^[A-Za-z0-9_.-]+$/.test(token))fail();
  return token;
}
async function boundedJson(response){
  if(!response||response.status!==200||response.ok!==true||
    !response.body?.getReader)fail();
  const header=response.headers?.get?.('content-length');
  if(header!==undefined&&header!==null&&
    (!/^[0-9]{1,10}$/.test(header)||Number(header)>MAX_REPLY))fail();
  const reader=response.body.getReader(),chunks=[];
  let size=0;
  try{
    for(;;){
      const part=await reader.read();
      if(part.done)break;
      if(!(part.value instanceof Uint8Array))fail();
      size+=part.value.byteLength;
      if(size>MAX_REPLY)fail();
      chunks.push(Buffer.from(part.value));
    }
  }catch{try{await reader.cancel();}catch{}fail();}
  let json;
  try{json=JSON.parse(decoder.decode(Buffer.concat(chunks,size)));}
  catch{fail();}
  if(!plain(json))fail();
  return json;
}
function validateInventory(value,expected){
  if(!plain(value)||value.total_count!==1||
    !Array.isArray(value.repositories)||value.repositories.length!==1)fail();
  const item=value.repositories[0];
  if(!plain(item)||item.full_name!==expected||item.private!==true||
    item.default_branch!=='main'||item.archived!==false||
    item.disabled===true||
    !Number.isSafeInteger(item.id)||item.id<1||
    (item.visibility!==undefined&&item.visibility!=='private'))fail();
  return Object.freeze({
    id:item.id,fullName:item.full_name,private:true,
    defaultBranch:'main',archived:false
  });
}
function createIsolatedInstallationScopeProbe({
  repositoryRole,token,transport
}={}){
  checkRole(repositoryRole);
  const expected=REPOS[repositoryRole];
  const secret=tokenOf(token);
  if(typeof transport!=='function')fail();
  // Fixed GitHub endpoint, with exact query; no redirects, mutation or retry.
  const url='https://api.github.com/installation/repositories?per_page=100&page=1';
  const headers={Authorization:'Bearer '+secret,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Kings-Capacity-Isolated-Scope-Probe'};
  async function once(){
    let response;
    try{
      response=await transport(url,{
        method:'GET',headers,redirect:'manual',
        signal:AbortSignal.timeout(15000)
      });
    }catch{fail();}
    return validateInventory(await boundedJson(response),expected);
  }
  async function read(){
    try{
      const before=await once(),after=await once();
      if(before.id!==after.id||before.fullName!==after.fullName)fail();
      return Object.freeze({
        visibility:'PRIVATE_ONLY',readOnly:true,role:repositoryRole,
        exactSingleRepositoryInventoryObserved:true,
        selectedRepositoryPrivateAndStable:true,
        twoConsistentInstallationInventoryReads:true,
        responseProvenanceTrustedByPureCode:false,
        callerTokenKindCryptographicallyAttested:false,
        actualTokenPermissionLevelsProven:false,
        contentsReadGrantVerified:false,
        contentsWriteGrantVerified:false,
        tokenCustodySeparationVerified:false,
        tokenRevocationAndExpiryVerified:false,
        ownerPrivateSigningKeyCustodyVerified:false,
        independentHighwaterCustodyVerified:false,
        syntheticPrivatePilotApproved:false,
        productionEnabled:false,safeToActivate:false,
        freeSlotsCertified:false
      });
    }catch{fail();}
  }
  return Object.freeze({read});
}
module.exports={createIsolatedInstallationScopeProbe};
