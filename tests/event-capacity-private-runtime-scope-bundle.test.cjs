'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ROLES,REPOS}
  =require('../event-capacity-private-runtime-grant-policy');
const {createKingsIsolatedRuntimeScopeBundle}
  =require('../event-capacity-private-runtime-scope-bundle');
const NAMES=Object.keys(ROLES);
function plan(){
  return {version:1,credentials:Object.fromEntries(NAMES.map(role=>{
    const p=ROLES[role];
    return [role,{
      identifier:'kings-capacity-'+role+'-proposal-v1',
      repository:p.repository,contentsPermission:p.contents,runner:p.runner,
      credentialKind:'short-lived-github-app-installation',
      selection:'exactly-one-repository',maxLifetimeMinutes:30,
      permissions:{metadata:'read',contents:p.contents,
        actions:'none',administration:'none',issues:'none',
        pullRequests:'none',workflows:'none',secrets:'none'}
    }];
  })),custodyIntent:{
    ownerSigningKey:'offline-owner-only',
    latestHighwater:'outside-github-independent',
    independentRecovery:'separately-controlled-recovery',
    productionEnabled:false
  }};
}
function fixture(){
  const calls=[],tokens=Object.fromEntries(NAMES.map(role=>[
    role,'synthetic-'+role+'-single-repo-github-app-token-only'
  ]));
  const overrides=new Map();
  const transportForRole=role=>async(url,opts)=>{
    calls.push({role,method:opts.method,url,
      auth:opts.headers.Authorization});
    const repository=ROLES[role].repository;
    const reply=overrides.has(role)?overrides.get(role):
      {total_count:1,repositories:[{
        id:1000000+NAMES.indexOf(role),
        full_name:repository,private:true,default_branch:'main',
        archived:false,disabled:false
      }]};
    if(reply instanceof Error)throw reply;
    return Response.json(reply);
  };
  const make=(changes={})=>createKingsIsolatedRuntimeScopeBundle({
    plan:plan(),roleTokens:tokens,transportForRole,...changes
  });
  return {make,calls,tokens,overrides,transportForRole};
}
test('All five proposed credential tokens see only one corresponding repository on two reads',async()=>{
  const s=fixture();
  const result=await s.make().read();
  assert.equal(result.plannedCredentialsReviewed,5);
  assert.equal(result.observedRoles.length,5);
  assert.deepEqual(result.observedRoles.map(x=>x.role),NAMES);
  assert.equal(s.calls.length,10);
  assert.equal(new Set(s.calls.map(x=>x.auth)).size,5);
  assert.ok(s.calls.every(x=>x.method==='GET'));
  assert.equal(result.effectivePermissionScopesVerified,false);
  assert.equal(result.privateSyntheticPilotApproved,false);
  assert.equal(result.safeToActivate,false);
  assert.equal(result.freeSlotsCertified,false);
});
test('Unexpected multi-repository installation immediately blocks future token probing',async()=>{
  const s=fixture();s.overrides.set('historyWriter',{
    total_count:2,repositories:[
      {id:1234567,full_name:REPOS.history,private:true,default_branch:'main',archived:false},
      {id:1234568,full_name:REPOS.backup,private:true,default_branch:'main',archived:false}
    ]});
  await assert.rejects(s.make().read());
  // First credential used twice; second only once; remaining not invoked.
  assert.deepEqual(s.calls.map(x=>x.role),[
    'historyReader','historyReader','historyWriter'
  ]);
});
test('Five role strings must be distinct, not merely five aliases for the same token',()=>{
  const s=fixture(),tokens={...s.tokens,backupReader:s.tokens.historyReader};
  assert.throws(()=>s.make({roleTokens:tokens}));
  assert.equal(s.calls.length,0);
});
test('Missing roles, extra secrets or hidden identity reassignments are rejected',()=>{
  const s=fixture(),missing={...s.tokens};delete missing.witnessReader;
  assert.throws(()=>s.make({roleTokens:missing}));
  assert.throws(()=>s.make({roleTokens:{...s.tokens,admin:'SUPERSECRET'}}));
  const other=plan();
  other.credentials.historyWriter.repository=REPOS.backup;
  assert.throws(()=>s.make({plan:other}));
});
test('Public repo and incorrect witness scope never pass a five-role audit',async()=>{
  for(const name of [REPOS.history,'Stinkesocke107/kings-logistics-automation']){
    const s=fixture();s.overrides.set('witnessReader',{
      total_count:1,repositories:[{id:23456,full_name:name,private:true,
        default_branch:'main',archived:false,disabled:false}]});
    await assert.rejects(s.make().read());
  }
});
test('Transport failure on one role is generic, does not retry, and never leaks tokens',async()=>{
  const s=fixture();s.overrides.set('backupReader',Error('SECRET event:100'));
  await assert.rejects(s.make().read(),e=>{
    assert.doesNotMatch(String(e),/SECRET|event:100|synthetic-/);return true;
  });
  assert.equal(s.calls.filter(x=>x.role==='backupReader').length,1);
  assert.equal(s.calls.filter(x=>x.role==='backupWriter').length,0);
});
test('No effective write right, token freshness or independent highwater is ever certified',async()=>{
  const s=fixture(),out=await s.make().read();
  for(const field of [
    'authenticatedSourceOfInjectedTransportProven',
    'effectivePermissionScopesVerified',
    'shortLivedTokenExpirationsVerified',
    'credentialIssuancePerformed',
    'credentialRevocationVerified',
    'currentOwnerHighwaterIndependentlyRetained',
    'privateSyntheticPilotApproved','safeToActivate','freeSlotsCertified'
  ])assert.equal(out[field],false);
  assert.ok(out.observedRoles.every(x=>x.effectiveReadWriteGrantsProven===false));
});
test('No repository full names or synthetic tokens appear in the returned private summary',async()=>{
  const s=fixture(),str=JSON.stringify(await s.make().read());
  for(const value of [...Object.values(REPOS),...Object.values(s.tokens),
    'PRIVATE KEY','event:100'])assert.equal(str.includes(value),false);
});
