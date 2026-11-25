'use strict';
// DRAFT / PRIVATE / OFFLINE / READ-ONLY.
// Crosscheck untrusted GitHub repo metadata and history/witness/backup
// checkpoint *claims*. Three private repos in ONE account are NOT independent
// custody. This module has no network, no signing keys, no writes and cannot
// authorize any release or certify event history / free slots.
const ERROR='Kings Event Capacity three-repository release gate refused.';
const REPOS=Object.freeze({
  history:'Stinkesocke107/kings-event-capacity-history',
  witness:'Stinkesocke107/kings-event-capacity-witness',
  backup:'Stinkesocke107/kings-event-capacity-backups'
});
const SHA=/^[a-f0-9]{64}$/;
const DAY=/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const ISSUES=Object.freeze([
  'REPOSITORY_METADATA_MISSING','REPOSITORY_NOT_PRIVATE',
  'REPOSITORY_NOT_ON_MAIN','REPOSITORY_ARCHIVED',
  'SINGLE_ACCOUNT_FAILURE_DOMAIN',
  'HISTORY_CHECKPOINT_MISSING','WITNESS_CHECKPOINT_MISSING',
  'BACKUP_CHECKPOINT_MISSING',
  'HISTORY_WITNESS_REVISION_MISMATCH',
  'HISTORY_WITNESS_DIGEST_MISMATCH',
  'BACKUP_REVISION_AHEAD_OF_HISTORY',
  'BACKUP_LAGS_CURRENT_HISTORY',
  'BACKUP_TIP_MISMATCH',
  'BACKUP_DIGEST_MISMATCH',
  'OWNER_HIGHWATER_NOT_SUPPLIED',
  'OWNER_HIGHWATER_AHEAD_OF_HISTORY',
  'OWNER_HIGHWATER_NOT_CURRENT',
  'OWNER_HIGHWATER_CONFLICT'
]);
function fail(){throw new Error(ERROR);}
function plain(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.getPrototypeOf(v)===Object.prototype;}
function exact(v,names){
  if(!plain(v)||Object.keys(v).sort().join(',')!==names.slice().sort().join(','))fail();
}
function validRevision(r){
  if(!Number.isSafeInteger(r)||r<0||r>24000)fail();
  return r;
}
function checkpoint(value){
  if(value===null)return null;
  exact(value,['revision','tip','archiveDigest']);
  validRevision(value.revision);
  if(typeof value.tip!=='string'||!SHA.test(value.tip)||
    typeof value.archiveDigest!=='string'||!SHA.test(value.archiveDigest))fail();
  return value;
}
function repoMetadata(r){
  exact(r,['repository_full_name','visibility','default_branch','archived','owner']);
  if(typeof r.repository_full_name!=='string'||
    !Object.values(REPOS).includes(r.repository_full_name)||
    !['private','public','internal'].includes(r.visibility)||
    typeof r.default_branch!=='string'||r.default_branch.length>80||
    typeof r.archived!=='boolean'||typeof r.owner!=='string'||
    !/^[A-Za-z0-9_-]{1,40}$/.test(r.owner)||
    r.repository_full_name.split('/')[0]!==r.owner)fail();
}
function utcDay(day){
  if(typeof day!=='string'||!DAY.test(day))fail();
  const t=Date.parse(day+'T00:00:00.000Z');
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==day)fail();
  return day;
}
function auditKingsThreeRepositoryReleaseGate({
  repositories=[],historyCheckpoint=null,witnessCheckpoint=null,
  backupCheckpoint=null,backupDay=null,ownerHighwaterClaim=null,
  nowUtcDay
}={}){
  try{
    utcDay(nowUtcDay);
    if(!Array.isArray(repositories)||repositories.length>3)fail();
    const byName=new Map(),issues=new Set();
    for(const meta of repositories){
      repoMetadata(meta);
      if(byName.has(meta.repository_full_name))fail();
      byName.set(meta.repository_full_name,meta);
    }
    let privateCount=0,archivedCount=0,wrongBranchCount=0;
    for(const name of Object.values(REPOS)){
      const meta=byName.get(name);
      if(!meta){issues.add('REPOSITORY_METADATA_MISSING');continue;}
      if(meta.visibility==='private')privateCount++;
      else issues.add('REPOSITORY_NOT_PRIVATE');
      if(meta.default_branch!=='main'){
        wrongBranchCount++;issues.add('REPOSITORY_NOT_ON_MAIN');
      }
      if(meta.archived){archivedCount++;issues.add('REPOSITORY_ARCHIVED');}
    }
    const accounts=new Set([...byName.values()].map(m=>m.owner));
    if(accounts.size===1&&byName.size===3)
      issues.add('SINGLE_ACCOUNT_FAILURE_DOMAIN');
    const history=checkpoint(historyCheckpoint),
      witness=checkpoint(witnessCheckpoint),
      backup=checkpoint(backupCheckpoint),
      owner=checkpoint(ownerHighwaterClaim);
    if(!history)issues.add('HISTORY_CHECKPOINT_MISSING');
    if(!witness)issues.add('WITNESS_CHECKPOINT_MISSING');
    if(!backup)issues.add('BACKUP_CHECKPOINT_MISSING');
    if(!owner)issues.add('OWNER_HIGHWATER_NOT_SUPPLIED');
    if(backupDay!==null){
      if(!backup)fail();
      if(utcDay(backupDay)>nowUtcDay)fail();
    }else if(backup!==null)fail();
    if(history&&witness){
      if(history.revision!==witness.revision)
        issues.add('HISTORY_WITNESS_REVISION_MISMATCH');
      if(history.tip!==witness.tip||
        history.archiveDigest!==witness.archiveDigest)
        issues.add('HISTORY_WITNESS_DIGEST_MISMATCH');
    }
    if(history&&backup){
      if(backup.revision>history.revision)
        issues.add('BACKUP_REVISION_AHEAD_OF_HISTORY');
      else if(backup.revision<history.revision)
        issues.add('BACKUP_LAGS_CURRENT_HISTORY');
      else{
        if(backup.tip!==history.tip)
          issues.add('BACKUP_TIP_MISMATCH');
        if(backup.archiveDigest!==history.archiveDigest)
          issues.add('BACKUP_DIGEST_MISMATCH');
      }
    }
    if(history&&owner){
      if(owner.revision>history.revision)
        issues.add('OWNER_HIGHWATER_AHEAD_OF_HISTORY');
      else if(owner.revision<history.revision)
        issues.add('OWNER_HIGHWATER_NOT_CURRENT');
      else if(owner.tip!==history.tip||
        owner.archiveDigest!==history.archiveDigest)
        issues.add('OWNER_HIGHWATER_CONFLICT');
    }
    const list=[...issues].sort();
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      reviewStatus:'STAFF_AND_CEO_RELEASE_REVIEW_REQUIRED',
      repositoriesRequired:3,repositoriesMetadataSupplied:byName.size,
      repositoriesClaimedPrivate:privateCount,
      repositoriesClaimedArchived:archivedCount,
      repositoriesClaimedWrongBranch:wrongBranchCount,
      separateGitHubRepositoriesConfirmedByClaims:byName.size===3&&
        privateCount===3&&wrongBranchCount===0&&archivedCount===0,
      sameAccountFailureDomainClaimed:accounts.size===1&&byName.size===3,
      historyCheckpointClaimed:history!==null,
      witnessCheckpointClaimed:witness!==null,
      backupCheckpointClaimed:backup!==null,
      independentOwnerHighwaterSuppliedAsClaim:owner!==null,
      historyWitnessClaimsMatch:history!==null&&witness!==null&&
        history.revision===witness.revision&&history.tip===witness.tip&&
        history.archiveDigest===witness.archiveDigest,
      currentBackupClaimsMatch:history!==null&&backup!==null&&
        history.revision===backup.revision&&history.tip===backup.tip&&
        history.archiveDigest===backup.archiveDigest,
      ownerHighwaterClaimMatches:history!==null&&owner!==null&&
        history.revision===owner.revision&&history.tip===owner.tip&&
        history.archiveDigest===owner.archiveDigest,
      issueCodes:Object.freeze(list),issueCount:list.length,
      repositoryMetadataAuthenticatedHere:false,
      signedHistoryIndependentlyVerifiedHere:false,
      independentOwnerCustodyVerified:false,
      independentBackupFailureDomainVerified:false,
      ninetyDayRetentionVerified:false,
      monthlyRestoreActuallyVerified:false,
      originalDiscordHistoryAuthenticated:false,
      genuineEventAvailabilityCertified:false,
      credentialScopeVerified:false,
      liveActivationAuthorized:false,
      githubWritesMade:0,discordRequestsMade:0,
      bookingsCommitted:0,freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsThreeRepositoryReleasePreview(r){
  try{
    if(!plain(r)||r.version!==1||r.visibility!=='PRIVATE_ONLY'||
      r.readOnly!==true||
      r.reviewStatus!=='STAFF_AND_CEO_RELEASE_REVIEW_REQUIRED'||
      r.repositoryMetadataAuthenticatedHere!==false||
      r.signedHistoryIndependentlyVerifiedHere!==false||
      r.independentOwnerCustodyVerified!==false||
      r.independentBackupFailureDomainVerified!==false||
      r.ninetyDayRetentionVerified!==false||
      r.monthlyRestoreActuallyVerified!==false||
      r.originalDiscordHistoryAuthenticated!==false||
      r.genuineEventAvailabilityCertified!==false||
      r.credentialScopeVerified!==false||
      r.liveActivationAuthorized!==false||
      r.githubWritesMade!==0||r.discordRequestsMade!==0||
      r.bookingsCommitted!==0||r.freeSlotsCertified!==false||
      r.safeToActivate!==false||r.repositoriesRequired!==3||
      !Array.isArray(r.issueCodes)||!Number.isSafeInteger(r.issueCount)||
      r.issueCount!==r.issueCodes.length||
      new Set(r.issueCodes).size!==r.issueCodes.length||
      r.issueCodes.some(x=>typeof x!=='string'||!ISSUES.includes(x)))fail();
    for(const k of ['repositoriesMetadataSupplied','repositoriesClaimedPrivate',
      'repositoriesClaimedArchived','repositoriesClaimedWrongBranch']){
      if(!Number.isSafeInteger(r[k])||r[k]<0||r[k]>3)fail();
    }
    if(r.repositoriesClaimedPrivate>r.repositoriesMetadataSupplied||
      r.repositoriesClaimedArchived>r.repositoriesMetadataSupplied||
      r.repositoriesClaimedWrongBranch>r.repositoriesMetadataSupplied||
      r.separateGitHubRepositoriesConfirmedByClaims!==
        (r.repositoriesMetadataSupplied===3&&
         r.repositoriesClaimedPrivate===3&&
         r.repositoriesClaimedArchived===0&&
         r.repositoriesClaimedWrongBranch===0)||
      r.sameAccountFailureDomainClaimed!==
        r.issueCodes.includes('SINGLE_ACCOUNT_FAILURE_DOMAIN'))fail();
    for(const k of ['historyCheckpointClaimed','witnessCheckpointClaimed',
      'backupCheckpointClaimed','independentOwnerHighwaterSuppliedAsClaim',
      'historyWitnessClaimsMatch','currentBackupClaimsMatch',
      'ownerHighwaterClaimMatches','sameAccountFailureDomainClaimed']){
      if(typeof r[k]!=='boolean')fail();
    }
    if(!r.historyCheckpointClaimed&&
      (r.historyWitnessClaimsMatch||r.currentBackupClaimsMatch||
       r.ownerHighwaterClaimMatches))fail();
    const content='**Kings Event Capacity — PRIVATE Three-Repository Release Audit**\n'+
      'Claimed private repositories '+r.repositoriesClaimedPrivate+
      '/3 | untrusted checkpoints H/W/B: '+
      [r.historyCheckpointClaimed,r.witnessCheckpointClaimed,
        r.backupCheckpointClaimed].map(x=>x?'yes':'no').join('/')+'\n'+
      'Human review issue categories: '+r.issueCount+'\n'+
      '**No independent custody, 90-day restore, Discord evidence or live release proven.**';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{flags:64,
      allowed_mentions:{parse:[]},content,embeds:[]}});
  }catch{fail();}
}
module.exports={auditKingsThreeRepositoryReleaseGate,
  renderKingsThreeRepositoryReleasePreview};
