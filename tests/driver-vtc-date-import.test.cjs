'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseDriverIdentityRecords}=require('../driver-identity-register');
const {loadRegister}=require('../driver-loyalty-register');
const {parseRoster,parseVtcJoinDate,readPublicProfile,matchProfiles,reportPages}=
  require('../kings-vtc-register-contract');
const NOW=new Date('2026-11-19T21:00:00Z');
const D1='123456789012345678', D2='123456789012345679',D3='123456789012345680';
const record=(id,tmpId,date)=>'discord_id: '+id+'\ntruckersmp_id: '+tmpId+
  '\nkings_join_date: '+date;
test('bounded Management batch retains existing record format and exact source ID',()=>{
  const batch='KINGS_REGISTER_BATCH_V1\n'+record(D1,'1234567','1.2.2020')+
    '\n---\n'+record(D2,'1234568','2.3.2021');
  const entries=parseDriverIdentityRecords(batch,NOW);
  assert.equal(entries.length,2);
  assert.equal(entries[0].userId,D1);
  assert.equal(entries[1].platformIds.truckersmp,'1234568');
  assert.equal(parseDriverIdentityRecords('id: '+D3+'\ndatum: 2.4.2022',NOW).length,1);
  assert.equal(parseDriverIdentityRecords('Management reminder',NOW).length,0);
  assert.throws(()=>parseDriverIdentityRecords('KINGS_REGISTER_BATCH_V1\n'+record(D1,'12345','1.2.2020')+'\n---\n'+record(D1,'12346','2.3.2021'),NOW),/duplicate/i);
  assert.throws(()=>parseDriverIdentityRecords('KINGS_REGISTER_BATCH_V1\n'+Array(13).fill(record(D1,'12345','1.2.2020')).join('\n---\n'),NOW),/1 to 12/);
  assert.throws(()=>parseDriverIdentityRecords('KINGS_REGISTER_BATCH_V1\n'+record(D1,'12345','1.2.2020')+'\n---\n',NOW),/nonempty/);
});

test('private loader accepts manager batch but refuses duplicate and unauthorized author',async()=>{
  const gid='1114967437788577792',cid='1572736232969084948';
  const manager='999000000000000002',bot='999000000000000003',owner='999000000000000001';
  const roles=[{id:'170000000000000002',name:'Management'}];
  const members=[{user:{id:manager,bot:false},roles:[roles[0].id]}];
  const channel={id:cid,guild_id:gid,type:0,permission_overwrites:[
    {id:gid,type:0,deny:'1024',allow:'0'},
    {id:roles[0].id,type:0,allow:'1024',deny:'0'}
  ]};
  let messages=[{id:'900000000000000001',author:{id:manager},
    content:'KINGS_REGISTER_BATCH_V1\n'+record(D1,'1234567','1.2.2020')+
      '\n---\n'+record(D2,'1234568','2.3.2021')}];
  const discord=async route=>{
    if(route.endsWith('/channels'))return [channel];
    if(route==='/guilds/'+gid)return {owner_id:owner};
    if(route.includes('/messages?'))return messages;
    throw Error('Unknown Discord request');
  };
  const loaded=await loadRegister(discord,gid,roles,members,bot,{channelId:cid});
  assert.equal(loaded.records.size,2);
  assert.equal(loaded.platformIndex.truckersmp.get('1234567'),D1);
  messages=[...messages,{id:'900000000000000002',author:{id:manager},
    content:'id: '+D1+'\ndatum: 1.2.2020'}];
  await assert.rejects(loadRegister(discord,gid,roles,members,bot,{channelId:cid}),/Duplicate Loyalty register entry/);
  messages=[{...messages[0],author:{id:'999000000000000099'}}];
  await assert.rejects(loadRegister(discord,gid,roles,members,bot,{channelId:cid}),/non-Management/);
});

test('official TruckersMP VTC member joinDate is not mistaken for player registration date',()=>{
  const input={error:false,response:{members:[
    {user_id:1234567,joinDate:'2026-10-18 18:22:03',username:'Example'},
    {user_id:1234568,joinDate:'2025-05-01T00:00:00.000Z',username:'Example2'}
  ]}};
  const out=parseRoster(input,NOW);
  assert.equal(out.length,2);
  assert.equal(out[0].joinedAt.toISOString(),'2026-10-18T18:22:03.000Z');
  assert.equal(out[1].joinedAt.toISOString(),'2025-05-01T00:00:00.000Z');
  assert.throws(()=>parseRoster({error:false,response:{members:[
    {user_id:1234567,joinDate:'2026-10-18 18:22:03'},
    {user_id:1234567,joinDate:'2026-10-18 18:22:03'}
  ]}},NOW),/duplicate/);
  assert.throws(()=>parseVtcJoinDate('2027-10-18 18:22:03',NOW),/future/);
  assert.throws(()=>parseVtcJoinDate('tomorrow',NOW),/Unsupported/);
});
test('profile mapping is exact, duplicate links and mismatched VTC are excluded',()=>{
  const good={error:false,response:{id:1234567,discordSnowflake:D1,
    joinDate:'2020-01-01T00:00:00Z',vtc:{id:64284,inVTC:true}}};
  assert.deepEqual(readPublicProfile(good,'1234567'),{valid:true,discordId:D1});
  assert.equal(readPublicProfile({...good,response:{...good.response,id:999}},'1234567').valid,false);
  assert.equal(readPublicProfile({...good,response:{...good.response,vtc:{id:1,inVTC:true}}},'1234567').valid,false);
  assert.equal(readPublicProfile({...good,response:{...good.response,discordSnowflake:null}},'1234567').discordId,null);
  const roster=parseRoster({error:false,response:{members:[
    {user_id:1234567,joinDate:'2025-10-01T12:00:00Z'},
    {user_id:1234568,joinDate:'2025-09-01T12:00:00Z'}
  ]}},NOW);
  const drivers=[{discordId:D1,role:'Driver'},{discordId:D2,role:'Trial'}];
  const profiles=new Map([
    ['1234567',{valid:true,discordId:D1}],
    ['1234568',{valid:true,discordId:D1}]
  ]);
  const conflict=matchProfiles(roster,profiles,drivers);
  assert.equal(conflict.matched.length,0);
  assert.equal(conflict.duplicateCount,1);
  assert.equal(conflict.outstanding.length,2);
  profiles.set('1234568',{valid:true,discordId:D2});
  const resolved=matchProfiles(roster,profiles,drivers);
  assert.equal(resolved.matched.length,2);
  assert.equal(resolved.outstanding.length,0);
  const pages=reportPages(resolved,'1114967437788577792');
  assert.equal(pages.length,1);
  assert.match(pages[0].content,/KINGS_REGISTER_BATCH_V1/);
  assert.match(pages[0].content,/kings_join_date: 01.10.2025/);
  assert.match(pages[0].content,/VTC join date is not automatically the original Kings date/);
  assert.ok(pages[0].content.length<1900);
  assert.equal(parseDriverIdentityRecords(pages[0].content.split('KINGS_REGISTER_BATCH_V1\n')[1].split('\n'+String.fromCharCode(96).repeat(3))[0]
      .replace(/^/,'KINGS_REGISTER_BATCH_V1\n'),NOW).length,2);
});
