'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {loadPublicationState}=require('../report-publication-journal-guard');

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
