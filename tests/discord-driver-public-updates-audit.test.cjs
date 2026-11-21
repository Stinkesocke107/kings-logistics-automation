'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {checkDriverPost}=require('../discord-driver-public-updates-audit');
const webhook='123456789123456789',channel='1479853315264217202';
const good={webhook_id:webhook,channel_id:channel,mention_everyone:false,mention_roles:[],mentions:[{id:'111111111111111111'}],
 embeds:[{title:'👑 Welcome to the Kings Family!',description:'Please welcome a verified Driver to Kings Logistics.',footer:{text:'Kings Logistics • Driver Update'},image:{url:'https://cdn.example.test/banner.png'}}]};
test('read-only Driver post check recognises existing Kings update title and sender',()=>{
 assert.equal(checkDriverPost(good,webhook,channel),null);
 assert.equal(checkDriverPost({...good,webhook_id:'999999999999999999'},webhook,channel),'driver-post-publisher-or-location-mismatch');
 assert.equal(checkDriverPost({...good,embeds:[]},webhook,channel),'driver-update-embed-contract-missing');
});
test('Discord allowed mentions remain narrowly scoped to one Driver',()=>{
 assert.equal(checkDriverPost({...good,mention_everyone:true},webhook,channel),'driver-post-broad-mention-detected');
 assert.equal(checkDriverPost({...good,mention_roles:['111111111111111111']},webhook,channel),'driver-post-broad-mention-detected');
 assert.equal(checkDriverPost({...good,mentions:[{id:'1'},{id:'2'}]},webhook,channel),'driver-post-broad-mention-detected');
});
test('Driver posts use valid HTTPS banners and do not expose private message text',()=>{
 assert.equal(checkDriverPost({...good,embeds:[{...good.embeds[0],image:{url:'http://cdn.example.test/unsafe.png'}}]},webhook,channel),'driver-update-banner-unsafe');
 const source=fs.readFileSync(path.join(__dirname,'../discord-driver-public-updates-audit.js'),'utf8');
 assert.doesNotMatch(source,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.doesNotMatch(source,/console\.log\([^\n]*description/);
 assert.match(source,/no claim about every historical Driver event/);
});
