'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../scripts/one-time/shl-36859-driver-reminder');
const meet=Date.parse('2026-11-22T00:00:00Z')/1000;
const event={id:36859,meetup_at:'2026-11-22T00:00:00.000Z',start_at:'2026-11-22T01:00:00.000Z',server:'[US] Simulation'};
const source={
 threadId:'1573471889127514252',eventId:'36859',archived:true,status:'Needs Information',
 staffStatus:{status:'Scheduled',roleSource:'guild-member-lookup',matchedRoleIds:['1114967608920395866']},
 validation:{checks:{eventLink:true,eventType:true,responsibleStaff:true,kingsSlotConfirmed:true,imageProof:true},
 parsed:{eventType:'Partner Convoy',kingsSlotImage:{messageId:'1573471889127514252',attachmentId:'1573471987190468700'}}}
};
test('SHL-shaped archived report requires actual human Scheduled role and slot image',()=>{
 assert.equal(H.verifiedSource({threads:[source]}).threadId,source.threadId);
 assert.throws(()=>H.verifiedSource({threads:[{...source,staffStatus:{status:'Ready for Approval'}}]}));
 assert.throws(()=>H.verifiedSource({threads:[{...source,duplicateEventId:true}]}));
 assert.throws(()=>H.verifiedSource({threads:[{...source,validation:{...source.validation,checks:{...source.validation.checks,imageProof:false}}}]}));
 assert.throws(()=>H.verifiedSource({threads:[{...source,eventId:'35810'}]}));
});
test('only official SHL event and strict one-hour window are accepted',()=>{
 assert.equal(H.verifyOfficialEvent(event,meet-1800),meet);
 assert.throws(()=>H.verifyOfficialEvent(event,meet-3700),/not-within/);
 assert.throws(()=>H.verifyOfficialEvent(event,meet+1),/not-within/);
 assert.throws(()=>H.verifyOfficialEvent({...event,meetup_at:'2026-11-22T01:00:00Z'},meet-1800));
 assert.throws(()=>H.verifyOfficialEvent({...event,cancelled:true},meet-1800));
 assert.throws(()=>H.verifyOfficialEvent({...event,id:12345},meet-1800));
});
test('pre-existing one-hour auto or manual announcement for SHL is detected; unrelated 24h reminder not',()=>{
 assert.equal(H.existingOneHourReminder([{content:'🚨 **Kings Driver Convoy Reminder — 1 Hour**\nhttps://truckersmp.com/events/36859'}]),true);
 assert.equal(H.existingOneHourReminder([{content:'Convoy Reminder — 1 Hour\nTruckersMP Event: https://truckersmp.com/events/36859'}]),true);
 assert.equal(H.existingOneHourReminder([{content:'⏰ **Kings Driver Convoy Reminder — 24 Hours**\nhttps://truckersmp.com/events/36859'}]),false);
 assert.equal(H.existingOneHourReminder([{content:'🚨 **Kings Driver Convoy Reminder — 1 Hour**\nhttps://truckersmp.com/events/36903'}]),false);
});
test('reminder stays Kings branded, role-scoped, idempotent marker and slot picture required',()=>{
 const b=H.body(meet,'https://cdn.discordapp.com/attachments/123/456/slot.png',event);
 assert.ok(b.content.includes('Kings Driver Convoy Reminder — 1 Hour'));
 assert.ok(b.content.includes('https://truckersmp.com/events/36859'));
 assert.ok(b.content.includes('<@&1476774746480709675>'));
 assert.ok(b.content.includes('<t:'+meet+':F>'));
 assert.deepEqual(b.allowed_mentions,{parse:[],roles:['1476774746480709675']});
 assert.equal(b.embeds[0].image.url,'https://cdn.discordapp.com/attachments/123/456/slot.png');
 assert.ok(!b.content.includes('@everyone'));
 assert.throws(()=>H.body(meet,'https://evil.invalid/image.png',event));
});
