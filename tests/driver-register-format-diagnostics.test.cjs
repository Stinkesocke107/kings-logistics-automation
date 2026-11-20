'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspectRegisterMessages,diagnosticPages,looksLikeWrappedEntry}=
  require('../driver-register-format-diagnostics');
const {review}=require('../driver-tmp-vtc-register-review');

const GUILD='1114967437788577792';
const CHANNEL='1572736232969084948';
const LEADERSHIP='1777777777777777772';
const DRIVER_ROLE='1204836048845410405';
const HR_ROLE='170000000000000001';
const HEAD_HR_ROLE='170000000000000002';
const OWNER='999000000000000001';
const MANAGER='999000000000000002';
const BOT='999000000000000003';
const D1='123456789012345678';
const D2='123456789012345679';
const valid='discord_id: '+D1+'\ntruckersmp_id: 1234567\nkings_join_date: 02.02.2020';
const invalid='discord_id: '+D2+'\nfoo: extra\nkings_join_date: 03.03.2021';
const roles=[
  {id:DRIVER_ROLE,name:'Kings Driver'},
  {id:HR_ROLE,name:'HR Management'},
  {id:HEAD_HR_ROLE,name:'Head Management HR'}
];
const members=[
  {user:{id:D1,bot:false},roles:[DRIVER_ROLE]},
  {user:{id:MANAGER,bot:false},roles:[HR_ROLE]}
];
const privateOverwrites=[
  {id:GUILD,type:0,deny:'1024',allow:'0'},
  {id:HR_ROLE,type:0,allow:'1024',deny:'0'},
  {id:HEAD_HR_ROLE,type:0,allow:'1024',deny:'0'}
];
const registerChannel={id:CHANNEL,guild_id:GUILD,name:'driver-records',
  type:0,permission_overwrites:privateOverwrites};
const messages=[
  {id:'900000000000000001',author:{id:MANAGER},content:valid},
  {id:'900000000000000002',author:{id:MANAGER},content:invalid},
  {id:'900000000000000003',author:{id:MANAGER},content:'general management note'}
];
function mockDiscord(unsafe=false){
  return async route=>{
    if(route==='/guilds/'+GUILD+'/channels')return [{
      ...registerChannel,
      permission_overwrites:unsafe?[...privateOverwrites,
        {id:DRIVER_ROLE,type:0,allow:'1024',deny:'0'}]:privateOverwrites
    }];
    if(route==='/guilds/'+GUILD)return {owner_id:OWNER};
    if(route.startsWith('/channels/'+CHANNEL+'/messages?'))return messages;
    throw Error('Unexpected Discord route');
  };
}
test('diagnostics find malformed private entries without leaking member IDs or dates',async()=>{
  const result=await inspectRegisterMessages(mockDiscord(),roles,members,BOT);
  assert.equal(result.scanned,3);
  assert.equal(result.validEntries,1);
  assert.equal(result.issues.length,1);
  assert.equal(result.issues[0].messageId,'900000000000000002');
  const pages=diagnosticPages(result);
  assert.equal(pages.length,2);
  const all=pages.map(p=>p.content).join('\n');
  assert.match(all,/Unrecognized field or extra text/);
  assert.match(all,/discord\.com\/channels\/1114967437788577792\/1572736232969084948\/900000000000000002/);
  assert.ok(!all.includes(D1) && !all.includes(D2));
  assert.ok(!all.includes('02.02.2020') && !all.includes('03.03.2021'));
  assert.ok(pages.every(p=>p.content.length<=1900));
});
test('scanner enforces privacy and detects wrapped or unauthorized register messages',async()=>{
  await assert.rejects(inspectRegisterMessages(mockDiscord(true),roles,members,BOT),
    /non-Management role.*kings driver/);
  const fence=String.fromCharCode(96).repeat(3);
  assert.equal(looksLikeWrappedEntry(fence+'text\n'+valid+'\n'+fence),true);
  const wrapped=[
    {id:'900000000000000004',author:{id:MANAGER},
      content:fence+'text\n'+valid+'\n'+fence},
    {id:'900000000000000005',author:{id:BOT},content:valid}
  ];
  const fake=async route=>{
    if(route==='/guilds/'+GUILD+'/channels')return [registerChannel];
    if(route==='/guilds/'+GUILD)return {owner_id:OWNER};
    if(route.startsWith('/channels/'+CHANNEL+'/messages?'))return wrapped;
    throw Error('Unexpected route');
  };
  const result=await inspectRegisterMessages(fake,roles,members,BOT);
  assert.equal(result.issues.length,2);
  assert.ok(result.issues.some(i=>i.kind==='Unrecognized field or extra text'));
  assert.ok(result.issues.some(i=>i.kind==='Author not authorized'));
});
test('audit-preview reports private correction links without writing or exposing private values',async()=>{
  const calls=[];
  const payload=data=>new Response(JSON.stringify(data),{status:200});
  const transport=async (url,options)=>{
    calls.push({url,method:options.method});
    assert.equal(options.method,'GET');
    const p=url.replace('https://discord.com/api/v10','')
      .replace('https://api.truckersmp.com/v2','');
    if(p==='/vtc/64284/members')return payload({error:false,response:{members:[
      {user_id:1234567,joinDate:'2024-02-01T10:00:00Z',username:'DriverA'}
    ]}});
    if(p==='/player/1234567')return payload({error:false,response:{
      id:1234567,discordSnowflake:D1,vtc:{id:64284,inVTC:true}
    }});
    if(p==='/guilds/'+GUILD+'/channels')return payload([
      registerChannel,{id:LEADERSHIP,name:'driver-leadership',guild_id:GUILD,
        type:0,permission_overwrites:privateOverwrites}
    ]);
    if(p==='/guilds/'+GUILD+'/roles')return payload(roles);
    if(p.startsWith('/guilds/'+GUILD+'/members?'))return payload(members);
    if(p==='/users/@me')return payload({id:BOT});
    if(p==='/guilds/'+GUILD)return payload({owner_id:OWNER});
    if(p.startsWith('/channels/'+CHANNEL+'/messages?'))return payload(messages);
    throw Error('Unexpected mock API request '+p);
  };
  const result=await review({token:'test-token',transport,mode:'audit-preview'});
  assert.equal(result.type,'audit-diagnostics');
  assert.equal(result.counts.invalidMessages,1);
  assert.equal(result.counts.complete,false);
  assert.equal(result.channelId,LEADERSHIP);
  assert.ok(result.pages.some(p=>p.content.includes('Open entry')));
  assert.ok(calls.every(c=>c.method==='GET'));
});
test('one-time publishing remains disabled for normal GitHub pushes',()=>{
  const yaml=fs.readFileSync(path.join(__dirname,
    '../.github/workflows/driver-tmp-vtc-review.yml'),'utf8');
  assert.match(yaml,/startsWith\(github\.event\.head_commit\.message, 'Run private Kings Driver register diagnostics'\)/);
  assert.match(yaml,/Read-only Kings private Driver register completion audit/);
  assert.match(yaml,/KINGS_TMP_VTC_REVIEW_MODE: audit-publish/);
  assert.doesNotMatch(yaml,/schedule:/);
});
