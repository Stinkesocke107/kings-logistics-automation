'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');
const ROOT=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/live-tracker.yml'),'utf8');
const id='123456789012345678';
const webhook='https://discord.com/api/webhooks/'+id+'/fake-test-token';
const old='2026-11-18T16:00:21.037Z';
const legacy={version:2,updatedAt:old,online:7,ets2Online:7,atsOnline:0,
  members:110,discordMessageId:id};
const roster=n=>({error:false,response:{members:Array.from({length:n},(_,i)=>({user_id:i+10}))}});
const servers={error:false,response:[
  {game:'ETS2',online:true,players:1400},
  {game:'ATS',online:true,players:75},
  {game:'ETS2',online:false,players:0}
]};
const json=value=>new Response(JSON.stringify(value),{status:200,
  headers:{'content-type':'application/json'}});
function fixture({serverFail=false,memberFail=false,targetsFail=false}={}){
  const calls=[],patches=[];
  const files={
    'data/live-tracker-snapshot.json':JSON.stringify(legacy),
    'data/statistics.json':JSON.stringify({messageId:id,sourceSnapshotAt:old,
      allTime:{peakOnline:7,peakETS2:7,peakATS:0},history:[{date:'2026-11-18'}]}),
    'data/central-overview.json':JSON.stringify({messageId:id})
  };
  const transport=async(url,options={})=>{
    calls.push({url,method:String(options.method||'GET')});
    if(url==='https://api.truckersmp.com/v2/vtc/64284/members')
      return memberFail?new Response('unavailable',{status:503}):json(roster(116));
    if(url==='https://api.truckersmp.com/v2/servers')
      return serverFail?new Response('unavailable',{status:503}):json(servers);
    if(url.startsWith(webhook.slice(0,36))||url.includes('/api/webhooks/')){
      if(options.method==='GET')return targetsFail?
        new Response('not found',{status:404}):json({embeds:[{title:'Prior Kings Live Tracker'}]});
      if(options.method==='PATCH'){
        patches.push(JSON.parse(options.body));
        return new Response(null,{status:204});
      }
    }
    throw Error('Unexpected map-dependent or unsupported request: '+url);
  };
  return {calls,patches,files,
    s:sandbox('live-outage-notice.js',{
      files,fetch:transport,
      env:{KINGS_TRACKER_SOURCE_MODE:'official',
        TRUCKERSMP_OFFICIAL_FEED_ENABLED:'true',
        DISCORD_WEBHOOK_URL:webhook,
        STATS_DISCORD_WEBHOOK_URL:webhook.replace('fake-test-token','stats-test-token'),
        CENTRAL_OVERVIEW_WEBHOOK_URL:webhook.replace('fake-test-token','overview-test-token')}
    })
  };
}
test('Kings Tracker in automatic mode requires a healthy probe before attempting the full player map',()=>{
  assert.match(workflow,/KINGS_TRACKER_SOURCE_MODE: 'auto'/);
  const tracker=workflow.split('      - name: Update Kings Live Tracker\n')[1].split('      - name: Continue Kings Live Systems without the live map')[0];
  assert.match(tracker,/steps\.map_probe\.outcome == 'success'/);
  const fallback=workflow.split('      - name: Continue Kings Live Systems without the live map\n')[1]
    .split('      - name: Update Kings Advanced Statistics')[0];
  assert.match(fallback,/env\.KINGS_TRACKER_SOURCE_MODE == 'auto'/);
  assert.match(fallback,/steps\.live_tracker\.outcome == 'failure'/);
  assert.match(fallback,/node live-outage-notice\.js/);
  assert.match(workflow,/data\/live-tracker-official\.json/);
  assert.doesNotMatch(fallback,/tracker\.ets2map\.com|map\.truckersmp\.com|node tracker\.js/);
});
test('map-free Tracker updates all three existing dashboards using ONLY public official aggregate data',async()=>{
  const {s,calls,patches,files}=fixture();
  await s.run('main()');
  assert.notEqual(s.process.exitCode,1);
  assert.equal(patches.length,3);
  const payload=JSON.stringify(patches);
  assert.doesNotMatch(payload,/https?:\/\/(?:tracker\.ets2map|map\.truckersmp)\.com/i);
  assert.doesNotMatch(payload,/Live Map|Open Map|View map/i);
  assert.match(payload,/Map-independent Tracker active/);
  assert.match(payload,/116 registered VTC members/);
  assert.match(payload,/1475 players/);
  assert.match(payload,/Kings Drivers currently online/);
  assert.match(payload,/Unavailable — not zero/);
  assert.ok(calls.every(x=>x.url.includes('api.truckersmp.com/v2/')||
    x.url.startsWith('https://discord.com/api/webhooks/')));
  assert.equal(calls.filter(x=>x.url.includes('api.truckersmp.com/v2/')).length,2);
  const saved=JSON.parse(s.files.get('data/live-tracker-official.json'));
  assert.equal(saved.sourceMode,'map-independent');
  assert.equal(saved.vtcMemberCount,116);
  assert.equal(saved.allTruckersMpPlayers,1475);
  assert.equal(saved.ets2AllPlayers,1400);
  assert.equal(saved.atsAllPlayers,75);
  assert.equal(saved.kingsOnline,null);
  assert.doesNotMatch(JSON.stringify(saved),/username|discordMessageId|tmpId|position|coordinates|token/i);
  assert.equal(s.files.get('data/live-tracker-snapshot.json'),files['data/live-tracker-snapshot.json'],
    'No map scan must rewrite historical Kings individual-player counts');
  const delivery=JSON.parse(s.files.get('data/live-systems-delivery.json'));
  assert.equal(delivery.mode,'fallback-delivered');
  assert.equal(delivery.source,'official-vtc-and-servers');
  assert.equal(delivery.livePlayerCountsAvailable,false);
  assert.equal(delivery.allDisplaysVerified,true);
});
test('official Tracker remains functional with verified Kings roster when global server directory is down',async()=>{
  const {s,patches,calls}=fixture({serverFail:true});
  await s.run('main()');
  assert.notEqual(s.process.exitCode,1);
  assert.equal(patches.length,3);
  assert.match(JSON.stringify(patches),/116 registered VTC members/);
  assert.doesNotMatch(JSON.stringify(patches),/1475 players|undefined players/);
  const state=JSON.parse(s.files.get('data/live-tracker-official.json'));
  assert.equal(state.vtcMemberCount,116);
  assert.equal(state.allTruckersMpPlayers,null);
  assert.equal(state.kingsOnline,null);
  const proof=JSON.parse(s.files.get('data/live-systems-delivery.json'));
  assert.equal(proof.source,'official-vtc-only');
  assert.equal(proof.allDisplaysVerified,true);
  assert.ok(calls.every(x=>!x.url.includes('ets2map')&&!x.url.includes('map.truckersmp')));
});
test('without official Kings roster the map-free Tracker is visibly incomplete, never falsely green',async()=>{
  const {s,patches,files}=fixture({memberFail:true});
  await s.run('main()');
  assert.equal(s.process.exitCode,1);
  assert.equal(patches.length,3);
  assert.equal(s.files.has('data/live-tracker-official.json'),false);
  assert.equal(s.files.get('data/live-tracker-snapshot.json'),files['data/live-tracker-snapshot.json']);
  const proof=JSON.parse(s.files.get('data/live-systems-delivery.json'));
  assert.equal(proof.mode,'fallback-incomplete');
  assert.equal(proof.livePlayerCountsAvailable,false);
  assert.equal(proof.source,'status-only');
});
test('a broken Discord display fails complete delivery and never creates a new message',async()=>{
  const {s,calls}=fixture({targetsFail:true});
  await s.run('main()');
  assert.equal(s.process.exitCode,1);
  assert.ok(calls.every(x=>x.method!=='POST'));
  assert.equal(JSON.parse(s.files.get('data/live-systems-delivery.json')).mode,'fallback-incomplete');
});
test('official data snapshot rejects forged online counts and inconsistent official totals',()=>{
  const s=sandbox('live-outage-notice.js');
  const good={source:'truckersmp-official-v2',observedAt:new Date().toISOString(),
    vtcMemberCount:116,kingsOnline:null,totalAllPlayers:100,
    ets2AllPlayers:90,atsAllPlayers:10,activeServers:2};
  assert.throws(()=>s.run('storeOfficialTrackerSnapshot('+JSON.stringify({...good,kingsOnline:115})+')'),/unverified/);
  assert.throws(()=>s.run('storeOfficialTrackerSnapshot('+JSON.stringify({...good,totalAllPlayers:101})+')'),/unverified/);
  assert.equal(s.files.has('data/live-tracker-official.json'),false);
});
