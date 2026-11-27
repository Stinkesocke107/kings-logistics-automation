'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {loadPublicationState,loadPublicationKeyState}=require('../report-publication-journal-guard');

function journal(t,value){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-report-journal-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'state.json');
  if(value!==undefined)fs.writeFileSync(file,value,'utf8');
  return file;
}
const fresh=()=>({version:2,publishedWeeks:[]});

test('missing weekly journal may start safely, but existing broken JSON must fail closed',t=>{
  assert.deepEqual(loadPublicationState(journal(t), 'publishedWeeks',fresh),fresh());
  assert.throws(()=>loadPublicationState(journal(t,'{broken'), 'publishedWeeks',fresh),
    /unreadable.*refusing empty-state reset/i);
});
test('invalid/null/wrong-shape journal never becomes a new publication state',t=>{
  for(const value of ['null','[]','{}','{"publishedWeeks":{}}']){
    assert.throws(()=>loadPublicationState(journal(t,value),'publishedWeeks',fresh),/invalid schema/);
  }
});
test('duplicate and invalid calendar periods are rejected before Discord publication',t=>{
  for(const keys of [
    ['2026-11-23','2026-11-23'],['2026-02-30'],['2026-13-01'],['preview'],[''],
  ]){
    const state={version:2,publishedWeeks:keys.map(key=>({key}))};
    assert.throws(()=>loadPublicationState(journal(t,JSON.stringify(state)),'publishedWeeks',fresh),
      /duplicate periods|invalid period key|nonexistent period/);
  }
});
test('real-shaped weekly and monthly journals retain previous publications exactly',t=>{
  const weekly={version:3,publishedWeeks:[{key:'2026-10-05',publishedAt:'2026-10-13T05:44:24.128Z'}],messageId:'123'};
  const monthly={version:2,publishedMonths:[{key:'2026-09',discordMessageId:'123'},{key:'2026-10',discordMessageId:'456'}]};
  assert.deepEqual(loadPublicationState(journal(t,JSON.stringify(weekly)),'publishedWeeks',fresh),weekly);
  assert.deepEqual(loadPublicationState(journal(t,JSON.stringify(monthly)),'publishedMonths',()=>({publishedMonths:[]})),monthly);
  assert.throws(()=>loadPublicationState(journal(t,JSON.stringify(weekly)),'publishedMonths',()=>({publishedMonths:[]})),/invalid schema/);
});
test('all weekly/monthly producers and verifiers use fail-closed journal reader',()=>{
  const files=['driver-weekly-summary.js','hr-weekly-summary.js','management-weekly-overview-v3.js',
    'monthly-report-v2.js','weekly-reports-verifier-v2.js','monthly-report-verifier.js'];
  for(const file of files){
    const body=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.match(body,/require\(['"]\.\/report-publication-journal-guard['"]\)/,file);
    assert.match(body,/loadPublicationState\(/,file);
  }
});
test('sensitive report APIs never copy arbitrary Discord response text to error logs',()=>{
  for(const file of [
    'driver-weekly-summary.js','hr-weekly-summary.js','management-weekly-overview-v3.js',
    'monthly-report-v2.js','weekly-reports-verifier-v2.js',
    'monthly-report-verifier.js','hr-weekly-summary-runner.js'
  ]){
    const body=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.doesNotMatch(body,/(?:text|body)\.slice\(0,\s*(?:200|300|500)\)/,file);
  }
});

test('leadership key-based daily/weekly/monthly journals preserve all original publication history',t=>{
  const state={
    version:1,publishedDailyKeys:['2026-10-13'],
    publishedWeeklyKeys:['2026-11-02'],publishedMonthlyKeys:['2026-10'],
    weeklyReports:[{key:'2026-11-02'}],monthlyReports:[{key:'2026-10'}]
  };
  assert.deepEqual(loadPublicationKeyState(journal(t,JSON.stringify(state)),
    ['publishedDailyKeys','publishedWeeklyKeys','publishedMonthlyKeys'],
    ['weeklyReports','monthlyReports'],()=>({})),state);
});
test('leadership publication journals fail closed on malformed keys, duplicate keys or missing report arrays',t=>{
  const base={version:1,publishedDailyKeys:['2026-11-21'],publishedMonthlyKeys:['2026-10'],monthlyReports:[{key:'2026-10'}]};
  const valid=(value)=>loadPublicationKeyState(journal(t,JSON.stringify(value)),
    ['publishedDailyKeys','publishedMonthlyKeys'],['monthlyReports'],()=>({}));
  assert.throws(()=>valid({...base,publishedDailyKeys:['2026-11-21','2026-11-21']}),/duplicate periods/);
  assert.throws(()=>valid({...base,publishedMonthlyKeys:['2026-13']}),/invalid period key/);
  assert.throws(()=>valid({...base,monthlyReports:[{key:'2026-02'},{key:'2026-02'}]}),/duplicate periods/);
  assert.throws(()=>valid({...base,monthlyReports:null}),/invalid schema/);
  assert.throws(()=>valid({...base,publishedDailyKeys:['2026-02-30']}),/nonexistent period/);
  assert.throws(()=>loadPublicationKeyState(journal(t,'{bad'),['publishedMonths'],['monthlyReports'],()=>({})),/unreadable/);
});
test('all four Leadership publishers validate key-based journals before publishing',()=>{
  for(const file of ['driver-leadership-reports.js','hr-leadership-reports.js',
    'staff-leadership-reports.js','management-monthly-report.js']){
    const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.ok(source.includes("require('./report-publication-journal-guard')"),file);
    assert.ok(source.includes('loadPublicationKeyState('),file);
    assert.ok(!source.includes('text.slice(0, 500)'),file);
  }
});
