'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDriverIdentityRecord, createPlatformIndex, addIdentityToIndex
} = require('../driver-identity-register.js');
const { loadRegister } = require('../driver-loyalty-register.js');
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
