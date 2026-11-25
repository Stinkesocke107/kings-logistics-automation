'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planHistoricalRetention}=require('../event-capacity-historical-retention-plan');
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
function backup(day,reviewOn,changes={}){
  return {backupId:'a'.repeat(64),day,retentionReviewOn:reviewOn,
    ciphertextDigest:'b'.repeat(64),legalHold:false,restoreTestAt:null,...changes};
}
test('24 distinct UTC months are listed without certifying history completeness',()=>{
  const result=planHistoricalRetention({nowMs:NOW});
  assert.equal(result.monthWindow.length,24);
  assert.equal(result.monthWindow[0],'2025-06');
  assert.equal(result.monthWindow.at(-1),'2027-05');
  assert.equal(result.missingMonthReviews.length,24);
  assert.equal(result.historyCompletenessCertified,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.retentionActionsAutomated,false);
});
test('Recorded monthly reviews do not become trusted evidence of historical coverage',()=>{
  const result=planHistoricalRetention({nowMs:NOW,monthReviews:[{
    month:'2027-04',reviewedAt:'2027-05-01T09:00:00.000Z',
    evidenceDigest:'c'.repeat(64)
  }]});
  assert.equal(result.recordedMonthReviewCount,1);
  assert.equal(result.missingMonthReviews.length,23);
  assert.equal(result.historyCompletenessCertified,false);
});
test('90-day backup review never deletes backups, even past review date',()=>{
  const result=planHistoricalRetention({nowMs:NOW,backups:[
    backup('2027-02-01','2027-05-02')
  ]});
  assert.equal(result.retentionReviewCandidates.length,1);
  assert.equal(result.deletedBackups,0);
  assert.equal(result.retentionActionsAutomated,false);
  assert.match(result.retentionReviewCandidates[0].reviewReason,/Review Only/);
});
test('Legal holds remain protected even after the retention review date',()=>{
  const result=planHistoricalRetention({nowMs:NOW,backups:[
    backup('2027-02-01','2027-05-02',{legalHold:true})
  ]});
  assert.equal(result.legalHoldBackupCount,1);
  assert.match(result.retentionReviewCandidates[0].reviewReason,/Legal Hold/);
  assert.equal(result.deletedBackups,0);
});
test('A reported isolated monthly restore is not independent proof of recovery',()=>{
  const result=planHistoricalRetention({nowMs:NOW,backups:[
    backup('2027-04-30','2027-07-29',
      {restoreTestAt:'2027-05-15T10:00:00.000Z'})
  ]});
  assert.equal(result.monthlyRestoreEvidenceRecorded,true);
  assert.equal(result.monthlyRestoreIndependentProofVerified,false);
});
test('Duplicate IDs and duplicate month reviews are rejected',()=>{
  const item=backup('2027-02-01','2027-05-02');
  assert.throws(()=>planHistoricalRetention({nowMs:NOW,backups:[item,item]}));
  const review={month:'2027-04',reviewedAt:'2027-05-01T09:00:00.000Z',
    evidenceDigest:'c'.repeat(64)};
  assert.throws(()=>planHistoricalRetention({nowMs:NOW,monthReviews:[review,review]}));
});
test('Invalid calendar dates and forged retention dates fail closed',()=>{
  assert.throws(()=>planHistoricalRetention({nowMs:NOW,backups:[
    backup('2027-02-30','2027-05-31')] }));
  assert.throws(()=>planHistoricalRetention({nowMs:NOW,backups:[
    backup('2027-02-01','2027-05-03')] }));
  assert.throws(()=>planHistoricalRetention({nowMs:NOW,backups:[
    backup('2027-02-01','2027-05-02',{restoreTestAt:'2027-01-31T09:00:00.000Z'})] }));
});
test('Unknown or future monthly evidence is rejected rather than assuming coverage',()=>{
  assert.throws(()=>planHistoricalRetention({nowMs:NOW,monthReviews:[{
    month:'2024-02',reviewedAt:'2027-05-01T00:00:00.000Z',
    evidenceDigest:'f'.repeat(64)
  }]}));
  assert.throws(()=>planHistoricalRetention({nowMs:NOW,monthReviews:[{
    month:'2027-05',reviewedAt:'2027-06-01T00:00:00.000Z',
    evidenceDigest:'f'.repeat(64)
  }]}));
});
