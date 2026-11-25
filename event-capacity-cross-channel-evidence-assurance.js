'use strict';
// PRIVATE, OFFLINE and DRAFT. Audit UNTRUSTED claimed source inventories.
// This function does not fetch Discord, accept Events or certify source
// completeness, even when every count and checkbox is consistent.
const ERROR='Kings Event Capacity cross-channel evidence assurance unavailable.';
const SNOW=/^[1-9]\d{16,21}$/;
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function count(x){if(!Number.isSafeInteger(x)||x<0||x>10000)fail();return x;}
function inspectKingsSourceChannelEvidenceClaims({channelInventory,convoyRecords}={}){
  try{
    if(!Array.isArray(channelInventory)||channelInventory.length>100||
      !Array.isArray(convoyRecords)||convoyRecords.length>10000)fail();
    const rows=new Map();
    for(const c of channelInventory){
      if(!plain(c)||!SNOW.test(c.channelId)||rows.has(c.channelId)||
        !['current','legacy'].includes(c.kind)||
        typeof c.currentThreadsRead!=='boolean'||
        typeof c.archivedThreadsRead!=='boolean'||
        typeof c.deletedThreadsReviewed!=='boolean'||
        typeof c.editHistoryReviewed!=='boolean')fail();
      const claimed=count(c.claimedThreadCount),
        archived=count(c.claimedArchivedCount),
        deleted=count(c.claimedDeletedCount);
      if(archived+deleted>claimed)fail();
      rows.set(c.channelId,{kind:c.kind,claimed,archived,deleted,
        observed:0,observedArchived:0,observedDeleted:0,
        gap:!c.currentThreadsRead||!c.archivedThreadsRead||
          !c.deletedThreadsReviewed||!c.editHistoryReviewed});
    }
    const seen=new Set();
    for(const record of convoyRecords){
      if(!plain(record)||!rows.has(record.channelId)||
        !SNOW.test(record.threadId)||
        !['current','archived','deleted','legacy'].includes(record.sourceKind))
        fail();
      const key=record.channelId+':'+record.threadId;
      if(seen.has(key))fail();
      seen.add(key);
      const row=rows.get(record.channelId);
      row.observed++;
      if(record.sourceKind==='archived')row.observedArchived++;
      if(record.sourceKind==='deleted')row.observedDeleted++;
    }
    const issues=[],totals={mismatchedThreadCounts:0,
      mismatchedArchivedCounts:0,mismatchedDeletedCounts:0,
      channelsWithCoverageClaimGaps:0,
      channelsWithAnyCountContradiction:0};
    for(const row of rows.values()){
      let violated=false;
      if(row.claimed!==row.observed){
        totals.mismatchedThreadCounts++;violated=true;
        issues.push('thread-count-contradiction');
      }
      if(row.archived!==row.observedArchived){
        totals.mismatchedArchivedCounts++;violated=true;
        issues.push('archived-count-contradiction');
      }
      if(row.deleted!==row.observedDeleted){
        totals.mismatchedDeletedCounts++;violated=true;
        issues.push('deleted-count-contradiction');
      }
      if(row.gap){
        totals.channelsWithCoverageClaimGaps++;
        issues.push('claimed-source-coverage-gap');
      }
      if(violated)totals.channelsWithAnyCountContradiction++;
    }
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      examinedChannelClaims:rows.size,examinedThreadClaims:convoyRecords.length,
      counters:Object.freeze(totals),
      issueKinds:Object.freeze([...new Set(issues)].sort()),
      untrustedInventoryInternallyConsistent:
        totals.channelsWithAnyCountContradiction===0,
      claimsDoNotAttestToActualDiscordAccess:true,
      allOldChannelsIndependentlyEnumerated:false,
      archivedAndDeletedThreadsOriginalsAuthenticated:false,
      complete24MonthOriginalSourceHistoryVerified:false,
      originalPrivateDiscordMessagesRead:0,
      providerAccessTokensIssued:0,
      eventDataWritten:0,
      staffDecisionsMade:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={inspectKingsSourceChannelEvidenceClaims};
