'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { sandbox } = require('./sandbox.cjs');

test('Live Tracker skips only officially confirmed zero-player servers, never unknown', async () => {
  const s=sandbox('tracker.js');
  s.run([
    "getCities=async()=>[{name:'City',x:0,y:0}];",
    "getServers=async()=>[",
    "{name:'Empty',game:'ATS',mapId:1,reportedPlayers:0,isEvent:false},",
    "{name:'Unknown',game:'ETS2',mapId:2,reportedPlayers:null,isEvent:false},",
    "{name:'Busy',game:'ETS2',mapId:3,reportedPlayers:20,isEvent:false}",
    "];",
    "var lookedUp=[];",
    "getPlayers=async(server)=>{lookedUp.push(server.name);return server.name==='Busy'?",
    "[{VtcId:64284,MpId:1234567,Name:'Kings',X:0,Y:0}]:[];};"
  ].join('\n'));
  const players=await s.run('getKingsOnline()');
  assert.equal(players.length,1);
  assert.equal(players[0].tmpId,1234567);
  assert.equal(s.run('JSON.stringify(lookedUp)'),JSON.stringify(['Unknown','Busy']));
});

test('Live Tracker accepts all-zero official servers as verified empty observation', async () => {
  const s=sandbox('tracker.js');
  s.run([
    "getCities=async()=>[];",
    "getServers=async()=>[",
    "{name:'Empty ATS',game:'ATS',mapId:1,reportedPlayers:0},",
    "{name:'Empty ETS2',game:'ETS2',mapId:2,reportedPlayers:0}",
    "];",
    "var queried=false;",
    "getPlayers=async()=>{queried=true;throw Error('Empty server must not be queried.');};"
  ].join('\n'));
  assert.equal((await s.run('getKingsOnline()')).length,0);
  assert.equal(s.run('queried'),false);
});

test('Live Tracker still fails closed if occupied or unknown server request fails', async () => {
  const s=sandbox('tracker.js');
  s.run([
    "getCities=async()=>[];",
    "getServers=async()=>[",
    "{name:'Empty',game:'ATS',mapId:1,reportedPlayers:0},",
    "{name:'Unknown',game:'ETS2',mapId:2,reportedPlayers:null}",
    "];",
    "getPlayers=async()=>{throw Error('Map provider unavailable.');};"
  ].join('\n'));
  await assert.rejects(s.run('getKingsOnline()'),/Only 1\/2/);
});

test('Official server list preserves missing counts as unknown, zero as zero', async () => {
  const serverList=[
    {name:'Empty',online:true,mapid:1,game:'ETS2',players:0},
    {name:'Missing',online:true,mapid:2,game:'ETS2'},
    {name:'Malformed',online:true,mapid:3,game:'ATS',players:'0'},
    {name:'Busy',online:true,mapid:4,game:'ETS2',players:4}
  ];
  const payload=(x)=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
  const s=sandbox('tracker.js',{fetch:async(url)=>{
    if(url==='https://api.truckersmp.com/v2/servers')return payload({error:false,response:serverList});
    throw Error('Unexpected network URL: '+url);
  }});
  const servers=await s.run('getServers()');
  const byName=new Map(servers.map(z=>[z.name,z.reportedPlayers]));
  assert.equal(byName.get('Empty'),0);
  assert.equal(byName.get('Missing'),null);
  assert.equal(byName.get('Malformed'),null);
  assert.equal(byName.get('Busy'),4);
});

test('Map failure retains aggregate snapshot; unknown maps never count as zero',()=>{
  const src=fs.readFileSync(require('node:path').join(__dirname,'../tracker.js'),'utf8');
  assert.match(src,/throw new Error\(\s*'Only ' \+ successfulServerChecks/);
  assert.match(src,/server\.reportedPlayers === 0/);
  assert.match(src,/Number\.isSafeInteger\(server\.players\)/);
  assert.match(src,/Only after the Discord update succeeds do we save/);
});
