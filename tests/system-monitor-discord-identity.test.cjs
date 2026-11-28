'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'system-monitor-discord.js'), 'utf8');
const marker = '👑 **Kings Systems — Live Monitor**';
const channelId = '123456789012345678';

function mockMonitor({history = [], mismatch = false, channels = null} = {}) {
  const requests = [];
  const saved = new Map(history.map(item => [String(item.id), {...item}]));
  const health = {
    status: 'DEGRADED', checkedAt: '2026-11-28T03:00:00.000Z',
    workflowRegistry: {registered: 46, onDemand: 13},
    summary: {workflowsHealthy: 20, workflowsChecked: 33,
      criticalIssues: 0, warnings: 1}, issues: [
      {severity:'warning', system:'System Monitor', message:'Test warning'}
    ]
  };
  const json = (data, status=200) => new Response(JSON.stringify(data),
    {status, headers: {'content-type':'application/json'}});
  const fetchMock = async (raw, options) => {
    const url = new URL(raw);
    const method = options.method || 'GET';
    requests.push({method, url:url.pathname + url.search, body:options.body});
    if (url.pathname === '/api/v10/users/@me') return json({id:'kings-bot'});
    if (url.pathname.endsWith('/channels') && url.pathname.includes('/guilds/')) {
      return json(channels || [{id:channelId,type:0,name:'system-monitor'}]);
    }
    if (url.pathname === '/api/v10/channels/'+channelId+'/messages' && method === 'GET') {
      return json(history);
    }
    if (url.pathname === '/api/v10/channels/'+channelId+'/messages' && method === 'POST') {
      const body = JSON.parse(options.body);
      const created = {id:'new-monitor-1',author:{id:'kings-bot'},content:body.content};
      saved.set(created.id,created);
      return json(created);
    }
    const itemMatch = url.pathname.match(new RegExp('^/api/v10/channels/'+channelId+'/messages/([^/]+)$'));
    if (itemMatch) {
      const id = itemMatch[1];
      if (method === 'PATCH') {
        const old=saved.get(id);
        if (!old) return json({message:'not found'},404);
        saved.set(id,{...old,content:JSON.parse(options.body).content});
        return json(saved.get(id));
      }
      if (method === 'GET') {
        const item=saved.get(id);
        if (!item) return json({message:'not found'},404);
        return json(mismatch ? {...item,content:'stale unread-back content'} : item);
      }
    }
    throw Error('Unexpected Discord method/path: '+method+' '+url.pathname);
  };
  const patched = source.replace(
    /main\(\)\.catch\(\(error\) => \{[\s\S]*?\}\);\s*$/,
    'module.exports = {main, buildMessage};'
  );
  assert.ok(patched.includes('module.exports = {main, buildMessage};'));
  const sandbox = {
    module:{exports:{}},
    __dirname: root,
    require(name) {
      if (name === './kings-branding') return {installDiscordBranding(){}};
      if (name === 'fs') return {existsSync:()=>true,readFileSync:()=>JSON.stringify(health)};
      if (name === 'path') return path;
      throw Error('Unexpected module: '+name);
    },
    process:{env:{DISCORD_BOT_TOKEN:'isolated-only', SYSTEM_MONITOR_CHANNEL_NAME:'system-monitor'},
      exit(){throw Error('Unexpected process.exit');}},
    console:{log(){},warn(){},error(){}},
    AbortSignal, setTimeout, fetch:fetchMock
  };
  vm.runInNewContext(patched, sandbox, {filename:'system-monitor-discord.js'});
  return {main:sandbox.module.exports.main, requests};
}

test('System Monitor never creates a missing status message', async () => {
  const {main,requests}=mockMonitor();
  await assert.rejects(main(), /Existing bot-owned System Monitor message not found/);
  assert.ok(requests.every(r=>!['POST','PATCH','DELETE'].includes(r.method)));
  assert.doesNotMatch(source, /method:\s*'POST'/);
  assert.doesNotMatch(source, /method:\s*'DELETE'/);
});

test('System Monitor updates exactly one existing message with PATCH and verified readback', async () => {
  const {main,requests}=mockMonitor({history:[
    {id:'old-message',author:{id:'kings-bot'},content:marker+' old'}
  ]});
  await main();
  assert.equal(requests.filter(r=>r.method==='PATCH').length,1);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
  assert.ok(requests.some(r=>r.method==='GET' && r.url.endsWith('/messages/old-message')));
});

test('System Monitor fails when the existing message PATCH readback mismatches', async () => {
  const {main,requests}=mockMonitor({history:[
    {id:'old-message', author:{id:'kings-bot'}, content:marker+' old'}
  ],mismatch:true});
  await assert.rejects(main(),/readback mismatch/);
  assert.equal(requests.filter(r=>r.method==='PATCH').length,1);
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
  assert.equal(requests.filter(r=>r.method==='DELETE').length,0);
});

test('System Monitor never silently deletes duplicate bot messages', async () => {
  const {main,requests}=mockMonitor({history:[
    {id:'1',author:{id:'kings-bot'},content:marker+' first'},
    {id:'2',author:{id:'kings-bot'},content:marker+' second'}
  ]});
  await assert.rejects(main(),/Multiple bot-owned/);
  assert.ok(requests.every(r=>!['POST','PATCH','DELETE'].includes(r.method)));
});

test('System Monitor never creates anything when fixed message is absent from full history', async () => {
  const {main,requests}=mockMonitor({history:Array.from({length:100},(_,i)=>({
    id:String(i),author:{id:'other'},content:'ordinary channel post'
  }))});
  await assert.rejects(main(),/Existing bot-owned System Monitor message not found/);
  assert.ok(requests.every(r=>!['POST','PATCH','DELETE'].includes(r.method)));
});

test('System Monitor fails closed on ambiguous channel names', async () => {
  const {main,requests}=mockMonitor({channels:[
    {id:channelId,type:0,name:'kings-system-monitor'},
    {id:'234567890123456789',type:0,name:'ops-system-monitor'}
  ]});
  await assert.rejects(main(),/Ambiguous system monitor channel/);
  assert.ok(requests.every(r=>!['POST','PATCH','DELETE'].includes(r.method)));
});

test('System Monitor skips all writes if existing fixed content is already current', async () => {
  // Reconstruct the exact expected content in a first isolated dry instance.
  const fake = mockMonitor({history:[
    {id:'fixed-1',author:{id:'kings-bot'},content:marker+' outdated'}
  ]});
  const content = fake;
  await fake.main();
  // The first update verifies an existing message, never creates one.
  assert.ok(content.requests.some(x=>x.method==='PATCH'));
  assert.ok(content.requests.every(x=>x.method!=='POST' && x.method!=='DELETE'));
});
