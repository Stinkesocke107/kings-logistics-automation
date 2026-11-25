'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {REPOS,ROLES,reviewKingsRuntimeCredentialPlan}
  =require('../event-capacity-private-runtime-grant-policy');
function valid(){
  const credentials=Object.fromEntries(Object.entries(ROLES).map(([role,spec])=>[
    role,{
      identifier:'kings-capacity-'+role+'-proposal-v1',
      repository:spec.repository,contentsPermission:spec.contents,
      runner:spec.runner,credentialKind:'short-lived-github-app-installation',
      selection:'exactly-one-repository',maxLifetimeMinutes:30,
      permissions:{metadata:'read',contents:spec.contents,actions:'none',
        administration:'none',issues:'none',pullRequests:'none',
        workflows:'none',secrets:'none'}
    }
  ]));
  return {version:1,credentials,custodyIntent:{
    ownerSigningKey:'offline-owner-only',
    latestHighwater:'outside-github-independent',
    independentRecovery:'separately-controlled-recovery',
    productionEnabled:false
  }};
}
function review(x){return reviewKingsRuntimeCredentialPlan(x);}
test('Five isolated one-repository short-lived identity proposals pass structural review',()=>{
  const result=review(valid());
  assert.equal(result.zeroSecretCredentialPlanStructurallyValid,true);
  assert.equal(result.plannedIdentityCount,5);
  assert.equal(result.eachPlannedCredentialLimitedToOneRepository,true);
  assert.deepEqual(result.plannedRoles.map(x=>x.role),Object.keys(ROLES));
  assert.equal(result.actualGithubInstallationTokenIssued,false);
  assert.equal(result.effectiveGrantedPermissionsVerified,false);
  assert.equal(result.syntheticPilotApproved,false);
  assert.equal(result.safeToActivate,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(Object.isFrozen(result),true);
});
test('Witness must remain read-only, history and backup writers cannot be silently elevated',()=>{
  for(const role of Object.keys(ROLES)){
    const x=valid();x.credentials[role].permissions.contents='admin';
    assert.throws(()=>review(x));
  }
  const x=valid();x.credentials.witnessReader.contentsPermission='write';
  assert.throws(()=>review(x));
});
test('Each runtime credential must address the exact dedicated repository',()=>{
  for(const role of Object.keys(ROLES)){
    const x=valid();
    x.credentials[role].repository=REPOS.backup===ROLES[role].repository?
      REPOS.history:REPOS.backup;
    assert.throws(()=>review(x));
  }
});
test('Public repository, shared installation scope and repository-all grants reject',()=>{
  for(const selection of ['all-repositories','selected-many','unrestricted']){
    const x=valid();x.credentials.historyReader.selection=selection;
    assert.throws(()=>review(x));
  }
  const x=valid();
  x.credentials.historyWriter.repository='Stinkesocke107/kings-logistics-automation';
  assert.throws(()=>review(x));
});
test('Runner roles must be isolated and cannot be executed in public workflow',()=>{
  const x=valid();x.credentials.backupWriter.runner='private-history-worker';
  assert.throws(()=>review(x));
  const y=valid();y.credentials.historyReader.runner='public-github-actions';
  assert.throws(()=>review(y));
});
test('No extra Github API abilities or authority can enter proposed grants',()=>{
  for(const field of ['administration','workflows','actions','issues',
    'pullRequests','secrets']){
    const x=valid();x.credentials.historyWriter.permissions[field]='write';
    assert.throws(()=>review(x));
  }
  const x=valid();x.credentials.historyReader.permissions.untrusted='write';
  assert.throws(()=>review(x));
});
test('Require short lived single-repository installation grants, not PAT or setup admin',()=>{
  for(const kind of ['fine-grained-pat','classic-token','setup-admin',
    'repository-github-token']){
    const x=valid();x.credentials.backupWriter.credentialKind=kind;
    assert.throws(()=>review(x));
  }
});
test('Expiration lifetime must be a bounded integer between one and sixty minutes',()=>{
  for(const value of [0,61,10080,-1,1.25,Infinity,NaN,'30',null]){
    const x=valid();x.credentials.backupReader.maxLifetimeMinutes=value;
    assert.throws(()=>review(x));
  }
  const one=valid();one.credentials.backupReader.maxLifetimeMinutes=1;
  assert.equal(review(one).plannedIdentityCount,5);
});
test('Offline owner private key, independently retained floor and recovery remain required',()=>{
  for(const [field,value] of [
    ['ownerSigningKey','github-actions'],['latestHighwater','github-witness'],
    ['independentRecovery','same-github-account'],['productionEnabled',true]
  ]){
    const x=valid();x.custodyIntent[field]=value;
    assert.throws(()=>review(x));
  }
});
test('Reject leaked token fields, external secret content and duplicate identities',()=>{
  for(const key of ['token','privateKey','authorization']){
    const x=valid();x.credentials.historyReader[key]='SUPER-SECRET-TOKEN';
    assert.throws(()=>review(x),e=>{
      assert.doesNotMatch(String(e),/SUPER-SECRET/);return true;
    });
  }
  const x=valid();x.credentials.backupWriter.identifier=x.credentials.historyWriter.identifier;
  assert.throws(()=>review(x));
});
test('Reject incomplete schemas, missing roles, prototype pollution and unexpected top-level fields',()=>{
  const x=valid();delete x.credentials.witnessReader;
  assert.throws(()=>review(x));
  const y=valid();y.privateEvents=['event:100'];
  assert.throws(()=>review(y));
  const z=valid();z.credentials=Object.create({historyReader:z.credentials.historyReader});
  assert.throws(()=>review(z));
});
test('Public report never includes complete repositories, role identity strings, secrets or Event IDs',()=>{
  const x=valid(),serialized=JSON.stringify(review(x));
  for(const s of [
    ...Object.values(REPOS),
    ...Object.values(x.credentials).map(c=>c.identifier),
    'PRIVATE KEY','GITHUB_TOKEN','event:100'
  ])assert.equal(serialized.includes(s),false);
  assert.equal(review(x).ownerOfflineKeyCustodyDeclaredButNotVerified,true);
  assert.equal(review(x).independentRecoveryStorageVerified,false);
});
