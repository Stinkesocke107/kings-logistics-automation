const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sandbox } = require('./sandbox.cjs');
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('monitor keeps a failed production run visible while a new run is queued', async () => {
  const at = new Date().toISOString();
  const s = sandbox('system-monitoring.js', { env: { GITHUB_TOKEN: 'fake' }, fetch: async () => json({ workflow_runs: [
    { id: 3, status: 'queued', created_at: at },
    { id: 2, status: 'completed', conclusion: 'failure', updated_at: at },
    { id: 1, status: 'completed', conclusion: 'success', updated_at: at }
  ] }) });
  const r = await s.run("checkWorkflow({file:'live-tracker.yml',label:'Live',maxAgeMinutes:30,severity:'critical'}, [])");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('latest-completed-failure'));
});

test('a recent convoy dry-run does not hide an overdue production run', async () => {
  const s = sandbox('system-monitoring.js', { env: { GITHUB_TOKEN: 'fake' }, fetch: async () => json({ workflow_runs: [
    { id: 2, event: 'workflow_dispatch', display_title: 'Kings Convoy Checker (dry-run)', status:'completed', conclusion:'success', updated_at:new Date().toISOString() },
    { id: 1, event: 'schedule', status:'completed', conclusion:'success', updated_at:new Date(Date.now()-3600000).toISOString() }
  ] }) });
  const r = await s.run("checkWorkflow({file:'convoy-checker.yml',label:'Convoy',maxAgeMinutes:45,severity:'critical'}, [])");
  assert.equal(r.ok, false);
  assert.equal(r.latestRun.id, 1);
});

test('staff workflow heartbeat accepts unchanged valid state but never a missing state', () => {
  const s = sandbox('system-monitoring.js', {files:{'data/staff-management-summary.json':'{"updatedAt":"2020-01-01"}'}});
  let r = s.run("checkFreshData([], [{file:'staff-management.yml',ok:true}]).find(x=>x.file.includes('staff-management'))");
  assert.equal(r.ok,true);
  s.files.delete('data/staff-management-summary.json');
  r = s.run("checkFreshData([], [{file:'staff-management.yml',ok:true}]).find(x=>x.file.includes('staff-management'))");
  assert.equal(r.ok,false);
});

test('staff history may exceed current count but cannot omit current staff', () => {
  const s = sandbox('data-integrity.js');
  assert.equal(s.run("const issues=[];checkStaffSummary({staff:{currentStaff:5,trackedStaffRecords:7}},issues,[]);issues.length"),0);
  assert.equal(s.run("const missing=[];checkStaffSummary({staff:{currentStaff:5,trackedStaffRecords:4}},missing,[]);missing.length"),1);
});

test('malformed HTTP-200 API payloads retry, accumulate logical failures and open the circuit', async () => {
  const s = sandbox('system-monitoring.js', { fetch: async () => json({error:true}) });
  for (let i=0;i<5;i++) {
    await assert.rejects(
      s.run("require('./api-resilience').resilientFetchJson('https://invalid.test', {label:'bad-json',baseDelayMs:1,validateJson:d=>!d.error})"),
      /validation/
    );
  }
  const health = JSON.parse(s.files.get('data/api-health/bad-json.json'));
  assert.equal(health.status,'down');
  assert.equal(health.consecutiveFailures,5);
  await assert.rejects(s.run("require('./api-resilience').resilientFetchJson('https://invalid.test',{label:'bad-json'})"),/circuit breaker/);
  assert.equal(s.calls.length,20);
});

for (const script of ['hr-probation.js','hr-leadership.js']) {
  test(`${script}: corrupted reviews fail without resetting state`, () => {
    const s=sandbox(script,{files:{'data/hr-probation.json':'{broken'}});
    assert.throws(()=>s.run("readJson(HR_PROBATION_FILE, null)"),/refusing to reset/);
    assert.equal(s.files.get('data/hr-probation.json'),'{broken');
    assert.equal(s.calls.length,0);
  });
}

test('HR reviews survive encrypted write and read without plaintext persistence', () => {
  const s=sandbox('hr-probation.js');
  s.run("writeHrState({version:1,reviews:[{tmpId:123,status:'completed'}]})");
  const raw=s.files.get('data/hr-probation.json');
  assert.equal(JSON.parse(raw).algorithm,'aes-256-gcm');
  assert.ok(!raw.includes('completed'));
  assert.equal(s.run('readHrState().reviews[0].status'),'completed');
});

for (const mode of ['empty-servers','all-server-failures','discord-failure','success']) {
  test(`tracker→Discord→snapshot: ${mode}`, async () => {
    const prior='{"discordMessageId":"123","updatedAt":"2020-01-01","online":7}';
    const s=sandbox('tracker.js',{env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/fake'},files:{'data/live-tracker-snapshot.json':prior},fetch:async url=>{
      if(url.includes('/members')) return json({response:{members:[{id:1}]}});
      if(url.includes('locations_')) return json([]);
      if(url.endsWith('/servers')) return json({response:mode==='empty-servers'?[]:[{name:'Simulation 1',online:true,mapid:1,game:'ETS2'}]});
      if(url.includes('ets2map.com')) return mode==='all-server-failures'?new Response('unavailable',{status:403}):json({Success:true,Data:[]});
      if(url.includes('discord.com')) return mode==='discord-failure'?new Response('forbidden',{status:403}):json({id:'123'});
      throw new Error(`Unexpected URL ${url}`);
    }});
    if(mode==='success') {
      await s.run('start()');
      assert.equal(JSON.parse(s.files.get('data/live-tracker-snapshot.json')).online,0);
      assert.notEqual(s.files.get('data/live-tracker-snapshot.json'),prior);
    } else {
      await assert.rejects(s.run('start()'));
      assert.equal(s.files.get('data/live-tracker-snapshot.json'),prior);
      if(mode!=='discord-failure') assert.equal(s.calls.filter(c=>c.url.includes('discord.com')).length,0);
    }
  });
}


test('monitor treats a recent active production run as recovery instead of overdue', async () => {
  const now = Date.now();
  const s = sandbox('system-monitoring.js', { env: { GITHUB_TOKEN: 'fake' }, fetch: async () => json({ workflow_runs: [
    { id: 3, event: 'workflow_dispatch', status: 'queued', created_at: new Date(now - 2 * 60000).toISOString() },
    { id: 2, event: 'schedule', status: 'completed', conclusion: 'success', updated_at: new Date(now - 70 * 60000).toISOString() }
  ] }) });
  const issues = [];
  const r = await s.run("checkWorkflow({file:'hr-leadership.yml',label:'HR',maxAgeMinutes:45,severity:'critical'}, issues)");
  assert.equal(r.ok, true);
  assert.ok(r.reasons.includes('active-run-in-progress'));
  assert.equal(r.latestActive.withinGrace, true);
  assert.equal(issues.length, 0);
});

test('monitor does not let an old stuck queued run hide an overdue workflow', async () => {
  const now = Date.now();
  const s = sandbox('system-monitoring.js', { env: { GITHUB_TOKEN: 'fake' }, fetch: async () => json({ workflow_runs: [
    { id: 3, event: 'workflow_dispatch', status: 'queued', created_at: new Date(now - 35 * 60000).toISOString() },
    { id: 2, event: 'schedule', status: 'completed', conclusion: 'success', updated_at: new Date(now - 70 * 60000).toISOString() }
  ] }) });
  const issues = [];
  const r = await s.run("checkWorkflow({file:'hr-leadership.yml',label:'HR',maxAgeMinutes:45,severity:'critical'}, issues)");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('overdue'));
  assert.equal(r.latestActive.withinGrace, false);
  assert.equal(issues.some((item) => item.id === 'workflow-overdue:hr-leadership.yml'), true);
});
