'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ROLES}=require('../event-capacity-private-runtime-grant-policy');
const {inspectRedactedGithubAppGrantMetadata}
  =require('../event-capacity-private-issued-grant-metadata-audit');
const NOW=Date.parse('2026-11-25T03:00:00.000Z');
const names=Object.keys(ROLES);
function sample(role='historyReader'){
  return {role,nowMs:NOW,receipt:{
    tokenOmitted:true,expiresAt:'2026-11-25T03:45:00.000Z',
    repositorySelection:'selected',
    repositories:[{fullName:ROLES[role].repository,
      private:true,defaultBranch:'main'}],
    permissions:{metadata:'read',contents:ROLES[role].contents}
  }};
}
test('Five separately redacted single-repository role grants match exact planned metadata only',()=>{
  for(const role of names){
    const result=inspectRedactedGithubAppGrantMetadata(sample(role));
    assert.equal(result.role,role);
    assert.equal(result.redactedMetadataSchemaMatched,true);
    assert.equal(result.plannedOneRepositoryScopeMatched,true);
    assert.equal(result.proposedContentsPermissionMatched,true);
    assert.equal(result.effectiveTokenPermissionsIndependentlyVerified,false);
    assert.equal(result.safeForPrivateSyntheticWrites,false);
    assert.equal(result.safeToActivate,false);
  }
});
test('Raw token, private signing key, arbitrary extra fields and provider payload leak fail closed',()=>{
  for(const extra of ['token','privateKey','rawEvent','admin']) {
    const x=sample();
    x.receipt[extra]='SUPER_SECRET_TOKEN';
    assert.throws(()=>inspectRedactedGithubAppGrantMetadata(x),e=>{
      assert.doesNotMatch(String(e),/SUPER_SECRET_TOKEN/);return true;
    });
  }
});
test('Broad installation scope and wrong repository fail',()=>{
  const a=sample();
  a.receipt.repositories.push({fullName:ROLES.backupWriter.repository,
    private:true,defaultBranch:'main'});
  assert.throws(()=>inspectRedactedGithubAppGrantMetadata(a));
  const b=sample();
  b.receipt.repositories[0].fullName='Stinkesocke107/kings-logistics-automation';
  assert.throws(()=>inspectRedactedGithubAppGrantMetadata(b));
});
test('Grant can never elevate contents permissions or add admin and workflow scopes',()=>{
  for(const changed of ['admin','write','none']) {
    const x=sample('historyReader');
    x.receipt.permissions.contents=changed;
    assert.throws(()=>inspectRedactedGithubAppGrantMetadata(x));
  }
  for(const extra of ['administration','actions','workflows','issues']){
    const x=sample();
    x.receipt.permissions[extra]='write';
    assert.throws(()=>inspectRedactedGithubAppGrantMetadata(x));
  }
});
test('Witness reviewer is strictly read-only even if all other metadata looks correct',()=>{
  const x=sample('witnessReader');
  x.receipt.permissions.contents='write';
  assert.throws(()=>inspectRedactedGithubAppGrantMetadata(x));
});
test('Short expiry must be within sixty minutes and strictly in the future',()=>{
  for(const time of ['2026-11-25T02:59:59.000Z',
    '2026-11-25T03:00:00.000Z','2026-11-25T04:01:00.000Z',
    '2026-11-25T03:30:00.000+00:00','invalid']){
    const x=sample();x.receipt.expiresAt=time;
    assert.throws(()=>inspectRedactedGithubAppGrantMetadata(x));
  }
  const x=sample();
  x.receipt.expiresAt='2026-11-25T04:00:00.000Z';
  assert.equal(inspectRedactedGithubAppGrantMetadata(x).expiryWithinSixtyMinutesObserved,true);
});
test('Missing token-redacted field, untrusted selection mode and unsupported roles refuse',()=>{
  const x=sample();delete x.receipt.tokenOmitted;
  assert.throws(()=>inspectRedactedGithubAppGrantMetadata(x));
  const y=sample();y.receipt.repositorySelection='all';
  assert.throws(()=>inspectRedactedGithubAppGrantMetadata(y));
  const z=sample();z.role='publicAdmin';
  assert.throws(()=>inspectRedactedGithubAppGrantMetadata(z));
});
test('Readiness never implies trusted Github origin, real issuance, independent custody or approval',()=>{
  const out=inspectRedactedGithubAppGrantMetadata(sample());
  for(const key of [
    'actualTokenIssuanceProven','authenticGithubProviderResponseVerified',
    'effectiveTokenPermissionsIndependentlyVerified',
    'tokenCustodyAndRevocationVerified',
    'broaderInstallationScopeExcludedByThisSnapshot',
    'offlineOwnerApprovalVerified','safeForPrivateSyntheticWrites',
    'safeToActivate','freeSlotsCertified'
  ])assert.equal(out[key],false);
});
test('Output redacts repository full names, future token, and all Event identities',()=>{
  const out=inspectRedactedGithubAppGrantMetadata(sample('backupWriter'));
  const serial=JSON.stringify(out);
  for(const sensitive of [
    ...Object.values(ROLES).map(x=>x.repository),
    'ghs_private_test_token','PRIVATE KEY','event:100'
  ])assert.equal(serial.includes(sensitive),false);
});
