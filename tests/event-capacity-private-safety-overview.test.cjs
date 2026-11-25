'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {crosscheckKingsHistoricalEvidenceClaims}
  =require('../event-capacity-historical-evidence-gap-audit');
const {inspectKingsNinetyDayBackupRecovery}
  =require('../event-capacity-backup-90day-recovery-audit');
const {summarizeKingsCapacityPrivateSafety}
  =require('../event-capacity-private-safety-overview');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const h=x=>crypto.createHash('sha256').update(x).digest('hex');
function sample(){
  const x=setup();
  const historicalEvidenceReport=crosscheckKingsHistoricalEvidenceClaims({
    firstMonth:'2025-06',sourceRecords:[{
      ref:'event:100',sourceKind:'current',sourceStatus:'Rescheduled',
      category:'Partner Convoy',departureAtUtc:'2027-04-20T18:00:00.000Z',
      sourceDigest:h('private source'),evidenceDigests:[h('e0'),h('e1')]
    }],
    journal:x.afterJournal,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    reviewSecret:'an isolated synthetic review HMAC secret for tests',
    nowMs:NOW
  });
  const backupRecoveryReport=inspectKingsNinetyDayBackupRecovery({nowMs:NOW});
  const runtimeScopeReport={
    visibility:'PRIVATE_ONLY',readOnly:true,safeToActivate:false,
    freeSlotsCertified:false,
    eachCredentialObservedOneExpectedRepository:true,
    effectivePermissionScopesVerified:false,
    privateSyntheticPilotApproved:false
  };
  const syntheticRestoreReport={
    visibility:'PRIVATE_ONLY',readOnly:true,safeToActivate:false,
    freeSlotsCertified:false,
    syntheticEncryptionAndSignedJournalIntegrityVerified:true,
    productionRestorePerformed:false,
    actualIndependentStorageCustodyVerified:false,
    latestOwnerFloorProven:false
  };
  return {historicalEvidenceReport,backupRecoveryReport,
    runtimeScopeReport,syntheticRestoreReport};
}
test('CEO safety overview composes real offline audit outputs without claiming ready',()=>{
  const r=summarizeKingsCapacityPrivateSafety(sample());
  assert.equal(r.softwareReviewReportsPresent,4);
  assert.equal(r.softwareReviewReportsExpected,4);
  assert.equal(r.counts.observedHistoricalEvidenceGaps,0);
  assert.equal(r.counts.missingNinetyDayBackupClaims,90);
  assert.equal(r.originalPrivateEventSourcesAuthenticated,false);
  assert.equal(r.explicitCEOProductionApprovalVerified,false);
  assert.equal(r.eventAvailabilityCertified,false);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('No reports is a truthful incomplete state with null gap statistics',()=>{
  const r=summarizeKingsCapacityPrivateSafety();
  assert.equal(r.softwareReviewReportsPresent,0);
  assert.equal(r.counts.observedHistoricalEvidenceGaps,null);
  assert.equal(r.counts.missingNinetyDayBackupClaims,null);
  assert.equal(r.review.historicalEvidence.state,'No Offline Review Supplied');
});
test('Partial reports cannot be mislabeled as all offline reviews present',()=>{
  const x=sample();delete x.runtimeScopeReport;delete x.syntheticRestoreReport;
  const r=summarizeKingsCapacityPrivateSafety(x);
  assert.equal(r.softwareReviewReportsPresent,2);
  assert.equal(r.safeToActivate,false);
});
test('Forged grant or recovery success cannot authorize production',()=>{
  for(const key of ['runtimeScopeReport','syntheticRestoreReport']){
    const x=sample();x[key]={...x[key],safeToActivate:true};
    assert.throws(()=>summarizeKingsCapacityPrivateSafety(x));
  }
  const y=sample();y.backupRecoveryReport={
    ...y.backupRecoveryReport,freeSlotsCertified:true
  };
  assert.throws(()=>summarizeKingsCapacityPrivateSafety(y));
});
test('Faked original source proof or independent backup cannot pass report constraints',()=>{
  const x=sample();x.historicalEvidenceReport={
    ...x.historicalEvidenceReport,
    originalSourceRecordsIndependentlyAuthenticated:true
  };
  assert.throws(()=>summarizeKingsCapacityPrivateSafety(x));
  const y=sample();y.backupRecoveryReport={
    ...y.backupRecoveryReport,
    independentOffsiteStorageCustodyVerified:true
  };
  assert.throws(()=>summarizeKingsCapacityPrivateSafety(y));
});
test('No sensitive original event refs, original source digests or encryption keys leak',()=>{
  const r=summarizeKingsCapacityPrivateSafety(sample());
  const serialized=JSON.stringify(r);
  for(const hidden of ['event:100','Partner Convoy','PRIVATE KEY',
    h('e0'),h('private source'),'DISCORD_BOT_TOKEN'])
    assert.equal(serialized.includes(hidden),false);
});
test('Untrusted fake report numbers and negative counts fail closed',()=>{
  const x=sample();x.historicalEvidenceReport={
    ...x.historicalEvidenceReport,counters:{
      ...x.historicalEvidenceReport.counters,
      unresolvedEvidenceGaps:-2
    }
  };
  assert.throws(()=>summarizeKingsCapacityPrivateSafety(x));
  const y=sample();y.backupRecoveryReport={
    ...y.backupRecoveryReport,counts:{
      ...y.backupRecoveryReport.counts,missingClaimedBackups:91
    }
  };
  assert.throws(()=>summarizeKingsCapacityPrivateSafety(y));
});
