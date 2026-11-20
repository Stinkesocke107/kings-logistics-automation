'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDriverIdentityRecord, parseDriverIdentityRecords, createPlatformIndex, addIdentityToIndex
} = require('../driver-identity-register.js');
const { loadRegister,managementRole,assertPrivateChannel } = require('../driver-loyalty-register.js');
const now = new Date('2026-11-19T10:00:00Z');

test('legacy two-line records remain valid with no platform mapping', () => {
  const parsed = parseDriverIdentityRecord('id: <@!123456789012345678>\r\ndatum: 2.2.2020', now);
  assert.equal(parsed.userId, '123456789012345678');
  assert.equal(parsed.joinedAt.toISOString(), '2020-02-02T00:00:00.000Z');
  assert.deepEqual(parsed.platformIds, {truckersmp:null, haulmp:null, trucklinemp:null});
  assert.equal(parseDriverIdentityRecord('General management notice', now), null);
});

test('extended records keep verified platform IDs as strings', () => {
  const parsed = parseDriverIdentityRecord('discord_id: 123456789012345678\ntruckersmp_id: 1234567\nhaulmp_id: user-ABC_123\ntrucklinemp_id: -\nkings_join_date: 02.02.2020', now);
  assert.equal(parsed.platformIds.truckersmp, '1234567');
  assert.equal(parsed.platformIds.haulmp, 'user-ABC_123');
  assert.equal(parsed.platformIds.trucklinemp, null);
  assert.equal(parsed.joinedAt.getUTCFullYear(), 2020);
});

test('existing unheaded multi-driver messages parse with or without separators', () => {
  const entry = (index) =>
    'discord_id: ' + String(123456789012345678n + BigInt(index)) +
    '\ntruckersmp_id: ' + String(2000000 + index) +
    '\nkings_join_date: 15.08.2026';
  const values = Array.from({length:17}, (_, i) => entry(i));
  // An existing message can contain >12 entries and may omit some '---' lines.
  const mixed = values.map((v, i) => i % 3 === 0 ? v : '---\n' + v).join('\n');
  const parsed = parseDriverIdentityRecords(mixed, now);
  assert.equal(parsed.length, 17);
  assert.equal(parsed[16].platformIds.truckersmp, '2000016');
  assert.equal(parseDriverIdentityRecords(entry(0), now).length, 1);
  assert.equal(parseDriverIdentityRecords('Staff internal note', now).length, 0);
  const originalBatch = 'KINGS_REGISTER_BATCH_V1\n' + values.slice(0, 2).join('\n---\n');
  assert.equal(parseDriverIdentityRecords(originalBatch, now).length, 2);
  assert.throws(() => parseDriverIdentityRecords(
    'KINGS_REGISTER_BATCH_V1\n' + values.slice(0, 13).join('\n---\n'), now
  ), /batch must contain/);
});

test('unheaded multi-driver messages still fail closed for duplicate IDs, invalid fields and empty separators', () => {
  const a = 'discord_id: 123456789012345678\ntruckersmp_id: 1234567\nkings_join_date: 02.02.2020';
  const b = 'discord_id: 123456789012345679\ntruckersmp_id: 1234568\nkings_join_date: 03.03.2021';
  assert.throws(() => parseDriverIdentityRecords(a + '\n---\n' + a, now), /duplicate/i);
  assert.throws(() => parseDriverIdentityRecords(a + '\n---\n' + b + '\n---', now), /separator|batch must contain/i);
  assert.throws(() => parseDriverIdentityRecords(a + '\n---\n' +
    'discord_id: 123456789012345680\nunknown_field: x\nkings_join_date: 03.03.2021', now),
  /Invalid Kings Driver identity record field or line/);
  assert.throws(() => parseDriverIdentityRecords(a + '\n---\n' +
    'discord_id: 123456789012345680\ntruckersmp_id: 1234569\nkings_join_date: 32.03.2021', now),
  /Invalid or future Kings joining date/);
});

test('invalid, malformed, duplicate, missing and future fields fail closed', () => {
  const bad = [
    'id: 123456789012345678\ndatum: 32.2.2020',
    'id: 123456789012345678\ndatum: 2.2.2027',
    'id: 123\ndatum: 2.2.2020',
    'id: 123456789012345678\ntruckersmp_id: abc\ndatum: 2.2.2020',
    'id: 123456789012345678\nhaulmp_id: some space\ndatum: 2.2.2020',
    'id: 123456789012345678\ndatum: 2.2.2020\ndatum: 3.2.2020',
    'id: 123456789012345678\ndatum: 2.2.2020\nfoo: bar',
    'id: 123456789012345678\ntruckersmp_id:\ndatum: 2.2.2020',
    'id: 123456789012345678\ntruckersmp_id: 12\ndatum: 2.2.2020\ndiscord_id: 123456789012345678'
  ];
  for (const input of bad) assert.throws(() => parseDriverIdentityRecord(input, now));
});

test('same platform ID cannot be assigned to two different members', () => {
  const index = createPlatformIndex();
  const first = parseDriverIdentityRecord('id: 123456789012345678\ntruckersmp_id: 1234567\ndatum: 2.2.2020', now);
  const second = parseDriverIdentityRecord('id: 123456789012345679\ntruckersmp_id: 1234567\ndatum: 2.2.2021', now);
  addIdentityToIndex(index, first);
  assert.equal(index.truckersmp.get('1234567'), first.userId);
  assert.throws(() => addIdentityToIndex(index, second), /Duplicate truckersmp ID/);
});

test('private Discord loader exposes verified mappings only in memory, preserving old role-date records', async () => {
  const guild = '1114967437788577792';
  const owner = '999000000000000001';
  const manager = '999000000000000002';
  const bot = '999000000000000003';
  const channelId = '999000000000000004';
  const roles = [{id:'100', name:'Management'}];
  const members = [{user:{id:manager, bot:false}, roles:['100']}];
  const channel = {
    id:channelId, guild_id:guild, name:'driver-loyalty-records', type:0,
    permission_overwrites:[
      {id:guild, type:0, allow:'0', deny:'1024'},
      {id:'100', type:0, allow:'1024', deny:'0'}
    ]
  };
  let messages = [
    {id:'900', author:{id:manager}, content:'discord_id: 123456789012345678\ntruckersmp_id: 1234567\nkings_join_date: 2.2.2020'},
    {id:'899', author:{id:manager}, content:'id: 123456789012345679\ndatum: 3.3.2021'}
  ];
  const discord = async (route) => {
    if (route === '/guilds/' + guild + '/channels') return [channel];
    if (route === '/guilds/' + guild) return {owner_id:owner};
    if (route.startsWith('/channels/' + channelId + '/messages?')) return messages;
    throw Error('Unexpected Discord request');
  };
  const loaded = await loadRegister(discord,guild,roles,members,bot);
  assert.equal(loaded.enabled,true);
  assert.equal(loaded.records.size,2);
  assert.equal(loaded.records.get('123456789012345678').getUTCFullYear(),2020);
  assert.equal(loaded.identities.get('123456789012345678').platformIds.truckersmp,'1234567');
  assert.equal(loaded.platformIndex.truckersmp.get('1234567'),'123456789012345678');

  messages = [
    ...messages,
    {id:'898',author:{id:manager},content:'id: 123456789012345680\ntruckersmp_id: 1234567\ndatum: 3.3.2021'}
  ];
  await assert.rejects(loadRegister(discord,guild,roles,members,bot),/Duplicate truckersmp ID/);
});


test('department-specific Head Management can see private register, general Driver and Staff roles cannot',()=>{
  const guild='1114967437788577792';
  const head={id:'170000000000000011',name:'Head Management - Driver Services'};
  const management={id:'170000000000000012',name:'Kings Management - Human Resources'};
  const driver={id:'170000000000000013',name:'Kings Driver'};
  const staff={id:'170000000000000014',name:'Staff - Driver Services'};
  assert.equal(managementRole(head),true);
  assert.equal(managementRole(management),true);
  assert.equal(managementRole(driver),false);
  assert.equal(managementRole(staff),false);
  assert.equal(managementRole({name:'Management Admin Everyone'}),false);
  const overwrites=[
    {id:guild,type:0,allow:'0',deny:'1024'},
    {id:head.id,type:0,allow:'1024',deny:'0'},
    {id:management.id,type:0,allow:'1024',deny:'0'}
  ];
  const channel={id:'1572736232969084948',guild_id:guild,type:0,
    permission_overwrites:overwrites};
  const owner='999000000000000001',bot='999000000000000003';
  assert.doesNotThrow(()=>assertPrivateChannel(channel,guild,
    [head,management,driver,staff],[],owner,bot));
  assert.throws(()=>assertPrivateChannel({...channel,
    permission_overwrites:[...overwrites,{id:driver.id,type:0,allow:'1024',deny:'0'}]
  },guild,[head,management,driver,staff],[],owner,bot),/non-Management role.*kings driver/);
  assert.throws(()=>assertPrivateChannel({...channel,
    permission_overwrites:[...overwrites,{id:staff.id,type:0,allow:'1024',deny:'0'}]
  },guild,[head,management,driver,staff],[],owner,bot),/non-Management role.*staff driver services/);
});


test('register privacy error lists every unauthorized role at once without exposing user IDs',()=>{
  const guild='1114967437788577792', owner='999000000000000001',bot='999000000000000003';
  const roles=[
    {id:'170000000000000001',name:'Management'},
    {id:'170000000000000002',name:'Driver Services Management'},
    {id:'170000000000000003',name:'Kings Driver'},
    {id:'170000000000000004',name:'Kings Trial'}
  ];
  const channel={id:'1572736232969084948',guild_id:guild,type:0,
    permission_overwrites:[
      {id:guild,type:0,allow:'0',deny:'1024'},
      {id:roles[0].id,type:0,allow:'1024',deny:'0'},
      {id:roles[1].id,type:0,allow:'1024',deny:'0'},
      {id:roles[2].id,type:0,allow:'1024',deny:'0'},
      {id:roles[3].id,type:0,allow:'1024',deny:'0'},
      {id:'900000000000000001',type:1,allow:'1024',deny:'0'}
    ]
  };
  let message='';
  try{
    assertPrivateChannel(channel,guild,roles,[],owner,bot);
    assert.fail('Expected private register permissions to fail');
  }catch(error){message=error.message;}
  assert.match(message,/driver services management/);
  assert.match(message,/kings driver/);
  assert.match(message,/kings trial/);
  assert.match(message,/1 non-Management individual member/);
  assert.doesNotMatch(message,/900000000000000001/);
  assert.doesNotMatch(message,/17000000000000000/);
  assert.doesNotThrow(()=>assertPrivateChannel({
    ...channel, permission_overwrites:channel.permission_overwrites.slice(0,2)
  },guild,roles,[],owner,bot));
});


test('HR Management and Head Management HR are private register managers',()=>{
  for (const name of ['HR Management','Head Management HR','HR Head Management','Management Human Resources']) {
    assert.equal(managementRole({name}),true,name);
  }
  for (const name of ['HR','HR Staff','Leadership','Driver Services Management','Kings Driver']) {
    assert.equal(managementRole({name}),false,name);
  }
  const guild='1114967437788577792';
  const hr={id:'170000000000000011',name:'HR Management'};
  const head={id:'170000000000000012',name:'Head Management HR'};
  const channel={id:'1572736232969084948',guild_id:guild,type:0,
    permission_overwrites:[
      {id:guild,type:0,allow:'0',deny:'1024'},
      {id:hr.id,type:0,allow:'1024',deny:'0'},
      {id:head.id,type:0,allow:'1024',deny:'0'}
    ]};
  assert.doesNotThrow(()=>assertPrivateChannel(channel,guild,[hr,head],[],
    '999000000000000001','999000000000000003'));
});
