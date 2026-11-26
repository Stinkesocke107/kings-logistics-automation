'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');
const yaml=fs.readFileSync(path.join(__dirname,'../.github/workflows/live-tracker.yml'),'utf8');
const now=new Date().toISOString();
const old='2026-11-18T16:00:21.037Z';
const id='123456789012345678';
const webhook='https://discord.com/api/webhooks/'+id+'/test-only';
const snapshot={version:2,updatedAt:now,members:110,online:3,ets2Online:2,
  atsOnline:1,discordMessageId:id};
const stats={sourceSnapshotAt:now,messageId:id};
const full={version:1,mode:'verified-live',source:'verified-map',checkedAt:now,
  allDisplaysVerified:true,
  displaysVerified:['Live Tracker','Advanced Statistics','Central Overview'],
  livePlayerCountsAvailable:true,sourceSnapshotAt:now};
function health(files={},proof=full){
  const s=sandbox('system-monitoring.js',{files:{
    'data/live-tracker-snapshot.json':JSON.stringify(snapshot),
    'data/statistics.json':JSON.stringify(stats),...files
  }});
  return s.run('checkOfficialTrackerSource('+JSON.stringify(proof)+')');
}
const json=v=>new Response(JSON.stringify(v),{status:200});
test('every 5-minute cycle probes, conditionally fully scans, and falls back on either probe or scan failure',()=>{
  assert.match(yaml,/KINGS_TRACKER_SOURCE_MODE: 'auto'/);
  const probe=yaml.split('      - name: Probe Kings player-map recovery (read-only)\n')[1]
    .split('      - name: Update Kings Live Tracker')[0];
  assert.match(probe,/id: map_probe/);
  assert.match(probe,/continue-on-error: true/);
  assert.match(probe,/node live-map-auto-probe\.js/);
  const fullStep=yaml.split('      - name: Update Kings Live Tracker\n')[1]
    .split('      - name: Continue Kings Live Systems without the live map')[0];
  assert.match(fullStep,/steps\.map_probe\.outcome == 'success'/);
  assert.match(fullStep,/continue-on-error: true/);
  assert.match(fullStep,/run: node tracker\.js/);
  const fallback=yaml.split('      - name: Continue Kings Live Systems without the live map\n')[1]
    .split('      - name: Update Kings Advanced Statistics')[0];
  assert.match(fallback,/steps\.live_tracker\.outcome != 'success'/);
  assert.match(fallback,/steps\.live_tracker\.outcome == 'failure'/);
  assert.match(fallback,/node live-outage-notice\.js/);
  assert.match(fallback,/TRUCKERSMP_OFFICIAL_FEED_ENABLED: 'true'/);
  assert.doesNotMatch(fallback,/continue-on-error: true/);
  for(const name of ['Update Kings Advanced Statistics',
    'Verify Tracker and Statistics use the same source generation',
    'Update Kings Central Overview','Record full Live Systems delivery evidence']){
    const section=yaml.split('      - name: '+name+'\n')[1].split('\n      - name: ')[0];
    assert.match(section,/steps\.live_tracker\.outcome == 'success'/,name);
  }
  assert.match(yaml,/if: always\(\)/);
});
test('verified complete map and all three shared-generation publishers automatically restore true Kings online',()=>{
  const status=health();
  assert.equal(status.mode,'map-live');
  assert.equal(status.status,'verified');
  assert.equal(status.source,'verified-map');
  assert.equal(status.kingsOnline,3);
});
test('map success is NOT proven by canary, missing stats, incorrect generation, or unverified display',()=>{
  const invalid=[
    [{},full],
    [{'data/statistics.json':JSON.stringify({...stats,sourceSnapshotAt:old})},full],
    [{}, {...full,mode:'fallback-delivered'}],
    [{}, {...full,source:'official-vtc-and-servers'}],
    [{}, {...full,livePlayerCountsAvailable:false}],
    [{}, {...full,displaysVerified:['Live Tracker','Advanced Statistics']}],
    [{}, {...full,checkedAt:old}],
    [{'data/live-tracker-snapshot.json':JSON.stringify({...snapshot,online:4})},full],
    [{'data/live-tracker-snapshot.json':JSON.stringify({...snapshot,updatedAt:old})},full]
  ];
  for(const [files,proof] of invalid){
    const outcome=health(files,proof);
    if(proof.mode!=='verified-live'){
      assert.notEqual(outcome.status,'verified');
    }else{
      assert.equal(outcome.mode,'map-live');
      assert.equal(outcome.status,'not-verified');
    }
  }
});
test('the map failed but official feed works: no map link or fake Kings online in Discord',async()=>{
  const calls=[],patches=[];
  const s=sandbox('live-outage-notice.js',{files:{
    'data/live-tracker-snapshot.json':JSON.stringify({...snapshot,updatedAt:old}),
    'data/statistics.json':JSON.stringify({...stats,sourceSnapshotAt:old}),
    'data/central-overview.json':JSON.stringify({messageId:id})
  },env:{KINGS_TRACKER_SOURCE_MODE:'auto',TRUCKERSMP_OFFICIAL_FEED_ENABLED:'true',
    DISCORD_WEBHOOK_URL:webhook,
    STATS_DISCORD_WEBHOOK_URL:webhook.replace('test-only','stats-only'),
    CENTRAL_OVERVIEW_WEBHOOK_URL:webhook.replace('test-only','central-only')},
  fetch:async(url,init={})=>{
    calls.push(url);
    if(url==='https://api.truckersmp.com/v2/vtc/64284/members')
      return json({error:false,response:{members:Array.from({length:111},()=>({}))}});
    if(url==='https://api.truckersmp.com/v2/servers')
      return json({error:false,response:[{online:true,game:'ETS2',players:321}]});
    if(url.startsWith('https://discord.com/api/webhooks/')){
      if(init.method==='GET')return json({embeds:[{title:'old'}]});
      if(init.method==='PATCH'){
        patches.push(JSON.parse(init.body));return new Response(null,{status:204});
      }
    }
    throw Error('Unexpected request (or map call): '+url);
  }});
  await s.run('main()');
  assert.notEqual(s.process.exitCode,1);
  assert.equal(patches.length,3);
  const display=JSON.stringify(patches);
  assert.match(display,/Map-independent Tracker active/);
  assert.match(display,/111 registered VTC members/);
  assert.match(display,/321 players/);
  assert.match(display,/Unavailable — not zero/);
  assert.doesNotMatch(display,/https:\/\/map\.truckersmp\.com|View map|Open Map|111 Kings Drivers online/);
  assert.ok(calls.every(url=>url.startsWith('https://api.truckersmp.com/')||
    url.startsWith('https://discord.com/api/webhooks/')));
  assert.equal(s.files.has('data/live-tracker-official.json'),true);
  assert.equal(JSON.parse(s.files.get('data/live-tracker-snapshot.json')).updatedAt,old,
    'fallback cannot overwrite old verified map snapshot');
  const proof=JSON.parse(s.files.get('data/live-systems-delivery.json'));
  assert.equal(proof.mode,'fallback-delivered');
  assert.equal(proof.livePlayerCountsAvailable,false);
});
test('Discord monitoring switches live-map/restored and official-fallback messages without hiding wider incidents',()=>{
  const s=sandbox('system-monitor-discord.js',{files:{
    'data/system-health.json':JSON.stringify({})
  }});
  const base={status:'UNHEALTHY',
    operationalReadiness:{status:'UNHEALTHY',diagnosticsCount:0},
    workflows:[{file:'live-tracker.yml',area:'Live Data',ok:true}]};
  const fullState={...base,data:{officialTracker:{mode:'map-live',status:'verified'}}};
  const fullLine=s.run('liveMapAvailabilityLine('+JSON.stringify(fullState)+')');
  assert.match(fullLine,/player map restored automatically/);
  assert.match(fullLine,/current Kings online data/);
  assert.ok(s.run('buildMessage('+JSON.stringify(fullState)+')').includes('UNHEALTHY'));
  const fallback={...base,data:{officialTracker:{mode:'map-independent',status:'verified'}}};
  const fallbackLine=s.run('liveMapAvailabilityLine('+JSON.stringify(fallback)+')');
  assert.match(fallbackLine,/Official membership/);
  assert.match(fallbackLine,/Unavailable \(not 0\)/);
  const unverified={...base,data:{officialTracker:{mode:'map-live',status:'not-verified'}}};
  assert.match(s.run('liveMapAvailabilityLine('+JSON.stringify(unverified)+')'),
    /not verified/);
});
