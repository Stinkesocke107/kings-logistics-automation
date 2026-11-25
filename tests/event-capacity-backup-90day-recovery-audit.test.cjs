'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {inspectKingsNinetyDayBackupRecovery}
  =require('../event-capacity-backup-90day-recovery-audit');
const NOW=Date.parse('2026-11-25T03:15:00.000Z');
const h=x=>crypto.createHash('sha256').update(x).digest('hex');
const plus=(day,n)=>new Date(Date.parse(day+'T00:00:00.000Z')+
  n*86400000).toISOString().slice(0,10);
const claim=(day,changes={})=>({
  day,ciphertextDigest:h('cipher:'+day),
  manifestDigest:h('manifest:'+day),retentionReviewOn:plus(day,90),
  legalHold:false,offsiteCopyClaimed:true,
  restoreTestedAt:null,restoreEvidenceDigest:null,...changes
});
const audit=(changes={})=>inspectKingsNinetyDayBackupRecovery({
  nowMs:NOW,backupClaims:[],...changes
});
test('90 *completed* UTC days, excluding unfinished today, are assessed without false success',()=>{
  const r=audit();
  assert.equal(r.reviewedDayCount,90);
  assert.equal(r.lastCompletedDay,'2026-11-24');
  assert.notEqual(r.firstCompletedDay,'2026-11-25');
  assert.equal(r.days.length,90);
  assert.equal(r.counts.missingClaimedBackups,90);
  assert.equal(r.monthlyIndependentRecoveryDrillVerified,false);
  assert.equal(r.backupRetentionEnforced,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('All 90 claimed backup days do NOT prove physical backups or independent restoration',()=>{
  const template=audit();
  const complete=audit({backupClaims:template.days.map(x=>claim(x.day))});
  assert.equal(complete.counts.missingClaimedBackups,0);
  assert.equal(complete.counts.suppliedBackupClaims,90);
  assert.equal(complete.independentOffsiteStorageCustodyVerified,false);
  assert.equal(complete.dailyBackupExecutionIndependentlyVerified,false);
  assert.equal(complete.monthlyIndependentRecoveryDrillVerified,false);
  assert.equal(complete.safeToActivate,false);
});
test('Legal hold and retention review are visible but never delete anything',()=>{
  const r=audit({backupClaims:[
    claim(audit().firstCompletedDay,{legalHold:true})
  ]});
  assert.equal(r.counts.legalHoldDays,1);
  assert.equal(r.counts.retentionReviewDueDays,1);
  assert.equal(r.days[0].status,'Legal Hold — Retain and Review');
  assert.equal(r.automaticDeletions,0);
  assert.equal(r.legalHoldEnforcementVerified,false);
});
test('Missing offsite copy and reported restoration stay unverified',()=>{
  const day=audit().lastCompletedDay;
  const r=audit({backupClaims:[claim(day,{
    offsiteCopyClaimed:false,
    restoreTestedAt:'2026-11-25T01:00:00.000Z',
    restoreEvidenceDigest:h('unverified restore receipt')
  })]});
  assert.equal(r.counts.offsiteCopyNotClaimed,1);
  assert.equal(r.counts.reportedRecentRestoreClaims,1);
  assert.equal(r.counts.independentRestoreProofsVerified,0);
  assert.equal(r.days.at(-1).status,'Offsite Copy Not Claimed');
  assert.equal(r.days.at(-1).recoveryProofVerified,false);
});
test('Duplicate or future/day-outside 90-day backups fail closed',()=>{
  const d=audit().lastCompletedDay;
  for(const backupClaims of [
    [claim(d),claim(d)],
    [claim('2026-11-25')],
    [claim('2026-06-01')],
    [claim('2026-02-30')]
  ])assert.throws(()=>audit({backupClaims}));
});
test('Forged retention-review date, malformed hash and unsafe input are rejected',()=>{
  const d=audit().lastCompletedDay;
  for(const patch of [
    {retentionReviewOn:d},{retentionReviewOn:'2026-02-30'},
    {ciphertextDigest:'not sha'}, {manifestDigest:h('x').toUpperCase()},
    {offsiteCopyClaimed:'true'},{legalHold:1},{rawToken:'SECRET'}
  ])assert.throws(()=>audit({backupClaims:[claim(d,patch)]}));
});
test('Restore timestamp and digest must either both exist or both be null',()=>{
  const d=audit().lastCompletedDay;
  for(const patch of [
    {restoreTestedAt:'2026-11-25T01:00:00.000Z'},
    {restoreEvidenceDigest:h('receipt')},
    {restoreTestedAt:'2026-11-25T01:00:00.000Z',
      restoreEvidenceDigest:'garbage'},
    {restoreTestedAt:'2026-11-26T01:00:00.000Z',
      restoreEvidenceDigest:h('future')},
    {restoreTestedAt:'2026-11-25T01:00:00+00:00',
      restoreEvidenceDigest:h('alternate ISO')}
  ])assert.throws(()=>audit({backupClaims:[claim(d,patch)]}));
});
test('Old restore claims do not satisfy recent 30-day drill tracking',()=>{
  const d=audit().firstCompletedDay;
  const r=audit({backupClaims:[claim(d,{
    restoreTestedAt:'2026-09-01T00:00:00.000Z',
    restoreEvidenceDigest:h('old restore')
  })]});
  assert.equal(r.counts.reportedRecentRestoreClaims,0);
});
test('A November/December UTC boundary preserves the 90 completed days rule',()=>{
  const r=inspectKingsNinetyDayBackupRecovery({
    nowMs:Date.parse('2027-01-01T00:00:00.000Z')
  });
  assert.equal(r.lastCompletedDay,'2026-12-31');
  assert.equal(r.reviewedDayCount,90);
  assert.equal(r.days.at(-1).day,'2026-12-31');
  assert.equal(r.days[0].day,r.firstCompletedDay);
});
test('Summary never leaks backup hashes, private credentials or event references',()=>{
  const d=audit().lastCompletedDay;
  const row=claim(d);
  const s=JSON.stringify(audit({backupClaims:[row]}));
  for(const field of [row.ciphertextDigest,row.manifestDigest,
    'event:100','Partner Convoy','PRIVATE KEY'])
    assert.equal(s.includes(field),false);
});
test('Malformed top-level input and excessive records are rejected',()=>{
  for(const nowMs of [-1,NaN,1.5,Infinity]){
    assert.throws(()=>audit({nowMs}));
  }
  assert.throws(()=>audit({backupClaims:999}));
  assert.throws(()=>audit({backupClaims:Array(91).fill(null)}));
});
