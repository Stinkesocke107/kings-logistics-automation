'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const observed=new Date(Date.now()-10000).toISOString();
const official={
  version:1,source:'truckersmp-official-v2',sourceMode:'map-independent',
  updatedAt:observed,vtcMemberCount:110,kingsOnline:null,
  allTruckersMpPlayers:1509,ets2AllPlayers:1458,atsAllPlayers:51,
  activeTruckersMpServers:10
};
const proof={
  version:1,mode:'fallback-delivered',source:'official-vtc-and-servers',
  checkedAt:observed,allDisplaysVerified:true,
  displaysVerified:['Live Tracker','Advanced Statistics','Central Overview'],
  livePlayerCountsAvailable:false,sourceSnapshotAt:'2026-11-18T16:00:21.037Z'
};
const files=(data=official)=>({
  'data/live-tracker-official.json':JSON.stringify(data)
});
test('official-mode Tracker monitoring verifies fresh independent data and every delivered display',()=>{
  const s=sandbox('system-monitoring.js',{files:files()});
  const status=s.run('checkOfficialTrackerSource('+JSON.stringify(proof)+')');
  assert.equal(status.mode,'map-independent');
  assert.equal(status.status,'verified');
  assert.equal(status.vtcMemberCount,110);
  assert.equal(status.allTruckersMpPlayers,1509);
  assert.equal(status.kingsOnline,null);
  assert.ok(!JSON.stringify(status).includes('discordMessageId'));
});
test('official-mode Tracker monitoring rejects stale, forged or incomplete records',()=>{
  const alterations=[
    [null,proof],
    [{...official,updatedAt:'2026-01-01T00:00:00Z'},proof],
    [{...official,vtcMemberCount:undefined},proof],
    [{...official,kingsOnline:110},proof],
    [{...official,allTruckersMpPlayers:1510},proof],
    [{...official,sourceMode:'map-dependent'},proof],
    [official,{...proof,allDisplaysVerified:false}],
    [official,{...proof,displaysVerified:['Live Tracker','Advanced Statistics']}],
    [official,{...proof,mode:'fallback-incomplete'}],
    [official,{...proof,livePlayerCountsAvailable:true}],
    [official,{...proof,source:'status-only'}],
    [official,{...proof,checkedAt:'2026-01-01T00:00:00Z'}]
  ];
  for(const [snapshot,delivery] of alterations){
    const s=sandbox('system-monitoring.js',{files:snapshot?files(snapshot):{}});
    const status=s.run('checkOfficialTrackerSource('+JSON.stringify(delivery)+')');
    assert.equal(status.mode,'map-independent');
    assert.equal(status.status,'not-verified');
  }
});
test('verified Kings membership-only mode is still a working map-independent Tracker',()=>{
  const s=sandbox('system-monitoring.js',{files:files({
    ...official,allTruckersMpPlayers:null,ets2AllPlayers:null,
    atsAllPlayers:null,activeTruckersMpServers:null
  })});
  const status=s.run('checkOfficialTrackerSource('+JSON.stringify({
    ...proof,source:'official-vtc-only'
  })+')');
  assert.equal(status.status,'verified');
  assert.equal(status.vtcMemberCount,110);
  assert.equal(status.allTruckersMpPlayers,null);
});
test('Discord monitor distinguishes a working official Tracker from unrelated red Core readiness',()=>{
  const s=sandbox('system-monitor-discord.js',{
    files:{'data/system-health.json':JSON.stringify({})}
  });
  const h={checkedAt:observed,status:'UNHEALTHY',
    operationalReadiness:{status:'UNHEALTHY',diagnosticsCount:0},
    workflows:[{file:'live-tracker.yml',area:'Live Data',ok:true}],
    data:{officialTracker:{mode:'map-independent',status:'verified'}}};
  const line=s.run('liveMapAvailabilityLine('+JSON.stringify(h)+')');
  assert.match(line,/Kings Live Tracker \(no map\)/);
  assert.match(line,/Official membership and TruckersMP server totals verified/);
  assert.match(line,/Unavailable \(not 0\)/);
  assert.doesNotMatch(line,/Full source and all 3 displays verified|Kings Drivers online: \*\*110/);
  const body=s.run('buildMessage('+JSON.stringify(h)+')');
  assert.match(body,/Overall Status:\*\* \x60UNHEALTHY\x60/);
  assert.ok(body.includes(line));
  const failed=s.run('liveMapAvailabilityLine('+JSON.stringify({
    ...h,data:{officialTracker:{mode:'map-independent',status:'not-verified'}}
  })+')');
  assert.match(failed,/Official data or 3-display delivery is unverified/);
  assert.doesNotMatch(failed,/verified on all 3 displays/);
});
