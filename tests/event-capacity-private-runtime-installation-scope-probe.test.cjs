'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {REPOS}=require('../event-capacity-private-runtime-grant-policy');
const {createIsolatedInstallationScopeProbe}
  =require('../event-capacity-private-runtime-installation-scope-probe');
const TOKEN='synthetic-ephemeral-installation-token-for-tests-only';
function valid(role='history'){
  return {total_count:1,repositories:[{id:1471110012,
    full_name:REPOS[role],private:true,default_branch:'main',
    archived:false,disabled:false,visibility:'private'}]};
}
function scenario(role='history'){
  const calls=[];let response=valid(role),second=null;
  const transport=async(url,options)=>{
    calls.push({url,method:options.method,
      redirect:options.redirect,headers:options.headers});
    return Response.json(calls.length>1&&second!==null?second:response);
  };
  const make=(override={})=>createIsolatedInstallationScopeProbe({
    repositoryRole:role,token:TOKEN,transport,...override
  });
  return {make,calls,setResponse:v=>{response=v;},
    setSecond:v=>{second=v;}};
}
test('History installation-token inventory must show one exact private repo twice',async()=>{
  const s=scenario(),result=await s.make().read();
  assert.equal(s.calls.length,2);
  assert.ok(s.calls.every(call=>call.method==='GET'&&call.redirect==='manual'));
  assert.ok(s.calls.every(call=>call.url===
    'https://api.github.com/installation/repositories?per_page=100&page=1'));
  assert.equal(result.role,'history');
  assert.equal(result.exactSingleRepositoryInventoryObserved,true);
  assert.equal(result.twoConsistentInstallationInventoryReads,true);
  assert.equal(result.actualTokenPermissionLevelsProven,false);
  assert.equal(result.contentsWriteGrantVerified,false);
  assert.equal(result.safeToActivate,false);
  assert.equal(result.freeSlotsCertified,false);
});
test('Witness and backup tokens must each observe their exact sole repository',async()=>{
  for(const role of ['witness','backup']){
    const s=scenario(role);
    const result=await s.make().read();
    assert.equal(result.role,role);
    assert.equal(result.selectedRepositoryPrivateAndStable,true);
    assert.equal(s.calls.length,2);
  }
});
test('Broad setup App with all six Kings repos is rejected even if expected is present',async()=>{
  const s=scenario();s.setResponse({
    total_count:3,
    repositories:[valid().repositories[0],
      valid('backup').repositories[0],valid('witness').repositories[0]]
  });
  await assert.rejects(s.make().read());
  assert.equal(s.calls.length,1);
});
test('Installation listing cannot include extra repos, missing repo or public code repo',async()=>{
  for(const x of [
    {total_count:1,repositories:[{...valid().repositories[0],
      full_name:REPOS.backup}]},
    {total_count:1,repositories:[{...valid().repositories[0],
      full_name:'Stinkesocke107/kings-logistics-automation'}]},
    {total_count:0,repositories:[]},
    {total_count:2,repositories:[valid().repositories[0]]},
    {total_count:1,repositories:[valid().repositories[0],
      valid().repositories[0]]}
  ]){
    const s=scenario();s.setResponse(x);
    await assert.rejects(s.make().read());
  }
});
test('Visibility, archived, disabled and branch inconsistencies always fail',async()=>{
  for(const changes of [
    {private:false},{archived:true},{disabled:true},
    {default_branch:'master'},{visibility:'public'},
    {id:0},{id:'1471110012'}
  ]){
    const s=scenario();s.setResponse({total_count:1,
      repositories:[{...valid().repositories[0],...changes}]});
    await assert.rejects(s.make().read());
  }
});
test('Changed inventory between two network reads is not trusted',async()=>{
  const s=scenario();
  s.setSecond({total_count:1,repositories:[{
    ...valid().repositories[0],id:1471111111
  }]});
  await assert.rejects(s.make().read());
  assert.equal(s.calls.length,2);
});
test('Transport error is sanitized and read is not retried',async()=>{
  let count=0;
  const probe=createIsolatedInstallationScopeProbe({
    repositoryRole:'history',token:TOKEN,
    transport:async()=>{count++;throw Error('synthetic-super-secret token');}
  });
  await assert.rejects(probe.read(),error=>{
    assert.doesNotMatch(String(error),/synthetic-super-secret|token-for-tests/);
    return true;
  });
  assert.equal(count,1);
});
test('HTTP error, redirect and oversized data cannot yield scope proof',async()=>{
  for(const transport of [
    async()=>new Response('unauthorized',{status:401}),
    async()=>new Response('redirect',{status:302,headers:{Location:'https://bad.test'}}),
    async()=>new Response('x'.repeat(129*1024),{status:200}),
    async()=>new Response('{bad json}',{status:200}),
    async()=>new Response(JSON.stringify(valid()),{
      status:200,headers:{'content-length':'9999999'}
    })
  ]){
    const probe=createIsolatedInstallationScopeProbe({
      repositoryRole:'history',token:TOKEN,transport
    });
    await assert.rejects(probe.read());
  }
});
test('Token form and request role must be validated before touching transport',()=>{
  const s=scenario();
  for(const token of [null,'short','secret\ninjected',' Bearer xyz',
    'a'.repeat(1025),'abc=def','not a valid token']){
    assert.throws(()=>s.make({token}));
  }
  for(const repositoryRole of ['source','public','all','historyAdmin',null]){
    assert.throws(()=>s.make({repositoryRole}));
  }
  assert.equal(s.calls.length,0);
});
test('Spoofed transport can only cause an observation, never grant or real provenance proof',async()=>{
  const result=await scenario().make().read();
  for(const property of [
    'responseProvenanceTrustedByPureCode',
    'callerTokenKindCryptographicallyAttested',
    'actualTokenPermissionLevelsProven',
    'tokenCustodySeparationVerified',
    'tokenRevocationAndExpiryVerified',
    'ownerPrivateSigningKeyCustodyVerified',
    'independentHighwaterCustodyVerified',
    'syntheticPrivatePilotApproved','productionEnabled'
  ])assert.equal(result[property],false);
});
test('Summary redacts exact repository and token and cannot publish private events',async()=>{
  const s=scenario();
  const serialized=JSON.stringify(await s.make().read());
  for(const val of [
    TOKEN,...Object.values(REPOS),'event:100','PRIVATE KEY'
  ])assert.equal(serialized.includes(val),false);
});
