'use strict';
// DRAFT/OFFLINE: concise human-review workboard for a separately authorized
// SYNTHETIC private pilot. Caller-supplied reports are not trusted provenance.
// This code NEVER issues permission, signs decisions or enables production.
const ERROR='Kings Event Capacity synthetic pilot hold audit invalid.';
const EXTERNAL=Object.freeze([
  'Explicit CEO approval for narrowly scoped synthetic private pilot',
  'Real GitHub App token issuance and effective permissions independently checked',
  'Isolated private execution environment and credential revocation procedure',
  'Offline owner signer and independently retained latest signed highwater',
  'Independently controlled backup/recovery storage and isolated restore drill',
  'Full authenticated 24-month Convoy Center historical event evidence',
  'Live effective Discord Staff permissions and two-person review',
  'Privacy, access-logging, retention and security sign-off'
]);
const OFFLINE=Object.freeze([
  ['zeroSecretGrantPlan','zeroSecretCredentialPlanStructurallyValid'],
  ['scopedGetOnlyInstallationInventory','eachCredentialObservedOneExpectedRepository'],
  ['syntheticEncryptedOfflineRecovery','syntheticEncryptionAndSignedJournalIntegrityVerified'],
  ['historicalReviewGapInventory','monthsRequired']
]);
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function reviewKingsSyntheticPilotHoldPoints({
  grantPlanReport=null,scopeBundleReport=null,
  offlineRecoveryReport=null,historicalReadinessReport=null
}={}){
  try{
    const reports=[
      grantPlanReport,scopeBundleReport,offlineRecoveryReport,
      historicalReadinessReport
    ];
    const results={};let checked=0;
    for(let i=0;i<OFFLINE.length;i++){
      const [name,key]=OFFLINE[i],report=reports[i];
      if(report!==null&&!plain(report))fail();
      if(report!==null&&(report.safeToActivate!==false||
        report.freeSlotsCertified!==false))fail();
      const completed=report!==null&&(
        i===3?report[key]===24&&
          report.ongoing24MonthOriginalSourceHistoryVerified===false:
          report[key]===true
      );
      results[name]=completed?'Offline Evidence Supplied':'Missing / Invalid Offline Evidence';
      if(completed)checked++;
    }
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      status:checked===OFFLINE.length?
        'Offline Software Evidence Present — External Authorization Still Blocked':
        'Offline Software Review Incomplete',
      offlineEvidenceChecks:Object.freeze(results),
      offlineChecksSupplied:checked,
      offlineChecksExpected:OFFLINE.length,
      // These untrusted inputs may be forged; never treat them as a pass to write.
      callerReportProvenanceVerified:false,
      externalGatesPending:EXTERNAL,
      externalGatesIndependentlyCompleted:0,
      historicalSourceCompletenessProven:false,
      actualRuntimePermissionsVerified:false,
      latestOwnerHighwaterIndependentlyConfirmed:false,
      externalDisasterRecoveryVerified:false,
      staffEffectiveAccessVerified:false,
      explicitCEOPilotApprovalVerified:false,
      anyCredentialProvisioned:false,
      anyRealEventImported:false,
      productionEnabled:false,
      privateSyntheticWritesAuthorized:false,
      safeToActivate:false,
      freeSlotsCertified:false
    });
  }catch{fail();}
}
module.exports={EXTERNAL,reviewKingsSyntheticPilotHoldPoints};
