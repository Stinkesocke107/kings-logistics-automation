'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/live-tracker.yml'),'utf8');
const id='123456789012345678';
const webhook='https://discord.com/api/webhooks/'+id+'/safe-test-token';
const snapshot={
  version:2,updatedAt:'2026-11-18T16:00:21.037Z',
  members:110,discordMessageId:id,online:1,ets2Online:1,atsOnline:0,
  activeServers:[{game:'ETS2',name:'Simulation 1',online:1,isEvent:false}]
};

function step(name){
  const start=workflow.indexOf('      - name: '+name+'\n');
  assert.ok(start>=0,'Missing workflow step: '+name);
  const next=workflow.indexOf('\n      - name: ',start+8);
  return workflow.slice(start,next<0?undefined:next);
}
function notice({stored=snapshot,fetch:transport,enabled=false}={}){
  return sandbox('live-outage-notice.js',{
    files:{'data/live-tracker-snapshot.json':JSON.stringify(stored)},
    env:{
      DISCORD_WEBHOOK_URL:webhook,
      TRUCKERSMP_OFFICIAL_FEED_ENABLED:enabled?'true':'false'
    },
    fetch:transport
  });
}
const json=value=>new Response(JSON.stringify(value),{
  status:200,headers:{'content-type':'application/json'}
});

test('one failed map scan keeps the fallback running but skips every map-dependent publisher',()=>{
  const tracker=step('Update Kings Live Tracker');
  assert.match(tracker,/id: live_tracker/);
  assert.match(tracker,/continue-on-error: true/);
  const fallback=step('Continue Kings Live Systems without the live map');
  assert.match(fallback,/steps\.live_tracker\.outcome == 'failure'/);
  assert.doesNotMatch(fallback,/continue-on-error: true/);
  assert.match(fallback,/node live-outage-notice\.js/);
  assert.match(fallback,/TRUCKERSMP_OFFICIAL_FEED_ENABLED: 'true'/);
  for(const name of [
    'Update Kings Advanced Statistics',
    'Verify Tracker and Statistics use the same source generation',
    'Update Kings Central Overview'
  ]){
    assert.match(step(name),/steps\.live_tracker\.outcome == 'success'/,name);
  }
  const persistence=step('Save Kings Live System Data and API Health Together');
  assert.match(persistence,/if: always\(\)/);
  assert.match(persistence,/data\/api-health/);
  assert.match(persistence,/data\/live-tracker-snapshot\.json/);
});

test('missing stored tracker message is an honest degraded-mode failure, not a green run',async()=>{
  const s=notice({stored:{...snapshot,discordMessageId:null}});
  await s.run('main()');
  assert.equal(s.process.exitCode,1);
  assert.equal(s.calls.length,0,'No POST, no guessed replacement');
  assert.equal(JSON.parse(s.files.get('data/live-tracker-snapshot.json')).online,1);
});

test('deleted tracker message fails fallback closed without creating a duplicate',async()=>{
  const s=notice({fetch:async(url,options)=>{
    assert.ok(url.endsWith('/messages/'+id));
    assert.equal(options.method,'GET');
    return new Response('not found',{status:404});
  }});
  await s.run('main()');
  assert.equal(s.process.exitCode,1);
  assert.deepEqual(s.calls.map(x=>x.options.method),['GET']);
  assert.equal(JSON.parse(s.files.get('data/live-tracker-snapshot.json')).updatedAt,snapshot.updatedAt);
});

test('fallback without any map or official API still displays unavailable (never fake zero)',async()=>{
  const sent=[];
  const s=notice({fetch:async(_url,options)=>{
    if(options.method==='GET')return json({embeds:[{title:'Previous verified live data'}]});
    assert.equal(options.method,'PATCH');
    sent.push(JSON.parse(options.body));
    return new Response(null,{status:204});
  }});
  await s.run('main()');
  assert.equal(s.process.exitCode,0);
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].allowed_mentions,{parse:[]});
  assert.match(sent[0].embeds[0].description,/temporarily unavailable/);
  assert.match(sent[0].embeds[0].fields[1].value,/Unavailable — not zero/);
  assert.doesNotMatch(JSON.stringify(sent),/Currently Online|Kings Drivers Online: 0/);
  assert.equal(s.files.get('data/live-tracker-snapshot.json'),JSON.stringify(snapshot));
});
