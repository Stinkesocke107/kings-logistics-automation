const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Execute the real functions with in-memory files and a fake Discord transport.
// No real webhook, repository data, or network request is used.
const root = path.resolve(__dirname, '..');
const existing = { category: 'Kings Systems', text: 'Existing entry', source: 'manual-test' };
function sandbox(script, queue, failSend = false, overrides = {}) {
  const files = new Map();
  if (queue !== undefined) files.set('changelog-queue.json', queue);
  files.set('changelog-state.json',
    overrides.state ?? JSON.stringify({ season: 'S01', nextNumber: 6 }));
  if(!overrides.missingHistory)files.set('changelog-history.json',
    overrides.history ?? JSON.stringify({ changelogs: [] }));
  const sent = [];
  const discordMessages = [...(overrides.previousMessages || [])];
  const WEBHOOK = '111111111111111111';
  const CHANNEL = '222222222222222222';
  const GUILD = '1114967437788577792';
  const fakeFs = {
    existsSync: p => files.has(path.basename(p)),
    readFileSync: p => files.get(path.basename(p)),
    mkdirSync: () => {},
    writeFileSync: (p, value) => files.set(path.basename(p), value)
  };
  const ctx = vm.createContext({
    require: name => name === 'fs' ? fakeFs : name === './kings-branding' ? { installDiscordBranding() {} } : name.startsWith('.') ? require(path.join(root, name)) : require(name),
    __dirname: root,
    console: { log() {}, error() {} },
    process: { env: {
      CHANGELOG_DISCORD_WEBHOOK_URL:
        'https://discord.com/api/webhooks/'+WEBHOOK+'/synthetic-webhook-token',
      DISCORD_BOT_TOKEN: overrides.noBotToken ? '' : 'synthetic-bot'
    } },
    fetch: async (url, options={}) => {
      if (options.method === 'GET') {
        if (overrides.failRead)
          return { ok: false, status: 403 };
        if (url.includes('/webhooks/'))
          return { ok: true, json: async () => ({
            id:WEBHOOK, guild_id:GUILD, channel_id:CHANNEL
          }) };
        if (url.includes('/channels/'+CHANNEL+'/messages?')) {
          const before = /[?&]before=(\d+)/.exec(url)?.[1];
          const list = before ? discordMessages.filter(x=>BigInt(x.id)<BigInt(before))
            : discordMessages;
          return { ok:true, json:async()=>list.slice(0,100) };
        }
        return { ok:false,status:404 };
      }
      const body=JSON.parse(options.body);
      sent.push(body);
      const fail = failSend || (overrides.failAfterPost !== undefined &&
        sent.length > overrides.failAfterPost);
      if (!fail) discordMessages.unshift({
        id:String(333333333333333333n+BigInt(discordMessages.length)),
        webhook_id:WEBHOOK,content:body.content
      });
      return {ok:!fail,status:fail?500:204,text:async()=> 'simulated response'};
    }
  });
  const source = fs.readFileSync(path.join(root, script), 'utf8');
  vm.runInContext(source.slice(0, source.lastIndexOf('start().catch')), ctx);
  return { files, sent, discordMessages, run: code => vm.runInContext(code, ctx) };
}

for (const [label, value] of [
  ['array', [existing]], ['legacy object', { entries: [existing] }]
]) {
  test(`publisher reads and archives ${label} without losing entries`, async () => {
    const s = sandbox('changelog.js', JSON.stringify(value));
    assert.equal(s.run('loadQueue().entries.length'), 1);
    await s.run('publishChangelog()');
    assert.equal(s.sent.length, 1);
    assert.match(s.sent[0].content, /Existing entry/);
    assert.deepEqual(JSON.parse(s.files.get('changelog-queue.json')), []);
    assert.deepEqual(JSON.parse(s.files.get('changelog-history.json')).changelogs[0].entries[0].text, existing.text);
    assert.equal(JSON.parse(s.files.get('changelog-state.json')).nextNumber, 7);
  });
  test(`milestone survives serialization and preserves ${label} entries`, () => {
    const s = sandbox('milestones.js', JSON.stringify(value));
    s.run('addMilestoneToChangelog(150)');
    s.run('addMilestoneToChangelog(150)');
    const queue = JSON.parse(s.files.get('changelog-queue.json'));
    assert.equal(queue.length, 2);
    assert.deepEqual(queue[0], existing);
    assert.equal(queue[1].source, 'milestone-150');
    const publisher = sandbox('changelog.js', JSON.stringify(queue));
    assert.equal(publisher.run('loadQueue().entries.length'), 2);
  });
}
test('failed Discord send keeps queue, history and numbering unchanged', async () => {
  const s = sandbox('changelog.js', JSON.stringify([existing]), true);
  const before = [...s.files];
  await assert.rejects(s.run('publishChangelog()'), /HTTP 500/);
  assert.deepEqual([...s.files], before);
});
for (const value of ['{broken', 'null', '{"unexpected":true}']) {
  test(`invalid queue is rejected without overwriting: ${value}`, () => {
    for (const script of ['changelog.js', 'milestones.js']) {
      const s = sandbox(script, value);
      assert.throws(() => s.run(script === 'changelog.js' ? 'loadQueue()' : 'addMilestoneToChangelog(150)'));
      assert.equal(s.files.get('changelog-queue.json'), value);
      assert.equal(s.sent.length, 0);
    }
  });
}
test('empty or missing queue sends nothing; first milestone can be added', async () => {
  for (const value of [undefined, '[]', '{"entries":[]}']) {
    const s = sandbox('changelog.js', value);
    await s.run('publishChangelog()');
    assert.equal(s.sent.length, 0);
    const m = sandbox('milestones.js', value);
    m.run('addMilestoneToChangelog(150)');
    assert.equal(JSON.parse(m.files.get('changelog-queue.json')).length, 1);
  }
});

test('existing corrupted release numbering or history blocks webhook before any publication',async()=>{
 const invalid=[
   {state:'{broken'},
   {state:'null'},
   {state:JSON.stringify({season:'S01',nextNumber:0})},
   {state:JSON.stringify({season:'S01',nextNumber:'6'})},
   {history:'{broken'},
   {history:'null'},
   {history:JSON.stringify({unexpected:true})},
   {history:JSON.stringify({changelogs:[
     {id:'S01-KL06',season:'S01',number:6,entries:[]},
     {id:'S01-KL06',season:'S01',number:6,entries:[]}
   ]})},
   {history:JSON.stringify({changelogs:[
     {id:'S01-KL06',season:'S01',number:6,entries:[]}
   ]})},
   {history:JSON.stringify({changelogs:[
     {id:'S01-KL07',season:'S01',number:7,entries:[]}
   ]})}
 ];
 for(const override of invalid){
   const s=sandbox('changelog.js',JSON.stringify([existing]),false,override);
   const before=[...s.files];
   await assert.rejects(s.run('publishChangelog()'),/invalid|unverified|conflicts/i);
   assert.equal(s.sent.length,0);
   assert.deepEqual([...s.files],before);
 }
});
test('invalid queue entries do not disappear into an apparently successful post',async()=>{
 const wrong=[
   [{category:'Kings Systems',text:' '},{...existing}],
   [null],
   [{category:'Kings',text:5}],
   [{category:'Kings',text:'x'.repeat(1001)}]
 ];
 for(const entries of wrong){
   const s=sandbox('changelog.js',JSON.stringify(entries));
   const before=[...s.files];
   await assert.rejects(s.run('publishChangelog()'),/invalid entry/i);
   assert.equal(s.sent.length,0);
   assert.deepEqual([...s.files],before);
 }
});
test('overlarge Changelog category must stop before sending instead of truncating approved text',async()=>{
 const entries=[1,2,3].map(n=>({
   category:'Kings Systems',text:'Critical change '+n+': '+'x'.repeat(820),
   source:'manual-test'
 }));
 const s=sandbox('changelog.js',JSON.stringify(entries));
 const before=[...s.files];
 await assert.rejects(s.run('publishChangelog()'),/too long/i);
 assert.equal(s.sent.length,0);
 assert.deepEqual([...s.files],before);
});

test('manual Changelog Editor writes valid entry, preserves deduplication, and does not log text',()=>{
 const os=require('node:os'),cp=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-changelog-editor-'));
 try{
   fs.copyFileSync(path.join(root,'add-changelog-entry.js'),
     path.join(dir,'add-changelog-entry.js'));
   fs.mkdirSync(path.join(dir,'data'));
   const entryFile=path.join(dir,'data','changelog-queue.json');
   fs.writeFileSync(entryFile,'[]');
   const secretText='Synthetic internal release payload: do not echo this';
   const run=()=>cp.spawnSync(process.execPath,['add-changelog-entry.js'],{
     cwd:dir,env:{...process.env,CHANGELOG_CATEGORY:'Kings Systems',
       CHANGELOG_TEXT:secretText},encoding:'utf8'
   });
   const first=run();
   assert.equal(first.status,0,first.stderr);
   assert.equal(first.stdout.includes(secretText),false);
   assert.equal(JSON.parse(fs.readFileSync(entryFile)).length,1);
   const second=run();
   assert.equal(second.status,0,second.stderr);
   assert.equal(JSON.parse(fs.readFileSync(entryFile)).length,1);
   fs.writeFileSync(entryFile,JSON.stringify([null]));
   const corrupt=run();
   assert.notEqual(corrupt.status,0);
   assert.equal(fs.readFileSync(entryFile,'utf8'),'[null]');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('missing historical archive blocks publishing later release numbers',async()=>{
 const s=sandbox('changelog.js',JSON.stringify([existing]),false,{missingHistory:true});
 await assert.rejects(s.run('publishChangelog()'),/archive missing/);
 assert.equal(s.sent.length,0);
 assert.equal(s.files.has('changelog-history.json'),false);
 assert.equal(JSON.parse(s.files.get('changelog-queue.json')).length,1);
});


test('Discord accepts release but Git state is lost: retry recovers without a second POST',async()=>{
 const s=sandbox('changelog.js',JSON.stringify([existing]));
 const before=[...s.files];
 await s.run('publishChangelog()');
 assert.equal(s.sent.length,1);
 for(const [k,v] of before)s.files.set(k,v);
 await s.run('publishChangelog()');
 assert.equal(s.sent.length,1,'recovery must not send a second public message');
 assert.equal(JSON.parse(s.files.get('changelog-state.json')).nextNumber,7);
 assert.equal(JSON.parse(s.files.get('changelog-history.json')).changelogs.length,1);
 assert.deepEqual(JSON.parse(s.files.get('changelog-queue.json')),[]);
});

test('partial multi-part Discord delivery blocks retry and preserves original queue',async()=>{
 const queue=JSON.stringify([
   {category:'First',text:'x'.repeat(920)},
   {category:'Second',text:'y'.repeat(920)}
 ]);
 const s=sandbox('changelog.js',queue,false,{failAfterPost:1});
 const before=[...s.files];
 await assert.rejects(s.run('publishChangelog()'),/HTTP 500/);
 assert.ok(s.discordMessages.length===1);
 const originalRequests=s.sent.length;
 await assert.rejects(s.run('publishChangelog()'),/partially published/);
 assert.equal(s.sent.length,originalRequests);
 assert.deepEqual([...s.files],before);
});

test('tampered previously delivered release must never be silently re-archived or reposted',async()=>{
 const s=sandbox('changelog.js',JSON.stringify([existing]));
 const before=[...s.files];
 await s.run('publishChangelog()');
 s.discordMessages[0].content=s.discordMessages[0].content.replace('Existing entry','Tampered entry');
 for(const [k,v] of before)s.files.set(k,v);
 await assert.rejects(s.run('publishChangelog()'),/content conflicts/);
 assert.equal(s.sent.length,1);
 assert.deepEqual([...s.files],before);
});

test('Discord GET failure or unavailable private bot credential blocks all public sends',async()=>{
 for(const config of [{failRead:true},{noBotToken:true}]) {
   const s=sandbox('changelog.js',JSON.stringify([existing]),false,config);
   const before=[...s.files];
   await assert.rejects(s.run('publishChangelog()'),/readback|credentials/i);
   assert.equal(s.sent.length,0);
   assert.deepEqual([...s.files],before);
 }
});
