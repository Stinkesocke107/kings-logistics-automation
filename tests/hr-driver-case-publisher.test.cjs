'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {publishPrivateHrCasePages,validatePrivatePages}=
  require('../hr-driver-case-publisher');

const GUILD='1114967437788577792';
const REPORT='1777777777777777888',DECISIONS='1777777777777777778';
const OWNER='199999999999999999',MANAGER='188888888888888888';
const BOT='199999999999999998',HR_ROLE='166666666666666666';
const roles=[
  {id:GUILD,name:'everyone',permissions:'0'},
  {id:HR_ROLE,name:'HR Management',permissions:'0'},
  {id:'166666666666666668',name:'Kings Systems',permissions:'0',tags:{bot_id:BOT}}
];
const members=[
  {user:{id:OWNER,bot:false},roles:[]},
  {user:{id:MANAGER,bot:false},roles:[HR_ROLE]},
  {user:{id:BOT,bot:true},roles:['166666666666666668']}
];
const channel={
  id:REPORT,guild_id:GUILD,type:0,
  permission_overwrites:[
    {id:GUILD,type:0,deny:'1024',allow:'0'},
    {id:HR_ROLE,type:0,deny:'0',allow:'1024'},
    {id:'166666666666666668',type:0,deny:'0',allow:'1024'}
  ]
};
const page=(i,total)=>Object.freeze({
  content:'👑 Kings HR Driver Case View | '+i+'/'+total+'\n'+
    '🔒 PRIVATE HR/Management ONLY\n'+
    (i>1?'• 123456789012345678 • approved-return • HR ticket ID: 1777777777777777999':
      'Current Kings Drivers: **74** • No formal HR decision is not a rejection.')
});
const context=()=>({
  pages:[page(1,2),page(2,2)],
  token:'private-test-token',channelId:REPORT,sourceChannelId:DECISIONS,
  guildId:GUILD,roles,members,ownerId:OWNER,botId:BOT
});
function mockTransport(existing=[],selectedChannel=channel){
  const calls=[];
  const transport=async(url,opts)=>{
    const p=new URL(url).pathname.replace(/^\/api\/v10/,'')+
      new URL(url).search;
    calls.push({path:p,method:opts.method,body:opts.body?JSON.parse(opts.body):null});
    let body;
    if(opts.method==='GET'&&p==='/channels/'+REPORT)body=selectedChannel;
    else if(opts.method==='GET'&&p==='/channels/'+REPORT+'/messages?limit=100')body=existing;
    else if(opts.method==='POST'&&p==='/channels/'+REPORT+'/messages')
      body={id:'1777777777777777991'};
    else if(opts.method==='PATCH'&&p.startsWith('/channels/'+REPORT+'/messages/'))
      body={id:p.split('/').at(-1)};
    else throw Error('Unsafe/unknown mock Discord method/endpoint');
    return new Response(JSON.stringify(body),{status:200});
  };
  return {calls,transport};
}

test('manual opt-in publisher creates only private HR report pages, suppresses pings and never changes roles',async()=>{
  const mock=mockTransport();
  const out=await publishPrivateHrCasePages({...context(),transport:mock.transport});
  assert.deepEqual({...out},{created:2,updated:0,archived:0,pageCount:2});
  assert.deepEqual(mock.calls.map(c=>c.method),['GET','GET','POST','POST']);
  assert.ok(mock.calls.every(c=>c.path.startsWith('/channels/'+REPORT)));
  const sends=mock.calls.filter(c=>c.method==='POST');
  assert.ok(sends.every(c=>c.body.allowed_mentions.parse.length===0&&c.body.flags===4));
  assert.ok(!mock.calls.some(c=>['DELETE','PUT'].includes(c.method)));
});

test('existing verified bot-owned pages are patched, not duplicated',async()=>{
  const old=[
    {id:'1777777777777777981',author:{id:BOT},content:page(1,2).content.replace('74','73')},
    {id:'1777777777777777982',author:{id:BOT},content:page(2,2).content}
  ];
  const mock=mockTransport(old);
  const out=await publishPrivateHrCasePages({...context(),transport:mock.transport});
  assert.equal(out.created,0);
  assert.equal(out.updated,1);
  assert.equal(out.archived,0);
  assert.equal(mock.calls.filter(c=>c.method==='PATCH').length,1);
  assert.equal(mock.calls.filter(c=>c.method==='POST').length,0);
});

test('resolved private cases are scrubbed from older bot-owned pages, never deleted',async()=>{
  const old=[
    {id:'1777777777777777981',author:{id:BOT},content:page(1,2).content},
    {id:'1777777777777777982',author:{id:BOT},content:page(2,2).content}
  ];
  const mock=mockTransport(old);
  const now={...context(),pages:[page(1,1)]};
  const result=await publishPrivateHrCasePages({...now,transport:mock.transport});
  assert.deepEqual({...result},{created:0,updated:1,archived:1,pageCount:1});
  const scrub=mock.calls.find(c=>c.method==='PATCH'&&c.path.endsWith('7982'));
  assert.ok(scrub);
  assert.ok(scrub.body.content.includes('[archived]'));
  assert.ok(!scrub.body.content.includes('123456789012345678'));
  assert.ok(!mock.calls.some(c=>c.method==='DELETE'));
});

test('untrusted actor and duplicate bot pages block all HR case publication',async()=>{
  const malicious=[
    {id:'1777777777777777981',author:{id:MANAGER},content:page(1,2).content}
  ];
  for(const existing of [malicious,[
    {id:'1777777777777777981',author:{id:BOT},content:page(1,2).content},
    {id:'1777777777777777982',author:{id:BOT},content:page(1,2).content}
  ]]){
    const mock=mockTransport(existing);
    await assert.rejects(publishPrivateHrCasePages({
      ...context(),transport:mock.transport
    }),/Untrusted or duplicate/);
    assert.ok(mock.calls.every(c=>c.method==='GET'));
  }
});

test('public or badly configured HR case channel blocks before reading or posting sensitive pages',async()=>{
  const bad={
    ...channel,
    permission_overwrites:[{id:GUILD,type:0,deny:'0',allow:'1024'}]
  };
  const mock=mockTransport([],bad);
  await assert.rejects(publishPrivateHrCasePages({
    ...context(),transport:mock.transport
  }),/deny View Channel/);
  assert.deepEqual(mock.calls.map(c=>c.method),['GET']);
  const empty=mockTransport();
  await assert.rejects(publishPrivateHrCasePages({
    ...context(),channelId:DECISIONS,transport:empty.transport
  }),/not authorized/);
  assert.equal(empty.calls.length,0);
});

test('incomplete history and invalid page lengths fail closed with no private writes',async()=>{
  const full=Array.from({length:100},(_,i)=>({
    id:String(1777777777777777000n+BigInt(i)),
    author:{id:BOT},content:'older'
  }));
  const mock=mockTransport(full);
  await assert.rejects(publishPrivateHrCasePages({
    ...context(),transport:mock.transport
  }),/history incomplete/);
  assert.ok(mock.calls.every(c=>c.method==='GET'));
  assert.throws(()=>validatePrivatePages([{content:'short'}]),/incomplete or unsafe/);
});

test('manual workflow input is the only way to enable private HR case report writes',()=>{
  const root=path.resolve(__dirname,'..');
  const workflow=fs.readFileSync(path.join(root,'.github','workflows','driver-register-onboarding.yml'),'utf8');
  const audit=fs.readFileSync(path.join(root,'hr-driver-decision-audit.js'),'utf8');
  assert.match(workflow,/publish_private_hr_case_view:/);
  assert.match(workflow,/default: false/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/inputs\.publish_private_hr_case_view == true/);
  assert.match(audit,/KINGS_HR_CASE_VIEW_PUBLISH==='confirmed'/);
  assert.match(audit,/publishPrivateHrCasePages\(/);
  assert.doesNotMatch(audit,/console\.log\([^\n]*(?:discordId|ticketId|originalKingsJoinedAt)/);
});
