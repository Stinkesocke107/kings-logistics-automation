'use strict';
// DRAFT ONLY: validates a proposed ZERO-SECRET, repository-scoped credential
// PLAN. This is not a GitHub permission query, installation token issuance,
// evidence of a real grant, pilot approval or production integration.
const ERROR='Kings Event Capacity private runtime credential plan rejected.';
const REPOS=Object.freeze({
  history:'Stinkesocke107/kings-event-capacity-history',
  witness:'Stinkesocke107/kings-event-capacity-witness',
  backup:'Stinkesocke107/kings-event-capacity-backups'
});
const ROLES=Object.freeze({
  historyReader:{repository:REPOS.history,contents:'read',runner:'private-history-review'},
  historyWriter:{repository:REPOS.history,contents:'write',runner:'private-history-worker'},
  witnessReader:{repository:REPOS.witness,contents:'read',runner:'isolated-owner-review'},
  backupReader:{repository:REPOS.backup,contents:'read',runner:'private-backup-review'},
  backupWriter:{repository:REPOS.backup,contents:'write',runner:'private-backup-worker'}
});
const PERMISSION_KEYS=['metadata','contents','actions','administration',
  'issues','pullRequests','workflows','secrets'];
const ROLE_KEYS=Object.keys(ROLES);
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function exact(x,keys){
  if(!plain(x)||Object.keys(x).sort().join(',')!==[...keys].sort().join(','))fail();
}
function reviewKingsRuntimeCredentialPlan(input={}){
  try{
    exact(input,['version','credentials','custodyIntent']);
    if(input.version!==1)fail();
    exact(input.credentials,ROLE_KEYS);
    exact(input.custodyIntent,['ownerSigningKey','latestHighwater',
      'independentRecovery','productionEnabled']);
    if(input.custodyIntent.ownerSigningKey!=='offline-owner-only'||
      input.custodyIntent.latestHighwater!=='outside-github-independent'||
      input.custodyIntent.independentRecovery!=='separately-controlled-recovery'||
      input.custodyIntent.productionEnabled!==false)fail();
    const identities=new Set();
    for(const role of ROLE_KEYS){
      const wanted=ROLES[role],entry=input.credentials[role];
      exact(entry,['identifier','repository','contentsPermission','runner',
        'credentialKind','selection','maxLifetimeMinutes','permissions']);
      if(entry.identifier!=='kings-capacity-'+role+'-proposal-v1'||
        identities.has(entry.identifier)||entry.repository!==wanted.repository||
        entry.runner!==wanted.runner||
        entry.contentsPermission!==wanted.contents||
        entry.credentialKind!=='short-lived-github-app-installation'||
        entry.selection!=='exactly-one-repository'||
        !Number.isSafeInteger(entry.maxLifetimeMinutes)||
        entry.maxLifetimeMinutes<1||entry.maxLifetimeMinutes>60)fail();
      identities.add(entry.identifier);
      exact(entry.permissions,PERMISSION_KEYS);
      if(entry.permissions.metadata!=='read'||
        entry.permissions.contents!==wanted.contents||
        PERMISSION_KEYS.some(k=>!['metadata','contents'].includes(k)&&
          entry.permissions[k]!=='none'))fail();
    }
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      zeroSecretCredentialPlanStructurallyValid:true,
      plannedRoles:ROLE_KEYS.map(role=>Object.freeze({
        role,repositoryRole:role.startsWith('history')?'history':
          role.startsWith('witness')?'witness':'backup',
        contentPermission:ROLES[role].contents,
        requestedSingleRepositoryOnly:true
      })),
      plannedIdentityCount:identities.size,
      eachPlannedCredentialLimitedToOneRepository:true,
      ownerOfflineKeyCustodyDeclaredButNotVerified:true,
      actualGithubInstallationTokenIssued:false,
      effectiveGrantedPermissionsVerified:false,
      separateRuntimeCredentialCustodyVerified:false,
      independentHighwaterStorageVerified:false,
      independentRecoveryStorageVerified:false,
      syntheticPilotApproved:false,
      safeToActivate:false,
      historicalCoverageCertified:false,
      freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={REPOS,ROLES,reviewKingsRuntimeCredentialPlan};
