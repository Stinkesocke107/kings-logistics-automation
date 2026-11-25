'use strict';
// DRAFT; five isolated GET-only installation inventory checks.
// Scope-only, no permission-level attestation, no token issuance, no writes.
// Never run this with the broad GitHub setup actor, a public Actions token,
// real user Event data or without separate CEO authorization for the pilot.
const {ROLES,reviewKingsRuntimeCredentialPlan}
  =require('./event-capacity-private-runtime-grant-policy');
const {createIsolatedInstallationScopeProbe}
  =require('./event-capacity-private-runtime-installation-scope-probe');
const ERROR='Kings Event Capacity separate runtime scope review failed.';
const ROLE_NAMES=Object.keys(ROLES);
function fail(){throw new Error(ERROR);}
function plain(o){return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype;}
function exact(o,keys){
  if(!plain(o)||Object.keys(o).sort().join(',')!==keys.slice().sort().join(','))fail();
}
function repoRole(credentialRole){
  return credentialRole.startsWith('history')?'history':
    credentialRole.startsWith('witness')?'witness':'backup';
}
function createKingsIsolatedRuntimeScopeBundle({
  plan,roleTokens,transportForRole
}={}){
  try{
    const planning=reviewKingsRuntimeCredentialPlan(plan);
    if(planning.zeroSecretCredentialPlanStructurallyValid!==true||
      typeof transportForRole!=='function')fail();
    exact(roleTokens,ROLE_NAMES);
    const unique=new Set(),probes=[];
    for(const role of ROLE_NAMES){
      const token=roleTokens[role];
      if(typeof token!=='string'||unique.has(token))fail();
      unique.add(token);
      const transport=transportForRole(role);
      if(typeof transport!=='function')fail();
      probes.push({role,probe:createIsolatedInstallationScopeProbe({
        repositoryRole:repoRole(role),token,transport
      })});
    }
    if(unique.size!==ROLE_NAMES.length)fail();
    async function read(){
      try{
        // Sequential by design: a failed role prevents later credentials
        // being used, and isolates failures to an independent human review.
        const results=[];
        for(const {role,probe} of probes){
          const observed=await probe.read();
          if(observed.exactSingleRepositoryInventoryObserved!==true||
            observed.twoConsistentInstallationInventoryReads!==true||
            observed.actualTokenPermissionLevelsProven!==false||
            observed.role!==repoRole(role))fail();
          results.push(Object.freeze({
            role,repositoryRole:observed.role,
            isolatedSingleRepositoryVisible:true,
            effectiveReadWriteGrantsProven:false
          }));
        }
        return Object.freeze({
          visibility:'PRIVATE_ONLY',readOnly:true,
          plannedCredentialsReviewed:ROLE_NAMES.length,
          distinctCredentialStringsSupplied:true,
          eachCredentialObservedOneExpectedRepository:true,
          observedRoles:Object.freeze(results),
          authenticatedSourceOfInjectedTransportProven:false,
          effectivePermissionScopesVerified:false,
          shortLivedTokenExpirationsVerified:false,
          credentialIssuancePerformed:false,
          credentialRevocationVerified:false,
          currentOwnerHighwaterIndependentlyRetained:false,
          privateSyntheticPilotApproved:false,
          safeToActivate:false,freeSlotsCertified:false
        });
      }catch{fail();}
    }
    return Object.freeze({read});
  }catch{fail();}
}
module.exports={createKingsIsolatedRuntimeScopeBundle};
