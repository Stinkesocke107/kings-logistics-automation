'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const a=require('../discord-event-driven-publication-audit');
test('published Kings monthly report must match actual webhook ownership and optional approved convoy backfill',()=>{
 const s={key:'2026-10',month:'October 2026',discordChannelId:'1479853315264217202',discordMessageId:'1566489510898958407',convoysParticipated:29,convoysWithConfirmedSlot:28};
 const m={id:s.discordMessageId,channel_id:s.discordChannelId,webhook_id:'123456789123456789',content:'Kings Logistics — October 2026 Monthly Report\nConvoys Participated: **29**\nWith Confirmed Kings Slot: **28**'};
 assert.equal(a.checkMonthlyMessage(m,s,m.webhook_id),null);
 assert.equal(a.checkMonthlyMessage({...m,content:m.content.replace('**28**','**0**')},s,m.webhook_id),'monthly-convoy-backfill-mismatch');
 assert.equal(a.checkMonthlyMessage({...m,webhook_id:'999999999999999999'},s,m.webhook_id),'monthly-publication-owner-or-location-mismatch');
});
test('changelog multipart contract checks release identity, exact part count and footer',()=>{
 const r={id:'S01-KL07',season:'S01',number:7,publishedAt:'2026-11-08T01:50:02.529Z',discordMessageCount:4};
 const message=(content)=>({webhook_id:'123456789123456789',timestamp:'2026-11-08T01:49:45.000Z',content});
 const parts=[message('Changelog – S01 – KL07'),message('Kings Logistics Changelog — Continued'),message('Kings Logistics Changelog — Continued'),message('Kings Logistics Changelog — Continued\nConnecting the world, creating friendships.')];
 assert.equal(a.checkChangelogMessages(parts,r,parts[0].webhook_id),null);
 assert.equal(a.checkChangelogMessages(parts.slice(1),r,parts[0].webhook_id),'changelog-message-count-mismatch');
 assert.equal(a.checkChangelogMessages(parts.map(m=>({...m,webhook_id:'999999999999999999'})),r,parts[0].webhook_id),'changelog-message-count-mismatch');
});
test('no-event is distinguishable from live verified and only used with real source evidence',()=>{
 assert.equal(a.milestoneExpectation({memberCountAtLastUpdate:111,reachedMilestones:[]}).status,'NO_EVENT');
 assert.equal(a.milestoneExpectation({memberCountAtLastUpdate:151,reachedMilestones:[]}).status,'UNVERIFIED');
 assert.equal(a.staffExpectation({mode:'live',updatedAt:new Date().toISOString(),published:0}).status,'NO_EVENT');
 assert.equal(a.staffExpectation({mode:'dry-run',updatedAt:new Date().toISOString(),published:0}).status,'UNVERIFIED');
});
test('technical alerts must be bot-authored and have the Kings system-monitoring footer',()=>{
 const m={author:{id:'123456789123456789'},embeds:[{title:'🚨 Kings System Alert — Critical',footer:{text:'Kings Logistics • System Monitoring • Technical only'}}]};
 assert.equal(a.alertMessageIsTechnical(m,m.author.id),true);
 assert.equal(a.alertMessageIsTechnical({...m,author:{id:'999999999999999999'}},'123456789123456789'),false);
});
test('event-driven audit never writes to Discord or logs message content',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../discord-event-driven-publication-audit.js'),'utf8');
 assert.doesNotMatch(src,/method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.doesNotMatch(src,/console\.log\([^\n]*\.content/);
 assert.match(src,/if\(missing\)throw/);
});

test('event-driven read-only audit retries bounded Discord rate limits without POSTs',async()=>{
 const a=require('../discord-event-driven-publication-audit');
 const calls=[];
 const transport=async (_url,init)=>{
   calls.push(init.method);
   if(calls.length===1)return new Response('{}',{status:429,headers:{'retry-after':'0'}});
   if(calls.length===2)return new Response('{}',{status:503});
   return new Response('{"ok":true}',{status:200});
 };
 const waits=[];
 const result=await a.getJson('https://discord.com/api/v10/channels/123/messages',{},transport,async ms=>{waits.push(ms);});
 assert.equal(result.ok,true);
 assert.deepEqual(calls,['GET','GET','GET']);
 assert.equal(waits.length,2);
 assert.ok(waits.every(n=>Number.isInteger(n)&&n>=0&&n<=10000));
});
test('event-driven audit fails closed after bounded transient retries',async()=>{
 const a=require('../discord-event-driven-publication-audit');
 const transport=async()=>new Response('{}',{status:429,headers:{'retry-after':'0'}});
 await assert.rejects(()=>a.getJson('https://discord.com/api/v10/channels/123/messages',{},transport,async()=>{}),/discord-read-transient-exhausted/);
});
