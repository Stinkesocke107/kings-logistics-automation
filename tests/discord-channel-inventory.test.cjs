'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {TARGETS,verifyChannels,renderSummary}=require('../discord-channel-inventory-audit');
const guild='1114967437788577792';
function fixture(){
 return TARGETS.map((t,i)=>({id:t.id||String(100000000000000000n+BigInt(i)),type:t.types[0],guild_id:guild,name:t.name||t.key}));
}
test('Kings read-only channel audit resolves all known targets without leaking channel objects',()=>{
 const actual=verifyChannels(fixture(),guild);
 assert.equal(actual.length,TARGETS.length);
 assert.ok(actual.every(x=>x.status==='VERIFIED'));
 assert.ok(actual.every(x=>!('id' in x)&&!('name' in x)&&!('permission_overwrites' in x)));
 assert.equal(renderSummary(actual).reduce((n,x)=>n+x.total,0),TARGETS.length);
});
test('missing, misconfigured, duplicated and cross-guild destinations fail closed',()=>{
 const base=fixture();
 const absent=verifyChannels(base.filter(x=>x.id!==TARGETS[0].id),guild);
 assert.equal(absent[0].status,'UNVERIFIED');
 const wrongType=base.map(x=>({...x}));wrongType[0].type=15;
 assert.equal(verifyChannels(wrongType,guild)[0].status,'UNVERIFIED');
 const wrongGuild=base.map(x=>({...x}));wrongGuild[0].guild_id='999999999999999999';
 assert.equal(verifyChannels(wrongGuild,guild)[0].reason,'guild-mismatch');
 const duplicated=[...base,{...base.at(-1),id:'777777777777777777'}];
 assert.equal(verifyChannels(duplicated,guild).at(-1).reason,'ambiguous');
});
test('the inventory audit never changes Discord messages, roles or channels',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const text=fs.readFileSync(path.join(__dirname,'..','discord-channel-inventory-audit.js'),'utf8');
 assert.doesNotMatch(text,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.doesNotMatch(text,/\/messages\/\$\{/);
 assert.doesNotMatch(text,/console\.log\([^\n]*JSON\.stringify\(channels/);
});
