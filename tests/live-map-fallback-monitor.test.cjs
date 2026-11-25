'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');

function health(mapStatus,workflowOk,snapshotOk=false){
  return {
    checkedAt:new Date().toISOString(),
    status:'UNHEALTHY',
    operationalReadiness:{status:'UNHEALTHY',criticalIssues:2,diagnosticsCount:0},
    summary:{workflowsChecked:1,workflowsHealthy:workflowOk?1:0},
    workflowRegistry:{registered:44,onDemand:12},
    workflows:[{file:'live-tracker.yml',area:'Live Data',ok:workflowOk}],
    data:{
      apiHealth:{services:mapStatus===null?[]:[{
        service:'truckersmp-map-live',
        file:'data/api-health/live-systems--truckersmp-map-live.json',
        status:mapStatus
      }]},
      freshness:[{file:'data/live-tracker-snapshot.json',ok:snapshotOk},
        {file:'data/statistics.json',ok:snapshotOk}]
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

test('live monitor differentiates an operational official-data fallback from full map recovery',()=>{
  const h=health('down',true,false);
  const {line,message}=view(h);
  assert.match(line,/Provider unavailable/);
  assert.match(line,/last Live Systems workflow delivered the official-data fallback/);
  assert.match(line,/Unavailable \(not 0\)/);
  assert.doesNotMatch(line,/Verified live source and Tracker snapshot/);
  assert.ok(message.includes(line),'Fallback status is visible in the monitor');
  assert.match(message,/Overall Status:\*\* `UNHEALTHY`/);
  assert.match(message,/Production Readiness:\*\* `UNHEALTHY`/);
  assert.equal(h.issues.length,1,'Monitor presentation must not hide real critical incidents');
});

test('a failed Live Systems workflow cannot be presented as a delivered map fallback',()=>{
  const {line}=view(health('down',false,false));
  assert.match(line,/fallback delivery not verified/);
  assert.doesNotMatch(line,/workflow delivered/);
});

test('full green live state requires both provider health, producer success and fresh verified snapshot',()=>{
  const green=view(health('healthy',true,true));
  assert.match(green.line,/Verified live source and Tracker snapshot available/);
  assert.doesNotMatch(green.line,/Provider unavailable/);
  for(const h of [health('healthy',false,true),health('healthy',true,false),
    health('degraded',false,false),health(null,true,false)]){
    const {line}=view(h);
    assert.doesNotMatch(line,/Verified live source and Tracker snapshot available/);
  }
  assert.match(view(health(null,true,false)).line,/not verified/);
});
