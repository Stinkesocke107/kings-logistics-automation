'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {verifyHistorical,inspectRecent}=require('../discord-public-convoy-content-audit');
const bot='1404524559214051499',channel='1351613882791366838',id='1555581610110230528';
const saved={eventId:35810,discordMessageId:id,discordChannelId:channel,discordBotId:bot};
const content='📣 **Kings Convoy Announcement — 2 Hours**\n🔗 **Event ID:** \x6035810\x60\n@everyone\nhttps://truckersmp.com/events/35810';
test('historical accepted convoy is tied to actual event, channel and sender',()=>{
 const message={id,channel_id:channel,author:{id:bot},content};
 assert.equal(verifyHistorical(message,saved,bot),null);
 assert.equal(verifyHistorical({...message,author:{id:'111111111111111111'}},saved,bot),'message-owner-or-location-mismatch');
 assert.equal(verifyHistorical({...message,content:content.replace('events/35810','events/99999')},saved,bot),'accepted-event-reference-missing');
});
test('recent public announcements require consistent Event IDs without duplicates',()=>{
 const item={author:{id:bot},content,mention_everyone:true,mention_roles:[]};
 assert.equal(inspectRecent([item],bot).status,'VERIFIED');
 assert.equal(inspectRecent([item,item],bot).reason,'public-event-duplicate-in-window');
 assert.equal(inspectRecent([{...item,content:content.replace('events/35810','events/99999')}],bot).reason,'public-event-id-or-link-mismatch');
 assert.equal(inspectRecent([{...item,mention_roles:['999999999999999999']}],bot).reason,'unexpected-role-mention');
});
test('missing recent publications do not imply a current delivery',()=>{
 assert.equal(inspectRecent([],bot).status,'NO_RECENT');
 assert.equal(inspectRecent(null,bot).status,'UNVERIFIED');
});
test('audit does not write to Discord or log actual message contents',()=>{
 const s=fs.readFileSync(require('node:path').join(__dirname,'../discord-public-convoy-content-audit.js'),'utf8');
 assert.doesNotMatch(s,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.doesNotMatch(s,/console\.log\([^\n]*\.content/);
});
