'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {encryptEventState}=require('../event-leadership-state');
const {readProtectedEventMonthlyReport}=require('../management-monthly-event-source');
const root=path.resolve(__dirname,'..');
const secret='synthetic-mgmt-event-test-key-'.repeat(3);
const month='2026-10';
function eventRecord(extra={}){
  return {key:month,publishedAt:'2026-11-01T10:00:00.000Z',
    counted:5,completed:2,cancelled:1,scheduled:1,ready:1,needsInfo:0,
    changes:2,realConvoys:5,...extra};
}
function state(record=eventRecord()){
  return {version:1,lastSnapshot:null,changeLog:[],
    publishedDailyKeys:[],publishedWeeklyKeys:[],publishedMonthlyKeys:[month],
    weeklyReports:[],monthlyReports:[record]};
}
function fixture(t,content){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-protected-event-month-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'event-state.json');
  if(content!==undefined)fs.writeFileSync(file,content,'utf8');
  return file;
}
function encrypted(t,value=state()){
  return fixture(t,JSON.stringify(encryptEventState(value,secret)));
}
test('a real-shaped AES-256-GCM Event monthly source is read-only and not certified history',t=>{
  const file=encrypted(t);
  const prior=fs.readFileSync(file,'utf8');
  const report=readProtectedEventMonthlyReport(file,month,secret);
  assert.equal(report.key,month);
  assert.equal(report.counted,5);
  assert.equal(report.completed,2);
  assert.equal(report.historyVerified,false);
  assert.equal(report.attendanceVerified,false);
  assert.equal(fs.readFileSync(file,'utf8'),prior,'Never edit the original protected source');
});
test('missing Event source and month stay missing, never synthesized as zero',t=>{
  assert.equal(readProtectedEventMonthlyReport(fixture(t),month,secret),null);
  assert.equal(readProtectedEventMonthlyReport(encrypted(t), '2026-09', secret),null);
});
test('invalid key, wrong AES key, unencrypted input and tampering fail closed',t=>{
  assert.throws(()=>readProtectedEventMonthlyReport(encrypted(t),month,'short'),/key.*short/);
  assert.throws(()=>readProtectedEventMonthlyReport(encrypted(t),month,secret+'wrong'),/integrity check failed/);
  assert.throws(()=>readProtectedEventMonthlyReport(fixture(t,JSON.stringify(state())),month,secret),/not encrypted/);
  assert.throws(()=>readProtectedEventMonthlyReport(fixture(t,'{bad'),month,secret),/JSON invalid/);
  assert.throws(()=>readProtectedEventMonthlyReport(encrypted(t), 'invalid',secret),/Invalid.*period/);
});
test('periods require matching original publication keys, unique monthly entries and bounded counts',t=>{
  for(const data of [
    {...state(),publishedMonthlyKeys:[]},
    {...state(),publishedMonthlyKeys:[month,month]},
    {...state(),monthlyReports:[eventRecord(),eventRecord()]},
    state(eventRecord({counted:-1})),
    state(eventRecord({counted:null})),
    state(eventRecord({counted:1,completed:2})),
    state(eventRecord({scheduled:4})),
  ]){
    const file=encrypted(t,data);
    assert.throws(()=>readProtectedEventMonthlyReport(file,month,secret),
      /journal inconsistent|counts invalid|counts contradictory/);
  }
});
test('Management Monthly uses protected source, existing AES secret and explicit historical warning',()=>{
  const source=fs.readFileSync(path.join(root,'management-monthly-report.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/management-monthly-report.yml'),'utf8');
  assert.match(source,/readProtectedEventMonthlyReport\(EVENT_REPORTS,period\.key/);
  assert.doesNotMatch(source,/event:\s*monthlyReport\(EVENT_REPORTS/);
  assert.match(source,/Original 24-month Event history, approvals and attendance remain unverified/);
  assert.match(source,/item\.completeCoverage === true/);
  assert.match(workflow,/EVENT_LEADERSHIP_STATE_KEY:\s*\$\{\{\s*secrets\.DRIVER_STATE_KEY\s*\}\}/);
  assert.match(workflow,/node --test tests\/management-monthly-encrypted-event-source\.test\.cjs/);
});
