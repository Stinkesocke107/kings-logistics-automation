'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.env.DISCORD_BOT_TOKEN='isolated-test-token';
const {CONTRACTS,verifyEmbed,audit,stateIds}=require('../discord-leadership-content-audit');
const botId='1404524559214051499';
const ids=Object.fromEntries(CONTRACTS.map((c,i)=>[c.key,(1500000000000000000n+BigInt(i)).toString()]));
function msg(def,id=ids[def.key]){
 return {
  id,channel_id:def.channel,author:{id:botId},
  embeds:[{title:'👑 '+def.title,description:def.description.join('. '),
   fields:def.fields.map(name=>({name:'👑 '+name,value:'**verified testing value**'})),
   footer:{text:def.footer},timestamp:new Date().toISOString()}]
 };
}
test('all five CURRENT Leadership dashboards have distinct explicit policy contracts',()=>{
 assert.deepEqual(CONTRACTS.map(x=>x.key),['driver','hr','staff','event','management']);
 assert.equal(new Set(CONTRACTS.map(x=>x.channel)).size,5);
 for(const def of CONTRACTS)assert.equal(verifyEmbed(msg(def),def,botId,ids[def.key]),null);
});
test('current source qualification and sections cannot silently disappear',()=>{
 const def=CONTRACTS.find(x=>x.key==='management'),message=msg(def);
 message.embeds[0].description='Drivers and staff count are always the same';
 assert.equal(verifyEmbed(message,def,botId,ids.management),'dashboard-source-qualification-missing');
 message.embeds[0].description=def.description.join('. ');
 message.embeds[0].fields=[];
 assert.equal(verifyEmbed(message,def,botId,ids.management),'dashboard-required-fields-missing');
});
test('invalid timestamp or footer fails without making a missing dashboard look verified',()=>{
 const def=CONTRACTS[0],message=msg(def);
 message.embeds[0].footer.text='Foreign Publisher';
 assert.equal(verifyEmbed(message,def,botId,ids.driver),'dashboard-footer-unexpected');
 message.embeds[0].footer.text=def.footer;
 message.embeds[0].timestamp='n/a';
 assert.equal(verifyEmbed(message,def,botId,ids.driver),'dashboard-source-timestamp-invalid');
});
test('wrong message, channel or bot identity is unverified',()=>{
 const def=CONTRACTS[1],message=msg(def);
 assert.equal(verifyEmbed({...message,id:'1999999999999999999'},def,botId,ids.hr),'message-identity-unverified');
 assert.equal(verifyEmbed({...message,author:{id:'1999999999999999999'}},def,botId,ids.hr),'message-identity-unverified');
 assert.equal(verifyEmbed({...message,channel_id:'1999999999999999999'},def,botId,ids.hr),'message-identity-unverified');
});
test('read-only audit requests only the bot identity and exact five stored message IDs',async()=>{
 const calls=[];
 const transport=async(url,init)=>{
  calls.push({url,method:init.method});
  if(url.endsWith('/users/@me'))return new Response(JSON.stringify({id:botId}),{status:200});
  const def=CONTRACTS.find(d=>url.includes('/channels/'+d.channel+'/messages/'+ids[d.key]));
  return new Response(JSON.stringify(def?msg(def):{}),{status:def?200:404});
 };
 const results=await audit(transport,ids);
 assert.equal(results.length,5);
 assert.ok(results.every(r=>r.status==='VERIFIED'));
 assert.equal(calls.length,6);
 assert.ok(calls.every(c=>c.method==='GET'));
});
test('read errors and bot identity failure stay fail-closed; no repair attempts',async()=>{
 const calls=[];
 const unavailable=async(url,init)=>{
  calls.push(init.method);
  if(url.endsWith('/users/@me'))return new Response(JSON.stringify({id:botId}),{status:200});
  return new Response('{}',{status:404});
 };
 const results=await audit(unavailable,ids);
 assert.equal(results.filter(x=>x.status==='UNVERIFIED').length,5);
 assert.ok(calls.every(x=>x==='GET'));
 await assert.rejects(()=>audit(async()=>new Response('{}',{status:401}),ids),/bot-identity-unverified/);
});
test('a missing state is unavailable rather than a fabricated empty dashboard proof',async()=>{
 let requested=false;
 await assert.rejects(()=>audit(async()=>{requested=true;throw Error('no network expected');},null),/dashboard-state-not-readable/);
 assert.equal(requested,false);
 const missing=stateIds('/nonexistent-kings-test-data-dir');
 assert.equal(missing,null);
});
test('auditor cannot write or log private user data and exposes no message body',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../discord-leadership-content-audit.js'),'utf8');
 assert.doesNotMatch(code,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.doesNotMatch(code,/(?:writeFileSync|appendFileSync|unlinkSync)\(/);
 assert.doesNotMatch(code,/console\.log\([^\n]*(?:message\.embeds|message\.content|message\.author|botId)/);
 const def=CONTRACTS[0],message=msg(def);
 message.embeds[0].description+=' PRIVATE-DRIVER-NAME';
 const reason=verifyEmbed(message,def,botId,ids.driver);
 assert.equal(reason,null);
 assert.ok(!JSON.stringify({key:def.key,status:'VERIFIED',reason}).includes('PRIVATE-DRIVER-NAME'));
});
