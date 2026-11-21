'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {compareRegister,auditPages,REPORT_PREFIX}=require('../driver-register-completeness');
const {review,driverOnlyAuditPages,cleanupObsoleteAuditPages}=require('../driver-tmp-vtc-register-review');

const GUILD='1114967437788577792';
const REGISTER='1572736232969084948';
const DR='1204836048845410405';
const TR='170000000000000001';
const MGT='170000000000000002';
const BOT='999000000000000003';
const OWNER='999000000000000001';
const MANAGER='999000000000000002';
const D1='123456789012345678',D2='123456789012345679',D3='123456789012345680';
const SOURCE='1777777777777777771';
const DEST='1777777777777777772';

function identity(tmp=null) {
  return {platformIds:{truckersmp:tmp,haulmp:null,trucklinemp:null}};
}
function roster() {
  return [
    {tmpId:'1234567',joinedAt:new Date('2020-02-02T00:00:00Z'),username:'DriverA'},
    {tmpId:'1234568',joinedAt:new Date('2020-03-02T00:00:00Z'),username:'DriverB'},
    {tmpId:'1234569',joinedAt:new Date('2025-04-02T00:00:00Z'),username:'Unknown'}
  ];
}
const drivers=[
  {discordId:D1,role:'Driver'},
  {discordId:D2,role:'Trial'}
];

test('daily private Driver onboarding uses the shared authoritative identity source',()=>{
  const {parseDriverIdentityRecord}=require('../driver-identity-register');
  const at=new Date('2026-11-21T16:00:00Z');
  const identity=parseDriverIdentityRecord(
    'discord_id: '+D1+'\nkings_join_date: 2.2.2024\ntruckersmp_id: 1234567',at);
  const register={enabled:true,records:new Map([[D1,identity.joinedAt]]),
    identities:new Map([[D1,identity]])};
  const current=[{discordId:D1,role:'Driver'},{discordId:D2,role:'Driver'},
    {discordId:D3,role:'Trial'}];
  const result=driverOnlyAuditPages(current,register,at);
  assert.equal(result.counts.currentDrivers,2);
  assert.equal(result.counts.registered,1);
  assert.equal(result.counts.missingRecords,1);
  assert.equal(result.counts.platformLinksPresent,1);
  assert.equal(result.counts.sourceStatus,'incomplete');
  assert.equal(result.counts.complete,false);
  const privateOutput=result.pages.map(page=>page.content).join('\n');
  assert.match(privateOutput,/Joining-date authority: \*\*private Management-approved Kings Driver Register/);
  assert.match(privateOutput,new RegExp(D2));
  assert.ok(!privateOutput.includes(D3),'Trial must not be treated as a missing registered Driver');
  assert.doesNotMatch(privateOutput,/2024-02-02|2\.2\.2024/,'Original joining date is not published in audit pages');
});

test('daily onboarding refuses missing or inconsistent private Kings source without guessing Discord dates',()=>{
  const {parseDriverIdentityRecord}=require('../driver-identity-register');
  const at=new Date('2026-11-21T16:00:00Z');
  const identity=parseDriverIdentityRecord('discord_id: '+D1+
    '\nkings_join_date: 2.2.2024',at);
  const active=[{discordId:D1,role:'Driver'}];
  assert.throws(()=>driverOnlyAuditPages(active,{enabled:false,
    records:new Map(),identities:new Map()},at),/private Kings Driver registry is unavailable/);
  const mismatch={enabled:true,records:new Map([[D1,new Date('2025-03-03T00:00:00Z')]]),
    identities:new Map([[D1,identity]])};
  assert.throws(()=>driverOnlyAuditPages(active,mismatch,at),/consistency/);
  assert.throws(()=>driverOnlyAuditPages(active,{enabled:true,
    records:new Map([[D1,identity.joinedAt]]),identities:new Map()},at),/source entry is inconsistent/);
});

test('audit only includes current Kings Driver role and checks its verified TMP link',()=>{
  const result=compareRegister({
    drivers,roster:roster(),
    identities:new Map([[D1,identity('1234567')],[D2,identity('1234568')]])
  });
  assert.equal(result.complete,true);
  assert.equal(result.discordComplete,true);
  assert.equal(result.vtcComplete,true);
  assert.equal(result.currentDrivers,1);
  assert.equal(result.registeredDrivers,1);
  assert.equal(result.matchedVtcCount,1);
  assert.equal(result.missingVtcLinks.length,0);
  const pages=auditPages(result,new Date('2026-11-20T21:00:00Z'));
  assert.equal(pages.length,1);
  assert.match(pages[0].content,/COMPLETE/);
  assert.match(pages[0].content,/1\/1/);
  assert.match(pages[0].content,/VTC-only accounts are outside/);
});

test('additional TMP VTC accounts do not block complete active Driver registrations',()=>{
  const allDrivers=[{discordId:D1,role:'Driver'},{discordId:D2,role:'Driver'}];
  const result=compareRegister({
    drivers:allDrivers,roster:roster(),
    identities:new Map([[D1,identity('1234567')],[D2,identity('1234568')]])
  });
  assert.equal(result.discordComplete,true);
  assert.equal(result.vtcComplete,true);
  assert.equal(result.complete,true);
  assert.equal(result.currentDrivers,2);
  assert.equal(result.matchedVtcCount,2);
  assert.equal(result.officialVtcMembers,3);
  const msg=auditPages(result)[0].content;
  assert.match(msg,/Current Kings Driver register coverage: \*\*COMPLETE\*\*/);
  assert.match(msg,/Active Kings Driver TMP verification: \*\*COMPLETE\*\*/);
  assert.doesNotMatch(msg,/Unlinked VTC/);
});

test('missing active Driver entries, TMP IDs and departed TMP accounts are distinct',()=>{
  const D4='123456789012345681';
  const mixed=compareRegister({
    drivers:[...drivers,{discordId:D3,role:'Driver'},{discordId:D4,role:'Driver'}],
    roster:roster(),
    identities:new Map([
      [D1,identity('1234567')],
      [D2,identity('1234568')], // Trial is not part of active Driver coverage.
      [D3,identity(null)]
    ])
  });
  assert.equal(mixed.complete,false);
  assert.equal(mixed.currentDrivers,3);
  assert.equal(mixed.registeredDrivers,2);
  assert.deepEqual(mixed.missingRecords.map(x=>x.discordId),[D4]);
  assert.deepEqual(mixed.missingTmpIds.map(x=>x.discordId),[D3]);
  assert.equal(mixed.missingVtcLinks.length,0);
  const pages=auditPages(mixed,new Date('2026-11-20T21:00:00Z'));
  assert.ok(pages.some(p=>p.marker.includes('Missing Discord')));
  assert.ok(pages.some(p=>p.marker.includes('Missing TMP ID')));
  assert.ok(!pages.some(p=>p.marker.includes('Unlinked VTC')));
  assert.ok(pages.every(p=>p.content.length<=1900));
  assert.match(pages.find(p=>p.marker.includes('Missing Discord')).content,new RegExp(D4));
  assert.doesNotMatch(pages.map(x=>x.content).join('\n'),/kings_join_date: /);
});

test('current exact TMP profile contradiction blocks active Driver completion',()=>{
  const result=compareRegister({
    drivers:drivers.slice(0,1),roster:roster().slice(0,1),
    identities:new Map([[D1,identity('1234567')]]),
    profiles:new Map([['1234567',{valid:true,discordId:D2}]])
  });
  assert.equal(result.complete,false);
  assert.equal(result.identityConflicts.length,1);
  assert.equal(result.matchedVtcCount,0);
  const pages=auditPages(result);
  assert.match(pages.find(x=>x.marker.includes('Identity conflict')).content,/VERIFY/);
});

test('wrong or duplicate TMP links cannot be counted as verified Driver membership',()=>{
  const wrong=compareRegister({
    drivers:[{discordId:D1,role:'Driver'},{discordId:D2,role:'Driver'}],
    roster:roster(),
    identities:new Map([[D1,identity('1234567')],[D2,identity('9988776')]])
  });
  assert.equal(wrong.complete,false);
  assert.equal(wrong.tmpNotInCurrentVtc.length,1);
  const duplicate=compareRegister({
    drivers:[{discordId:D1,role:'Driver'},{discordId:D2,role:'Driver'}],
    roster:roster(),
    identities:new Map([[D1,identity('1234567')],[D2,identity('1234567')]])
  });
  assert.equal(duplicate.complete,false);
  assert.equal(duplicate.identityConflicts.length,1);
});

test('large missing lists paginate without overflowing Discord or publishing anything',()=>{
  const hundred=Array.from({length:100},(_,i)=>({
    discordId:String(200000000000000001n+BigInt(i)),role:'Driver'
  }));
  const result=compareRegister({
    drivers:hundred,roster:roster().slice(0,1),identities:new Map()
  });
  const pages=auditPages(result);
  assert.ok(pages.length>2);
  assert.ok(pages.every(x=>x.content.length<=1900));
  assert.ok(pages.every(x=>x.marker.startsWith(REPORT_PREFIX)));
  assert.ok(pages.every(x=>x.content.startsWith(x.marker)));
});
test('private audit only reads source APIs and rejects unsafe register permissions',async()=>{
  const allRoles=[
    {id:DR,name:'Kings Driver'},{id:TR,name:'Kings Trial'},
    {id:MGT,name:'Management'}
  ];
  const memberList=[
    {user:{id:D1,bot:false,username:'DriverA'},roles:[DR]},
    {user:{id:D2,bot:false,username:'DriverB'},roles:[TR]},
    {user:{id:MANAGER,bot:false},roles:[MGT]}
  ];
  const privateOverwrites=[
    {id:GUILD,type:0,deny:'1024',allow:'0'},
    {id:MGT,type:0,deny:'0',allow:'1024'}
  ];
  const channels=[
    {id:DEST,name:'🚛｜driver-leadership',guild_id:GUILD,type:0,
      permission_overwrites:privateOverwrites},
    {id:REGISTER,name:'driver-records',guild_id:GUILD,type:0,
      permission_overwrites:privateOverwrites}
  ];
  let untrusted=false;
  const calls=[];
  const payload=o=>new Response(JSON.stringify(o),{status:200});
  const transport=async(url,opts)=>{
    calls.push({url,method:opts.method});
    assert.equal(opts.method,'GET');
    const p=url.replace('https://discord.com/api/v10','')
      .replace('https://api.truckersmp.com/v2','');
    if(p==='/vtc/64284/members')return payload({error:false,response:{members:[
      {user_id:1234567,joinDate:'2024-02-01T10:00:00Z',username:'DriverA'},
      {user_id:1234568,joinDate:'2024-02-01T10:00:00Z',username:'DriverB'}
    ]}});
    if(p.startsWith('/player/'))return payload({error:false,response:{
      id:Number(p.split('/').at(-1)),discordSnowflake:
        p.endsWith('1234567')?D1:D2,vtc:{id:64284,inVTC:true}
    }});
    if(p==='/guilds/'+GUILD+'/channels')return payload(untrusted
      ? channels.map(c=>c.id===REGISTER?{...c,permission_overwrites:[
        ...privateOverwrites,{id:DR,type:0,allow:'1024',deny:'0'}
      ]}:c):channels);
    if(p==='/guilds/'+GUILD+'/roles')return payload(allRoles);
    if(p.startsWith('/guilds/'+GUILD+'/members?'))return payload(memberList);
    if(p==='/guilds/'+GUILD)return payload({owner_id:OWNER});
    if(p==='/users/@me')return payload({id:BOT});
    if(p.startsWith('/channels/'+REGISTER+'/messages?'))return payload([
      {id:'900000000000000001',author:{id:MANAGER},
        content:'discord_id: '+D1+'\ntruckersmp_id: 1234567\nkings_join_date: 02.02.2024'}
    ]);
    throw Error('Unexpected route '+p);
  };
  const result=await review({token:'test-token',transport,mode:'audit-preview'});
  assert.equal(result.type,'audit');
  assert.equal(result.counts.registered,1);
  assert.equal(result.counts.missingRecords,0);
  assert.equal(result.counts.unlinkedVtc,0);
  assert.equal(result.counts.currentDrivers,1);
  assert.equal(result.counts.complete,true);
  assert.ok(result.pages.every(p=>!p.content.includes(D2)));
  assert.ok(calls.every(x=>x.method==='GET'));
  untrusted=true;
  await assert.rejects(review({token:'test-token',transport,mode:'audit-preview'}),
    /non-Management role/);
});

test('Discord-only private audit publishes missing active Kings Driver IDs without TruckersMP requests',async()=>{
  const allRoles=[{id:DR,name:'Kings Driver'},{id:TR,name:'Kings Trial'},{id:MGT,name:'Management'}];
  const allMembers=[
    {user:{id:D1,bot:false},roles:[DR]},
    {user:{id:D2,bot:false},roles:[DR]},
    {user:{id:D3,bot:false},roles:[TR]},
    {user:{id:MANAGER,bot:false},roles:[MGT]}
  ];
  const over=[
    {id:GUILD,type:0,deny:'1024',allow:'0'},
    {id:MGT,type:0,deny:'0',allow:'1024'}
  ];
  const channels=[
    {id:DEST,name:'driver-leadership',guild_id:GUILD,type:0,permission_overwrites:over},
    {id:REGISTER,name:'driver-register',guild_id:GUILD,type:0,permission_overwrites:over}
  ];
  const calls=[];
  const transport=async (url,opts)=>{
    calls.push(url);
    assert.equal(opts.method,'GET');
    assert.ok(!url.includes('truckersmp.com'), 'Discord-only audit must not call TMP API');
    const p=url.replace('https://discord.com/api/v10','');
    const payload=body=>new Response(JSON.stringify(body),{status:200});
    if(p==='/guilds/'+GUILD+'/channels')return payload(channels);
    if(p==='/guilds/'+GUILD+'/roles')return payload(allRoles);
    if(p.startsWith('/guilds/'+GUILD+'/members?'))return payload(allMembers);
    if(p==='/guilds/'+GUILD)return payload({owner_id:OWNER});
    if(p==='/users/@me')return payload({id:BOT});
    if(p.startsWith('/channels/'+REGISTER+'/messages?'))return payload([
      {id:'900000000000000001',author:{id:MANAGER},
        content:'discord_id: '+D1+'\ntruckersmp_id: 1234567\nkings_join_date: 02.02.2024'}
    ]);
    throw Error('Unexpected request '+p);
  };
  const result=await review({token:'test-token',transport,mode:'audit-driver-only-preview'});
  assert.equal(result.type,'audit-driver-only');
  assert.deepEqual(result.counts,{currentDrivers:2,registered:1,missingRecords:1,
    pendingHrIntakeCases:1,platformLinksPresent:1,sourceStatus:'incomplete',complete:false});
  const published=result.pages.map(p=>p.content).join('\n');
  assert.ok(result.pages.every(p=>p.marker.startsWith('👑 **Kings Driver Registration Queue | ')));
  assert.ok(published.includes(D2));
  assert.ok(!published.includes(D3));
  assert.ok(!published.includes(D1+' • Kings Driver'));
  assert.ok(!/truckersmp_id:\s*1234567\b/.test(published));
  assert.ok(calls.every(url=>!url.includes('truckersmp.com')));
});

test('old audit cleanup removes only bot-authored expired audit pages',async()=>{
  const removed=[];
  const post=payload=>new Response(JSON.stringify(payload),{status:200});
  const transport=async (url,options)=>{
    const p=url.replace('https://discord.com/api/v10','');
    if(options.method==='GET'){
      if(p==='/users/@me')return post({id:BOT});
      if(p.includes('/messages?'))return post([
        {id:'900000000000000005',author:{id:BOT},
          content:REPORT_PREFIX+'Missing Discord 9/9**'},
        {id:'900000000000000006',author:{id:BOT},
          content:REPORT_PREFIX+'Summary**\nCurrent content'},
        {id:'900000000000000007',author:{id:MANAGER},
          content:REPORT_PREFIX+'Missing Discord 9/9**'},
        {id:'900000000000000008',author:{id:BOT},content:'Unrelated Leadership message'}
      ]);
    }
    if(options.method==='DELETE'){
      removed.push(p);
      return new Response(null,{status:204});
    }
    throw Error('Unrecognized mock request');
  };
  const deleted=await cleanupObsoleteAuditPages({
    token:'test-token',channelId:DEST,markers:[REPORT_PREFIX+'Summary**'],
    transport
  });
  assert.equal(deleted,1);
  assert.deepEqual(removed,['/channels/'+DEST+'/messages/900000000000000005']);
});
test('daily onboarding queue cleanup never removes private VTC mismatch audit reports',async()=>{
  const queuePrefix='👑 **Kings Driver Registration Queue | ';
  const cleanupTarget=queuePrefix+'Missing Discord 1/1**';
  const vtcSummary=REPORT_PREFIX+'Summary**';
  const deleted=[];
  const transport=async(url,options)=>{
    const p=url.replace('https://discord.com/api/v10','');
    if(options.method==='GET'){
      if(p==='/users/@me') return new Response(JSON.stringify({id:BOT}),{status:200});
      if(p.includes('/messages?')) return new Response(JSON.stringify([
        {id:'900000000000000041',author:{id:BOT},content:cleanupTarget},
        {id:'900000000000000042',author:{id:BOT},content:vtcSummary},
        {id:'900000000000000043',author:{id:MANAGER},content:cleanupTarget}
      ]),{status:200});
    }
    if(options.method==='DELETE'){
      deleted.push(p);
      return new Response(null,{status:204});
    }
    throw Error('Unexpected request');
  };
  const deletedCount=await cleanupObsoleteAuditPages({
    token:'test',channelId:DEST,markers:[queuePrefix+'Summary**'],
    prefix:queuePrefix,transport
  });
  assert.equal(deletedCount,1);
  assert.deepEqual(deleted,['/channels/'+DEST+'/messages/900000000000000041']);
  await assert.rejects(cleanupObsoleteAuditPages({
    token:'test',channelId:DEST,markers:[vtcSummary],
    prefix:queuePrefix,transport
  }), /cleanup scope/);
});

test('existing VTC review workflow exposes only manual register audit modes',()=>{
  const text=fs.readFileSync(path.join(__dirname,'../.github/workflows/driver-tmp-vtc-review.yml'),'utf8');
  assert.match(text,/audit-preview/);
  assert.match(text,/audit-publish/);
  assert.match(text,/github\.event_name == 'workflow_dispatch'/);
  assert.match(text,/KINGS_TMP_VTC_REVIEW_MODE: \$\{\{ inputs\.mode \}\}/);
  assert.doesNotMatch(text,/schedule:/);
});
