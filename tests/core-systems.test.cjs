const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sandbox } = require('./sandbox.cjs');
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('monitor keeps a failed production run visible while a new run is queued', async () => {
  const at = new Date().toISOString();
  const s = sandbox('system-monitoring.js', { env: { GITHUB_TOKEN: 'fake' }, fetch: async () => json({ workflow_runs: [
    { id: 3, event: 'schedule', status: 'queued', created_at: at },
    { id: 2, event: 'schedule', status: 'completed', conclusion: 'failure', updated_at: at },
    { id: 1, event: 'schedule', status: 'completed', conclusion: 'success', updated_at: at }
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

test('monitor ignores intentionally skipped workflow_run callbacks without hiding actual verifier failures', async () => {
  const now = new Date().toISOString();
  const success = {id:1,event:'workflow_run',status:'completed',conclusion:'success',updated_at:now};
  const skipped = {id:2,event:'workflow_run',status:'completed',conclusion:'skipped',updated_at:now};
  const config = "{file:'convoy-announcement-verifier.yml',label:'Convoy Verification',maxAgeMinutes:120,severity:'warning'}";
  const healthy = sandbox('system-monitoring.js', {
    env:{GITHUB_TOKEN:'fake'}, fetch:async()=>json({workflow_runs:[skipped,success]})
  });
  const r = await healthy.run('checkWorkflow('+config+', [])');
  assert.equal(r.ok,true);
  assert.equal(r.latestRun.id,1);
  const failing = sandbox('system-monitoring.js', {
    env:{GITHUB_TOKEN:'fake'}, fetch:async()=>json({workflow_runs:[
      {id:3,event:'workflow_run',status:'completed',conclusion:'failure',updated_at:now},
      skipped,success
    ]})
  });
  const bad = await failing.run('checkWorkflow('+config+', [])');
  assert.equal(bad.ok,false);
  assert.ok(bad.reasons.includes('latest-completed-failure'));
});

test('staff workflow heartbeat accepts unchanged valid state but never a missing state', () => {
  const s = sandbox('system-monitoring.js', {files:{'data/staff-management-summary.json':'{"updatedAt":"2020-01-01"}'}});
  let r = s.run("checkFreshData([], [{file:'staff-management.yml',ok:true}]).find(x=>x.file.includes('staff-management'))");
  assert.equal(r.ok,true);
  s.files.delete('data/staff-management-summary.json');
  r = s.run("checkFreshData([], [{file:'staff-management.yml',ok:true}]).find(x=>x.file.includes('staff-management'))");
  assert.equal(r.ok,false);
});

test('Driver online observation integrity distinguishes unavailable from a verified zero', () => {
  const s=sandbox('data-integrity.js');
  const summary=(onlineNow,onlineObservationStatus)=>{
    const driver={currentDrivers:1,onlineNow,onlineObservationStatus,activity:{grace:1}};
    return s.run('(()=>{const issues=[],checks=[];checkDriverSummary({driver:'+JSON.stringify(driver)+'},issues,checks);return {issues,checks};})()');
  };
  const unknown=summary(null,'unavailable');
  assert.equal(unknown.issues.length,0);
  assert.ok(unknown.checks.some(x=>x.check==='driver-online-observation-contract'&&x.ok));
  assert.ok(!unknown.checks.some(x=>x.check==='driver-online-plausibility'));

  const falseZero=summary(0,'unavailable');
  assert.ok(falseZero.issues.some(x=>x.id==='integrity-driver-online-observation'));

  const validZero=summary(0,'verified-live');
  assert.equal(validZero.issues.length,0);
  assert.ok(validZero.checks.some(x=>x.check==='driver-online-plausibility'&&x.ok));
  assert.ok(summary(null,'verified-live').issues.some(x=>x.id==='integrity-driver-online-observation'));
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

test('Live Tracker rejects partial server coverage instead of publishing a false zero online', async () => {
  const prior='{"version":2,"discordMessageId":"123","updatedAt":"2026-11-18T18:00:00Z","online":4}';
  const s=sandbox('tracker.js',{
    env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/fake'},
    files:{'data/live-tracker-snapshot.json':prior},
    fetch:async url=>{
      if(url.includes('/vtc/') && url.endsWith('/members'))return json({response:{members:[{id:1}]}});
      if(url.includes('locations_'))return json([]);
      if(url.endsWith('/servers'))return json({response:[
        {name:'Simulation 1',online:true,mapid:1,game:'ETS2'},
        {name:'Simulation 2',online:true,mapid:2,game:'ETS2'}
      ]});
      if(url.includes('ets2map.com') && url.includes('server=1'))return json({Success:true,Data:[]});
      if(url.includes('ets2map.com') && url.includes('server=2'))return new Response('unavailable',{status:403});
      if(url.includes('discord.com'))throw Error('No Discord write allowed for incomplete server coverage');
      throw Error('Unexpected request '+url);
    }
  });
  await assert.rejects(s.run('start()'),/Only 1\/2 live TruckersMP server checks succeeded/);
  assert.equal(s.files.get('data/live-tracker-snapshot.json'),prior);
  assert.equal(s.calls.filter(x=>x.url.includes('discord.com')).length,0);
});

test('Kings Tracker stops on the first failed server and saves no partial snapshot', async () => {
  const prior='{"version":2,"discordMessageId":"123","updatedAt":"2026-11-18T16:00:00Z","online":7}';
  const s=sandbox('tracker.js',{
    env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/fake'},
    files:{'data/live-tracker-snapshot.json':prior},
    fetch:async (url,options)=>{
      if(url.includes('/members'))return json({response:{members:[{id:1}]}});
      if(url.includes('locations_'))return json([]);
      if(url.endsWith('/servers'))return json({response:[
        {name:'Simulation 1',online:true,mapid:1,game:'ETS2'},
        {name:'Simulation 2',online:true,mapid:2,game:'ETS2'},
        {name:'Simulation 3',online:true,mapid:3,game:'ETS2'}
      ]});
      if(url.includes('tracker.ets2map.com'))return new Response('Unavailable',{status:503});
      if(url.includes('discord.com'))throw Error('No Discord write should happen during failed map coverage');
      throw Error('Unexpected URL '+url);
    }
  });
  await assert.rejects(s.run('start()'),/Only 0\/3 live TruckersMP server checks succeeded/);
  const calls=s.calls.filter(c=>c.url.includes('tracker.ets2map.com'));
  assert.equal(calls.length,1,'First failed map probe prevents unnecessary requests to remaining servers');
  assert.equal(s.files.get('data/live-tracker-snapshot.json'),prior);
  assert.equal(s.calls.filter(c=>c.url.includes('discord.com')).length,0);
});

test('Kings outage embeds show fresh VTC membership but never convert it to Kings online count', () => {
  const id='123456789012345678', timestamp=new Date().toISOString();
  const count=110;
  const files={
    'data/live-tracker-snapshot.json':JSON.stringify({discordMessageId:id,updatedAt:'2026-11-18T16:00:00Z',online:8}),
    'data/driver-management-summary.json':JSON.stringify({currentDrivers:count,updatedAt:timestamp,onlineNow:null})
  };
  const s=sandbox('live-outage-notice.js',{files});
  const embed=s.run("outageEmbed(SETTINGS[0],readSafeState('live-tracker-snapshot.json'))");
  assert.equal(embed.fields.length,3);
  assert.match(embed.fields[2].name,/membership \(not live online\)/);
  assert.match(embed.fields[2].value,/110 members/);
  assert.match(embed.fields[1].value,/Unavailable — not zero/);
  assert.doesNotMatch(embed.fields[2].value,/online now|currently online/i);

  const stale=sandbox('live-outage-notice.js',{files:{
    ...files,'data/driver-management-summary.json':JSON.stringify({
      currentDrivers:count,updatedAt:new Date(Date.now()-100*60000).toISOString()
    })
  }});
  assert.equal(stale.run("outageEmbed(SETTINGS[0],readSafeState('live-tracker-snapshot.json'))").fields.length,2,
    'Old roster data is omitted, not misrepresented as current');
});

test('Kings outage message is edited if previously verified VTC membership becomes stale', async () => {
  const id='123456789012345678';
  const files={
    'data/live-tracker-snapshot.json':JSON.stringify({discordMessageId:id,updatedAt:new Date().toISOString()}),
    'data/driver-management-summary.json':JSON.stringify({
      currentDrivers:112,updatedAt:new Date(Date.now()-100*60000).toISOString()
    })
  };
  let patch=null;
  const s=sandbox('live-outage-notice.js',{
    files,env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/token'},
    fetch:async(url,opts)=>{
      if(opts.method==='GET')return json({embeds:[{
        title:'👑 Kings Live Tracker — Live Data Unavailable',
        description:'Old outage notice', fields:[{name:'VTC members',value:'112'}]
      }]});
      if(opts.method==='PATCH'){patch=JSON.parse(opts.body);return new Response(null,{status:204})}
      throw Error('Unsupported Discord method');
    }
  });
  await s.run('main()');
  assert.equal(s.calls.length,2);
  assert.equal(patch.embeds[0].fields.length,2,'Stale roster membership removed from displayed outage notice');
  assert.deepEqual(patch.allowed_mentions,{parse:[]});
});

test('a failed live refresh edits only existing Discord status messages and preserves all data', async () => {
  const id='123456789012345678';
  const files={
    'data/live-tracker-snapshot.json':JSON.stringify({
      version:2,updatedAt:'2026-11-18T16:00:00.000Z',online:3,discordMessageId:id
    }),
    'data/statistics.json':JSON.stringify({
      version:2,sourceSnapshotAt:'2026-11-18T16:00:00.000Z',messageId:id,
      allTime:{peakOnline:8},history:[{date:'2026-11-17',peakOnline:8}]
    }),
    'data/central-overview.json':JSON.stringify({version:1,messageId:id})
  };
  const payloads=[];
  const s=sandbox('live-outage-notice.js',{
    env:{
      DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/tracker-token',
      STATS_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/stats-token',
      CENTRAL_OVERVIEW_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/central-token'
    },
    files,
    fetch:async(url,opts)=>{
      if(opts.method==='GET') return json({embeds:[{title:'Kings Live'}]});
      if(opts.method==='PATCH'){
        payloads.push(JSON.parse(opts.body));
        return new Response(null,{status:204});
      }
      throw Error('Unexpected webhook method');
    }
  });
  await s.run('main()');
  assert.equal(s.process.exitCode,0);
  assert.equal(payloads.length,3);
  assert.equal(s.calls.length,6);
  for(const p of payloads){
    assert.equal(p.content,'');
    assert.deepEqual(p.allowed_mentions,{parse:[]});
    assert.equal(p.embeds.length,1);
    assert.match(p.embeds[0].title,/Unavailable/);
    assert.match(p.embeds[0].fields[1].value,/Unavailable — not zero/);
    assert.doesNotMatch(JSON.stringify(p),/Currently Online|No Kings Logistics members are currently online/);
  }
  for(const [key,value] of Object.entries(files)){
    assert.equal(s.files.get(key),value,'Outage notice must never overwrite stored data '+key);
  }
});

test('live outage notice is idempotent and never creates messages on missing targets', async () => {
  const id='123456789012345678';
  const files={'data/live-tracker-snapshot.json':JSON.stringify({
    discordMessageId:id,updatedAt:'2026-11-18T16:00:00Z',online:2
  })};
  let displayed = null;
  const s=sandbox('live-outage-notice.js',{
    files,env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/token'},
    fetch:async(url,opts)=>{
      assert.equal(opts.method,'GET');
      return json({embeds:[displayed]});
    }
  });
  displayed=s.run("outageEmbed(SETTINGS[0],readSafeState('live-tracker-snapshot.json'))");
  await s.run('main()');
  assert.equal(s.calls.length,1);
  assert.equal(s.process.exitCode,1,'Missing Statistics/Overview targets prevent a false green fallback run');
  assert.equal(s.files.get('data/live-tracker-snapshot.json'),files['data/live-tracker-snapshot.json']);
  assert.equal(s.run("webhookBase('https://example.com/api/webhooks/123456789012345678/token')"),null);
  assert.equal(s.run("webhookBase('http://discord.com/api/webhooks/123456789012345678/token')"),null);
});

test('auto Tracker probes before full map scan and fails back to official data', () => {
  const fs=require('node:fs');
  const path=require('node:path');
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/live-tracker.yml'),'utf8');
  assert.match(workflow,/id: live_tracker/);
  assert.match(workflow,/continue-on-error: true/);
  assert.match(workflow,/KINGS_TRACKER_SOURCE_MODE: 'auto'/);
  assert.match(workflow,/steps\.map_probe\.outcome == 'success'/);
  assert.match(workflow,/steps\.live_tracker\.outcome != 'success'/);
  assert.match(workflow,/node live-outage-notice\.js/);
  assert.match(workflow,/if: \${{ steps\.live_tracker\.outcome == 'success' }}/);
  assert.match(workflow,/if: always\(\)/);
});

test('monthly verifier respects the actual 10 UTC publish and 11 UTC verification deadline', () => {
  const {periodForVerification, expectedDates} = require('../monthly-report-verifier.js');
  const before = periodForVerification(new Date('2026-11-01T03:05:00.000Z'));
  assert.equal(before.key, '2026-10');
  assert.equal(before.phase, 'awaiting-publish');
  assert.equal(periodForVerification(new Date('2026-11-01T10:59:59.000Z')).phase, 'awaiting-publish');
  assert.equal(periodForVerification(new Date('2026-11-01T11:00:00.000Z')).phase, 'post-publish');
  assert.equal(expectedDates(before, new Date('2026-11-01T03:05:00.000Z'), true).length, 31);

  const midmonth = new Date('2026-11-05T12:00:00.000Z');
  const midperiod = periodForVerification(midmonth);
  assert.equal(midperiod.key, '2026-11');
  assert.equal(midperiod.phase, 'readiness');
  assert.equal(expectedDates(midperiod, midmonth, false).length, 5);

  const january = periodForVerification(new Date('2027-01-01T02:00:00.000Z'));
  assert.equal(january.key, '2026-12');
  assert.equal(january.phase, 'awaiting-publish');
  const leap = periodForVerification(new Date('2028-03-01T12:00:00.000Z'));
  assert.equal(leap.key, '2028-02');
  assert.equal(leap.phase, 'post-publish');
  assert.equal(expectedDates(leap,new Date('2028-03-01T12:00:00.000Z'),true).length,29);
});


test('noncritical city API failures keep verified Kings VTC online player counts',async()=>{
  const s=sandbox('tracker.js',{fetch:async url=>{
    if(url.includes('locations_'))return new Response('not available',{status:404});
    if(url.includes('/v2/servers'))return new Response(JSON.stringify({
      error:false,response:[{online:true,mapid:1,name:'Simulation 1',game:'ETS2',players:1}]
    }),{status:200});
    if(url.includes('tracker.ets2map.com/v3/area'))return new Response(JSON.stringify({
      Success:true,Data:[{VtcId:64284,MpId:1234,Name:'Kings Member',X:0,Y:0}]
    }),{status:200});
    throw Error('Unexpected mock API '+url);
  }});
  const players=await s.run('getKingsOnline()');
  assert.equal(players.length,1);
  assert.equal(players[0].tmpId,1234);
  assert.equal(players[0].city,'Location unavailable');
});


test('map outages never fetch unnecessary optional city metadata',async()=>{
  const calls=[];
  const s=sandbox('tracker.js',{fetch:async url=>{
    calls.push(url);
    if(url.includes('/v2/servers'))return new Response(JSON.stringify({
      error:false,response:[{online:true,mapid:1,name:'Simulation 1',game:'ETS2',players:10}]
    }),{status:200});
    if(url.includes('tracker.ets2map.com'))return new Response('outage',{status:503});
    if(url.includes('locations_'))throw Error('city metadata should never load after failed map');
    throw Error('Unexpected API request '+url);
  }});
  await assert.rejects(s.run('getKingsOnline()'),/Only 0\/1 live TruckersMP server checks succeeded/);
  assert.equal(calls.some(url=>url.includes('locations_')),false);
});

test('verified players can resolve city after complete coverage without leaking in-memory coordinates',async()=>{
  const s=sandbox('tracker.js',{fetch:async url=>{
    if(url.includes('/v2/servers'))return new Response(JSON.stringify({
      error:false,response:[{online:true,mapid:1,name:'Simulation 1',game:'ETS2',players:1}]
    }),{status:200});
    if(url.includes('tracker.ets2map.com'))return new Response(JSON.stringify({
      Success:true,Data:[{VtcId:64284,MpId:123,Name:'Kings Member',X:10,Y:20}]
    }),{status:200});
    if(url.includes('locations_'))return new Response(JSON.stringify([
      {type:'city',name:'Test City',x:10,y:20}
    ]),{status:200});
    throw Error('Unexpected request '+url);
  }});
  const players=await s.run('getKingsOnline()');
  assert.equal(players.length,1);
  assert.equal(players[0].city,'Test City');
  assert.equal(Object.hasOwn(players[0],'X'),false);
  assert.equal(Object.hasOwn(players[0],'Y'),false);
});
