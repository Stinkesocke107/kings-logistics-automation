'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {auditKingsThreeRepositoryReleaseGate:audit,
  renderKingsThreeRepositoryReleasePreview:render}
  =require('../event-capacity-three-repo-release-gate');
const OWNER='Stinkesocke107',DAY='2026-11-25';
const REPOS=['history','witness','backups'].map(s=>({
  repository_full_name:OWNER+'/kings-event-capacity-'+s,
  owner:OWNER,visibility:'private',default_branch:'main',archived:false
}));
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const PIN={revision:11,tip:A,archiveDigest:B};
function run(changes={}){
  return audit({repositories:structuredClone(REPOS),
    nowUtcDay:DAY,...changes});
}
function full(changes={}){
  return run({historyCheckpoint:{...PIN},witnessCheckpoint:{...PIN},
    backupCheckpoint:{...PIN},backupDay:'2026-11-24',
    ownerHighwaterClaim:{...PIN},...changes});
}
function issue(r,code){return r.issueCodes.includes(code);}
test('Three correctly named private repos are separated but share one owner account',()=>{
  const r=run();
  assert.equal(r.repositoriesClaimedPrivate,3);
  assert.equal(r.repositoriesMetadataSupplied,3);
  assert.equal(r.separateGitHubRepositoriesConfirmedByClaims,true);
  assert.equal(r.sameAccountFailureDomainClaimed,true);
  assert.ok(issue(r,'SINGLE_ACCOUNT_FAILURE_DOMAIN'));
  assert.equal(r.independentBackupFailureDomainVerified,false);
  assert.equal(r.independentOwnerCustodyVerified,false);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.githubWritesMade,0);
});
test('Even perfectly matching three checkpoint claims never enable real rollout',()=>{
  const r=full();
  assert.equal(r.historyWitnessClaimsMatch,true);
  assert.equal(r.currentBackupClaimsMatch,true);
  assert.equal(r.ownerHighwaterClaimMatches,true);
  assert.equal(r.historyCheckpointClaimed,true);
  assert.equal(r.liveActivationAuthorized,false);
  assert.equal(r.originalDiscordHistoryAuthenticated,false);
  assert.equal(r.credentialScopeVerified,false);
  assert.equal(r.ninetyDayRetentionVerified,false);
  assert.equal(r.monthlyRestoreActuallyVerified,false);
  assert.equal(r.safeToActivate,false);
});
test('Missing metadata and checkpointer receipts report human blockers',()=>{
  const r=run({repositories:[REPOS[0]]});
  assert.equal(r.repositoriesMetadataSupplied,1);
  assert.ok(issue(r,'REPOSITORY_METADATA_MISSING'));
  assert.ok(issue(r,'HISTORY_CHECKPOINT_MISSING'));
  assert.ok(issue(r,'WITNESS_CHECKPOINT_MISSING'));
  assert.ok(issue(r,'BACKUP_CHECKPOINT_MISSING'));
  assert.ok(issue(r,'OWNER_HIGHWATER_NOT_SUPPLIED'));
  assert.equal(r.separateGitHubRepositoriesConfirmedByClaims,false);
});
test('Public or archived repo, wrong default branch are not considered private ready',()=>{
  const data=structuredClone(REPOS);
  data[0].visibility='public';data[1].archived=true;
  data[2].default_branch='dev';
  const r=run({repositories:data});
  assert.equal(r.repositoriesClaimedPrivate,2);
  assert.equal(r.repositoriesClaimedArchived,1);
  assert.equal(r.repositoriesClaimedWrongBranch,1);
  assert.ok(issue(r,'REPOSITORY_NOT_PRIVATE'));
  assert.ok(issue(r,'REPOSITORY_ARCHIVED'));
  assert.ok(issue(r,'REPOSITORY_NOT_ON_MAIN'));
  assert.equal(r.separateGitHubRepositoriesConfirmedByClaims,false);
});
test('Duplicate, wrong repo owner, unknown repo and unknown fields are rejected',()=>{
  assert.throws(()=>run({repositories:[REPOS[0],REPOS[0]]}));
  assert.throws(()=>run({repositories:[{...REPOS[0],owner:'other'}]}));
  assert.throws(()=>run({repositories:[{
    ...REPOS[0],repository_full_name:OWNER+'/fake-repository'
  }]}));
  assert.throws(()=>run({repositories:[{...REPOS[0],token:'private-secret'}]}));
  assert.throws(()=>run({repositories:[{},...REPOS.slice(1)]}));
});
test('History-witness revision/digest conflict must not be ignored',()=>{
  const r=full({witnessCheckpoint:{revision:10,tip:C,archiveDigest:C}});
  assert.equal(r.historyWitnessClaimsMatch,false);
  assert.ok(issue(r,'HISTORY_WITNESS_REVISION_MISMATCH'));
  assert.ok(issue(r,'HISTORY_WITNESS_DIGEST_MISMATCH'));
  assert.equal(r.liveActivationAuthorized,false);
});
test('An old backup remains a known lag, not a historical restore proof',()=>{
  const r=full({backupCheckpoint:{revision:8,tip:C,archiveDigest:C}});
  assert.equal(r.currentBackupClaimsMatch,false);
  assert.ok(issue(r,'BACKUP_LAGS_CURRENT_HISTORY'));
  assert.equal(r.independentBackupFailureDomainVerified,false);
});
test('Backup head ahead of known history is a consistency alarm',()=>{
  const r=full({backupCheckpoint:{revision:12,tip:C,archiveDigest:C}});
  assert.ok(issue(r,'BACKUP_REVISION_AHEAD_OF_HISTORY'));
  assert.equal(r.backupCheckpointClaimed,true);
});
test('Same revision with conflicting backup tip or digest is reviewed separately',()=>{
  const r=full({backupCheckpoint:{revision:11,tip:C,archiveDigest:C}});
  assert.ok(issue(r,'BACKUP_TIP_MISMATCH'));
  assert.ok(issue(r,'BACKUP_DIGEST_MISMATCH'));
  assert.equal(r.currentBackupClaimsMatch,false);
});
test('Owner-held highwater claims ahead, behind or tampered are never proof',()=>{
  const future=full({ownerHighwaterClaim:{...PIN,revision:15}});
  assert.ok(issue(future,'OWNER_HIGHWATER_AHEAD_OF_HISTORY'));
  const past=full({ownerHighwaterClaim:{...PIN,revision:10}});
  assert.ok(issue(past,'OWNER_HIGHWATER_NOT_CURRENT'));
  const broken=full({ownerHighwaterClaim:{...PIN,tip:C}});
  assert.ok(issue(broken,'OWNER_HIGHWATER_CONFLICT'));
  for(const r of [future,past,broken])
    assert.equal(r.independentOwnerCustodyVerified,false);
});
test('Invalid backup day, date, missing backup checkpoint and fake digests refuse audit',()=>{
  assert.throws(()=>full({backupDay:'2026-11-26'}));
  assert.throws(()=>full({backupDay:'2026-02-30'}));
  assert.throws(()=>full({nowUtcDay:'2026-11-31'}));
  assert.throws(()=>full({backupDay:null}));
  assert.throws(()=>full({historyCheckpoint:{...PIN,archiveDigest:'X'.repeat(64)}}));
  assert.throws(()=>full({backupCheckpoint:null,backupDay:'2026-11-24'}));
});
test('Preview hides all repo/checkpoint identifiers and forbids fake release statuses',()=>{
  const r=full(),v=render(r),s=JSON.stringify(v);
  assert.equal(v.type,4);
  assert.equal(v.data.flags,64);
  assert.deepEqual(v.data.allowed_mentions,{parse:[]});
  for(const secret of [OWNER,'kings-event-capacity-history',
    'kings-event-capacity-witness','kings-event-capacity-backups',
    A,B,C,'DISCORD_BOT_TOKEN','@everyone'])
    assert.equal(s.includes(secret),false);
  assert.match(s,/No independent custody/);
  for(const patch of [
    {liveActivationAuthorized:true},{safeToActivate:true},
    {originalDiscordHistoryAuthenticated:true},
    {independentBackupFailureDomainVerified:true},
    {independentOwnerCustodyVerified:true},
    {genuineEventAvailabilityCertified:true},
    {monthlyRestoreActuallyVerified:true},
    {repositoriesClaimedPrivate:1},
    {sameAccountFailureDomainClaimed:false},
    {issueCount:r.issueCount+1},
    {issueCodes:[...r.issueCodes,'FAKE_STATUS']}
  ])assert.throws(()=>render({...r,...patch}));
});
test('Three-repository audit is disconnected from live Convoy Checker, with no network',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const source=read('event-capacity-three-repo-release-gate.js');
  for(const p of ['convoy-checker.js','.github/workflows/convoy-checker.yml'])
    assert.equal(read(p).includes('event-capacity-three-repo-release-gate'),false);
  assert.doesNotMatch(source,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/api\.github/);
  assert.match(source,/githubWritesMade:0,discordRequestsMade:0/);
  assert.match(source,/freeSlotsCertified:false,safeToActivate:false/);
});
