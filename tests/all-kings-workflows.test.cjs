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
  assert.equal(WORKFLOW_REGISTRY.length,46);
  assert.equal(SCHEDULED_WORKFLOWS.length,33);
  assert.equal(ON_DEMAND_WORKFLOWS.length,13);
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
  assert.match(msg,/46 total workflows \(13 on-demand\)/);
  for(const phrase of ['Drivers, Probation & Awards','Convoy Center & Events','HR & Staff Systems',
    'Live Tracker & Statistics','Leadership & Periodic Reports','Backup & Restore Health','News & Changelog']){
    assert.ok(msg.includes(phrase),phrase);
  }
  assert.ok(msg.includes('33/33 scheduled healthy'),msg);
  assert.ok(!msg.includes('Unknown'),msg);
  assert.ok(msg.length<1950,'Discord output exceeds the safe message limit');
  assert.match(msg,/Read-only monitoring/);
  for(const group of new Set(SCHEDULED_WORKFLOWS.map(x=>x.area))){
    const output=s.run('workflowGroupLine('+JSON.stringify(health)+','+JSON.stringify(group)+','+JSON.stringify(group)+')');
    assert.match(output,/healthy$/,group);
  }
});


test('published workflow inventory stays synchronized with the source registry', () => {
  const doc=fs.readFileSync(path.join(root,'docs','KINGS-ALL-SYSTEMS-INVENTORY.md'),'utf8');
  const count=WORKFLOW_REGISTRY.length;
  assert.ok(doc.includes('('+count+' aktive Workflows)'), 'Public inventory heading must show current count');
  assert.ok(doc.includes('**'+count+' erfasst**'), 'Public inventory summary must show current count');
  assert.ok(doc.includes('**'+SCHEDULED_WORKFLOWS.length+' automatisch eingeplant**'), 'Scheduled count in documentation must match registry');
  assert.ok(doc.includes('**'+ON_DEMAND_WORKFLOWS.length+' ohne eigenen Dauer-Zeitplan**'), 'On-demand count in documentation must match registry');

  // Only Markdown rows with real workflow filenames count. Historic numbers
  // in narrative text must never accidentally satisfy the live inventory.
  const rows=[...doc.matchAll(/^\| `([\w-]+\.yml)` \| ([^|]+)\|/gm)]
    .map(([,file,operation])=>({file,operation:operation.trim()}));
  assert.deepEqual(rows.map(row=>row.file).sort(),
    WORKFLOW_REGISTRY.map(workflow=>workflow.file).sort(),
    'Each actual workflow must appear exactly once in the published inventory');

  const operationByFile=new Map(rows.map(({file,operation})=>[file,operation]));
  for (const workflow of WORKFLOW_REGISTRY) {
    const operation=operationByFile.get(workflow.file);
    if (workflow.mode==='scheduled') assert.equal(operation,'Automatisch',workflow.file);
    else if (workflow.mode==='manual') assert.equal(operation,'Nur manuell',workflow.file);
    else assert.match(operation,/^Bei Codeänderungen/,workflow.file);
  }
});


test('README cites the live registry without presenting historical test counts as current', () => {
  const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
  assert.ok(readme.includes(WORKFLOW_REGISTRY.length+' registered workflows'));
  assert.ok(readme.includes(SCHEDULED_WORKFLOWS.length+' scheduled'));
  assert.ok(readme.includes(ON_DEMAND_WORKFLOWS.length+' on-demand'));
  assert.doesNotMatch(readme,/suite passes \*\*107\/107 tests\*\*/);
});
