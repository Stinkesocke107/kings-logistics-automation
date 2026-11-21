'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const {fetchOfficialMembership,parseOfficialMembership}=require('../truckersmp-official-live.js');

test('independent official Kings VTC membership survives an unrelated server-directory outage',async()=>{
  const urls=[];
  const membership=await fetchOfficialMembership(async(url)=>{
    urls.push(url);
    return new Response(JSON.stringify({error:false,response:{
      members:Array.from({length:110},(_,i)=>({user_id:10000+i}))
    }}),{status:200});
  });
  assert.equal(membership.vtcMemberCount,110);
  assert.equal(membership.kingsOnline,null);
  assert.equal(membership.totalAllPlayers,undefined);
  assert.equal(urls.length,1);
  assert.match(urls[0],/\/vtc\/64284\/members$/);
  assert.throws(()=>parseOfficialMembership({error:true,response:{members:[]}}),/unavailable or invalid/);
});

test('VTC-only verified count is displayed in outage without inventing online players',()=>{
  const s=sandbox('live-outage-notice.js',{files:{
    'data/live-tracker-snapshot.json':JSON.stringify({updatedAt:'2026-11-18T00:00:00Z'})
  }});
  const membership=parseOfficialMembership({error:false,response:{
    members:Array.from({length:110},()=>({}))
  }});
  const embed=s.run('outageEmbed(SETTINGS[0],readSafeState(SETTINGS[0].file),'+JSON.stringify(membership)+')');
  assert.equal(embed.fields.length,3);
  assert.match(embed.fields[1].value,/Unavailable — not zero/);
  assert.match(embed.fields[2].value,/110 registered VTC members/);
  assert.doesNotMatch(JSON.stringify(embed),/undefined players|110 Currently Online/);
});
