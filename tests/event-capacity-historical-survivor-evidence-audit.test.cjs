'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture:source,ch,row,C,L,h}
  =require('./fixtures/outbound-center-scenario.cjs');
const {fixture:pages}
  =require('./fixtures/event-capacity-discord-pagination-fixture.cjs');
const {auditKingsHistoricalSurvivorEvidence:audit,
  renderKingsHistoricalSurvivorEvidencePreview:render}
  =require('../event-capacity-historical-survivor-evidence-audit');
const DATE='2026-11-25T14:00:00.000Z';
function fixture(){
  const sourceIntake=source(),paginationInput=pages();
  paginationInput.nowMs=sourceIntake.nowMs;
  sourceIntake.channelInventory[1].firstCoveredMonth='2026-10';
  sourceIntake.channelInventory[1].lastCoveredMonth='2026-10';
  const archived=row(C,'990000000000000030','archived'),
    deleted=row(L,'990000000000000040','deleted');
  archived.modifiedAtUtc='2026-11-20T12:00:00.000Z';
  deleted.departureAtUtc='2026-10-20T18:00:00.000Z';
  deleted.modifiedAtUtc='2026-10-21T12:00:00.000Z';
  sourceIntake.convoyRecords.push(archived,deleted);
  sourceIntake.channelInventory[0].claimedThreadCount=2;
  sourceIntake.channelInventory[0].claimedArchivedCount=1;
  sourceIntake.channelInventory[1].claimedThreadCount=2;
  sourceIntake.channelInventory[1].claimedDeletedCount=1;
  return {sourceIntake,paginationInput,survivingReceiptClaims:[]};
}
function receipt(record,change={}){
  return {channelId:record.channelId,threadId:record.threadId,
    sourceKind:record.sourceKind,sourceDigest:record.sourceDigest,
    receiptDigest:h('surviving-receipt-'+record.threadId),
    capturedAtUtc:DATE,...change};
}
function get(r,kind){
  return r.sourceIntake.convoyRecords.find(x=>x.sourceKind===kind);
}
function run(change){
  const f=fixture();change?.(f);return audit(f);
}
test('Historical survivor audit always treats original archive/deletions as unverified',()=>{
  const r=run();
  assert.equal(r.suppliedArchivedRecordClaims,1);
  assert.equal(r.suppliedDeletedRecordClaims,1);
  assert.equal(r.archivedClaimsWithoutSurvivingReceipt,1);
  assert.equal(r.deletedClaimsWithoutSurvivingReceipt,1);
  assert.equal(r.originalDiscordArchiveAuthenticated,false);
  assert.equal(r.originalDiscordDeletionsRecovered,false);
  assert.equal(r.deletionTombstoneIndependentlyVerified,false);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.realDiscordNetworkCalls,0);
  assert.ok(r.reviewItems.some(x=>x.reason==='MISSING_SURVIVING_RECORD_EVIDENCE'));
});
test('Matching receipt claims never establish original provider proof or capacity',()=>{
  const r=run(f=>{
    f.survivingReceiptClaims=[
      receipt(get(f,'archived')),receipt(get(f,'deleted'))];
  });
  assert.equal(r.matchingArchivedReceiptClaims,1);
  assert.equal(r.matchingDeletedReceiptClaims,1);
  assert.equal(r.archivedClaimsWithoutSurvivingReceipt,0);
  assert.equal(r.deletedClaimsWithoutSurvivingReceipt,0);
  assert.equal(r.capturedReceiptClaimsAreNotProviderProof,true);
  assert.equal(r.originalDiscordArchiveAuthenticated,false);
  assert.equal(r.originalDiscordDeletionsRecovered,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Wrong linked digest or source kind remains a contradiction for staff review',()=>{
  const r=run(f=>{
    f.survivingReceiptClaims=[
      receipt(get(f,'archived'),{sourceDigest:h('wrong')} ),
      receipt(get(f,'deleted'),{sourceKind:'archived'})];
  });
  assert.equal(r.conflictingReceiptClaims,2);
  assert.equal(r.matchingArchivedReceiptClaims,0);
  assert.equal(r.matchingDeletedReceiptClaims,0);
  assert.ok(r.reviewItems.some(x=>x.reason==='RECEIPT_KIND_OR_DIGEST_CONFLICT'));
});
test('Receipt predating a deleted or archived record cannot prove survivor chain',()=>{
  const r=run(f=>{
    f.survivingReceiptClaims=[receipt(get(f,'archived'),{
      capturedAtUtc:'2026-11-19T00:00:00.000Z'
    })];
  });
  assert.equal(r.receiptsPredatingRecordClaims,1);
  assert.equal(r.deletedClaimsWithoutSurvivingReceipt,1);
  assert.equal(r.originalDiscordDeletionsRecovered,false);
});
test('Orphan evidence is counted but cannot create or count a Convoy',()=>{
  const r=run(f=>{
    f.survivingReceiptClaims=[receipt(get(f,'archived'),{
      threadId:'990000000000000099'})];
  });
  assert.equal(r.orphanSurvivingReceiptClaims,1);
  assert.equal(r.archivedClaimsWithoutSurvivingReceipt,1);
  assert.equal(r.suppliedArchivedRecordClaims,1);
  assert.ok(r.reviewItems.some(x=>x.reason==='UNMATCHED_SURVIVING_RECEIPT'));
  assert.equal(r.bookingsApproved,0);
});
test('Duplicate receipts and unexpected raw private content fields abort',()=>{
  const f=fixture(),r=receipt(get(f,'deleted'));
  assert.throws(()=>audit({...f,survivingReceiptClaims:[r,r]}));
  assert.throws(()=>audit({...f,survivingReceiptClaims:[{
    ...r,originalMessage:'Private deleted message'
  }]}));
  assert.throws(()=>audit({...f,survivingReceiptClaims:[{
    ...r,capturedAtUtc:'2027-01-01T00:00:00.000Z'
  }]}));
});
test('Contradictory archived/deleted inventory counts are visible even if receipts match',()=>{
  const r=run(f=>{
    f.sourceIntake.channelInventory[0].claimedArchivedCount=0;
    f.survivingReceiptClaims=[receipt(get(f,'archived'))];
  });
  assert.equal(r.sourceArchiveDeletedCountContradictions,1);
  assert.equal(r.matchingArchivedReceiptClaims,1);
  assert.ok(r.reviewItems.some(x=>x.reason==='SOURCE_ROW_COUNT_DISAGREEMENT'));
});
test('Pagination omissions remain visible despite matching historical receipt claims',()=>{
  const r=run(f=>{
    f.survivingReceiptClaims=[
      receipt(get(f,'archived')),receipt(get(f,'deleted'))];
    f.paginationInput.scans=f.paginationInput.scans.filter(x=>
      x.stream!=='archived-public');
  });
  assert.equal(r.sourcePaginationClaimInternallyComplete,false);
  assert.ok(r.reviewItems.some(x=>x.reason==='SOURCE_PAGINATION_INCOMPLETE'));
  assert.equal(r.completeHistoricalChannelDiscoveryVerified,false);
});
test('Missing older source inventory is never interpreted as authenticated history',()=>{
  const r=run(f=>{
    f.paginationInput.channels=[f.paginationInput.channels[0]];
    f.paginationInput.scans=f.paginationInput.scans.filter(x=>
      x.channelId===f.paginationInput.channels[0].channelId);
  });
  assert.equal(r.sourceInventoryMismatches,1);
  assert.ok(r.reviewItems.some(x=>x.reason==='CHANNEL_INVENTORY_DISAGREEMENT'));
});
test('Declared legacy channel time range conflict is flagged',()=>{
  const r=run(f=>{
    f.sourceIntake.channelInventory[1].firstCoveredMonth='2026-09';
  });
  assert.equal(r.sourceCoverageMismatches,1);
  assert.equal(r.safeToActivate,false);
});
test('Mismatched guild/24-month scope or date rejects history evidence combining',()=>{
  const f=fixture();
  for(const patch of [
    {guildId:'990000000000000098'},
    {firstMonth:'2025-01'},
    {finalMonth:'2026-10'},
    {nowMs:f.paginationInput.nowMs+1}
  ]){
    assert.throws(()=>audit({...f,paginationInput:{
      ...f.paginationInput,...patch
    }}));
  }
});
test('Redacted private preview excludes IDs, receipts and tokens',()=>{
  const r=run(f=>{f.survivingReceiptClaims=[
    receipt(get(f,'archived')),receipt(get(f,'deleted'))]});
  const view=render(r),data=JSON.stringify(view);
  assert.equal(view.type,4);
  assert.equal(view.data.flags,64);
  assert.deepEqual(view.data.allowed_mentions,{parse:[]});
  for(const raw of [C,L,'990000000000000030','990000000000000040',
    'kings-workboard-reminder:',h('source'), 'PRIVATE KEY','@everyone'])
    assert.equal(data.includes(raw),false);
  assert.match(data,/NOT original Discord verification/);
});
test('Private renderer refuses forged source proof, availability and arithmetic',()=>{
  const r=run();
  for(const change of [
    {originalDiscordArchiveAuthenticated:true},
    {originalDiscordDeletionsRecovered:true},
    {deletionTombstoneIndependentlyVerified:true},
    {completeHistoricalChannelDiscoveryVerified:true},
    {freeSlotsCertified:true},{bookingsApproved:1},
    {matchingArchivedReceiptClaims:1},
    {archivedClaimsWithoutSurvivingReceipt:0},
    {survivingReceiptClaims:50},
    {humanReviewIssueCount:0}
  ])assert.throws(()=>render({...r,...change}));
});
test('New evidence audit is offline and not imported by live Convoy Checker',()=>{
  const root=path.join(__dirname,'..');
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const code=read('event-capacity-historical-survivor-evidence-audit.js');
  assert.equal(read('convoy-checker.js').includes(
    'event-capacity-historical-survivor-evidence-audit'),false);
  assert.equal(read('.github/workflows/convoy-checker.yml').includes(
    'event-capacity-historical-survivor-evidence-audit'),false);
  assert.doesNotMatch(code,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/discord/);
  assert.match(code,/bookingsApproved:0,freeSlotsCertified:false,safeToActivate:false/);
});
