'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseDriverIdentityRecord}=require('../driver-identity-register');
const {
  CASE_TYPE,CASE_STATUS,pendingHrDriverIntake,humanHrIntakeInstructions
}=require('../hr-driver-intake-review');
const {driverOnlyAuditPages}=require('../driver-tmp-vtc-register-review');

const A='123456789012345678',B='123456789012345679',TRIAL='123456789012345680';
const NOW=new Date('2026-11-21T18:00:00Z');
function makeRegister() {
  const a=parseDriverIdentityRecord(
    'discord_id: '+A+'\nkings_join_date: 14.11.2023\ntruckersmp_id: 1234567',NOW);
  return {enabled:true,records:new Map([[A,a.joinedAt]]),identities:new Map([[A,a]])};
}
const current=[{discordId:A,role:'Driver'},{discordId:B,role:'Driver'},{discordId:TRIAL,role:'Trial'}];

test('only active verified Discord Driver role holders without an original Kings date get a human intake case',()=>{
  const report=pendingHrDriverIntake(current,makeRegister(),NOW);
  assert.equal(report.counts.activeDrivers,2);
  assert.equal(report.counts.registered,1);
  assert.equal(report.counts.needsHumanReview,1);
  assert.equal(report.counts.platformLinksPresent,1);
  assert.equal(report.counts.status,'incomplete');
  assert.equal(report.cases.length,1);
  assert.equal(report.cases[0].discordId,B);
  assert.equal(report.cases[0].status,CASE_STATUS);
  assert.equal(report.cases[0].admissionType,CASE_TYPE);
  assert.ok(report.cases[0].admissionType.includes('undetermined'));
  assert.ok(!JSON.stringify(report.cases).includes('2023-11-14'));
  assert.ok(!JSON.stringify(report.cases).includes(TRIAL));
});

test('already verified private Kings record does not create unnecessary duplicate intake cases',()=>{
  const report=pendingHrDriverIntake([{discordId:A,role:'Driver'}],makeRegister(),NOW);
  assert.equal(report.counts.status,'complete');
  assert.equal(report.counts.registered,1);
  assert.equal(report.cases.length,0);
  // Verification of the original date is not an HR admission/rejoin approval.
  assert.match(humanHrIntakeInstructions().join(' '),/Driver role alone is not an approval/);
});

test('invalid, missing or contradictory private original dates cannot produce a passing HR case',()=>{
  assert.throws(()=>pendingHrDriverIntake(current,{enabled:false,records:new Map(),identities:new Map()},NOW),
    /authoritative private Kings Driver registry is unavailable/i);
  const mismatched=makeRegister();
  mismatched.records.set(A,new Date('2024-06-01T00:00:00Z'));
  assert.throws(()=>pendingHrDriverIntake(current,mismatched,NOW),/consistency/);
  assert.throws(()=>pendingHrDriverIntake([current[0],current[0]],makeRegister(),NOW),
    /duplicates/);
});

test('private established queue carries manual FIRST ADMISSION vs RETURNER checklist, not guessed classification',()=>{
  const report=driverOnlyAuditPages(current,makeRegister(),NOW);
  assert.equal(report.counts.pendingHrIntakeCases,1);
  assert.equal(report.counts.missingRecords,1);
  assert.equal(report.counts.currentDrivers,2);
  assert.equal(report.counts.registered,1);
  const summary=report.pages[0].content;
  assert.match(summary,/HR first-admission \/ returner cases pending human review: \*\*1\*\*/);
  assert.match(summary,/role is NOT evidence that HR approved/);
  const review=report.pages.find(page=>page.marker.includes('Missing Discord'));
  assert.ok(review);
  assert.match(review.content,/FIRST ADMISSION or RETURNER/);
  assert.match(review.content,/original Kings date/);
  assert.ok(review.content.includes(B));
  assert.ok(!review.content.includes(A+' • Kings Driver'));
  assert.ok(!review.content.includes(TRIAL));
  assert.ok(report.pages.every(page=>page.content.length<=1900));
});

test('large future HR intake queue safely paginates in the private Leadership report',()=>{
  const registry={enabled:true,records:new Map(),identities:new Map()};
  const drivers=Array.from({length:70},(_,i)=>({
    discordId:String(200000000000000001n+BigInt(i)),role:'Driver'
  }));
  const report=driverOnlyAuditPages(drivers,registry,NOW);
  assert.equal(report.counts.pendingHrIntakeCases,70);
  assert.equal(report.pages.length,1+Math.ceil(70/15));
  assert.ok(report.pages.every(page=>page.content.length<=1900));
  assert.ok(report.pages.every(page=>page.marker.startsWith('👑 **Kings Driver Registration Queue | ')));
});

test('HR review adapter performs no writes and original register stays authoritative',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','hr-driver-intake-review.js'),'utf8');
  assert.doesNotMatch(source,/fetch\s*\(|writeFileSync\s*\(|appendFileSync\s*\(|method\s*:\s*['"](?:POST|PATCH|DELETE)['"]/);
  assert.doesNotMatch(source,/console\.log\(|console\.error\(/);
  assert.match(source,/activeDriverSourceCoverage\(register,active\.map/);
  assert.match(source,/first-admission-or-returner-undetermined/);
});
