'use strict';
// DRAFT/PURE: inspect the REDACTED metadata shape of an already issued,
// externally approved GitHub App installation token. NEVER accept raw tokens,
// issue credentials, call GitHub, store keys or trust caller authenticity.
// This is not a production credential scope or owner authorization proof.
const {ROLES}=require('./event-capacity-private-runtime-grant-policy');
const ERROR='Kings Event Capacity redacted installation grant metadata invalid.';
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function exact(x,fields){
  if(!plain(x)||Object.keys(x).sort().join(',')!==[...fields].sort().join(','))fail();
}
function isoDate(value){
  if(typeof value!=='string'||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value)||
    !Number.isFinite(Date.parse(value))||
    new Date(value).toISOString()!==value)fail();
  return Date.parse(value);
}
function inspectRedactedGithubAppGrantMetadata({
  role,receipt,nowMs=Date.now()
}={}){
  try{
    if(!Object.hasOwn(ROLES,role)||!Number.isFinite(nowMs)||
      nowMs<0||nowMs>8640000000000000)fail();
    // The external reviewer must remove the token and all unnecessary
    // provider response fields before handing over this small, safe record.
    exact(receipt,['tokenOmitted','expiresAt','repositorySelection',
      'repositories','permissions']);
    if(receipt.tokenOmitted!==true||
      receipt.repositorySelection!=='selected'||
      !Array.isArray(receipt.repositories)||
      receipt.repositories.length!==1)fail();
    const spec=ROLES[role];
    const repo=receipt.repositories[0];
    exact(repo,['fullName','private','defaultBranch']);
    if(repo.fullName!==spec.repository||repo.private!==true||
      repo.defaultBranch!=='main')fail();
    exact(receipt.permissions,['metadata','contents']);
    if(receipt.permissions.metadata!=='read'||
      receipt.permissions.contents!==spec.contents)fail();
    const expiry=isoDate(receipt.expiresAt);
    // The service typically uses an hour-long installation token. Require
    // a short remaining validity but do NOT infer its actual issuance time.
    if(expiry<=nowMs||expiry>nowMs+60*60000)fail();
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      role,redactedMetadataSchemaMatched:true,
      plannedOneRepositoryScopeMatched:true,
      proposedContentsPermissionMatched:true,
      expiryWithinSixtyMinutesObserved:true,
      rawTokenPresentInInput:false,
      actualTokenIssuanceProven:false,
      authenticGithubProviderResponseVerified:false,
      effectiveTokenPermissionsIndependentlyVerified:false,
      tokenCustodyAndRevocationVerified:false,
      broaderInstallationScopeExcludedByThisSnapshot:false,
      offlineOwnerApprovalVerified:false,
      safeForPrivateSyntheticWrites:false,
      safeToActivate:false,freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={inspectRedactedGithubAppGrantMetadata};
