'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const sources=[
  'event-capacity-discord-rest-readonly-contract.js',
  'event-capacity-discord-injected-source-replay.js'
];
test('New source readers are not imported by production Convoy Checker or the live workflow',()=>{
  const workflow=read('.github/workflows/convoy-checker.yml');
  const checker=read('convoy-checker.js');
  for(const file of sources){
    const name=file.slice(0,-3);
    assert.equal(workflow.includes(name),false);
    assert.equal(checker.includes(name),false);
  }
});
test('No source reader directly imports HTTP clients, environment tokens or process secrets',()=>{
  for(const file of sources){
    const text=read(file);
    assert.doesNotMatch(text,/process\.env|DISCORD_BOT_TOKEN|GITHUB_TOKEN|https?\.request\(|axios|undici|node:https/);
    assert.doesNotMatch(text,/\bfetch\s*\(/);
    assert.match(text,/safeToActivate:false/);
    assert.match(text,/freeSlotsCertified:false/);
  }
});
test('Pure GET planner never contains a mutating HTTP method or a privileged Discord route',()=>{
  const contract=read(sources[0]);
  assert.match(contract,/method:'GET'/);
  assert.match(contract,/mayWrite:false/);
  assert.doesNotMatch(contract,/method:'POST'|method:'PATCH'|method:'DELETE'/);
  assert.doesNotMatch(contract,/\/channels\/.*\/messages\/bulk-delete/);
});
test('Source simulator requires an injected offline-only transport and never imports production interaction handlers',()=>{
  const replay=read(sources[1]);
  assert.match(replay,/INJECTED_SYNTHETIC_ONLY/);
  assert.match(replay,/actualDiscordNetworkRequestsMadeByModule:0/);
  assert.match(replay,/providerResponseAuthenticated:false/);
  assert.doesNotMatch(replay,/event-capacity-discord-auth/);
});
test('Private raw pagination receipt is explicitly marked not safe for logs',()=>{
  const replay=read(sources[1]),planner=read(sources[0]);
  assert.match(replay,/privateReceiptDoNotLog/);
  assert.match(planner,/privateRequestDoNotLog:true/);
  assert.match(planner,/sourceRecordContentsRetained:false/);
});
