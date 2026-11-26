'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {trustedOfficialFallback,trustedVerifiedMap,verifyOfficialFallback}=
  require('../discord-publication-content-audit');
const NOW=Date.parse('2026-11-26T22:58:00.000Z');
const AT=new Date(NOW-45000).toISOString();
const stamp=Math.floor(Date.parse(AT)/1000);
const NAMES=['Live Tracker','Advanced Statistics','Central Overview'];
function official(){
 return {version:1,source:'truckersmp-official-v2',
   sourceMode:'map-independent',updatedAt:AT,vtcMemberCount:110,
   kingsOnline:null,allTruckersMpPlayers:1281,ets2AllPlayers:1239,
   atsAllPlayers:42,activeTruckersMpServers:10};
}
function delivery(){
 return {version:1,mode:'fallback-delivered',
   source:'official-vtc-and-servers',checkedAt:new Date(NOW-30000).toISOString(),
   allDisplaysVerified:true,displaysVerified:[...NAMES],
   livePlayerCountsAvailable:false,
   sourceSnapshotAt:'2026-11-18T16:00:21.037Z'};
}
function embed(label='Live Tracker',o=official()){
 return {embeds:[{title:'👑 Kings '+label+' — Official Data',
   description:'✅ Map-independent Tracker active. No live-map connection is required. Individual Kings Drivers online and live locations cannot be measured by this feed.',
   fields:[
     {name:'Official Tracker data refreshed',value:'<t:'+stamp+':F> (<t:'+stamp+':R>)'},
     {name:'Kings Drivers currently online',value:'**Unavailable — not zero**'},
     {name:'Kings VTC membership (official TruckersMP)',
       value:'**'+o.vtcMemberCount+' registered VTC members** — verified <t:'+stamp+':R>'},
     {name:'ALL TruckersMP players online (not Kings Drivers)',
       value:'**'+o.allTruckersMpPlayers+' players** across '+o.activeTruckersMpServers+
        ' online servers (ETS2: **'+o.ets2AllPlayers+'** · ATS: **'+o.atsAllPlayers+
        '**) — <t:'+stamp+':R>'}
   ],
   footer:{text:'Kings Systems | Official TruckersMP source; Kings player presence unavailable without verified player data.'}}]};
}
test('three synchronized official-source fallback displays are validated without inventing Kings online presence',()=>{
 const o=official(),d=delivery();
 assert.deepEqual(trustedOfficialFallback(o,d,NOW),o);
 for(const label of NAMES)assert.equal(verifyOfficialFallback(embed(label),label,o),null);
 assert.equal(o.kingsOnline,null);
 assert.notEqual(d.sourceSnapshotAt,o.updatedAt);
});
test('read-only audit refuses stale, partial, forged or contradictory source proof',()=>{
 const o=official(),d=delivery();
 const invalid=[
  [{...o,kingsOnline:3},d],
  [{...o,updatedAt:'2026-11-17T20:00:00.000Z'},d],
  [{...o,vtcMemberCount:-1},d],
  [{...o,allTruckersMpPlayers:999},d],
  [{...o,sourceMode:'map-live'},d],
  [o,{...d,mode:'fallback-incomplete'}],
  [o,{...d,allDisplaysVerified:false}],
  [o,{...d,displaysVerified:NAMES.slice(1)}],
  [o,{...d,displaysVerified:[NAMES[0],NAMES[0],NAMES[2]]}],
  [o,{...d,checkedAt:'2026-11-18T16:00:00Z'}],
  [o,{...d,livePlayerCountsAvailable:true}],
  [o,{...d,source:'status-only'}]
 ];
 for(const [value,proof] of invalid)
   assert.equal(trustedOfficialFallback(value,proof,NOW),null);
});
test('actual Discord content must match the official VTC count, global totals and unavailable Kings online field',()=>{
 const o=official();
 const good=embed('Advanced Statistics');
 assert.equal(verifyOfficialFallback(good,'Advanced Statistics',o),null);
 const mutate=fn=>{
   const modified=structuredClone(good);
   fn(modified.embeds[0]);
   return verifyOfficialFallback(modified,'Advanced Statistics',o);
 };
 assert.equal(mutate(e=>{e.fields[1].value='**1281 Kings online**'}),'official-kings-online-unavailable-missing');
 assert.equal(mutate(e=>{e.fields[2].value='**109 registered VTC members**'}),'official-vtc-membership-mismatch');
 assert.equal(mutate(e=>{e.fields[3].value='**1299 players**'}),'official-global-population-mismatch');
 assert.equal(mutate(e=>{e.title='Kings Advanced Statistics — Live Data Unavailable'}),'official-title-missing');
 assert.equal(mutate(e=>{e.description='Latest live statistics'}),'official-source-limits-missing');
 assert.equal(mutate(e=>{e.fields.push(e.fields[1])}),'official-fields-duplicate');
});
test('membership-only fallback never claims unverified global player totals',()=>{
 const o={...official(),allTruckersMpPlayers:null,
   ets2AllPlayers:null,atsAllPlayers:null,activeTruckersMpServers:null};
 const d={...delivery(),source:'official-vtc-only'};
 assert.deepEqual(trustedOfficialFallback(o,d,NOW),o);
 const m=embed('Central Overview',o);
 m.embeds[0].fields.pop();
 assert.equal(verifyOfficialFallback(m,'Central Overview',o),null);
 m.embeds[0].fields.push({name:'ALL TruckersMP players online (not Kings Drivers)',value:'**0 players**'});
 assert.equal(verifyOfficialFallback(m,'Central Overview',o),'unverified-global-online-number-present');
});
test('full map must present consistent fresh snapshot, statistics and delivery proof',()=>{
 const tracker={updatedAt:AT,online:3,members:110};
 const stats={sourceSnapshotAt:AT};
 const d={version:1,mode:'verified-live',source:'verified-map',
   checkedAt:new Date(NOW-10000).toISOString(),
   allDisplaysVerified:true,displaysVerified:[...NAMES],
   livePlayerCountsAvailable:true,sourceSnapshotAt:AT};
 assert.equal(trustedVerifiedMap(d,tracker,stats,NOW),true);
 assert.equal(trustedVerifiedMap({...d,sourceSnapshotAt:'yesterday'},tracker,stats,NOW),false);
 assert.equal(trustedVerifiedMap(d,{...tracker,online:111},stats,NOW),false);
 assert.equal(trustedVerifiedMap(d,tracker,{sourceSnapshotAt:null},NOW),false);
});
