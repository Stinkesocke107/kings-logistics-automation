'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('New historical evidence journal is isolated from all scheduled and manual live event workflows',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const evidence=fs.readFileSync(path.join(root,
    'event-capacity-historical-lifecycle-journal.js'),'utf8');
  assert.doesNotMatch(runner,/require\(['"]\.\.\/event-capacity-historical-lifecycle-journal['"]\)/);
  assert.doesNotMatch(workflow,/historical-lifecycle-journal/);
  assert.doesNotMatch(workflow,/KINGS_EVENT_CAPACITY_HISTORICAL_IMPORT_ENABLED/);
  assert.match(evidence,/historicalCoverageCertified:false/);
  assert.match(evidence,/freeSlotsCertified:false/);
  assert.match(evidence,/signHistoricalTransitionOffline/);
  assert.doesNotMatch(evidence,/discord\.com|hooks\.slack\.com|process\.env\.DISCORD_BOT_TOKEN/);
});

test('Private encrypted history archive remains offline and cannot change live capacity',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const archive=fs.readFileSync(path.join(root,
    'event-capacity-historical-encrypted-archive.js'),'utf8');
  assert.doesNotMatch(runner,/event-capacity-historical-encrypted-archive/);
  assert.doesNotMatch(workflow,/event-capacity-historical-encrypted-archive/);
  assert.doesNotMatch(workflow,/KINGS_EVENT_CAPACITY_HISTORICAL_ARCHIVE_ENABLED/);
  assert.match(archive,/historicalCoverageCertified:false/);
  assert.match(archive,/freeSlotsCertified:false/);
  assert.match(archive,/verifyHistoricalJournal/);
  assert.doesNotMatch(archive,/DISCORD_BOT_TOKEN|fetch\(|discord\.com|process\.env/);
});

test('Historical GitHub archive reader is read-only and not part of live capacity flows',()=>{
  const runner=fs.readFileSync(path.join(root,'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/convoy-checker.yml'),'utf8');
  const reader=fs.readFileSync(path.join(root,'event-capacity-historical-github-reader.js'),'utf8');
  assert.doesNotMatch(runner,/event-capacity-historical-github-reader/);
  assert.doesNotMatch(workflow,/event-capacity-historical-github-reader/);
  assert.doesNotMatch(workflow,/KINGS_EVENT_CAPACITY_HISTORICAL_READER_ENABLED/);
  assert.match(reader,/method:'GET'/);
  assert.doesNotMatch(reader,/method:'(?:PUT|POST|PATCH|DELETE)'/);
  assert.match(reader,/encryptedArchiveIntegrityVerified:true/);
  assert.match(reader,/historicalCoverageCertified:false/);
  assert.match(reader,/sourceEvidenceAuthenticityVerified:false/);
  assert.match(reader,/freeSlotsCertified:false/);
  assert.doesNotMatch(reader,/DISCORD_BOT_TOKEN|discord\.com|process\.env/);
});

test('Owner-pinned private archive writer cannot silently activate via GitHub Actions',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const writer=fs.readFileSync(path.join(root,
    'event-capacity-historical-github-writer.js'),'utf8');
  assert.doesNotMatch(runner,/event-capacity-historical-github-writer/);
  assert.doesNotMatch(workflow,/event-capacity-historical-github-writer/);
  assert.doesNotMatch(workflow,/KINGS_EVENT_CAPACITY_HISTORICAL_WRITE_ENABLED/);
  assert.match(writer,/ownerReceiptRetentionRequired:true/);
  assert.match(writer,/sourceEvidenceAuthenticityVerified:false/);
  assert.match(writer,/historicalCoverageCertified:false/);
  assert.match(writer,/freeSlotsCertified:false/);
  assert.match(writer,/openEncryptedHistoricalArchive/);
  assert.match(writer,/createPrivateHistoricalArchiveReader/);
  assert.match(writer,/api\('GET'/);
  assert.match(writer,/api\('PUT'/);
  assert.doesNotMatch(writer,/api\('(?:DELETE|PATCH|POST)'/);
  assert.doesNotMatch(writer,/DISCORD_BOT_TOKEN|discord\.com|process\.env/);
});

test('Historical recovery, offsite backup and retention planner are not live workflows',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const names=['event-capacity-historical-github-recovery',
    'event-capacity-historical-offsite-backup',
    'event-capacity-historical-retention-plan'];
  for(const name of names){
    const source=fs.readFileSync(path.join(root,name+'.js'),'utf8');
    assert.equal(runner.includes(name),false);
    assert.equal(workflow.includes(name),false);
    assert.doesNotMatch(source,/DISCORD_BOT_TOKEN|discord\.com|process\.env/);
    assert.match(source,/freeSlotsCertified:false/);
  }
  const recovery=fs.readFileSync(path.join(root,names[0]+'.js'),'utf8');
  assert.doesNotMatch(recovery,/method:'(?:PUT|POST|PATCH|DELETE)'/);
  assert.match(recovery,/humanReconciliationRequired:true/);
  const backup=fs.readFileSync(path.join(root,names[1]+'.js'),'utf8');
  assert.match(backup,/productionRestorePerformed:false/);
  assert.match(backup,/offsiteStoragePerformed:false/);
  const policy=fs.readFileSync(path.join(root,names[2]+'.js'),'utf8');
  assert.match(policy,/retentionActionsAutomated:false/);
  assert.match(policy,/deletedBackups:0/);
});

test('Standalone daily private backup vault stays outside live workflows and has no deletion methods',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const module=fs.readFileSync(path.join(root,
    'event-capacity-historical-github-backup-vault.js'),'utf8');
  assert.doesNotMatch(runner,/event-capacity-historical-github-backup-vault/);
  assert.doesNotMatch(workflow,/event-capacity-historical-github-backup-vault/);
  assert.match(module,/writeDailyOnce/);
  assert.match(module,/readDaily/);
  assert.match(module,/freeSlotsCertified:false/);
  assert.match(module,/retentionEnforced:false/);
  assert.doesNotMatch(module,/request\('(?:DELETE|PATCH|POST)'/);
  assert.doesNotMatch(module,/DISCORD_BOT_TOKEN|discord\.com|process\.env/);
});

test('Signed history crosscheck and backup continuity stay isolated and read-only',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  for(const moduleName of [
    'event-capacity-historical-source-crosscheck',
    'event-capacity-historical-backup-continuity'
  ]){
    const content=fs.readFileSync(path.join(root,moduleName+'.js'),'utf8');
    assert.equal(runner.includes(moduleName),false);
    assert.equal(workflow.includes(moduleName),false);
    assert.match(content,/freeSlotsCertified:false/);
    assert.doesNotMatch(content,/DISCORD_BOT_TOKEN|discord\.com|process\.env/);
  }
  const cross=fs.readFileSync(path.join(root,
    'event-capacity-historical-source-crosscheck.js'),'utf8');
  assert.match(cross,/verifyHistoricalJournal/);
  assert.match(cross,/sourceProvenanceTrustedByThisPureFunction:false/);
  assert.match(cross,/staffDecisionsCommitted:false/);
  const continuity=fs.readFileSync(path.join(root,
    'event-capacity-historical-backup-continuity.js'),'utf8');
  assert.match(continuity,/createPrivateHistoricalBackupVault/);
  assert.match(continuity,/retentionEnforced:false/);
  assert.match(continuity,/automaticDeletions:0/);
  assert.doesNotMatch(continuity,/writeDailyOnce|DELETE|PATCH|POST/);
});

test('Historical review task proposals never auto-create Staff tasks in production',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const live=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const proposals=fs.readFileSync(path.join(root,
    'event-capacity-historical-workboard-proposals.js'),'utf8');
  assert.doesNotMatch(runner,/event-capacity-historical-workboard-proposals/);
  assert.doesNotMatch(live,/event-capacity-historical-workboard-proposals/);
  assert.match(proposals,/staffTasksCreated:0/);
  assert.match(proposals,/commandsReadyToExecute:false/);
  assert.match(proposals,/humanAuthorizationRequired:true/);
  assert.match(proposals,/freeSlotsCertified:false/);
  assert.doesNotMatch(proposals,/DISCORD_BOT_TOKEN|discord\.com|process\.env/);
});

test('Authenticated historical read gateway, offline owner receipt audit and Workboard bundle stay disabled',()=>{
  const live=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const sources=[
    'event-capacity-historical-authenticated-crosscheck',
    'event-capacity-historical-owner-receipt-audit',
    'event-capacity-historical-review-workboard-bundle'
  ];
  for(const name of sources){
    const source=fs.readFileSync(path.join(root,name+'.js'),'utf8');
    assert.equal(live.includes(name),false);
    assert.equal(workflow.includes(name),false);
    assert.match(source,/freeSlotsCertified:false/);
    assert.doesNotMatch(source,/DISCORD_BOT_TOKEN|discord\.com|process\.env/);
    assert.doesNotMatch(source,/method:'(?:PUT|POST|PATCH|DELETE)'/);
  }
  const gateway=fs.readFileSync(path.join(root,sources[0]+'.js'),'utf8');
  assert.match(gateway,/createAuthenticatedKingsSource/);
  assert.match(gateway,/createPrivateHistoricalArchiveReader/);
  assert.match(gateway,/sourceAuthenticationEstablishedByThisComposer:false/);
  assert.match(gateway,/independentLatestOwnerHighwaterVerified:false/);
  const receipts=fs.readFileSync(path.join(root,sources[1]+'.js'),'utf8');
  assert.match(receipts,/externalOwnerReceiptCustodyAuthenticated:false/);
  assert.match(receipts,/latestIndependentOwnerHighwaterVerified:false/);
  const bundle=fs.readFileSync(path.join(root,sources[2]+'.js'),'utf8');
  assert.match(bundle,/staffTasksCreated:0/);
  assert.match(bundle,/commandsReadyToExecute:false/);
  assert.match(bundle,/isDeepStrictEqual\(before,after\)/);
});

test('Private storage preflight and large segmented backups cannot silently activate production',()=>{
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const modules=[
    'event-capacity-private-storage-preflight',
    'event-capacity-historical-segmented-backup',
    'event-capacity-historical-segmented-github-vault'
  ];
  for(const name of modules){
    const source=fs.readFileSync(path.join(root,name+'.js'),'utf8');
    assert.equal(runner.includes(name),false);
    assert.equal(workflow.includes(name),false);
    assert.match(source,/freeSlotsCertified:false/);
    assert.doesNotMatch(source,/DISCORD_BOT_TOKEN|discord\.com|process\.env/);
    assert.doesNotMatch(source,/request\('(?:DELETE|POST|PATCH)'/);
  }
  const preflight=fs.readFileSync(path.join(root,modules[0]+'.js'),'utf8');
  assert.match(preflight,/safeToActivate:false/);
  assert.match(preflight,/branchProtectionRulesIndependentlyInspected:false/);
  assert.match(preflight,/credentialGrantIsolationIndependentlyVerified:false/);
  assert.doesNotMatch(preflight,/method:'(?:PUT|DELETE|POST|PATCH)'/);
  const codec=fs.readFileSync(path.join(root,modules[1]+'.js'),'utf8');
  assert.match(codec,/offsiteStoragePerformed:false/);
  assert.match(codec,/inspectEncryptedOffsiteHistoricalBackup/);
  const vault=fs.readFileSync(path.join(root,modules[2]+'.js'),'utf8');
  assert.match(vault,/retentionEnforced:false/);
  assert.match(vault,/ownerReceiptCustodyVerified:false/);
  assert.match(vault,/request\('PUT'/);
  assert.doesNotMatch(vault,/request\('DELETE'/);
});

test('GitHub Free three-private-repo plan does not permit public sensitive archive publishing',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const root=path.resolve(__dirname,'..');
  const publicBoundary=fs.readFileSync(path.join(root,
    'event-capacity-public-single-repo-boundary.js'),'utf8');
  const publicRunner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const handoff=fs.readFileSync(path.join(root,
    'docs/KINGS-EVENT-CAPACITY-GITHUB-FREE-SECRETS-AND-ACCESS-2026-11-25.md'),'utf8');
  assert.match(publicBoundary,/PUBLIC_CODE_AND_ANONYMOUS_STATUS_ONLY/);
  assert.match(publicBoundary,/confidentialDataAllowed:false/);
  assert.match(publicBoundary,/encryptedHistoricalPayloadAllowed:false/);
  assert.match(publicBoundary,/productionActivated:false/);
  assert.equal(fs.existsSync(path.join(root,
    'event-capacity-public-opaque-backup.js')),false);
  assert.doesNotMatch(publicRunner,/event-capacity-public-single-repo-boundary/);
  assert.doesNotMatch(workflow,/event-capacity-public-single-repo-boundary/);
  assert.match(handoff,/kings-event-capacity-history/);
  assert.match(handoff,/kings-event-capacity-witness/);
  assert.match(handoff,/kings-event-capacity-backups/);
  assert.match(handoff,/GitHub Free/);
  assert.match(handoff,/Do not create secrets until after that verification/);
});
