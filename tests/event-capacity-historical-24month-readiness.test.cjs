'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {REQUIRED,auditKings24MonthHistoricalReadiness}
  =require('../event-capacity-historical-24month-readiness');
const NOW=Date.parse('2026-11-25T03:00:00.000Z');
function claim(month,changes={}){
  return {month,...Object.fromEntries(REQUIRED.map(k=>[k,true])),
    unresolvedReviewItems:0,...changes};
}
const audit=(changes={})=>auditKings24MonthHistoricalReadiness({
  firstMonth:'2024-12',asOfMs:NOW,monthlyClaims:[],...changes
});
test('Missing original 24-month evidence produces exactly 24 private review rows',()=>{
  const result=audit();
  assert.equal(result.firstMonth,'2024-12');
  assert.equal(result.finalMonth,'2026-11');
  assert.equal(result.rows.length,24);
  assert.equal(result.counts.monthsWithoutClaim,24);
  assert.equal(result.rows[0].month,'2024-12');
  assert.equal(result.rows.at(-1).month,'2026-11');
  assert.equal(result.realSourceAvailabilityCertified,false);
  assert.equal(result.safeToActivate,false);
  assert.equal(result.freeSlotsCertified,false);
});
test('All 24 monthly claim checkboxes still cannot prove authenticated historical completeness',()=>{
  const months=audit().rows.map(x=>x.month);
  const result=audit({monthlyClaims:months.map(m=>claim(m))});
  assert.equal(result.counts.monthsWithAllClaimsSubmitted,24);
  assert.equal(result.counts.monthsIndependentlyAuthenticated,0);
  assert.equal(result.ongoing24MonthOriginalSourceHistoryVerified,false);
  assert.equal(result.deletedAndArchivedEvidenceCompletenessProven,false);
  assert.equal(result.realHistoryImported,false);
  assert.equal(result.freeSlotsCertified,false);
});
test('Separate missing checkboxes for archive, legacy and signed owner journal stay visible',()=>{
  const result=audit({monthlyClaims:[claim('2026-10',{
    archivedDeletedThreadsReconciled:false,
    legacyEventsReconciled:false,signedOwnerJournalCompared:false
  })]});
  assert.equal(result.counts.monthsWithOpenChecks,1);
  const october=result.rows.find(x=>x.month==='2026-10');
  assert.ok(october.missingChecks.includes('archivedDeletedThreadsReconciled'));
  assert.ok(october.missingChecks.includes('legacyEventsReconciled'));
  assert.ok(october.missingChecks.includes('signedOwnerJournalCompared'));
  assert.equal(october.availableSlotsCertified,false);
});
test('Unresolved human-review tasks remain blockers even if checkboxes claim complete',()=>{
  const result=audit({monthlyClaims:[claim('2026-09',{unresolvedReviewItems:7})]});
  assert.equal(result.counts.monthsWithOpenChecks,1);
  assert.equal(result.counts.unresolvedHumanReviewItems,7);
  assert.equal(result.rows.find(x=>x.month==='2026-09').reviewState,
    'Human Evidence Review Incomplete');
});
test('Duplicate, outside-window and malformed months abort with a sanitized error',()=>{
  for(const values of [
    [claim('2026-10'),claim('2026-10')],
    [claim('2024-11')],
    [claim('2026-12')],
    [claim('2026-13')],
    [claim('twenty-six')]
  ])assert.throws(()=>audit({monthlyClaims:values}),e=>{
    assert.doesNotMatch(String(e),/event:100|Partner Convoy/);
    return true;
  });
});
test('Partial month submission keeps all outstanding months visible',()=>{
  const r=audit({monthlyClaims:[claim('2024-12'),claim('2026-11')]});
  assert.equal(r.counts.monthsWithoutClaim,22);
  assert.equal(r.counts.monthsWithAllClaimsSubmitted,2);
  assert.equal(r.rows.length,24);
  assert.equal(r.rows[0].claimSubmitted,true);
  assert.equal(r.rows[1].claimSubmitted,false);
});
test('No secret, event id, or unauthorized raw event records may enter monthly claim schema',()=>{
  for(const value of [
    {...claim('2026-11'),token:'PRIVATE_TOKEN'},
    {...claim('2026-11'),rawEventIds:['event:100']},
    {...claim('2026-11'),sourceText:'Partner Convoy'}
  ])assert.throws(()=>audit({monthlyClaims:[value]}),e=>{
    assert.doesNotMatch(String(e),/PRIVATE_TOKEN|event:100|Partner Convoy/);
    return true;
  });
});
test('Missing or nonboolean claims and unsafe review counts are rejected',()=>{
  for(const value of [undefined,null,1,-1,10001,Infinity,'0']){
    const x=claim('2026-11',{unresolvedReviewItems:value});
    assert.throws(()=>audit({monthlyClaims:[x]}));
  }
  const untyped=claim('2026-11',{completedNotUsedAsAttendance:'true'});
  assert.throws(()=>audit({monthlyClaims:[untyped]}));
  const incomplete=claim('2026-11');
  delete incomplete.separateStaffReviewerChecked;
  assert.throws(()=>audit({monthlyClaims:[incomplete]}));
});
test('Future windows and invalid calendar setup fail rather than shifting history',()=>{
  for(const firstMonth of ['2025-01','2027-01','2024-00','2024-13','2024-2']){
    assert.throws(()=>audit({firstMonth}));
  }
  assert.throws(()=>audit({asOfMs:NaN}));
  assert.throws(()=>audit({asOfMs:-1}));
  assert.throws(()=>audit({asOfMs:10.5}));
});
test('Leap-year February and year transitions are handled by UTC calendar month math',()=>{
  const r=audit({firstMonth:'2024-01'});
  assert.equal(r.rows[1].month,'2024-02');
  assert.equal(r.rows[11].month,'2024-12');
  assert.equal(r.rows[12].month,'2025-01');
  assert.equal(r.rows.at(-1).month,'2025-12');
  assert.equal(r.monthsRequired,24);
});
test('Monthly view is safe for a CEO command summary and does not leak source assertions',()=>{
  const raw=claim('2026-11');
  const r=audit({monthlyClaims:[raw]});
  const output=JSON.stringify(r);
  assert.equal(output.includes('event:100'),false);
  assert.equal(output.includes('GITHUB_TOKEN'),false);
  assert.equal(r.rows.at(-1).realEvidenceAuthenticated,false);
  assert.equal(r.requiresSourceAndOwnerReview,true);
  assert.equal(r.realEventAttendanceInferred,false);
});
