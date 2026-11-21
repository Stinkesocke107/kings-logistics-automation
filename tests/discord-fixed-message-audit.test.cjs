'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');

const id='1559442670441730079';
const webhook='https://discord.com/api/webhooks/123456789012345678/fake-secret?wait=true';
const botId='1404524559214051499';
const webhookId='123456789012345678';
const body={id,embeds:[{title:'Kings fixed status',fields:[
  {name:'Live',value:'VTC Drivers **111** • Online **Unavailable**'},
  {name:'🗂️ Kings Driver Registration — HR Review',value:'Active Discord Kings Drivers registered **74/74** • Needs HR registration review **0**'}
]}]};
const response=(url='',payload=body)=>{
  if(url.endsWith('/users/@me'))
    return new Response(JSON.stringify({id:botId}),{status:200});
  const channel=url.match(/\/channels\/(\d+)\/messages\//)?.[1] || '123456789012345678';
  const message={
    ...payload,
    channel_id:payload.channel_id || channel,
    author:payload.author || {id:botId},
    ...(url.includes('/webhooks/')?{webhook_id:payload.webhook_id || webhookId}:{})
  };
  return new Response(JSON.stringify(message),{status:200,headers:{'content-type':'application/json'}});
};
function setup(fetcher=async(url)=>response(url),options={}){
 const files={
  'data/live-tracker-snapshot.json':JSON.stringify({discordMessageId:id}),
  'data/statistics.json':JSON.stringify({messageId:id}),
  'data/central-overview.json':JSON.stringify({messageId:id}),
  'data/driver-management-summary.json':JSON.stringify({currentDrivers:111,onlineNow:null,onlineObservationStatus:'unavailable',updatedAt:new Date().toISOString()}),
  'data/driver-loyalty-roles-summary.json':JSON.stringify({
    source:'management-private-kings-date-register',registrationChannelActive:true,
    updatedAt:new Date().toISOString(),currentDrivers:74,registeredKingsDates:74,unregisteredDrivers:0,
    identitySourceCoverage:{status:'complete',activeDrivers:74,registered:74,missing:0,platformLinksPresent:74,authority:'management-approved-private-discord'}
  }),
  'data/leadership-dashboard-state.json':JSON.stringify({messageIds:{
    driver:id,hr:id,staff:id,event:id,management:id
  }}),
  ...options.files
 };
 const env={
  DISCORD_BOT_TOKEN:'read-only-test-token',
  DISCORD_WEBHOOK_URL:webhook,
  STATS_DISCORD_WEBHOOK_URL:webhook,
  CENTRAL_OVERVIEW_WEBHOOK_URL:webhook,
  ...options.env
 };
 return sandbox('discord-fixed-message-audit.js',{files,env,fetch:fetcher});
}

test('fixed message audit checks exactly 8 existing Discord messages via GET only',async()=>{
 const s=setup(async(_url,request)=>{
  assert.equal(request.method,'GET');
  return response(_url);
 });
 const result=await s.run('main()');
 assert.equal(result.length,8);
 assert.ok(result.every(x=>x.status==='VERIFIED'));
 assert.deepEqual(s.calls.map(c=>c.options.method),Array(9).fill('GET'));
 assert.equal(s.calls.filter(c=>c.url.endsWith('/users/@me')).length,1);
 assert.equal(s.calls.filter(c=>c.url.includes('/channels/')).length,5);
 assert.equal(s.calls.filter(c=>c.url.includes('/webhooks/')).length,3);
 assert.ok(s.calls.some(c=>c.url.includes('/messages/'+id)));
});

test('missing stored fixed message ID and no token fail closed without Discord write',async()=>{
 const s=setup(async()=>{throw Error('Network must never be invoked for misconfigured targets');},{
  files:{'data/live-tracker-snapshot.json':'{}',
         'data/statistics.json':'{}',
         'data/central-overview.json':'{}',
         'data/leadership-dashboard-state.json':'{}'},
  env:{DISCORD_WEBHOOK_URL:'',STATS_DISCORD_WEBHOOK_URL:'',CENTRAL_OVERVIEW_WEBHOOK_URL:''}
 });
 await assert.rejects(s.run('main()'),/could not be independently verified/);
 assert.equal(s.calls.length,0);
});

test('404 and missing embeds are audit failures and do not trigger POST/PATCH/DELETE',async()=>{
 const s=setup(async(_url,request)=>{
  assert.equal(request.method,'GET');
  if(_url.endsWith('/users/@me'))return response(_url);
  if(_url.includes('/webhooks/'))return new Response('missing',{status:404});
  return response(_url,{id,embeds:[]});
 });
 await assert.rejects(s.run('main()'),/could not be independently verified/);
 assert.equal(s.calls.length,9);
 assert.ok(s.calls.every(x=>x.options.method==='GET'));
});

test('webhook URLs are allowlisted to Discord HTTPS and fixed message IDs',()=>{
 const s=setup();
 assert.equal(s.run('webhookMessageUrl("http://discord.com/api/webhooks/123456789012345678/secret",'+JSON.stringify(id)+')'),null);
 assert.equal(s.run('webhookMessageUrl("https://evil.example/api/webhooks/123456789012345678/secret",'+JSON.stringify(id)+')'),null);
 assert.equal(s.run('webhookMessageUrl("https://discord.com.evil.example/api/webhooks/123456789012345678/secret",'+JSON.stringify(id)+')'),null);
 const target=s.run('webhookMessageUrl('+JSON.stringify(webhook)+','+JSON.stringify(id)+')');
 assert.ok(target.endsWith('/messages/'+id));
 assert.ok(!target.includes('wait=true'));
});

test('audit source cannot write to Discord or persist private message content',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','discord-fixed-message-audit.js'),'utf8');
 assert.doesNotMatch(source,/method:\s*['"](?:POST|PATCH|DELETE)['"]/);
 assert.doesNotMatch(source,/writeFileSync\(|appendFileSync\(/);
 assert.doesNotMatch(source,/console\.log\([^\n]*(?:target\.url|JSON\.stringify\(message|message\.embeds)/);
});

test('Driver and Management audit rejects visible stale online values even with a readable embed',async()=>{
  const bad={id,embeds:[{title:'Kings fixed status',fields:[{name:'Live',value:'VTC Drivers **111** • Online **9**'}]}]};
  const s=setup(async(url,options)=>{
    assert.equal(options.method,'GET');
    if(url.includes('/channels/'))return response(url,bad);
    return response(url);
  });
  const result=await assert.rejects(s.run('main()'),/could not be independently verified/);
  assert.equal(s.calls.length,9);
  assert.ok(s.calls.every(x=>x.options.method==='GET'));
});

test('aggregate online evidence accepts verified zero, never invents a zero on an outage',()=>{
  const s=setup();
  const at=Date.now();
  const source={currentDrivers:111,updatedAt:new Date(at).toISOString(),onlineObservationStatus:'verified-live',onlineNow:0};
  assert.equal(s.run('expectedDriverObservation('+JSON.stringify(source)+','+at+')'),'0');
  assert.equal(s.run('expectedDriverObservation('+JSON.stringify({...source,onlineObservationStatus:'unavailable',onlineNow:9})+','+at+')'),'Unavailable');
  assert.equal(s.run('expectedDriverObservation('+JSON.stringify({...source,updatedAt:'2026-11-18T16:00:21Z',onlineNow:9})+','+at+')'),'Unavailable');
});


test('direct HR audit confirms the displayed fixed message has verified 74/74 registrations',async()=>{
  const s=setup();
  const result=await s.run('main()');
  assert.equal(result.find(x=>x.label==='HR Leadership').status,'VERIFIED');
  assert.ok(s.calls.every(x=>x.options.method==='GET'));
});

test('direct HR audit rejects a stale or mismatched Driver registration count without posting',async()=>{
  const bad={id,embeds:[{title:'Kings fixed status',fields:[
    {name:'Live',value:'VTC Drivers **111** • Online **Unavailable**'},
    {name:'🗂️ Kings Driver Registration — HR Review',value:
      'Active Discord Kings Drivers registered **73/74** • Needs HR registration review **1**'}
  ]}]};
  const s=setup(async(url,opts)=>{
    assert.equal(opts.method,'GET');
    return response(url,url.includes('/channels/')&&url.includes('/messages/')?bad:body);
  });
  await assert.rejects(s.run('main()'),/could not be independently verified/);
  assert.equal(s.calls.length,9);
  assert.ok(s.calls.every(x=>x.options.method==='GET'));
});

test('HR direct audit expects explicit unavailable status when authoritative source is stale',()=>{
  const s=setup(undefined,{
    files:{'data/driver-loyalty-roles-summary.json':JSON.stringify({
      source:'management-private-kings-date-register',registrationChannelActive:true,
      updatedAt:'2026-01-01T00:00:00Z',
      currentDrivers:74,registeredKingsDates:74,unregisteredDrivers:0,
      identitySourceCoverage:{status:'complete',activeDrivers:74,registered:74,
        missing:0,authority:'management-approved-private-discord'}
    })}
  });
  assert.equal(s.run('hrEmbeddedDataMatches({key:"hr"},'+JSON.stringify(body)+')'),false);
  const correct={id,embeds:[{title:'Kings HR Leadership Dashboard',fields:[{
    name:'🗂️ Kings Driver Registration — HR Review',value:'Verified Kings Driver registration **Unavailable / stale**.'
  }]}]};
  assert.equal(s.run('hrEmbeddedDataMatches({key:"hr"},'+JSON.stringify(correct)+')'),true);
});


test('fixed message identities reject swapped stored ID, wrong webhook, bot or channel',()=>{
 const s=setup();
 const msgId=id,channel='1551675577226887229';
 const target={ownerType:'bot',expectedMessageId:msgId,expectedChannelId:channel};
 const valid={id:msgId,channel_id:channel,author:{id:botId}};
 assert.equal(s.run('verifyMessageIdentity('+JSON.stringify(target)+','+JSON.stringify(valid)+','+JSON.stringify(botId)+')'),null);
 assert.equal(s.run('verifyMessageIdentity('+JSON.stringify(target)+','+JSON.stringify({...valid,id:'1999999999999999999'})+','+JSON.stringify(botId)+')'),'fixed-message-id-mismatch');
 assert.equal(s.run('verifyMessageIdentity('+JSON.stringify(target)+','+JSON.stringify({...valid,channel_id:'1999999999999999999'})+','+JSON.stringify(botId)+')'),'fixed-leadership-channel-mismatch');
 assert.equal(s.run('verifyMessageIdentity('+JSON.stringify(target)+','+JSON.stringify({...valid,author:{id:'1999999999999999999'}})+','+JSON.stringify(botId)+')'),'fixed-bot-owner-mismatch');
 const webTarget={ownerType:'webhook',expectedMessageId:msgId,expectedWebhookId:webhookId};
 const msg={id:msgId,webhook_id:'1999999999999999999'};
 assert.equal(s.run('verifyMessageIdentity('+JSON.stringify(webTarget)+','+JSON.stringify(msg)+',null)'),'fixed-webhook-owner-mismatch');
 assert.equal(s.run('verifyMessageIdentity('+JSON.stringify(webTarget)+','+JSON.stringify({...msg,webhook_id:webhookId})+',null)'),null);
});

test('bot identity HTTP failure fails closed even when all embeds are readable',async()=>{
 const s=setup(async(url)=>{
   if(url.endsWith('/users/@me')) return new Response('{}',{status:403});
   return response(url);
 });
 await assert.rejects(s.run('main()'),/could not be independently verified/);
 assert.equal(s.calls.length,9);
 assert.ok(s.calls.every(x=>x.options.method==='GET'));
});
