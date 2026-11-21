'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {sandbox}=require('./sandbox.cjs');
const fs=require('node:fs');
const path=require('node:path');

const id='1550301949470048277';
const webhook='https://discord.com/api/webhooks/123456789012345678/test-token';

function targets(mode,fetch){
  if(mode==='tracker')return sandbox('tracker.js',{
    env:{DISCORD_WEBHOOK_URL:webhook},
    files:{'data/live-tracker-snapshot.json':JSON.stringify({discordMessageId:id})},fetch
  });
  if(mode==='statistics')return sandbox('statistics.js',{
    env:{STATS_DISCORD_WEBHOOK_URL:webhook},fetch
  });
  return sandbox('central-overview.js',{
    env:{CENTRAL_OVERVIEW_WEBHOOK_URL:webhook},fetch
  });
}
function runSync(mode,s,storedId=id){
  if(mode==='tracker')return s.run('updateDiscordMessage([])');
  if(mode==='statistics')return s.run('syncDiscord('+JSON.stringify({messageId:storedId})+', {title:"Statistics"})');
  return s.run('publishOverview('+JSON.stringify({messageId:storedId,recreateMessage:false})+', {title:"Central"})');
}

for(const mode of ['tracker','statistics','central']){
  test(mode+': missing message IDs fail closed with no Discord POST',async()=>{
    const s=targets(mode,async()=>{throw Error('No Discord request permitted');});
    if(mode==='tracker')s.files.set('data/live-tracker-snapshot.json','{"updatedAt":"2026-11-18T16:00:00Z"}');
    await assert.rejects(runSync(mode,s,null),/message ID missing or invalid/);
    assert.equal(s.calls.length,0);
  });
  test(mode+': a missing Discord message on PATCH never creates a replacement',async()=>{
    const s=targets(mode,async(_url,options)=>{
      assert.equal(options.method,'PATCH');
      return new Response('not found',{status:404});
    });
    await assert.rejects(runSync(mode,s),/refusing duplicate publication/);
    assert.deepEqual(s.calls.map(call=>call.options.method),['PATCH']);
  });
  test(mode+': a valid existing message is updated in-place',async()=>{
    const s=targets(mode,async(_url,options)=>{
      assert.equal(options.method,'PATCH');
      return new Response(null,{status:204});
    });
    const result=await runSync(mode,s);
    assert.equal(mode==='tracker'?result:id,mode==='tracker'?id:id);
    if(mode!=='tracker')assert.equal(result,false);
    assert.deepEqual(s.calls.map(call=>call.options.method),['PATCH']);
  });
}

test('Central Overview legacy recreate flag is blocked without a destructive DELETE',async()=>{
  const s=targets('central',async()=>{throw Error('No Discord requests permitted');});
  await assert.rejects(s.run('publishOverview({messageId:'+JSON.stringify(id)+',recreateMessage:true},{title:"Central"})'),/manual ownership verification/);
  assert.equal(s.calls.length,0);
});

test('Fixed Live publishing scripts contain no automatic new-message or delete operations',()=>{
  const root=path.resolve(__dirname,'..');
  for(const file of ['tracker.js','statistics.js','central-overview.js']){
    const code=fs.readFileSync(path.join(root,file),'utf8');
    assert.doesNotMatch(code,/createDiscordMessage\(|createMessage\(|deleteDiscordMessage\(/,file);
    assert.match(code,/refusing duplicate publication|refusing to create another message/,file);
  }
});
