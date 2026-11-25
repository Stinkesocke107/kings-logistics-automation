'use strict';
// DRAFT / OFFLINE: strict, zero-credentials Kings GitHub Free topology audit.
// Input must originate from trusted GitHub repository metadata + installation
// scope/branch queries; this validator does NOT fetch or verify caller origin.
// No tokens, secrets, event records, writes, or release authorization.
const ERROR='Kings Event Capacity private repository topology could not be verified.';
const ROLES=Object.freeze({
  history:'Stinkesocke107/kings-event-capacity-history',
  witness:'Stinkesocke107/kings-event-capacity-witness',
  backup:'Stinkesocke107/kings-event-capacity-backups'
});
const KEYS=['history','witness','backup'];
const REPO_KEYS=[
  'repository_full_name','id','visibility','default_branch','archived',
  'permissions','mainBranchFound'
];
const SHA=/^\d{6,20}$/;
function fail(){throw new Error(ERROR);}
function isPlain(v){
  return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
    Object.getPrototypeOf(v)===Object.prototype;
}
function exact(v,names){
  if(!isPlain(v)||Object.keys(v).sort().join(',')!==
    [...names].sort().join(','))fail();
}
function auditKingsGitHubFreeRepositoryTopology({
  repositories,installation
}={}){
  try{
    exact(repositories,KEYS);
    exact(installation,['selection','accessibleRepositoryNames']);
    if(installation.selection!=='selected'||
      !Array.isArray(installation.accessibleRepositoryNames)||
      installation.accessibleRepositoryNames.length>1000)fail();
    const visible=new Set();
    for(const name of installation.accessibleRepositoryNames){
      if(typeof name!=='string'||name.length>256||
        visible.has(name))fail();
      visible.add(name);
    }
    const ids=new Set(),roles=[],broad=[];
    for(const role of KEYS){
      const item=repositories[role];
      exact(item,REPO_KEYS);
      if(item.repository_full_name!==ROLES[role]||
        item.visibility!=='private'||item.default_branch!=='main'||
        item.archived!==false||item.mainBranchFound!==true||
        (typeof item.id!=='string'&&!Number.isSafeInteger(item.id))||
        !SHA.test(String(item.id))||ids.has(String(item.id))||
        !visible.has(ROLES[role]))fail();
      exact(item.permissions,['admin','maintain','pull','push','triage']);
      if(Object.values(item.permissions).some(value=>typeof value!=='boolean')||
        item.permissions.pull!==true)fail();
      ids.add(String(item.id));
      roles.push(Object.freeze({role,private:true,
        mainBranchExists:true,installationAccessible:true}));
      if(item.permissions.admin||item.permissions.push||item.permissions.maintain)
        broad.push(role);
    }
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      exactKingsPrivateRepositorySetVerified:true,
      verifiedPrivateRepositoryCount:3,
      selectedGitHubAppInstallationObserved:true,
      roles,
      connectedActorHasBroadWriteRightsReported:broad.length>0,
      broadWriteRightsRoles:broad,
      runtimeLeastPrivilegeCredentialVerified:false,
      ownerOfflineSigningKeyCustodyVerified:false,
      independentHighwaterCustodyVerified:false,
      independentDisasterRecoveryVerified:false,
      actualPrivateDataProvisionedByAudit:false,
      safeForProductionSecrets:false,
      safeForSensitiveWrites:false,
      historicalCoverageCertified:false,
      freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={ROLES,auditKingsGitHubFreeRepositoryTopology};
