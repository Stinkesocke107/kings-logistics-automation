'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {WORKFLOW_REGISTRY,SCHEDULED_WORKFLOWS,ON_DEMAND_WORKFLOWS,assertRegistry} = require('../kings-workflow-registry.js');
const {sandbox} = require('./sandbox.cjs');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'.github','workflows');

test('all Kings workflows have explicit ownership, cadence mode, and health policy', () => {
  assert.doesNotThrow(assertRegistry);
  const files=fs.readdirSync(dir).filter(n=>/\.ya?ml$/i.test(n)).sort();
  const registered=WORKFLOW_REGISTRY.map(w=>w.file).sort();
  assert.deepEqual(registered,files,'Every workflow file must be registered: no invisible systems');
  assert.equal(WORKFLOW_REGISTRY.length,43);
  assert.equal(SCHEDULED_WORKFLOWS.length,32);
  assert.equal(ON_DEMAND_WORKFLOWS.length,11);
  for(const item of WORKFLOW_REGISTRY){
    const yaml=fs.readFileSync(path.join(dir,item.file),'utf8');
    const actuallyScheduled=/^  schedule:/m.test(yaml);
    assert.equal(item.mode==='scheduled',actuallyScheduled,item.file+' schedule classification disagrees with production');
    if(item.mode==='manual'){
      assert.match(yaml,/^  workflow_dispatch:/m,item.file+' should be operator-started');
    }
    if(item.mode==='scheduled'){
      assert.ok(item.maxAgeMinutes>0,item.file);
      assert.ok(['warning','critical'].includes(item.severity),item.file);
    }
  }
});

test('health monitoring checks every scheduled workflow, counts manual tools and detects unregistered files',()=>{
  const source=fs.readFileSync(path.join(root,'system-monitoring.js'),'utf8');
  assert.match(source,/const WORKFLOWS = SCHEDULED_WORKFLOWS;/);
  assert.match(source,/function checkWorkflowRegistryCoverage\(issues\)/);
  assert.match(source,/workflowRegistryComplete: workflowRegistry\.complete/);
  assert.match(source,/workflowsRegistered: workflowRegistry\.registered/);
  assert.match(source,/workflowsScheduled: workflowRegistry\.scheduled/);
  assert.match(source,/workflowsOnDemand: workflowRegistry\.onDemand/);
  assert.doesNotMatch(source,/const WORKFLOWS = \[/);
});

test('Discord Kings System Monitor aggregates every area without stale leadership workflow references', () => {
  const workflows=SCHEDULED_WORKFLOWS.map(item=>({file:item.file,area:item.area,ok:true,label:item.label}));
  const health={
    checkedAt:'2026-10-20T11:00:00Z',status:'HEALTHY',
    summary:{workflowsHealthy:workflows.length,workflowsChecked:workflows.length,
      deepIntegrityHealthy:8,deepIntegrityChecks:8,securityHealthy:6,securityChecks:6,
      discordPermissionHealthy:4,discordPermissionChecks:4},
    workflowRegistry:{registered:WORKFLOW_REGISTRY.length,scheduled:SCHEDULED_WORKFLOWS.length,
      onDemand:ON_DEMAND_WORKFLOWS.length},
    workflows,data:{freshness:[{file:'data/statistics.json',ok:true}]},issues:[]
  };
  const s=sandbox('system-monitor-discord.js',{files:{'data/system-health.json':JSON.stringify(health)},
    env:{DISCORD_BOT_TOKEN:'test-only'}});
  const msg=s.run('buildMessage('+JSON.stringify(health)+')');
  assert.match(msg,/43 total workflows \(11 on-demand\)/);
  for(const phrase of ['Drivers, Probation & Awards','Convoy Center & Events','HR & Staff Systems',
    'Live Tracker & Statistics','Leadership & Periodic Reports','Backup & Restore Health','News, Social & Changelog']){
    assert.ok(msg.includes(phrase),phrase);
  }
  assert.ok(msg.includes('32/32 scheduled healthy'),msg);
  assert.ok(!msg.includes('Unknown'),msg);
  assert.ok(msg.length<1950,'Discord output exceeds the safe message limit');
  assert.match(msg,/Read-only monitoring/);
  for(const group of new Set(SCHEDULED_WORKFLOWS.map(x=>x.area))){
    const output=s.run('workflowGroupLine('+JSON.stringify(health)+','+JSON.stringify(group)+','+JSON.stringify(group)+')');
    assert.match(output,/healthy$/,group);
  }
});
