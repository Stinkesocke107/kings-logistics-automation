const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parseOfficialSnapshot,fetchOfficialSnapshot}=require('../truckersmp-official-live');
const {sandbox}=require('./sandbox.cjs');

const now=Date.parse('2026-11-19T00:00:00.000Z');
const roster=n=>({error:false,response:{members:Array.from({length:n},(_,i)=>({id:i+1}))}});
const servers=(rows)=>({error:false,response:rows});
const rows=[
  {online:true,game:'ETS2',players:1800},
  {online:true,game:'ATS',players:200},
  {online:false,game:'ETS2',players:0}
];
const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});

test('TruckersMP official feed reports Kings VTC and all-server population as different quantities',()=>{
 const r=parseOfficialSnapshot(roster(110),servers(rows),now);
 assert.equal(r.source,'truckersmp-official-v2');
 assert.equal(r.vtcMemberCount,110);
 assert.equal(r.activeServers,2);
 assert.equal(r.ets2AllPlayers,1800);
 assert.equal(r.atsAllPlayers,200);
 assert.equal(r.totalAllPlayers,2000);
 assert.equal(r.kingsOnline,null,'Official TMP server population cannot establish Kings Driver online');
 assert.equal(r.observedAt,'2026-11-19T00:00:00.000Z');
});

test('Official TruckersMP server API may return the literal string false for its error flag',()=>{
 const r=parseOfficialSnapshot(roster(110),{error:'false',response:rows},now);
 assert.equal(r.vtcMemberCount,110);
 assert.equal(r.totalAllPlayers,2000);
 assert.equal(r.kingsOnline,null);
 assert.throws(()=>parseOfficialSnapshot(roster(110),{error:'true',response:rows},now));
});

test('Official VTC roster string false remains valid in the joint server snapshot, but string true is rejected',()=>{
 const r=parseOfficialSnapshot({error:'false',response:{members:Array.from({length:110},()=>({}))}},servers(rows),now);
 assert.equal(r.vtcMemberCount,110);
 assert.equal(r.totalAllPlayers,2000);
 assert.equal(r.kingsOnline,null);
 assert.throws(()=>parseOfficialSnapshot(
  {error:'true',response:{members:[]}},servers(rows),now));
});

test('TruckersMP official data rejects incomplete or misleading responses',()=>{
 for(const bad of [
  null,{}, {error:true,response:{members:[]}},
  {error:false,response:{members:null}}, {error:false,response:{members:{}}}
 ])assert.throws(()=>parseOfficialSnapshot(bad,servers(rows),now));
 for(const bad of [
  null,{}, {error:true,response:rows}, {error:false,response:[]},
  servers([{online:true,game:'ETS2',players:-1}]),
  servers([{online:true,game:'ETS2',players:1.3}]),
  servers([{online:true,game:'UNKNOWN',players:20}]),
  servers([{online:1,game:'ETS2',players:1}])
 ])assert.throws(()=>parseOfficialSnapshot(roster(110),bad,now));
});

test('Official TruckersMP secondary fetch accesses only documented TMP v2 URLs',async()=>{
 const calls=[];
 const transport=async(url,init)=>{
  calls.push(url);
  assert.ok(init.signal);
  assert.equal(init.headers.Accept,'application/json');
  if(url==='https://api.truckersmp.com/v2/vtc/64284/members')return json(roster(110));
  if(url==='https://api.truckersmp.com/v2/servers')return json(servers(rows));
  throw new Error('Unexpected provider URL');
 };
 const r=await fetchOfficialSnapshot(transport);
 assert.deepEqual(calls.sort(),[
  'https://api.truckersmp.com/v2/servers',
  'https://api.truckersmp.com/v2/vtc/64284/members'
 ]);
 assert.equal(r.totalAllPlayers,2000);
 assert.equal(r.kingsOnline,null);
});

test('Outage Discord messages show official server totals without inventing Kings Driver presence',async()=>{
 const id='123456789012345678';
 const files={
  'data/live-tracker-snapshot.json':JSON.stringify({discordMessageId:id,online:4,updatedAt:'2026-11-18T10:00:00Z'}),
  'data/statistics.json':JSON.stringify({messageId:id,allTime:{peakOnline:12},sourceSnapshotAt:'2026-11-18T10:00:00Z'}),
  'data/central-overview.json':JSON.stringify({messageId:id})
 };
 const payloads=[];
 const s=sandbox('live-outage-notice.js',{
  files,
  env:{
   TRUCKERSMP_OFFICIAL_FEED_ENABLED:'true',
   DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/tracker',
   STATS_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/stats',
   CENTRAL_OVERVIEW_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/overview'
  },
  fetch:async(url,init)=>{
   if(url==='https://api.truckersmp.com/v2/vtc/64284/members')return json(roster(110));
   if(url==='https://api.truckersmp.com/v2/servers')return json(servers(rows));
   if(url.includes('discord.com')&&init.method==='GET')return json({embeds:[{title:'Old'}]});
   if(url.includes('discord.com')&&init.method==='PATCH'){
    payloads.push(JSON.parse(init.body));
    return new Response(null,{status:204});
   }
   throw new Error('Unexpected URL');
  }
 });
 await s.run('main()');
 assert.equal(payloads.length,3);
 assert.equal(s.calls.filter(x=>x.url.includes('api.truckersmp.com')).length,2,'One official fetch per run, not per Discord message');
 for(const p of payloads){
  assert.deepEqual(p.allowed_mentions,{parse:[]});
  assert.equal(p.content,'');
  const fields=p.embeds[0].fields;
  assert.match(fields[1].value,/Unavailable — not zero/);
  assert.match(fields[2].value,/110 registered VTC members/);
  assert.match(fields[3].name,/ALL TruckersMP players online \(not Kings Drivers\)/);
  assert.match(fields[3].value,/2000 players/);
  assert.match(fields[3].value,/ETS2: \*\*1800\*\*/);
  assert.match(fields[3].value,/ATS: \*\*200\*\*/);
  assert.doesNotMatch(JSON.stringify(p),/Kings Drivers online: \*\*2000/);
 }
 for(const [key,value] of Object.entries(files)) assert.equal(s.files.get(key),value);
});

test('Official server API outage retains prior honest unavailable display without fake numbers',async()=>{
 const id='123456789012345678';
 const files={'data/live-tracker-snapshot.json':JSON.stringify({discordMessageId:id,updatedAt:'2026-11-18T10:00:00Z'})};
 const payloads=[];
 const s=sandbox('live-outage-notice.js',{
  files,
  env:{
   TRUCKERSMP_OFFICIAL_FEED_ENABLED:'true',
   DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/'+id+'/tracker'
  },
  fetch:async(url,init)=>{
   if(url==='https://api.truckersmp.com/v2/vtc/64284/members')return json(roster(110));
   if(url==='https://api.truckersmp.com/v2/servers')return new Response('error',{status:503});
   if(init.method==='GET')return json({embeds:[{title:'Old'}]});
   if(init.method==='PATCH'){payloads.push(JSON.parse(init.body));return new Response(null,{status:204})}
   throw new Error('Unexpected URL');
  }
 });
 await s.run('main()');
 assert.equal(s.process.exitCode,1,'Other required Live Systems displays are missing; cannot claim full fallback delivery');
 assert.equal(payloads.length,1);
 assert.equal(payloads[0].embeds[0].fields.length,3);
 assert.match(payloads[0].embeds[0].fields[1].value,/Unavailable/);
 assert.match(payloads[0].embeds[0].fields[2].value,/110 registered VTC members/);
 assert.doesNotMatch(JSON.stringify(payloads[0]),/undefined players|110 Currently Online/);
 assert.equal(s.files.get('data/live-tracker-snapshot.json'),files['data/live-tracker-snapshot.json']);
});
