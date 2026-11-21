'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assessDailyUtcSchedule}=require('../scheduled-cadence-health');
const {sandbox}=require('./sandbox.cjs');

const config={hour:7,minute:17,graceMinutes:120};
const run=(date,id=1)=>({id,event:'schedule',status:'completed',conclusion:'success',created_at:date});
const z=(s)=>new Date(s).getTime();

test('Kings daily UTC schedule: eight-hour late onboarding run is still flagged despite success',()=>{
  const due='2026-11-21T07:17:00.000Z';
  const late='2026-11-21T15:19:53Z';
  const r=assessDailyUtcSchedule([run(late)],{...config,now:'2026-11-21T16:05:00Z'});
  assert.equal(r.status,'late');
  assert.equal(r.expectedAt,due);
  assert.equal(r.actualAt,late);
  assert.equal(r.delayMinutes,482);
  assert.equal(r.runId,1);
});

test('on-time scheduled run remains healthy and does not use earlier manual runs',()=>{
  const due='2026-11-21T07:17:00.000Z';
  const r=assessDailyUtcSchedule([
    {id:3,event:'workflow_dispatch',created_at:'2026-11-21T15:19:53Z'},
    run('2026-11-21T07:22:00Z',2)
  ],{...config,now:'2026-11-21T16:05:00Z'});
  assert.equal(r.status,'on-time');
  assert.equal(r.expectedAt,due);
  assert.equal(r.delayMinutes,5);
});

test('manual or push success does not disguise a missed daily cron run',()=>{
  const r=assessDailyUtcSchedule([
    {id:1,event:'workflow_dispatch',created_at:'2026-11-21T10:00:00Z'},
    {id:2,event:'push',created_at:'2026-11-21T11:00:00Z'},
    run('2026-11-20T07:19:00Z',3)
  ],{...config,now:'2026-11-21T16:05:00Z'});
  assert.equal(r.status,'missing');
  assert.equal(r.expectedAt,'2026-11-21T07:17:00.000Z');
});

test('before grace expires, check previous UTC day instead of marking today missed',()=>{
  const r=assessDailyUtcSchedule([run('2026-11-20T07:20:00Z')],{
    ...config,now:'2026-11-21T08:00:00Z'
  });
  assert.equal(r.status,'on-time');
  assert.equal(r.expectedAt,'2026-11-20T07:17:00.000Z');
});

test('UTC scheduler does not reinterpret summer daylight saving as CET',()=>{
  const r=assessDailyUtcSchedule([run('2027-05-16T07:18:00Z')],{
    ...config,now:'2027-05-16T15:00:00Z'
  });
  assert.equal(r.status,'on-time');
  assert.equal(r.expectedAt,'2027-05-16T07:17:00.000Z');
});

test('impossible scheduled timestamps do not hide missing jobs',()=>{
  const r=assessDailyUtcSchedule([run('garbage'),run('2026-11-22T07:17:00Z')],{
    ...config,now:'2026-11-21T16:05:00Z'
  });
  assert.equal(r.status,'missing');
});

test('Kings monitor warns on missed onboarding even when a recent manual run succeeded',async()=>{
  const s=sandbox('system-monitoring.js',{
    env:{GITHUB_TOKEN:'test-only'},
    fetch:async()=>new Response(JSON.stringify({workflow_runs:[{
      id:555,event:'workflow_dispatch',created_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),status:'completed',conclusion:'success'
    }]}),{status:200})
  });
  const check=await s.run(`(()=>{const issues=[];return checkWorkflow({
    file:'driver-register-onboarding.yml',label:'Driver Registration Onboarding',
    maxAgeMinutes:2160,severity:'warning',dailyUtcSchedule:{hour:7,minute:17,graceMinutes:120}
  },issues).then(result=>({result,issues}));})()`);
  assert.equal(check.result.ok,false);
  assert.equal(check.result.scheduleCadence.status,'missing');
  assert.ok(check.issues.some(item=>item.id==='workflow-schedule-missing:driver-register-onboarding.yml'));
  assert.ok(check.result.reasons.includes('schedule-missing'));
});

test('Kings registry and private audit schedule agree and never auto-dispatch personnel workflows',()=>{
  const registry=require('../kings-workflow-registry.js');
  const entry=registry.WORKFLOW_REGISTRY.find(x=>x.file==='driver-register-onboarding.yml');
  assert.deepEqual(entry.dailyUtcSchedule,{hour:7,minute:17,graceMinutes:120});
  assert.ok(!entry.optionalUntilFirstRun);
  const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','driver-register-onboarding.yml'),'utf8');
  assert.match(workflow,/cron: '17 7 \* \* \*'/);
  assert.match(workflow,/KINGS_TMP_VTC_REVIEW_MODE: audit-driver-only-publish/);
  const monitor=fs.readFileSync(path.join(__dirname,'..','system-monitoring.js'),'utf8');
  assert.match(monitor,/assessDailyUtcSchedule\(allRuns, config\.dailyUtcSchedule\)/);
});
