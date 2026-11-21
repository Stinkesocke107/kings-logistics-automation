'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateSecondaryMapFrame}=require('../map-source-coverage.js');
const NOW=Date.parse('2026-11-21T02:00:00Z');
const servers=[{mapId:45,game:'ATS',name:'ATS Server',reportedPlayers:2},
  {mapId:2,game:'ETS2',name:'ETS2 Server',reportedPlayers:1}];
const example=()=>({source:'verified-live-map',observedAt:'2026-11-21T01:59:30Z',
  complete:true,servers:[
    {mapId:45,complete:true,players:[
      {MpId:1001,VtcId:64284,Name:'Kings Member',X:1,Y:2},
      {MpId:1002,VtcId:0,Name:'Visitor',X:2,Y:3}]},
    {mapId:2,complete:true,players:[
      {MpId:1003,VtcId:64284,Name:'Kings VTC-only',X:4,Y:5}]}]});
test('secondary source needs full official coverage and includes VTC-only Kings members',()=>{
 const found=validateSecondaryMapFrame(example(),servers,NOW);
 assert.equal(found.serverCoverage.checked,2);
 assert.equal(found.kingsPlayers.length,2);
 assert.deepEqual(found.kingsPlayers.map(p=>p.tmpId),[1001,1003]);
 assert.equal(found.kingsPlayers[1].name,'Kings VTC-only');
});
test('secondary source rejects partial scans, inconsistent populations and duplicates',()=>{
 const broken=example();broken.servers.pop();
 assert.throws(()=>validateSecondaryMapFrame(broken,servers,NOW),/rejected/);
 const altered=example();altered.servers[0].players.pop();
 assert.throws(()=>validateSecondaryMapFrame(altered,servers,NOW),/rejected/);
 const duplicate=example();duplicate.servers[1].players[0].MpId=1001;
 assert.throws(()=>validateSecondaryMapFrame(duplicate,servers,NOW),/duplicate player/);
});
test('secondary source rejects stale, future and unverified source frames',()=>{
 for(const observedAt of ['2026-11-20T02:00:00Z','2026-11-21T02:05:00Z','invalid']){
   assert.throws(()=>validateSecondaryMapFrame({...example(),observedAt},servers,NOW),/rejected/);
 }
 assert.throws(()=>validateSecondaryMapFrame({...example(),complete:false},servers,NOW),/rejected/);
 assert.throws(()=>validateSecondaryMapFrame(example(),[],NOW),/rejected/);
});
