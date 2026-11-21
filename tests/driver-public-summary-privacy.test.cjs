'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');

const ROOT=path.resolve(__dirname,'..');
const now=new Date().toISOString();
const earlier=new Date(Date.now()-40*86400000).toISOString();
const recent=new Date(Date.now()-2*86400000).toISOString();

function driver(tmpId,username,joinDate){
  return {tmpId,username,joinDate,firstObservedAt:joinDate,current:true,activityLevel:'Active'};
}

test('public Driver Management summary publishes only aggregated tenure buckets, no names or IDs',()=>{
  const s=sandbox('driver-management.js');
  const state={version:3,updatedAt:now,drivers:[
    driver(11,'PrivateDriverOne',earlier),driver(12,'PrivateDriverTwo',recent)
  ]};
  const result=s.run('buildSummary('+JSON.stringify(state)+',new Map(),false)');
  assert.equal(result.currentDrivers,2);
  assert.equal(result.onlineNow,null);
  assert.equal(result.tenure.known,2);
  assert.equal(result.tenure.oneToThreeMonths,1);
  assert.equal(result.tenure.under1Month,1);
  assert.equal(Object.hasOwn(result.tenure,'newestDrivers'),false);
  assert.equal(Object.hasOwn(result.tenure,'longestServing'),false);
  const published=JSON.stringify(result);
  for(const forbidden of ['PrivateDriverOne','PrivateDriverTwo','tmpId','username','joinDate','tenureDays']){
    assert.ok(!published.includes(forbidden),'Public summary exposed '+forbidden);
  }
});

test('already committed public summary snapshot contains no personal Driver tenure records',()=>{
  const raw=fs.readFileSync(path.join(ROOT,'data','driver-management-summary.json'),'utf8');
  const summary=JSON.parse(raw);
  assert.ok(Number.isInteger(summary.currentDrivers));
  assert.ok(Number.isInteger(summary.tenure.known));
  assert.equal(Object.hasOwn(summary.tenure,'longestServing'),false,'Public summary has private longest-serving list');
  assert.equal(Object.hasOwn(summary.tenure,'newestDrivers'),false,'Public summary has private newest-driver list');
  assert.doesNotMatch(raw,/"(?:tmpId|username|joinDate|tenureDays|lastOnlineSeenAt)"\s*:/);
});

test('authorized Driver Leadership still displays newest member names from private encrypted source',()=>{
  const s=sandbox('leadership-dashboard.js');
  const data={
    driver:{drivers:[
      driver(11,'PrivateDriverOne',earlier),driver(12,'PrivateDriverTwo',recent)
    ]},
    driverSummary:{currentDrivers:2,onlineNow:null,onlineObservationStatus:'unavailable',
      updatedAt:now,tenure:{known:2},activity:{}},
    loa:{leaves:[]},hr:{reviews:[]},driverWeekly:{publishedWeeks:[]},
    driverReports:{monthlyReports:[]}
  };
  const rendered=s.run('buildDriver('+JSON.stringify(data)+')');
  const daily=rendered.fields.find(field=>field.name==='🟢 Last 24 Hours')?.value || '';
  assert.match(daily,/Newest: PrivateDriverTwo, PrivateDriverOne/);
  assert.match(daily,/Joined \*\*/);
  assert.match(JSON.stringify(rendered),/Online \*\*Unavailable\*\*/);
});

test('Lead dashboard no longer references public newestDrivers property',()=>{
  const source=fs.readFileSync(path.join(ROOT,'leadership-dashboard.js'),'utf8');
  assert.ok(!source.includes('t.newestDrivers'));
  assert.ok(source.includes('shortPeople(newestPrivate, 3)'));
});

test('shared Kings safe-push helper refuses stale checkouts that reintroduce named Driver summaries',()=>{
  const shell=fs.readFileSync(path.join(ROOT,'scripts','git-safe-push.sh'),'utf8');
  assert.ok(shell.includes('validate_public_driver_privacy()'));
  assert.ok(shell.includes('if ! validate_public_driver_privacy; then'));
  assert.ok(shell.includes("Object.hasOwn(json.tenure,'longestServing')"));
  assert.ok(shell.includes("Object.hasOwn(json.tenure,'newestDrivers')"));
});
