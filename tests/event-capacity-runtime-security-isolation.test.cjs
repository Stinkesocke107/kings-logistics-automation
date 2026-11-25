'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const newModules=[
  'event-capacity-private-runtime-grant-policy',
  'event-capacity-offline-synthetic-recovery-drill',
  'event-capacity-historical-24month-readiness',
  'event-capacity-private-runtime-installation-scope-probe',
  'event-capacity-private-runtime-scope-bundle',
  'event-capacity-synthetic-pilot-hold-audit',
  'event-capacity-private-issued-grant-metadata-audit',
  'event-capacity-historical-evidence-gap-audit',
  'event-capacity-backup-90day-recovery-audit',
  'event-capacity-private-safety-overview',
  'event-capacity-historical-reservation-holds'
];
test('New credential policy and synthetic restoration cannot activate live Convoy Checker',()=>{
  const live=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const runtime=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const testWorkflow=fs.readFileSync(path.join(root,
    '.github/workflows/system-tests.yml'),'utf8');
  for(const mod of newModules){
    assert.equal(live.includes(mod),false);
    assert.equal(runtime.includes(mod),false);
    assert.equal(testWorkflow.includes(mod),false);
    const code=fs.readFileSync(path.join(root,mod+'.js'),'utf8');
    assert.doesNotMatch(code,/DISCORD_BOT_TOKEN|process\.env|child_process/);
    assert.doesNotMatch(code,/\bfetch\(|method:\s*['"](?:PUT|POST|PATCH|DELETE)['"]/);
    assert.match(code,/safeToActivate:false/);
    assert.match(code,/freeSlotsCertified:false/);
  }
});
test('Synthetic recovery composes signed floor and independently encrypted chunk verifier',()=>{
  const src=fs.readFileSync(path.join(root,
    'event-capacity-offline-synthetic-recovery-drill.js'),'utf8');
  assert.match(src,/inspectOfflineOwnerRecoveryCopies/);
  assert.match(src,/verifyHistoricalArchivePin/);
  assert.match(src,/inspectSegmentedEncryptedBackup/);
  assert.match(src,/actualIndependentStorageCustodyVerified:false/);
  assert.match(src,/productionRestorePerformed:false/);
});
test('Credential plan never contains live token issuance or independent custody attestation',()=>{
  const src=fs.readFileSync(path.join(root,
    'event-capacity-private-runtime-grant-policy.js'),'utf8');
  assert.match(src,/exactly-one-repository/);
  assert.match(src,/effectiveGrantedPermissionsVerified:false/);
  assert.match(src,/actualGithubInstallationTokenIssued:false/);
  assert.match(src,/separateRuntimeCredentialCustodyVerified:false/);
  assert.doesNotMatch(src,/createInstallationAccessToken|process\.env|privateKey\s*:/);
});

test('New installation scope probes expose fixed GET-only endpoint and never certify grant levels',()=>{
  const source=fs.readFileSync(path.join(root,
    'event-capacity-private-runtime-installation-scope-probe.js'),'utf8');
  assert.match(source,/installation\/repositories\?per_page=100&page=1/);
  assert.match(source,/method:'GET'/);
  assert.match(source,/actualTokenPermissionLevelsProven:false/);
  assert.doesNotMatch(source,/method:'(?:POST|PUT|PATCH|DELETE)'/);
});
test('New five-role audit can never issue a token or bypass explicit pilot authorization',()=>{
  const source=fs.readFileSync(path.join(root,
    'event-capacity-private-runtime-scope-bundle.js'),'utf8');
  assert.match(source,/createIsolatedInstallationScopeProbe/);
  assert.match(source,/credentialIssuancePerformed:false/);
  assert.match(source,/privateSyntheticPilotApproved:false/);
  const pilot=fs.readFileSync(path.join(root,
    'event-capacity-synthetic-pilot-hold-audit.js'),'utf8');
  assert.match(pilot,/privateSyntheticWritesAuthorized:false/);
  assert.match(pilot,/externalGatesIndependentlyCompleted:0/);
  assert.match(pilot,/explicitCEOPilotApprovalVerified:false/);
});

test('A redacted token issuance shape validator must not itself issue GitHub App tokens',()=>{
  const src=fs.readFileSync(path.join(root,
    'event-capacity-private-issued-grant-metadata-audit.js'),'utf8');
  assert.match(src,/tokenOmitted/);
  assert.match(src,/authenticGithubProviderResponseVerified:false/);
  assert.match(src,/safeForPrivateSyntheticWrites:false/);
  assert.doesNotMatch(src,/createInstallationAccessToken|\/access_tokens['"]/);
});

test('Offline historical evidence audit never authenticates the source by itself',()=>{
  const src=fs.readFileSync(path.join(root,
    'event-capacity-historical-evidence-gap-audit.js'),'utf8');
  assert.match(src,/verifyHistoricalJournal/);
  assert.match(src,/originalSourceRecordsIndependentlyAuthenticated:false/);
  assert.match(src,/sourceInventoryCompletenessVerified:false/);
  assert.match(src,/anyEventDecisionCommitted:false/);
  assert.match(src,/reviewItemsCreatedInDiscord:0/);
});
test('Ninety day backup audit never creates backups, deletes files or pretends a real restore',()=>{
  const src=fs.readFileSync(path.join(root,
    'event-capacity-backup-90day-recovery-audit.js'),'utf8');
  assert.match(src,/monthlyIndependentRecoveryDrillVerified:false/);
  assert.match(src,/automaticDeletions:0/);
  assert.match(src,/backupWritesPerformed:0/);
  assert.match(src,/independentOffsiteStorageCustodyVerified:false/);
});
test('Private CEO safety overview refuses automatic Event slot or go-live authority',()=>{
  const src=fs.readFileSync(path.join(root,
    'event-capacity-private-safety-overview.js'),'utf8');
  assert.match(src,/eventAvailabilityCertified:false/);
  assert.match(src,/explicitCEOProductionApprovalVerified:false/);
  assert.match(src,/originalPrivateEventSourcesAuthenticated:false/);
  assert.match(src,/operationsPerformed:0/);
});

test('Conservative historic holds never release rescheduled, cancelled or completed slots without human review',()=>{
  const src=fs.readFileSync(path.join(root,
    'event-capacity-historical-reservation-holds.js'),'utf8');
  assert.match(src,/verifyHistoricalJournal/);
  assert.match(src,/cancellationsNeverAutoRelease:true/);
  assert.match(src,/previousDatesNeverAutoReleaseAfterReschedule:true/);
  assert.match(src,/staffDecisionsCommitted:false/);
  assert.match(src,/freeSlotsCertified:false/);
});
