'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRegister } = require('../driver-loyalty-register.js');

const GUILD = '1114967437788577792';
const CHANNEL = '1572736232969084948';

test('Loyalty preflight, Loyalty live sync and TMP Tracker use one pinned private register channel', () => {
  const root = path.join(__dirname, '..', '.github', 'workflows');
  const loyalty = fs.readFileSync(path.join(root, 'driver-achievements.yml'), 'utf8');
  const tracker = fs.readFileSync(path.join(root, 'live-tracker.yml'), 'utf8');
  const pinned = "DRIVER_LOYALTY_REGISTER_CHANNEL_ID: '" + CHANNEL + "'";
  const matches = input => input.split(pinned).length - 1;
  assert.equal(matches(loyalty), 2, 'both dry-run preflight and live role sync must pin the exact channel');
  assert.equal(matches(tracker), 1, 'live identity lookup must pin the exact same channel');
  for (const file of [loyalty, tracker]) {
    assert.match(file, /DISCORD_GUILD_ID: '1114967437788577792'/);
    assert.doesNotMatch(file, /DRIVER_LOYALTY_REGISTER_CHANNEL_ID: \x24\{\{ secrets\./);
  }
  assert.match(loyalty, /Preflight full Kings Driver Loyalty sync \(no role writes\)/);
  assert.match(tracker, /TRACKER_IDENTITY_SYNC_ENABLED: 'true'/);
});

test('exact channel ID works with its existing name and cannot silently fall back to a similarly named channel', async () => {
  const manager = '999000000000000002';
  const owner = '999000000000000001';
  const bot = '999000000000000003';
  const roles = [{id:'100', name:'Management'}];
  const members = [{user:{id:manager,bot:false},roles:['100']}];
  const channel = {
    id: CHANNEL, guild_id:GUILD, name:'kings-driver-data', type:0,
    permission_overwrites:[
      {id:GUILD, type:0, allow:'0',deny:'1024'},
      {id:'100', type:0, allow:'1024',deny:'0'}
    ]
  };
  const messages = [{id:'900',author:{id:manager},
    content:'discord_id: 123456789012345678\ntruckersmp_id: 1234567\nhaulmp_id: -\ntrucklinemp_id: -\nkings_join_date: 2.2.2020'}];
  const discord = async route => {
    if (route === '/guilds/' + GUILD + '/channels') return [
      channel,
      {...channel,id:'999000000000000010',name:'driver-loyalty-records'}
    ];
    if (route === '/guilds/' + GUILD) return {owner_id:owner};
    if (route.startsWith('/channels/' + CHANNEL + '/messages?')) return messages;
    throw new Error('Wrong Discord channel was requested');
  };
  const loaded = await loadRegister(discord,GUILD,roles,members,bot,{channelId:CHANNEL});
  assert.equal(loaded.enabled,true);
  assert.equal(loaded.channelId,CHANNEL);
  assert.equal(loaded.records.size,1);
  assert.equal(loaded.platformIndex.truckersmp.get('1234567'),'123456789012345678');
  await assert.rejects(
    loadRegister(discord,GUILD,roles,members,bot,{channelId:'999000000000000011'}),
    /Missing or ambiguous private Kings Loyalty channel/
  );
});

test('pinning the private channel keeps access checks fail-closed', async () => {
  const owner = '999000000000000001';
  const bot = '999000000000000003';
  const discord = async route => {
    if (route === '/guilds/' + GUILD + '/channels') return [{
      id:CHANNEL,guild_id:GUILD,name:'private-database',type:0,
      permission_overwrites:[{id:GUILD,type:0,allow:'1024',deny:'0'}]
    }];
    if (route === '/guilds/' + GUILD) return {owner_id:owner};
    throw new Error('No message reads allowed from unsafe channel');
  };
  await assert.rejects(
    loadRegister(discord,GUILD,[],[],bot,{channelId:CHANNEL}),
    /must deny View Channel to @everyone/
  );
});
