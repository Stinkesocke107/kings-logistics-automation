'use strict';
// Integration rehearsal: all provider responses, Event sources and keys are
// SYNTHETIC. No GitHub HTTP, Discord I/O, filesystem or real private records.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {ROLES}=require('../event-capacity-private-runtime-grant-policy');
const {createKingsIsolatedRuntimeScopeBundle}
  =require('../event-capacity-private-runtime-scope-bundle');
const {createEncryptedOffsiteHistoricalBackup}
  =require('../event-capacity-historical-offsite-backup');
const {packSegmentedEncryptedBackup}
  =require('../event-capacity-historical-segmented-backup');
const {prepareOfflineOwnerHighwaterCard,fingerprintSignedOfflineOwnerFloor}
  =require('../event-capacity-independent-owner-highwater');
const {simulateKingsOfflineSyntheticRecovery}
  =require('../event-capacity-offline-synthetic-recovery-drill');
const {crosscheckKingsHistoricalEvidenceClaims}
  =require('../event-capacity-historical-evidence-gap-audit');
const {reviewSignedHistoricalReservationHolds}
  =require('../event-capacity-historical-reservation-holds');
const {inspectKingsNinetyDayBackupRecovery}
  =require('../event-capacity-backup-90day-recovery-audit');
const {summarizeKingsCapacityPrivateSafety}
  =require('../event-capacity-private-safety-overview');
const {evaluate}=require('../event-capacity-core');
const {projectKingsStaffCalendarReview,renderKingsStaffCalendarEphemeral}
  =require('../event-capacity-staff-calendar-review');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const SOURCE='synthetic private encryption secret for test only and never production';
const BACKUP='independent synthetic backup secret held away from private source';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function plan(){
  const roles=Object.keys(ROLES);
  return {version:1,credentials:Object.fromEntries(roles.map(role=>{
    const p=ROLES[role];
    return [role,{
      identifier:'kings-capacity-'+role+'-proposal-v1',
      repository:p.repository,contentsPermission:p.contents,runner:p.runner,
      credentialKind:'short-lived-github-app-installation',
      selection:'exactly-one-repository',maxLifetimeMinutes:30,
      permissions:{metadata:'read',contents:p.contents,actions:'none',
        administration:'none',issues:'none',pullRequests:'none',
        workflows:'none',secrets:'none'}
    }];
  })),custodyIntent:{
    ownerSigningKey:'offline-owner-only',
    latestHighwater:'outside-github-independent',
    independentRecovery:'separately-controlled-recovery',
    productionEnabled:false
  }};
}
function specimen(){
  const x=setup();
  const signed=prepareOfflineOwnerHighwaterCard({
    ownerReceipt:x.nextOwnerReceipt,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  const separate=structuredClone(signed);
  const fingerprint=fingerprintSignedOfflineOwnerFloor({
    retainedOwnerCard:signed,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,nowMs:NOW
  });
  const envelope=createEncryptedOffsiteHistoricalBackup({
    archive:x.next.archive,ownerReceipt:x.nextOwnerReceipt,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:SOURCE,backupSecret:BACKUP,nowMs:NOW
  }).envelope;
  const packaged=packSegmentedEncryptedBackup({
    envelope,expectedOwnerReceipt:x.nextOwnerReceipt,scope:SCOPE,
    ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:SOURCE,backupSecret:BACKUP,
    chunkBytes:1024,nowMs:NOW
  });
  const recoveryArgs={primaryOwnerCard:signed,recoveryOwnerCard:separate,
    expectedFingerprint:fingerprint,manifest:packaged.manifest,
    parts:packaged.parts,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    encryptionSecret:SOURCE,backupSecret:BACKUP,nowMs:NOW};
  const sourceClaims=[{
    ref:'event:100',sourceKind:'current',sourceStatus:'Rescheduled',
    category:'Partner Convoy',departureAtUtc:'2027-04-20T18:00:00.000Z',
    sourceDigest:hash('synthetic original source bytes'),
    evidenceDigests:[hash('e0'),hash('e1')]
  }];
  return {x,recoveryArgs,sourceClaims};
}
async function fullReview({missingSource=false,tamperedBackup=false}={}){
  const s=specimen(),roleTokens=Object.fromEntries(Object.keys(ROLES)
    .map(role=>[role,'synthetic-'+role+'-isolated-test-access-token']));
  const runtime=createKingsIsolatedRuntimeScopeBundle({
    plan:plan(),roleTokens,transportForRole:role=>async()=>Response.json({
      total_count:1,repositories:[{
        id:2461000+Object.keys(ROLES).indexOf(role),
        full_name:ROLES[role].repository,private:true,
        default_branch:'main',archived:false,disabled:false
      }]
    })
  });
  const runtimeScopeReport=await runtime.read();
  const historicalEvidenceReport=crosscheckKingsHistoricalEvidenceClaims({
    firstMonth:'2025-06',sourceRecords:missingSource?[]:s.sourceClaims,
    journal:s.x.afterJournal,scope:SCOPE,
    ownerPublicKey:s.x.ownerPublicKey,
    reviewSecret:'synthetic review-only HMAC key for private tests',
    nowMs:NOW
  });
  const backupRecoveryReport=inspectKingsNinetyDayBackupRecovery({nowMs:NOW});
  const recoveryArgs={...s.recoveryArgs};
  if(tamperedBackup){
    const corrupted=[...recoveryArgs.parts];
    corrupted[0]=Buffer.from('corrupt').toString('base64');
    recoveryArgs.parts=corrupted;
  }
  const syntheticRestoreReport=simulateKingsOfflineSyntheticRecovery(recoveryArgs);
  const historicalHoldsReport=reviewSignedHistoricalReservationHolds({
    journal:s.x.afterJournal,scope:SCOPE,
    ownerPublicKey:s.x.ownerPublicKey,month:'2027-04',nowMs:NOW
  });
  const overview=summarizeKingsCapacityPrivateSafety({
    historicalEvidenceReport,backupRecoveryReport,
    runtimeScopeReport,syntheticRestoreReport,historicalHoldsReport
  });
  return {s,historicalEvidenceReport,backupRecoveryReport,
    runtimeScopeReport,syntheticRestoreReport,historicalHoldsReport,
    overview};
}
test('Five private credential plans, owner-signed history, encrypted recovery and CEO overview compose safely',async()=>{
  const r=await fullReview();
  assert.equal(r.historicalEvidenceReport.counters.unresolvedEvidenceGaps,0);
  assert.equal(r.runtimeScopeReport.observedRoles.length,5);
  assert.equal(r.syntheticRestoreReport.recoveredSignedRevision,2);
  assert.equal(r.historicalHoldsReport.days[0].partnerProvisionalHolds,1);
  assert.equal(r.backupRecoveryReport.counts.missingClaimedBackups,90);
  assert.equal(r.overview.softwareReviewReportsPresent,4);
  assert.equal(r.overview.historicalProvisionalHolds.provisionalDateHolds,1);
  assert.equal(r.overview.originalPrivateEventSourcesAuthenticated,false);
  assert.equal(r.overview.safeToActivate,false);
  assert.equal(r.overview.freeSlotsCertified,false);
});
test('Original acceptance remains a March hold despite the new April departure',async()=>{
  const r=await fullReview(),march=reviewSignedHistoricalReservationHolds({
    journal:r.s.x.afterJournal,scope:SCOPE,
    ownerPublicKey:r.s.x.ownerPublicKey,month:'2027-03',nowMs:NOW
  });
  assert.equal(march.days[0].partnerProvisionalHolds,1);
  assert.equal(r.overview.historicalProvisionalHolds.provisionalDateHolds,1);
  assert.equal(r.overview.eventAvailabilityCertified,false);
});
test('Missing original source with fully signed history is flagged and still blocks a private pilot',async()=>{
  const r=await fullReview({missingSource:true});
  assert.equal(r.historicalEvidenceReport.counters.unresolvedEvidenceGaps,1);
  assert.equal(r.overview.counts.observedHistoricalEvidenceGaps,1);
  assert.equal(r.overview.full24MonthHistoryCertified,false);
  assert.equal(r.overview.explicitCEOProductionApprovalVerified,false);
});
test('Encrypted segment corruption aborts the combined review before generating a plausible safe summary',async()=>{
  await assert.rejects(fullReview({tamperedBackup:true}));
});
test('Combined private CEO summary does not disclose synthetic Event identities, hashes or secrets',async()=>{
  const r=await fullReview(),serialized=JSON.stringify(r.overview);
  for(const forbidden of ['event:100','Partner Convoy','PRIVATE KEY',
    SOURCE,BACKUP,hash('synthetic original source bytes')])
    assert.equal(serialized.includes(forbidden),false);
  assert.equal(r.overview.operationsPerformed,0);
  assert.equal(r.overview.productionWorkflowsModified,false);
});

test('Integrated private staff calendar shows March old hold and April current booking separately, never free slots',async()=>{
  const r=await fullReview();
  const march=reviewSignedHistoricalReservationHolds({
    journal:r.s.x.afterJournal,scope:SCOPE,
    ownerPublicKey:r.s.x.ownerPublicKey,month:'2027-03',nowMs:NOW
  });
  const capacity=evaluate([{
    eventId:'100',eventType:'Partner Convoy',eventTypeVerified:true,
    status:'Rescheduled',statusVerified:true,rescheduleApproved:true,
    departureAtUtc:'2027-04-20T18:00:00Z',departureVerified:true,
    meetingAtUtc:'2027-04-20T17:00:00Z',
    plannedEndAtUtc:'2027-04-20T20:00:00Z'
  }],{dataFresh:true});
  const view=projectKingsStaffCalendarReview({
    capacity,year:'2027',selectedMonth:'2027-04',
    historicalHoldsReports:[march,r.historicalHoldsReport],
    historicalEvidenceReport:r.historicalEvidenceReport
  });
  assert.equal(view.months.length,12);
  assert.equal(view.months[2].signedHistoricalProvisional.partner,1);
  assert.equal(view.months[2].currentSnapshot.partner,0);
  assert.equal(view.months[3].signedHistoricalProvisional.partner,1);
  assert.equal(view.months[3].currentSnapshot.partner,1);
  assert.equal(view.days.find(x=>x.utcDate==='2027-04-20').snapshotCombined,1);
  assert.equal(view.days.find(x=>x.utcDate==='2027-04-20').historicalCombinedProvisional,1);
  assert.equal(view.currentAndHistoricalCountsNeverAddedTogether,true);
  assert.equal(view.actualAvailableSlotsDisplayed,false);
  assert.equal(view.freeSlotsCertified,false);
  const preview=renderKingsStaffCalendarEphemeral(view);
  assert.equal(preview.data.flags,64);
  assert.equal(JSON.stringify(preview).includes('event:100'),false);
});
test('Integrated missing original historical evidence is still visible and cannot authorize the staff calendar',async()=>{
  const r=await fullReview({missingSource:true});
  const view=projectKingsStaffCalendarReview({
    capacity:evaluate([],{dataFresh:true}),
    year:'2027',selectedMonth:'2027-04',
    historicalHoldsReports:[r.historicalHoldsReport],
    historicalEvidenceReport:r.historicalEvidenceReport
  });
  assert.equal(view.months[3].evidenceGapsReported,1);
  assert.equal(view.months[3].historicalHoldCountExceedsCurrentSnapshot,true);
  assert.equal(view.days.find(x=>x.utcDate==='2027-04-20').canApprove,false);
  assert.equal(view.freeSlotsCertified,false);
  assert.equal(view.safeToActivate,false);
});
