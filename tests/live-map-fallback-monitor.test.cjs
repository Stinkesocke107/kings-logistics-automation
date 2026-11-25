'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const now=new Date().toISOString();
const lastFull=new Date(Date.now()-60*1000).toISOString();
function proof(mode,source,overrides={}){
  return {
    version:1,checkedAt:now,mode,source,
    sourceSnapshotAt:lastFull,allDisplaysVerified:true,
    displaysVerified:['Live Tracker','Advanced Statistics','Central Overview'],
    livePlayerCountsAvailable:mode==='verified-live',
    ...overrides
  };
}
function health(mapStatus,workflowOk,snapshotOk=false,delivery=null){
  return {
    checkedAt:now,
    status:'UNHEALTHY',
    operationalReadiness:{status:'UNHEALTHY',criticalIssues:2,diagnosticsCount:0},
    summary:{workflowsChecked:1,workflowsHealthy:workflowOk?1:0},
    workflowRegistry:{registered:44,onDemand:12},
    workflows:[{file:'live-tracker.yml',area:'Live Data',ok:workflowOk}],
    data:{
      liveDelivery:delivery,
      apiHealth:{services:mapStatus===null?[]:[{
        service:'truckersmp-map-live',
        file:'data/api-health/live-systems--truckersmp-map-live.json',
        status:mapStatus
      }]},
      freshness:[{file:'data/live-tracker-snapshot.json',ok:snapshotOk,updatedAt:lastFull},
        {file:'data/statistics.json',ok:snapshotOk,updatedAt:lastFull}]
    },
    issues:[{id:'api-health:truckersmp-map-live',severity:'critical',
      system:'API Resilience',message:'External player map provider unavailable'}]
  };
}
function view(healthValue){
  const s=sandbox('system-monitor-discord.js',{
    files:{'data/system-health.json':JSON.stringify(healthValue)}
  });
  const expr='liveMapAvailabilityLine('+JSON.stringify(healthValue)+')';
  return {line:s.run(expr),message:s.run('buildMessage('+JSON.stringify(healthValue)+')')};
}

test('live monitor requires fresh explicit evidence for a delivered official-data fallback',()=>{
  const h=health('down',true,false,proof('fallback-delivered','official-vtc-and-servers'));
  const {line,message}=view(h);
  assert.match(line,/Provider down/);
  assert.match(line,/official-data fallback verified on all 3 displays/);
  assert.match(line,/Unavailable \(not 0\)/);
  assert.doesNotMatch(line,/Full source and all 3 displays verified/);
  assert.ok(message.includes(line),'Fallback status is visible in the monitor');
  assert.match(message,/Overall Status:\*\* `UNHEALTHY`/);
  assert.match(message,/Production Readiness:\*\* `UNHEALTHY`/);
  assert.equal(h.issues.length,1,'Monitor presentation must not hide real critical incidents');
});

test('successful workflow alone cannot prove fallback delivery',()=>{
  const missing=view(health('down',true,false,null)).line;
  assert.match(missing,/no recent proof of complete fallback delivery/);
  const failed=view(health('down',false,false,
    proof('fallback-delivered','official-vtc-and-servers'))).line;
  assert.match(failed,/no recent proof of complete fallback delivery/);
  assert.doesNotMatch(failed,/fallback verified/);
});

test('stale or incomplete proof never promotes an outage into a verified fallback',()=>{
  for(const bad of [
    proof('fallback-delivered','official-vtc-only',{checkedAt:new Date(Date.now()-40*60000).toISOString()}),
    proof('fallback-incomplete','official-vtc-and-servers',{allDisplaysVerified:false}),
    proof('fallback-delivered','official-vtc-and-servers',{displaysVerified:['Live Tracker','Advanced Statistics']}),
    proof('verified-live','verified-map'),
    proof('fallback-delivered','invalid-source')
  ]){
    const line=view(health('down',true,false,bad)).line;
    assert.match(line,/no recent proof of complete fallback delivery/);
  }
});

test('status-only fallback is distinguishable from verified official TruckersMP data',()=>{
  const status=view(health('down',true,false,proof('fallback-delivered','status-only'))).line;
  assert.match(status,/unavailability notices delivered/);
  assert.match(status,/Official feed also unavailable/);
  assert.doesNotMatch(status,/official-data fallback/);
  const roster=view(health('down',true,false,proof('fallback-delivered','recent-roster'))).line;
  assert.match(roster,/recent roster fallback/);
});

test('green live source requires provider, producer, fresh snapshot and matching full-live proof',()=>{
  const p=proof('verified-live','verified-map');
  const green=view(health('healthy',true,true,p));
  assert.match(green.line,/Full source and all 3 displays verified/);
  for(const h of [
    health('healthy',false,true,p),
    health('healthy',true,false,p),
    health('healthy',true,true,null),
    health('healthy',true,true,proof('fallback-delivered','official-vtc-only')),
    health('healthy',true,true,proof('verified-live','verified-map',{sourceSnapshotAt:'2026-01-01T00:00:00Z'})),
    health('degraded',true,true,p),
    health(null,true,true,p)
  ]){
    const {line}=view(h);
    assert.doesNotMatch(line,/Full source and all 3 displays verified/);
  }
  assert.match(view(health(null,true,false)).line,/not verified/);
});
