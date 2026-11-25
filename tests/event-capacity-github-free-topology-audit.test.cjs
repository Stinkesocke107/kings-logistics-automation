'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ROLES,auditKingsGitHubFreeRepositoryTopology}
  =require('../event-capacity-github-free-topology-audit');
function valid(){
  const permission={admin:true,maintain:true,pull:true,push:true,triage:true};
  const entries=Object.fromEntries(Object.entries(ROLES).map(([role,name],i)=>[
    role,{repository_full_name:name,id:String(1471110012+i*44),
      visibility:'private',default_branch:'main',archived:false,
      permissions:{...permission},mainBranchFound:true}
  ]));
  return {repositories:entries,installation:{
    selection:'selected',
    accessibleRepositoryNames:[
      'Stinkesocke107/kings-logistics-automation',
      ...Object.values(ROLES)
    ]
  }};
}
function check(v){return auditKingsGitHubFreeRepositoryTopology(v);}
test('Exactly three dedicated Kings private repos on GitHub Free are accepted as observed',()=>{
  const v=valid(),out=check(v);
  assert.equal(out.exactKingsPrivateRepositorySetVerified,true);
  assert.equal(out.verifiedPrivateRepositoryCount,3);
  assert.equal(out.selectedGitHubAppInstallationObserved,true);
  assert.deepEqual(out.roles.map(x=>x.role),['history','witness','backup']);
  assert.ok(out.roles.every(x=>x.mainBranchExists&&x.private));
  assert.equal(out.connectedActorHasBroadWriteRightsReported,true);
  assert.deepEqual(out.broadWriteRightsRoles,['history','witness','backup']);
  assert.equal(out.runtimeLeastPrivilegeCredentialVerified,false);
  assert.equal(out.safeForSensitiveWrites,false);
  assert.equal(out.safeForProductionSecrets,false);
  assert.equal(out.historicalCoverageCertified,false);
  assert.equal(out.freeSlotsCertified,false);
});
test('Read-only metadata approval never implies independent custody or live launch',()=>{
  const v=valid();for(const role of Object.keys(ROLES)){
    v.repositories[role].permissions={admin:false,maintain:false,
      pull:true,push:false,triage:false};
  }
  const out=check(v);
  assert.equal(out.connectedActorHasBroadWriteRightsReported,false);
  assert.equal(out.runtimeLeastPrivilegeCredentialVerified,false);
  assert.equal(out.ownerOfflineSigningKeyCustodyVerified,false);
  assert.equal(out.independentHighwaterCustodyVerified,false);
  assert.equal(out.independentDisasterRecoveryVerified,false);
  assert.equal(out.actualPrivateDataProvisionedByAudit,false);
  assert.equal(out.safeForSensitiveWrites,false);
});
test('Swapped history/witness and typo repos are not silently accepted',()=>{
  const v=valid();const tmp=v.repositories.history;
  v.repositories.history=v.repositories.witness;
  v.repositories.witness=tmp;
  assert.throws(()=>check(v));
  const another=valid();
  another.repositories.backup.repository_full_name='Stinkesocke107/kings-event-capacity-backup';
  assert.throws(()=>check(another));
});
test('Public repo or missing real main branch is never accepted',()=>{
  for(const [key,value] of [
    ['visibility','public'],['archived',true],['mainBranchFound',false],
    ['default_branch','master']
  ]){
    const v=valid();v.repositories.history[key]=value;
    assert.throws(()=>check(v));
  }
});
test('GitHub App must include all three repos using selected repository access',()=>{
  const v=valid();v.installation.accessibleRepositoryNames=
    v.installation.accessibleRepositoryNames.filter(x=>x!==ROLES.witness);
  assert.throws(()=>check(v));
  const w=valid();w.installation.selection='all';
  assert.throws(()=>check(w));
  const dup=valid();dup.installation.accessibleRepositoryNames.push(ROLES.history);
  assert.throws(()=>check(dup));
});
test('Duplicate GitHub repository ids and incomplete permission schemas are rejected',()=>{
  const v=valid();v.repositories.backup.id=v.repositories.witness.id;
  assert.throws(()=>check(v));
  const y=valid();delete y.repositories.history.permissions.pull;
  assert.throws(()=>check(y));
  const z=valid();z.repositories.history.permissions.push='yes';
  assert.throws(()=>check(z));
});
test('No private repo access tokens, ids or event payloads appear in the safety report',()=>{
  const v=valid(),out=check(v),text=JSON.stringify(out);
  for(const token of [
    ...Object.values(ROLES),...Object.values(v.repositories).map(x=>x.id),
    'DISCORD_BOT_TOKEN','event:100','PRIVATE KEY'
  ])assert.equal(text.includes(token),false);
  assert.equal(Object.isFrozen(out),true);
});
test('Malformed data fails closed without exposing contents in errors',()=>{
  const v=valid();
  const bad={...v,unexpected:'private-token-sensitive'};
  assert.throws(()=>check(bad),err=>{
    assert.doesNotMatch(String(err),/private-token-sensitive/);
    return true;
  });
  const another=valid();another.repositories.backup.permissions.token='never';
  assert.throws(()=>check(another));
  assert.throws(()=>check({}));
});
