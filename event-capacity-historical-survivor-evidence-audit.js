'use strict';
// PRIVATE / PURE / OFFLINE / DRAFT. Cross-check archived/deleted Convoy
// record claims with surviving evidence RECEIPT CLAIMS and the 24-month
// pagination inventory. Receipt matching is not original Discord proof.
// No network, storage mutation, booking, staff approval, or archive recovery.
const {createHmac}=require('node:crypto');
const {reconcileKingsMultiSourceConvoys}
  =require('./event-capacity-convoy-multi-source-intake');
const {auditKingsDiscordHistoryPagination}
  =require('./event-capacity-discord-history-pagination-audit');
const ERROR='Kings Event History survivor evidence review refused.';
const SNOW=/^[1-9]\d{16,21}$/;
const SHA=/^[a-f0-9]{64}$/;
const ISO=/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const TYPES=new Set(['archived','deleted']);
const REASONS=new Set(['MISSING_SURVIVING_RECORD_EVIDENCE',
  'UNMATCHED_SURVIVING_RECEIPT','RECEIPT_KIND_OR_DIGEST_CONFLICT',
  'RECEIPT_CAPTURE_PRECEDES_RECORD','CHANNEL_INVENTORY_DISAGREEMENT',
  'CHANNEL_COVERAGE_DISAGREEMENT','SOURCE_PAGINATION_INCOMPLETE',
  'SOURCE_ROW_COUNT_DISAGREEMENT']);
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function exact(x,keys){
  if(!plain(x)||Object.keys(x).sort().join(',')!==keys.slice().sort().join(','))fail();
}
function time(x){
  if(typeof x!=='string'||!ISO.test(x))fail();
  const t=Date.parse(x);
  if(!Number.isFinite(t)||new Date(t).toISOString()!==x)fail();
  return t;
}
function count(x){if(!Number.isSafeInteger(x)||x<0||x>10000)fail();return x;}
function key(secret,guild,reason,ref){
  return 'history-survivor:'+createHmac('sha256',secret)
    .update(['kings-history-survivor-v1',guild,reason,ref].join('\0'))
    .digest('hex').slice(0,40);
}
function auditKingsHistoricalSurvivorEvidence({
  sourceIntake,paginationInput,survivingReceiptClaims=[]
}={}){
  try{
    if(!plain(sourceIntake)||!plain(paginationInput)||
      sourceIntake.guildId!==paginationInput.guildId||
      sourceIntake.firstMonth!==paginationInput.firstMonth||
      sourceIntake.finalMonth!==paginationInput.finalMonth||
      sourceIntake.nowMs!==paginationInput.nowMs||
      !Array.isArray(survivingReceiptClaims)||
      survivingReceiptClaims.length>10000)fail();
    const intake=reconcileKingsMultiSourceConvoys(sourceIntake),
      page=auditKingsDiscordHistoryPagination(paginationInput);
    if(intake.freeSlotsCertified!==false||intake.safeToActivate!==false||
      page.freeSlotsCertified!==false||page.safeToActivate!==false||
      page.monthRows.length!==24)fail();
    const channels=new Map(sourceIntake.channelInventory.map(c=>[c.channelId,c])),
      scans=new Map(paginationInput.channels.map(c=>[c.channelId,c])),
      reviews=new Map(),recordMap=new Map(),receipts=new Map();
    const secret=sourceIntake.reviewSecret,guild=sourceIntake.guildId;
    function issue(reason,ref){
      if(!REASONS.has(reason))fail();
      const reviewKey=key(secret,guild,reason,ref);
      if(!reviews.has(reviewKey))reviews.set(reviewKey,Object.freeze({
        reviewKey,reason,privateHumanReviewRequired:true,
        automaticallyResolved:false,bookingCapacityChanged:false
      }));
    }
    let inventoryMismatches=0,coverageMismatches=0;
    const channelUnion=new Set([...channels.keys(),...scans.keys()]);
    for(const id of channelUnion){
      const c=channels.get(id),p=scans.get(id);
      if(!c||!p){
        inventoryMismatches++;issue('CHANNEL_INVENTORY_DISAGREEMENT',id);
      }else if(c.firstCoveredMonth!==p.firstCoveredMonth||
        c.lastCoveredMonth!==p.lastCoveredMonth||
        (c.kind==='current')!==(p.channelKind==='current-forum')){
        coverageMismatches++;issue('CHANNEL_COVERAGE_DISAGREEMENT',id);
      }
    }
    if(!page.untrustedPaginationClaimsInternallyComplete)
      issue('SOURCE_PAGINATION_INCOMPLETE','untrusted-claimed-scans');
    let archived=0,deleted=0;
    for(const r of sourceIntake.convoyRecords){
      if(!TYPES.has(r.sourceKind))continue;
      const ref=r.channelId+':'+r.threadId;
      if(recordMap.has(ref))fail();
      recordMap.set(ref,r);
      if(r.sourceKind==='archived')archived++;else deleted++;
    }
    let countMismatch=0;
    for(const c of sourceIntake.channelInventory){
      const archivedRows=sourceIntake.convoyRecords.filter(r=>
        r.channelId===c.channelId&&r.sourceKind==='archived').length;
      const deletedRows=sourceIntake.convoyRecords.filter(r=>
        r.channelId===c.channelId&&r.sourceKind==='deleted').length;
      if(archivedRows!==c.claimedArchivedCount||
        deletedRows!==c.claimedDeletedCount){
        countMismatch++;issue('SOURCE_ROW_COUNT_DISAGREEMENT',c.channelId);
      }
    }
    const now=sourceIntake.nowMs;
    for(const r of survivingReceiptClaims){
      exact(r,['channelId','threadId','sourceKind','sourceDigest',
        'receiptDigest','capturedAtUtc']);
      if(!SNOW.test(r.channelId)||!SNOW.test(r.threadId)||
        !TYPES.has(r.sourceKind)||!SHA.test(r.sourceDigest)||
        !SHA.test(r.receiptDigest)||time(r.capturedAtUtc)>now+60000)fail();
      const ref=r.channelId+':'+r.threadId;
      if(receipts.has(ref))fail();
      receipts.set(ref,r);
    }
    let missingArchive=0,missingDeleted=0,linkedArchive=0,
      linkedDeleted=0,contradictions=0,orphan=0,early=0;
    for(const [ref,r] of recordMap){
      const receipt=receipts.get(ref);
      if(!receipt){
        if(r.sourceKind==='archived')missingArchive++;
        else missingDeleted++;
        issue('MISSING_SURVIVING_RECORD_EVIDENCE',ref);
        continue;
      }
      if(receipt.sourceKind!==r.sourceKind||
        receipt.sourceDigest!==r.sourceDigest){
        contradictions++;issue('RECEIPT_KIND_OR_DIGEST_CONFLICT',ref);
        continue;
      }
      if(time(receipt.capturedAtUtc)<time(r.modifiedAtUtc)){
        early++;issue('RECEIPT_CAPTURE_PRECEDES_RECORD',ref);
        continue;
      }
      if(r.sourceKind==='archived')linkedArchive++;
      else linkedDeleted++;
    }
    for(const [ref] of receipts){
      if(!recordMap.has(ref)){
        orphan++;issue('UNMATCHED_SURVIVING_RECEIPT',ref);
      }
    }
    if(archived+deleted>10000||reviews.size>10000)fail();
    const issueItems=[...reviews.values()].sort((a,b)=>
      a.reason.localeCompare(b.reason)||a.reviewKey.localeCompare(b.reviewKey));
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      historicalWindowFirstMonth:page.firstMonth,
      historicalWindowFinalMonth:page.finalMonth,
      expectedHistoryMonths:24,
      suppliedArchivedRecordClaims:count(archived),
      suppliedDeletedRecordClaims:count(deleted),
      survivingReceiptClaims:count(receipts.size),
      matchingArchivedReceiptClaims:count(linkedArchive),
      matchingDeletedReceiptClaims:count(linkedDeleted),
      archivedClaimsWithoutSurvivingReceipt:count(missingArchive),
      deletedClaimsWithoutSurvivingReceipt:count(missingDeleted),
      conflictingReceiptClaims:count(contradictions),
      receiptsPredatingRecordClaims:count(early),
      orphanSurvivingReceiptClaims:count(orphan),
      sourceArchiveDeletedCountContradictions:count(countMismatch),
      sourceInventoryMismatches:count(inventoryMismatches),
      sourceCoverageMismatches:count(coverageMismatches),
      sourcePaginationClaimInternallyComplete:
        page.untrustedPaginationClaimsInternallyComplete,
      humanReviewIssueCount:count(issueItems.length),
      reviewItems:Object.freeze(issueItems),
      originalDiscordArchiveAuthenticated:false,
      originalDiscordDeletionsRecovered:false,
      deletionTombstoneIndependentlyVerified:false,
      capturedReceiptClaimsAreNotProviderProof:true,
      completeHistoricalChannelDiscoveryVerified:false,
      sourceAndReceiptsRemainUntrusted:true,
      realDiscordNetworkCalls:0,archiveWrites:0,
      bookingsApproved:0,freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsHistoricalSurvivorEvidencePreview(r){
  try{
    if(!plain(r)||r.version!==1||r.visibility!=='PRIVATE_ONLY'||
      r.readOnly!==true||r.safeToActivate!==false||
      r.freeSlotsCertified!==false||
      r.originalDiscordArchiveAuthenticated!==false||
      r.originalDiscordDeletionsRecovered!==false||
      r.deletionTombstoneIndependentlyVerified!==false||
      r.capturedReceiptClaimsAreNotProviderProof!==true||
      r.completeHistoricalChannelDiscoveryVerified!==false||
      r.sourceAndReceiptsRemainUntrusted!==true||
      r.realDiscordNetworkCalls!==0||r.archiveWrites!==0||
      r.bookingsApproved!==0||!Array.isArray(r.reviewItems)||
      r.reviewItems.length!==count(r.humanReviewIssueCount))fail();
    for(const x of ['suppliedArchivedRecordClaims',
      'suppliedDeletedRecordClaims','survivingReceiptClaims',
      'matchingArchivedReceiptClaims','matchingDeletedReceiptClaims',
      'archivedClaimsWithoutSurvivingReceipt',
      'deletedClaimsWithoutSurvivingReceipt','conflictingReceiptClaims',
      'receiptsPredatingRecordClaims','orphanSurvivingReceiptClaims',
      'sourceArchiveDeletedCountContradictions','sourceInventoryMismatches',
      'sourceCoverageMismatches'])count(r[x]);
    if(r.matchingArchivedReceiptClaims+
        r.archivedClaimsWithoutSurvivingReceipt+
        r.conflictingReceiptClaims+
        r.receiptsPredatingRecordClaims>r.suppliedArchivedRecordClaims+
        r.suppliedDeletedRecordClaims||
      r.matchingArchivedReceiptClaims+
        r.matchingDeletedReceiptClaims+
        r.archivedClaimsWithoutSurvivingReceipt+
        r.deletedClaimsWithoutSurvivingReceipt+
        r.conflictingReceiptClaims+r.receiptsPredatingRecordClaims!==
        r.suppliedArchivedRecordClaims+r.suppliedDeletedRecordClaims||
      r.matchingArchivedReceiptClaims+r.matchingDeletedReceiptClaims+
        r.conflictingReceiptClaims+r.receiptsPredatingRecordClaims+
        r.orphanSurvivingReceiptClaims!==r.survivingReceiptClaims||
      typeof r.sourcePaginationClaimInternallyComplete!=='boolean')fail();
    if(r.reviewItems.some(x=>!plain(x)||!REASONS.has(x.reason)||
      typeof x.reviewKey!=='string'||
      !/^history-survivor:[a-f0-9]{40}$/.test(x.reviewKey)||
      x.privateHumanReviewRequired!==true||
      x.automaticallyResolved!==false||
      x.bookingCapacityChanged!==false))fail();
    const content='**Kings Event History — PRIVATE survivor evidence review**\n'+
      'Archived claims '+r.suppliedArchivedRecordClaims+
      ' | Deleted claims '+r.suppliedDeletedRecordClaims+'\n'+
      'Missing archive receipts '+r.archivedClaimsWithoutSurvivingReceipt+
      ' | Missing deleted receipts '+r.deletedClaimsWithoutSurvivingReceipt+
      '\nConflicts '+r.conflictingReceiptClaims+
      ' | Unmatched receipts '+r.orphanSurvivingReceiptClaims+
      ' | Staff issues '+r.humanReviewIssueCount+
      '\n**Claim matching is NOT original Discord verification; no free slots approved.**';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{flags:64,
      allowed_mentions:{parse:[]},content,embeds:[]}});
  }catch{fail();}
}
module.exports={auditKingsHistoricalSurvivorEvidence,
  renderKingsHistoricalSurvivorEvidencePreview};
