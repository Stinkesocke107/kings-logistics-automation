'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');
const GUILD='1114967437788577792',CHANNEL='900000000000000005';
const OWNER='999000000000000001',APPROVER='999000000000000002';
const OUTSIDER='999000000000000003',HR_ROLE='170000000000000002';
const DRIVER_ROLE='1204836048845410405';
const OLD='900000000000000050',NEW='900000000000000051';
const JOINED='2026-09-01T12:00:00.000Z',TMP=42;
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function setup({author=APPROVER,roles=[HR_ROLE],edited=false,webhook=false,failRoles=false,command='!probation complete 42'}={}){
  const calls=[];
  const message={
    id:NEW,author:{id:author,bot:false},
    content:command,edited_timestamp:edited?'2026-11-26T17:00:00Z':null,
    webhook_id:webhook?'999000000000000007':null
  };
  const transport=async(url,options={})=>{
    const pathname=new URL(url).pathname.replace(/^\/api\/v10/,'');
    const query=new URL(url).search;
    const method=String(options.method||'GET').toUpperCase();
    calls.push({pathname,query,method});
    if(pathname==='/channels/'+CHANNEL+'/messages'&&query==='?limit=100')return json([message]);
    if(pathname==='/guilds/'+GUILD)return json({id:GUILD,owner_id:OWNER});
    if(pathname==='/guilds/'+GUILD+'/roles')
      return failRoles?new Response('PRIVATE_ERROR_SOURCE',{status:503}):
        json([{id:HR_ROLE,name:'HR Management'},{id:DRIVER_ROLE,name:'Kings Driver'}]);
    if(pathname==='/guilds/'+GUILD+'/members/'+author)
      return json({user:{id:author,bot:false},roles});
    if(pathname==='/channels/'+CHANNEL+'/messages'&&method==='POST')
      return json({id:'999000000000000099'});
    throw Error('Unexpected synthetic HR route: '+pathname+query);
  };
  const s=sandbox('hr-probation.js',{fetch:transport});
  const key=s.run("membershipKey("+TMP+","+JSON.stringify(JOINED)+")");
  const driver={drivers:[{tmpId:TMP,current:true,username:'SYNTHETIC_HR_DRIVER',joinDate:JOINED}]};
  const hr={version:1,initializedAt:JOINED,updatedAt:JOINED,
    lastProcessedMessageId:OLD,reviews:[{
      key,tmpId:TMP,username:'SYNTHETIC_HR_DRIVER',joinedAt:JOINED,
      openedAt:JOINED,status:'open',dueAt:null,completedAt:null,
      completedByDiscordUserId:null,updatedAt:JOINED,
      updatedByDiscordUserId:null
    }]
  };
  s.run('var TEST_DRIVER='+JSON.stringify(driver)+'; var TEST_HR='+JSON.stringify(hr)+';');
  return {s,calls,execute:()=>s.run('processCommands({id:'+JSON.stringify(CHANNEL)+'},TEST_DRIVER,TEST_HR)'),
    status:()=>s.run('TEST_HR.reviews[0].status'),
    cursor:()=>s.run('TEST_HR.lastProcessedMessageId')};
}
test('real-guild-approved HR Manager human command changes internal review and writes protected cursor',async()=>{
  const t=setup();
  assert.equal(await t.execute(),1);
  assert.equal(t.status(),'completed');
  assert.equal(t.cursor(),NEW);
  assert.equal(t.calls.filter(x=>x.method==='POST').length,1);
  assert.equal(t.calls.filter(x=>x.pathname==='/guilds/'+GUILD+'/members/'+APPROVER).length,1);
  const encrypted=JSON.parse(t.s.files.get('data/hr-probation.json'));
  assert.equal(encrypted.encrypted,true);
  assert.equal(encrypted.ciphertext.includes('SYNTHETIC_HR_DRIVER'),false);
});
test('non-HR staff cannot complete Probation even if they can post into leadership channel',async()=>{
  const t=setup({author:OUTSIDER,roles:[DRIVER_ROLE]});
  assert.equal(await t.execute(),0);
  assert.equal(t.status(),'open');
  assert.equal(t.cursor(),NEW,'unauthorized command is not retroactively approved');
  assert.equal(t.calls.filter(x=>x.method==='POST').length,0);
});
test('edited commands and webhook impersonation never alter a protected HR review',async()=>{
  for(const opts of [{edited:true},{webhook:true}]){
    const t=setup(opts);
    assert.equal(await t.execute(),0);
    assert.equal(t.status(),'open');
    assert.equal(t.calls.filter(x=>x.method==='POST').length,0);
    assert.equal(t.calls.filter(x=>x.pathname==='/guilds/'+GUILD).length,0);
  }
});
test('missing HR role authority prevents both state changes and cursor writes',async()=>{
  const t=setup({failRoles:true});
  await assert.rejects(t.execute(),/Kings HR Discord request failed/);
  assert.equal(t.status(),'open');
  assert.equal(t.cursor(),OLD);
  assert.equal(t.s.files.has('data/hr-probation.json'),false);
  assert.equal(t.calls.filter(x=>x.method==='POST').length,0);
});
test('HR Probation only checks trusted guild membership, never mutates Discord roles',()=>{
  const s=fs.readFileSync(path.join(__dirname,'../hr-probation.js'),'utf8');
  assert.match(s,/authorizedHrApprover/);
  assert.match(s,/authorizedHrCommandActors\(fresh\)/);
  assert.match(s,/\/guilds\/\$\{DISCORD_GUILD_ID\}\/members\/\$\{actor\}/);
  assert.match(s,/actorAllowed\.get/);
  assert.doesNotMatch(s,/\/guilds\/\$\{DISCORD_GUILD_ID\}\/members\/\$\{actor\}.*method:\s*'PATCH'/);
});
