'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readNewCommands,PAGE_SIZE,MAX_PAGES}=require('../discord-command-cursor');
const BASE=900000000000000000n,CHANNEL='1114967437788577792';
const msg=n=>({id:String(BASE+BigInt(n)),author:{id:'999000000000000001',bot:false},
  content:'!probation help'});
function syntheticPages(rows){
  const calls=[];
  const fetchPage=async before=>{
    calls.push(before);
    const cap=before===null?null:BigInt(before);
    return rows.filter(x=>cap===null||BigInt(x.id)<cap).slice(0,PAGE_SIZE);
  };
  return {calls,fetchPage};
}
test('empty first-run stores a durable zero cursor so the first subsequent real command is not skipped',async()=>{
  const p=syntheticPages([]);
  const first=await readNewCommands({channelId:CHANNEL,cursor:null,fetchPage:p.fetchPage});
  assert.equal(first.bootstrap,true);
  assert.equal(first.newestId,'0');
  assert.deepEqual(first.messages,[]);
  const next=await readNewCommands({
    channelId:CHANNEL,cursor:first.newestId,
    fetchPage:syntheticPages([msg(1)]).fetchPage
  });
  assert.equal(next.bootstrap,false);
  assert.deepEqual(next.messages.map(x=>x.id),[msg(1).id]);
  assert.equal(next.newestId,msg(1).id);
});
test('first activation skips existing messages without paging through old private history',async()=>{
  const rows=Array.from({length:150},(_,i)=>msg(150-i));
  const p=syntheticPages(rows);
  const r=await readNewCommands({channelId:CHANNEL,cursor:null,fetchPage:p.fetchPage});
  assert.equal(r.bootstrap,true);
  assert.equal(r.newestId,msg(150).id);
  assert.deepEqual(r.messages,[]);
  assert.equal(p.calls.length,1);
});
test('250+ new commands are paged backwards and returned once, in chronological order',async()=>{
  const rows=Array.from({length:270},(_,i)=>msg(270-i));
  const p=syntheticPages(rows);
  const r=await readNewCommands({
    channelId:CHANNEL,cursor:msg(9).id,fetchPage:p.fetchPage
  });
  assert.equal(r.bootstrap,false);
  assert.equal(r.messages.length,261);
  assert.equal(r.messages[0].id,msg(10).id);
  assert.equal(r.messages.at(-1).id,msg(270).id);
  assert.equal(new Set(r.messages.map(x=>x.id)).size,261);
  assert.equal(r.newestId,msg(270).id);
  assert.equal(p.calls.length,3);
  assert.equal(p.calls[1],msg(171).id);
});
test('nothing new keeps the prior encrypted checkpoint intact',async()=>{
  const r=await readNewCommands({channelId:CHANNEL,cursor:msg(270).id,
    fetchPage:syntheticPages([msg(270),msg(269)]).fetchPage});
  assert.equal(r.bootstrap,false);
  assert.deepEqual(r.messages,[]);
  assert.equal(r.newestId,msg(270).id);
});
test('unbounded 2001-message backlog fails closed instead of silently dropping commands',async()=>{
  const rows=Array.from({length:2001},(_,i)=>msg(2002-i));
  const p=syntheticPages(rows);
  await assert.rejects(readNewCommands({
    channelId:CHANNEL,cursor:msg(1).id,fetchPage:p.fetchPage
  }),/backlog exceeds the safe read-only limit/);
  assert.equal(p.calls.length,MAX_PAGES);
});
test('missing, duplicate, reordered and oversized Discord pages cannot advance protected cursor',async()=>{
  for(const batch of [
    null,{},[{}],[{id:'invalid'}],[msg(9),msg(9)],
    [msg(9),msg(10)],Array.from({length:101},(_,i)=>msg(101-i))
  ]){
    await assert.rejects(readNewCommands({channelId:CHANNEL,cursor:msg(1).id,
      fetchPage:async()=>batch}),/unverified/);
  }
  let calls=0;
  await assert.rejects(readNewCommands({channelId:CHANNEL,cursor:'forged',
    fetchPage:async()=>{calls++;return []}}),/cursor unverified/);
  assert.equal(calls,0);
});
test('HR Probation and Driver LOA use the same paginated fail-closed history reader',()=>{
  for(const name of ['hr-probation','driver-loa']){
    const script=fs.readFileSync(path.join(__dirname,'..',name+'.js'),'utf8');
    assert.match(script,/require\(['"]\.\/discord-command-cursor['"]\)/);
    assert.match(script,/await readNewCommands\(/);
    assert.match(script,/&before=\$\{before\}/);
    assert.match(script,/if\(history\.bootstrap\)/);
    assert.match(script,/lastProcessedMessageId=history\.newestId/);
    assert.doesNotMatch(script,/const messages = await discord\(`\/channels\/\$\{channel\.id\}\/messages\?limit=100`\)/);
  }
});
