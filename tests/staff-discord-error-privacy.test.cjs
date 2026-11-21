'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');

const GUILD='1114967437788577792';
const CHANNEL='1551675877178474526';
const MESSAGE='1559808918761373737';
const BOT='999999999999999999';
const STRANGER='888888888888888888';
const STAFF='777777777777777777';
const ROLE_IDS=Array.from({length:5},(_,i)=>String(200000000000000001n+BigInt(i)));
const HIERARCHY=['Head Management','Management','Director','Team Lead','Staff'];
const roles=HIERARCHY.map((name,i)=>({name,id:ROLE_IDS[i],position:15-i}));
const members=[{user:{id:STAFF,bot:false},roles:[ROLE_IDS[4]]},
  {user:{id:BOT,bot:true},roles:[]}];
const stored=JSON.stringify({version:1,channelId:CHANNEL,messageId:MESSAGE,updatedAt:'2026-11-20T00:00:00Z'});
const OWN={id:MESSAGE,author:{id:BOT},embeds:[{title:'👔 Kings Staff Leadership — Live Role Overview'}]};
const WRONG={...OWN,author:{id:STRANGER}};
const CHANNEL_DESCRIPTOR={id:CHANNEL,guild_id:GUILD,type:0,name:'staff-leadership'};
const ROOT=path.resolve(__dirname,'..');

function setup({state=stored,existing=OWN,status=200,recent=[OWN],invalidJson=false,mutate}={}){
  const files=state===null?{}:{'data/staff-leadership-live-overview.json':state};
  const transport=async(url,options={})=>{
    const parsed=new URL(url);
    const p=parsed.pathname.replace(/^\/api\/v10/,'')+parsed.search;
    if(p==='/guilds/'+GUILD+'/roles')return new Response(JSON.stringify(roles));
    if(p==='/guilds/'+GUILD+'/members?limit=1000')return new Response(JSON.stringify(members));
    if(p==='/guilds/'+GUILD+'/channels')return new Response(JSON.stringify([CHANNEL_DESCRIPTOR]));
    if(p==='/users/@me')return new Response(JSON.stringify({id:BOT}));
    if(p==='/channels/'+CHANNEL+'/messages/'+MESSAGE&&options.method!=='PATCH'){
      if(invalidJson)return new Response('Private Staff: Sensitive Test Name', {status:200});
      return new Response(JSON.stringify(status===200?existing:{
        message:'Sensitive Test Name, private username',
        content:'PRIVATE TMP/Discord user '+STAFF
      }),{status});
    }
    if(p==='/channels/'+CHANNEL+'/messages?limit=100')return new Response(JSON.stringify(recent));
    if(options.method==='PATCH'&&p==='/channels/'+CHANNEL+'/messages/'+MESSAGE){
      return new Response(JSON.stringify(mutate??{id:MESSAGE}));
    }
    throw Error('Unexpected Staff Discord URL/method in test');
  };
  return sandbox('staff-leadership-live-overview.js',{files,fetch:transport});
}

test('verified existing Staff overview is PATCH-only with same message ID and source-safe counts',async()=>{
  const s=setup();
  await s.run('main()');
  const writes=s.calls.filter(c=>c.options.method!=='GET');
  assert.equal(writes.length,1);
  assert.equal(writes[0].options.method,'PATCH');
  assert.ok(writes[0].url.endsWith('/channels/'+CHANNEL+'/messages/'+MESSAGE));
  const persisted=JSON.parse(s.files.get('data/staff-leadership-live-overview.json'));
  assert.equal(persisted.messageId,MESSAGE);
  assert.equal(persisted.channelId,CHANNEL);
  assert.equal(persisted.totalStaff,1);
  assert.ok(!s.calls.some(c=>c.options.method==='POST'||c.options.method==='DELETE'));
});

test('missing stored Staff dashboard message fails closed on HTTP 404; no duplicate post',async()=>{
  const s=setup({status:404});
  await assert.rejects(s.run('main()'),error=>{
    assert.match(error.message,/Discord API HTTP 404/);
    assert.doesNotMatch(error.message,/Sensitive Test Name|PRIVATE TMP|777777777777777777/);
    return true;
  });
  assert.ok(s.calls.every(c=>!['POST','PATCH','DELETE'].includes(c.options.method)));
  assert.equal(s.files.get('data/staff-leadership-live-overview.json'),stored);
});

test('mismatched Staff dashboard owner or title never gets overwritten',async()=>{
  const s=setup({existing:WRONG});
  await assert.rejects(s.run('main()'),/not bot-owned or has wrong title/);
  assert.ok(s.calls.every(c=>c.options.method==='GET'));
});

test('missing stored state may only adopt exactly one bot-owned existing Staff dashboard',async()=>{
  const s=setup({state:null,recent:[OWN]});
  await s.run('main()');
  assert.equal(s.calls.filter(c=>c.options.method==='PATCH').length,1);
  assert.equal(s.calls.filter(c=>c.options.method==='POST').length,0);
  assert.equal(JSON.parse(s.files.get('data/staff-leadership-live-overview.json')).messageId,MESSAGE);
});

test('unverified first publication, duplicates, or an incomplete 100-message page fail closed',async()=>{
  for(const recent of [[],[OWN,OWN],Array.from({length:100},()=>({id:'another'}))]){
    const s=setup({state:null,recent});
    await assert.rejects(s.run('main()'),/exactly one verified|history not exhaustive/);
    assert.ok(s.calls.every(c=>c.options.method==='GET'));
    assert.equal(s.files.has('data/staff-leadership-live-overview.json'),false);
  }
});

test('corrupt or cross-channel persisted Staff dashboard state is not automatically reset',async()=>{
  for(const state of ['{broken',JSON.stringify({version:1,channelId:'111111111111111111',messageId:MESSAGE})]){
    const s=setup({state});
    await assert.rejects(s.run('main()'),/Corrupt Staff|conflicting Staff/);
    assert.equal(s.files.get('data/staff-leadership-live-overview.json'),state);
    assert.ok(s.calls.every(c=>c.options.method==='GET'));
  }
});

test('Discord JSON parsing and HTTP 500 responses cannot expose names or payload in errors',async()=>{
  const bad=setup({invalidJson:true});
  await assert.rejects(bad.run('main()'),e=>{
    assert.match(e.message,/invalid JSON/);
    assert.doesNotMatch(e.message,/Sensitive Test Name/);
    return true;
  });
  const http=setup({status:500});
  await assert.rejects(http.run('main()'),e=>{
    assert.match(e.message,/HTTP 500/);
    assert.doesNotMatch(e.message,/Sensitive Test Name|PRIVATE TMP/);
    return true;
  });
});

test('Staff Management Discord GET API errors are privacy-redacted too',async()=>{
  const s=sandbox('staff-management.js',{fetch:async()=>new Response(
    JSON.stringify({message:'Private Staff Member Example',tmpId:123456,secret:'do-not-expose'}),
    {status:403}
  )});
  await assert.rejects(s.run("discord('/channels/"+CHANNEL+"')"),e=>{
    assert.match(e.message,/HTTP 403/);
    assert.doesNotMatch(e.message,/Private Staff|tmpId|do-not-expose|1551675877178474526/);
    return true;
  });
});

test('Staff live overview has no message-create or personnel-write path',()=>{
  const src=fs.readFileSync(path.join(ROOT,'staff-leadership-live-overview.js'),'utf8');
  assert.match(src,/if\s*\(!\['GET','PATCH'\]\.includes\(method\)\)/);
  assert.doesNotMatch(src,/method\s*===?\s*['"]POST['"]|\bdiscord\([^,)]*,\s*['"]POST['"]/);
  assert.match(src,/Discord API HTTP/);
  assert.doesNotMatch(src,/result\.slice\(0,400\)/);
  const management=fs.readFileSync(path.join(ROOT,'staff-management.js'),'utf8');
  assert.doesNotMatch(management,/text\.slice\(0,\s*500\)/);
});
