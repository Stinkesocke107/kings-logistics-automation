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

test('Driver LOA writer publishes only aggregate tenure buckets, even when old source contains names',()=>{
  const s=sandbox('driver-loa.js');
  const drivers=[driver(11,'PrivateDriverOne',earlier),driver(12,'PrivateDriverTwo',recent)];
  const publicBuckets=s.run('buildTenureSummary('+JSON.stringify(drivers)+')');
  assert.equal(publicBuckets.known,2);
  assert.equal(publicBuckets.under1Month,1);
  assert.equal(publicBuckets.oneToThreeMonths,1);
  assert.deepEqual(Object.keys(publicBuckets).sort(),
    ['known','under1Month','oneToThreeMonths','threeToSixMonths','sixToTwelveMonths',
      'oneToTwoYears','twoToThreeYears','threeYearsPlus','unknown'].sort());
  const serialized=JSON.stringify(publicBuckets);
  for(const forbidden of ['PrivateDriverOne','PrivateDriverTwo','tmpId','username','joinDate','tenureDays',
    'longestServing','newestDrivers']){
    assert.ok(!serialized.includes(forbidden),'LOA public summary exposed '+forbidden);
  }
});

test('Driver LOA updateSummary removes any legacy named tenure rankings rather than republishing them',()=>{
  const files={'data/driver-management-summary.json':JSON.stringify({
    version:2,currentDrivers:2,tenure:{known:2,
      longestServing:[{tmpId:11,username:'PrivateDriverOne',joinDate:earlier,tenureDays:40}],
      newestDrivers:[{tmpId:12,username:'PrivateDriverTwo',joinDate:recent,tenureDays:2}]}
  })};
  const s=sandbox('driver-loa.js',{files});
  const state={updatedAt:now,drivers:[
    driver(11,'PrivateDriverOne',earlier),driver(12,'PrivateDriverTwo',recent)
  ]};
  const next=s.run('updateSummary('+JSON.stringify(state)+')');
  const saved=s.files.get('data/driver-management-summary.json');
  assert.equal(next.version,3);
  assert.equal(next.currentDrivers,2);
  assert.equal(next.tenure.known,2);
  assert.equal(Object.hasOwn(next.tenure,'longestServing'),false);
  assert.equal(Object.hasOwn(next.tenure,'newestDrivers'),false);
  assert.equal(JSON.parse(saved).tenure.known,2);
  assert.doesNotMatch(saved,/"(?:tmpId|username|joinDate|tenureDays|discordUserId)"\s*:/);
  assert.doesNotMatch(saved,/PrivateDriverOne|PrivateDriverTwo/);
});
