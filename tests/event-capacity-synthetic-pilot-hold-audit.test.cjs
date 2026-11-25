'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EXTERNAL,reviewKingsSyntheticPilotHoldPoints}
  =require('../event-capacity-synthetic-pilot-hold-audit');
function reports(){
  return {
    grantPlanReport:{
      zeroSecretCredentialPlanStructurallyValid:true,
      safeToActivate:false,freeSlotsCertified:false
    },
    scopeBundleReport:{
      eachCredentialObservedOneExpectedRepository:true,
      safeToActivate:false,freeSlotsCertified:false
    },
    offlineRecoveryReport:{
      syntheticEncryptionAndSignedJournalIntegrityVerified:true,
      safeToActivate:false,freeSlotsCertified:false
    },
    historicalReadinessReport:{
      monthsRequired:24,
      ongoing24MonthOriginalSourceHistoryVerified:false,
      safeToActivate:false,freeSlotsCertified:false
    }
  };
}
test('All four synthetic software results do not grant a private pilot or any production authority',()=>{
  const r=reviewKingsSyntheticPilotHoldPoints(reports());
  assert.equal(r.offlineChecksSupplied,4);
  assert.equal(r.offlineChecksExpected,4);
  assert.match(r.status,/External Authorization Still Blocked/);
  assert.equal(r.externalGatesPending.length,8);
  assert.equal(r.externalGatesIndependentlyCompleted,0);
  assert.equal(r.actualRuntimePermissionsVerified,false);
  assert.equal(r.explicitCEOPilotApprovalVerified,false);
  assert.equal(r.privateSyntheticWritesAuthorized,false);
  assert.equal(r.productionEnabled,false);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Absent offline evidence keeps all checks incomplete rather than defaulting to true',()=>{
  const result=reviewKingsSyntheticPilotHoldPoints();
  assert.equal(result.offlineChecksSupplied,0);
  assert.equal(result.offlineChecksExpected,4);
  assert.equal(result.privateSyntheticWritesAuthorized,false);
  assert.equal(result.externalGatesPending.length,EXTERNAL.length);
});
test('Partial inventory has a consistent bounded review summary',()=>{
  const r=reviewKingsSyntheticPilotHoldPoints({
    grantPlanReport:reports().grantPlanReport,
    offlineRecoveryReport:reports().offlineRecoveryReport
  });
  assert.equal(r.offlineChecksSupplied,2);
  assert.equal(r.offlineEvidenceChecks.scopedGetOnlyInstallationInventory,
    'Missing / Invalid Offline Evidence');
});
test('Malicious claimed activation or certifiable Event availability is rejected',()=>{
  for(const key of Object.keys(reports())){
    const inputs=reports();inputs[key]={...inputs[key],safeToActivate:true};
    assert.throws(()=>reviewKingsSyntheticPilotHoldPoints(inputs));
    const other=reports();other[key]={...other[key],freeSlotsCertified:true};
    assert.throws(()=>reviewKingsSyntheticPilotHoldPoints(other));
  }
});
test('Fake evidence can never elevate external gate completion',()=>{
  const inputs=reports();
  inputs.grantPlanReport={
    ...inputs.grantPlanReport,effectiveGithubScopeVerified:true
  };
  inputs.scopeBundleReport={
    ...inputs.scopeBundleReport,explicitCEOPilotApprovalVerified:true
  };
  const result=reviewKingsSyntheticPilotHoldPoints(inputs);
  assert.equal(result.actualRuntimePermissionsVerified,false);
  assert.equal(result.explicitCEOPilotApprovalVerified,false);
  assert.equal(result.externalGatesIndependentlyCompleted,0);
});
test('Untrusted inputs cannot accidentally inject secrets or raw Events into report',()=>{
  const inputs=reports();
  inputs.grantPlanReport={
    ...inputs.grantPlanReport,rawEvents:['event:100'],token:'SUPER_SECRET'
  };
  const text=JSON.stringify(reviewKingsSyntheticPilotHoldPoints(inputs));
  assert.doesNotMatch(text,/event:100|SUPER_SECRET|PRIVATE KEY/);
  assert.match(text,/Offline Software Evidence Present/);
});
test('Wrong object types, arrays, and prototype objects fail closed',()=>{
  for(const value of ['yes',[],true,1,Object.create({safeToActivate:false})]){
    assert.throws(()=>reviewKingsSyntheticPilotHoldPoints({
      grantPlanReport:value
    }));
  }
});
test('No checklist labels falsely promise that actual data or tokens were verified',()=>{
  const result=reviewKingsSyntheticPilotHoldPoints(reports());
  assert.equal(result.callerReportProvenanceVerified,false);
  assert.equal(result.anyCredentialProvisioned,false);
  assert.equal(result.anyRealEventImported,false);
  assert.equal(result.externalDisasterRecoveryVerified,false);
  assert.equal(result.staffEffectiveAccessVerified,false);
  assert.equal(result.historicalSourceCompletenessProven,false);
});
