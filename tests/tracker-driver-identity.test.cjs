'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  markLinkedTruckersMpPlayers,
  loadTrackerTruckersMpIdentityIndex
} = require('../tracker-driver-identity.js');
const { sandbox } = require('./sandbox.cjs');

const guild = '1114967437788577792';
const owner = '999000000000000001';
const manager = '999000000000000002';
const bot = '999000000000000003';
const channelId = '999000000000000004';

function mockDiscordRead({unsafe=false, messages=null, channelMissing=false}={}) {
  const requests = [];
  const response = value => new Response(JSON.stringify(value),{
    headers:{'content-type':'application/json'}
  });
  const records = messages || [
    {id:'900',author:{id:manager},
      content:'discord_id: 123456789012345678\ntruckersmp_id: 1234567\nkings_join_date: 2.2.2020'},
    {id:'899',author:{id:manager},
      content:'id: 123456789012345679\ndatum: 3.3.2021'}
  ];
  const channel = {
    id:channelId, guild_id:guild, name:'driver-loyalty-records', type:0,
    permission_overwrites:[
      {id:guild,type:0,allow:'0',deny:unsafe?'0':'1024'},
      {id:'100',type:0,allow:'1024',deny:'0'}
    ]
  };
  const transport = async (url, options) => {
    requests.push({url,options});
    assert.equal(options.method,'GET','Tracker private identity lookup must be read-only');
    assert.match(options.headers.Authorization,/^Bot /);
    const route = url.replace('https://discord.com/api/v10','');
    if (route === '/users/@me') return response({id:bot});
    if (route === '/guilds/' + guild + '/roles') return response([{id:'100',name:'Management'}]);
    if (route.startsWith('/guilds/' + guild + '/members?')) {
      return response([{user:{id:manager,bot:false},roles:['100']}]);
    }
    if (route === '/guilds/' + guild + '/channels') return response(channelMissing?[]:[channel]);
    if (route === '/guilds/' + guild) return response({owner_id:owner});
    if (route.startsWith('/channels/' + channelId + '/messages?')) return response(records);
    throw Error('Unrecognized read-only mock route: ' + route);
  };
  return {transport,requests};
}

test('live identity linking uses TMP IDs, not names, and never copies Discord IDs or join dates', () => {
  const index = new Map([['1234567', '123456789012345678']]);
  const players = [
    {name:'Someone Else',tmpId:1234567,game:'ETS2',city:'Reims'},
    {name:'Someone Else',tmpId:777777,game:'ATS',city:'Berlin'},
    {name:'Someone Else',tmpId:Number.NaN,game:'ETS2',city:'Calais'}
  ];
  const linked = markLinkedTruckersMpPlayers(players,index);
  assert.equal(linked[0].identityLinked,true);
  assert.equal(linked[1].identityLinked,false);
  assert.equal(linked[2].identityLinked,false);
  assert.deepEqual(Object.keys(linked[0]).sort(),[...Object.keys(players[0]),'identityLinked'].sort());
  assert.doesNotMatch(JSON.stringify(linked),/123456789012345678|2020-02-02|joinedAt|discordUserId/);
  assert.equal(players[0].identityLinked,undefined,'Input player objects are unchanged');
});

test('missing Discord bot secret uses standard Tracker display without any read attempts', async () => {
  const {transport,requests} = mockDiscordRead();
  const result = await loadTrackerTruckersMpIdentityIndex({token:'',transport});
  assert.equal(result.enabled,false);
  assert.equal(result.index.size,0);
  assert.equal(requests.length,0);
});

test('private register permits exact TMP identity mapping with GET-only Discord operations', async () => {
  const {transport,requests} = mockDiscordRead();
  const result = await loadTrackerTruckersMpIdentityIndex({token:'test-bot',guildId:guild,transport});
  assert.equal(result.enabled,true);
  assert.equal(result.index.size,1);
  assert.equal(result.index.get('1234567'),'123456789012345678');
  assert.ok(requests.length>=6);
  assert.ok(requests.every(x=>x.options.method==='GET'));
  assert.ok(requests.every(x=>x.url.startsWith('https://discord.com/api/v10/')));
});

test('private identity integration refuses unsafe permission overrides and duplicate TMP mappings', async () => {
  const unsafe = mockDiscordRead({unsafe:true});
  await assert.rejects(
    loadTrackerTruckersMpIdentityIndex({token:'test-bot',guildId:guild,transport:unsafe.transport}),
    /deny View Channel/
  );
  const duplicate = mockDiscordRead({messages:[
    {id:'900',author:{id:manager},content:'id: 123456789012345678\ntruckersmp_id: 1234567\ndatum: 2.2.2020'},
    {id:'899',author:{id:manager},content:'id: 123456789012345679\ntruckersmp_id: 1234567\ndatum: 3.3.2021'}
  ]});
  await assert.rejects(
    loadTrackerTruckersMpIdentityIndex({token:'test-bot',guildId:guild,transport:duplicate.transport}),
    /Duplicate truckersmp ID/
  );
});

test('missing register channel leaves Tracker identity inactive, not a fake Kings match', async () => {
  const mock = mockDiscordRead({channelMissing:true});
  const result = await loadTrackerTruckersMpIdentityIndex({
    token:'test-bot',guildId:guild,transport:mock.transport
  });
  assert.equal(result.enabled,false);
  assert.equal(result.index.size,0);
});

test('public Discord presentation shows only public TMP ID and linked status; saved snapshot stays aggregate-only', () => {
  const s = sandbox('tracker.js');
  const players = [
    {name:'ExampleDriver',tmpId:1234567,game:'ETS2',server:'Simulation 1',
      city:'Nürnberg',isEvent:false,identityLinked:true},
    {name:'OtherDriver',tmpId:999999,game:'ATS',server:'Simulation 2',
      city:'Berlin',isEvent:false,identityLinked:false}
  ];
  const embeds = s.run('buildDiscordEmbeds('+JSON.stringify(players)+')');
  const publicText = JSON.stringify(embeds);
  assert.match(publicText,/TruckersMP ID: 1234567.*Kings Identity Linked/);
  assert.match(publicText,/TruckersMP ID: 999999/);
  assert.doesNotMatch(publicText,/discord_id|discordUserId|kings_join_date|123456789012345678/);
  const snapshot = s.run('buildLiveSnapshot('+JSON.stringify(players)+',110,"123")');
  assert.equal(snapshot.online,2);
  assert.equal(snapshot.ets2Online,1);
  assert.equal(snapshot.atsOnline,1);
  assert.doesNotMatch(JSON.stringify(snapshot),/ExampleDriver|OtherDriver|1234567|999999|identityLinked|discord/i);
});

test('production Live Tracker reads bot token only inside the existing tracker job', () => {
  const workflow = fs.readFileSync(path.join(__dirname,'../.github/workflows/live-tracker.yml'),'utf8');
  assert.match(workflow,/TRACKER_IDENTITY_SYNC_ENABLED: 'true'/);
  assert.match(workflow,/DISCORD_BOT_TOKEN: \$\{\{ secrets\.DISCORD_BOT_TOKEN \}\}/);
  assert.match(workflow,/- 'tracker-driver-identity\.js'/);
  assert.match(workflow,/- 'driver-loyalty-register\.js'/);
  assert.match(workflow,/- 'driver-identity-register\.js'/);
});
