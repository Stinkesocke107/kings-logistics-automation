'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const {markLinkedTruckersMpPlayers}=require('../tracker-driver-identity.js');

test('Live Tracker membership counts all 110 official Kings VTC accounts regardless of Discord roles',async()=>{
  const roster=Array.from({length:110},(_,i)=>({id:i+1,user_id:i+1000,username:'Driver'+i}));
  const s=sandbox('tracker.js',{fetch:async url=>{
    assert.equal(url,'https://api.truckersmp.com/v2/vtc/64284/members');
    return new Response(JSON.stringify({error:false,response:{members:roster}}),{status:200});
  }});
  const members=await s.run('getMemberCount()');
  assert.equal(members,110);
  assert.equal(s.calls.length,1);
  assert.ok(!s.calls.some(c=>c.url.includes('discord.com')));
});

test('private Discord identity markers never exclude VTC-only online players or change the full VTC count',()=>{
  const players=[
    {name:'Registered',tmpId:1234567,game:'ETS2',server:'Simulation 1',city:'Berlin',isEvent:false},
    {name:'VTC-only',tmpId:7654321,game:'ATS',server:'Simulation 2',city:'Phoenix',isEvent:false}
  ];
  const registered=new Map([['1234567','123456789012345678']]);
  const linked=markLinkedTruckersMpPlayers(players,registered);
  assert.equal(linked.length,2);
  assert.equal(linked[0].identityLinked,true);
  assert.equal(linked[1].identityLinked,false);
  const s=sandbox('tracker.js');
  const snapshot=s.run('buildLiveSnapshot('+JSON.stringify(linked)+',110,null)');
  assert.equal(snapshot.members,110);
  assert.equal(snapshot.online,2);
  assert.equal(snapshot.ets2Online,1);
  assert.equal(snapshot.atsOnline,1);
  const publicEmbeds=s.run('buildDiscordEmbeds('+JSON.stringify(linked)+')');
  const publicText=JSON.stringify(publicEmbeds);
  assert.match(publicText,/2 Kings members currently online/);
  assert.match(publicText,/VTC-only/);
  assert.doesNotMatch(JSON.stringify(snapshot),/VTC-only|Registered|123456789012345678|7654321/);
});

test('Advanced Statistics always reads the full VTC count from the live tracker, not active Discord roles',()=>{
  const snapshot={version:2,updatedAt:new Date().toISOString(),
    members:110,online:2,ets2Online:1,atsOnline:1,
    activeServers:[{game:'ETS2',name:'Simulation 1',online:1},
      {game:'ATS',name:'Simulation 2',online:1}]};
  const s=sandbox('statistics.js',{
    env:{STATS_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789012345678/fake'},
    files:{'data/live-tracker-snapshot.json':JSON.stringify(snapshot)}
  });
  const live=s.run('loadLiveSnapshot()');
  assert.equal(live.members,110);
  const embed=s.run('buildEmbed(loadStatistics(),loadLiveSnapshot(),null)');
  const memberField=embed.fields.find(x=>x.name==='Members');
  assert.ok(memberField);
  assert.match(memberField.value,/110 TruckersMP Members/);
  assert.doesNotMatch(memberField.value,/74|Discord Kings Driver/);
  assert.match(embed.fields.find(x=>x.name==='Current Activity').value,/2 Currently Online/);
});
