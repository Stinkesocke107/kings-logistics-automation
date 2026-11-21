'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {TARGETS,endpoint,verifyDestination}=require('../discord-webhook-destination-audit');
test('eight known active Kings webhook publishers are present and secrets are resolved only at runtime',()=>{
 assert.equal(TARGETS.length,8);
 assert.equal(new Set(TARGETS.map(x=>x.secret)).size,8);
 const r=endpoint('https://discord.com/api/webhooks/123456789123456789/secrettoken');
 assert.deepEqual(r,{url:'https://discord.com/api/webhooks/123456789123456789/secrettoken',id:'123456789123456789'});
 assert.equal(endpoint('https://evil.test/api/webhooks/123456789123456789/secrettoken'),null);
});
test('webhook destination is verified against actual guild, channel, kind and latest News evidence',()=>{
 const id='123456789123456789',guild='1114967437788577792',channel='1479853315264217202';
 const details={id,guild_id:guild,channel_id:channel,type:1};
 const channels=[{id:channel,guild_id:guild,type:0}];
 assert.equal(verifyDestination(details,{id},channels,guild,channel),null);
 assert.equal(verifyDestination({...details,guild_id:'999999999999999999'},{id},channels,guild,channel),'webhook-guild-mismatch');
 assert.equal(verifyDestination({...details,type:2},{id},channels,guild,channel),'not-an-incoming-webhook');
 assert.equal(verifyDestination(details,{id},channels,guild,'101010101010101010'),'webhook-publication-target-drift');
 assert.equal(verifyDestination(details,{id},[],guild,channel),'webhook-channel-not-accessible-in-kings-guild');
});
test('webhook audit must not mutate Discord or log secrets/publication bodies',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../discord-webhook-destination-audit.js'),'utf8');
 assert.doesNotMatch(source,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.doesNotMatch(source,/console\.log\([^\n]*JSON\.stringify\(details/);
 assert.doesNotMatch(source,/console\.log\([^\n]*parsed\.url/);
 assert.match(source,/if\(verified!==results\.length\)throw/);
});
