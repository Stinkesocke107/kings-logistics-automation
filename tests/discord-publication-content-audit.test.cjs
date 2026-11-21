'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const a=require('../discord-publication-content-audit');
const now=Date.parse('2026-11-21T21:00:00Z');
const mk=(t,minutes=10)=>new Date(t-minutes*60000).toISOString();
test('outage embeds must state online unavailability not zero',()=>{
 const cfg=a.OUTAGE[0];
 const valid={embeds:[{title:cfg.title,description:'Status temporarily unavailable; drivers not being marked online or offline',fields:[{name:'Current online count',value:'**Unavailable — not zero**'}]}]};
 assert.equal(a.verifyOutage(valid,cfg.title),null);
 assert.equal(a.verifyOutage({embeds:[{...valid.embeds[0],fields:[{name:'Current online count',value:'**0 online**'}]}]},cfg.title),'outage-online-unavailable-field-missing');
 assert.equal(a.verifyNormal(valid,cfg.title),'outage-still-shown-after-fresh-snapshot');
 const actualWording={embeds:[{...valid.embeds[0],description:'Current TruckersMP player status is temporarily unavailable. No one is being marked online or offline from missing information.'}]};
 assert.equal(a.verifyOutage(actualWording,cfg.title),null);
});
test('Staff role dashboard checks explicit distinction from HR appointments and source counts',()=>{
 const st={channelId:'1551675877178474526',messageId:'1559808918761373737',updatedAt:mk(now),totalStaff:11};
 const m={id:st.messageId,channel_id:st.channelId,author:{id:'111111111111111111'},embeds:[{title:'👔 Kings Staff Leadership — Live Role Overview',description:'Current Discord Staff hierarchy roles only. A role does NOT prove an HR-approved Staff appointment',fields:[{name:'Total unique Staff members',value:'**11**'},{name:'Staff appointment / HR authorization',value:'**Not verified**'}]}]};
 assert.equal(a.verifyStaff(m,st,{currentStaff:11,updatedAt:mk(now)},m.author.id,now),null);
 assert.equal(a.verifyStaff(m,st,{currentStaff:14,updatedAt:mk(now)},m.author.id,now),'staff-aggregate-source-disagrees');
 m.embeds[0].fields[1].value='**Approved**';
 assert.equal(a.verifyStaff(m,st,null,m.author.id,now),'staff-unverified-appointments-not-marked');
});
test('latest News message matches stored article, target channel and webhook publisher',()=>{
 const s={discordMessageId:'1570643828749242409',discordChannelId:'1479853315264217202',url:'https://truckersmp.com/vtc/64284/news/72143',title:'Kings Logistics News'};
 const m={id:s.discordMessageId,channel_id:s.discordChannelId,webhook_id:'123456789123456789',embeds:[{url:s.url,title:s.title}]};
 assert.equal(a.verifyNews(m,s,m.webhook_id),null);
 assert.equal(a.verifyNews({...m,webhook_id:'111111111111111111'},s,m.webhook_id),'news-message-or-publisher-mismatch');
});
test('monitor/convoy audits reject stale or duplicate bot messages while omitting all bodies from output',()=>{
 const bot='123456789123456789';
 const monitor={author:{id:bot},content:'👑 **Kings Systems — Live Monitor**\n**Overall Status:** `UNHEALTHY`\n**Production Readiness:** `UNHEALTHY`\n**Automation Coverage:** 31/32\n🕒 **Last Check:** <t:'+Math.floor((now-600000)/1000)+':F>'};
 assert.equal(a.verifyMonitor([monitor],bot,now),null);
 assert.equal(a.verifyMonitor([{...monitor,content:monitor.content.replace('👑','<:Kings_Logistics_Logo:1545254529648431124>')}],bot,now),null);
 assert.equal(a.verifyMonitor([monitor,monitor],bot,now),'monitor-duplicate-visible');
 const convoy={author:{id:bot},content:'👑 **Kings Logistics | Convoy Overview**\nLatest Kings Convoy Center snapshot <t:'+Math.floor((now-600000)/1000)+':R>\nConvoy Planning\nSystem Overview'};
 assert.equal(a.verifyConvoyOverview([convoy],bot,now),null);
 assert.equal(a.verifyConvoyOverview([{...convoy,content:convoy.content.replace('👑','<:Kings_Logistics_Logo:1545254529648431124>')}],bot,now),null);
 assert.equal(a.verifyConvoyOverview([convoy,convoy],bot,now),'convoy-overview-duplicate-visible');
});
test('publisher-observed IDs allow direct lookup for updated messages older than latest 100',()=>{
 assert.equal(a.MONITOR_FIXED_MESSAGE_ID,'1551779478269599746');
 assert.equal(a.CONVOY_FIXED_MESSAGE_ID,'1550990101838954508');
 const code=fs.readFileSync(path.join(__dirname,'../discord-publication-content-audit.js'),'utf8');
 assert.match(code,/ownedFixedAndRecent\(monitorId,MONITOR_FIXED_MESSAGE_ID/);
 assert.match(code,/ownedFixedAndRecent\(CONVOY_CHANNEL,CONVOY_FIXED_MESSAGE_ID/);
 assert.match(code,/recent\.filter\(m=>String\(m\?\.id\|\|''\)!==String\(fixed\.id\)\)/);
});
test('webhook URLs are validated and never logged; audit uses GET only',()=>{
 assert.equal(a.webhookIdentity('https://discord.com/api/webhooks/123456789123456789/secrettoken'),'123456789123456789');
 assert.equal(a.webhookUrl('https://discord.com/api/webhooks/123456789123456789/secrettoken','123456789123456788'),'https://discord.com/api/webhooks/123456789123456789/secrettoken/messages/123456789123456788');
 assert.equal(a.webhookUrl('https://malicious.example/api/webhooks/123456789123456789/secrettoken','123456789123456788'),null);
 const code=fs.readFileSync(path.join(__dirname,'../discord-publication-content-audit.js'),'utf8');
 assert.doesNotMatch(code,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.doesNotMatch(code,/console\.log\([^\n]*message\.content/);
 assert.match(code,/if\(verified!==total\)throw/);
});
