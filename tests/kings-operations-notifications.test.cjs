'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {eventSnapshot,publishEventSnapshot} = require('../kings-operations-notifications');

const GUILD = '1114967437788577792';
const CHANNEL = '1551676060645597256';
const BOT = '123456789123456789';
const NOW = Date.parse('2026-11-27T01:00:00Z');
function report() {
  return {
    generatedAt: new Date(NOW).toISOString(), mode:'READ_ONLY',
    summary:{errors:0,actualConvoys:3,testThreads:1},
    threads:[
      {threadId:'123456789123456781',status:'Ready for Approval'},
      {threadId:'123456789123456782',status:'Needs Information'},
      {threadId:'123456789123456783',status:'Scheduled',testThread:true}
    ]
  };
}
function ok(payload) {return {ok:true,async json(){return payload;}};}
function mockDiscord(history = []) {
  const requests = [];
  const transport = async (url,options) => {
    const path = new URL(url).pathname;
    requests.push({path,method:options.method,body:options.body ? JSON.parse(options.body) : null});
    if (options.method === 'GET' && path.endsWith('/channels/' + CHANNEL)) {
      return ok({id:CHANNEL,guild_id:GUILD,type:0,name:'operations-notifications',
        permission_overwrites:[{id:GUILD,type:0,deny:'1024',allow:'0'}]});
    }
    if (options.method === 'GET' && path.endsWith('/users/@me'))
      return ok({id:BOT,bot:true});
    if (options.method === 'GET' && path.endsWith('/channels/' + CHANNEL + '/messages'))
      return ok(history);
    if (options.method === 'POST' && path.endsWith('/channels/' + CHANNEL + '/messages'))
      return ok({id:'123456789123456780'});
    throw Error('Unexpected request');
  };
  return {transport,requests};
}

test('Only fresh, reconciled non-test Convoy status aggregates enter notices', () => {
  const r = report();
  const s = eventSnapshot(r,NOW);
  assert.equal(s.total,2);
  assert.equal(s.counts['Ready for Approval'],1);
  assert.equal(s.counts['Needs Information'],1);
  assert.equal(s.counts.Scheduled,0);
  assert.equal(s.digest.length,24);
  r.threads[0].error = 'source missing';
  assert.throws(()=>eventSnapshot(r,NOW),/unverified/);
  delete r.threads[0].error;
  r.summary.errors = 1;
  assert.throws(()=>eventSnapshot(r,NOW),/incomplete/);
  r.summary.errors = 0;
  r.generatedAt = '2026-11-01T00:00:00Z';
  assert.throws(()=>eventSnapshot(r,NOW),/stale/);
});

test('Notices are default-off, and never post into System Alerts', async () => {
  const {transport,requests} = mockDiscord();
  const disabled = await publishEventSnapshot({
    enabled:'DISABLED',report:report(),channelId:CHANNEL,transport,nowMs:NOW
  });
  assert.equal(disabled.status,'DISABLED');
  assert.equal(requests.length,0);
  await assert.rejects(publishEventSnapshot({
    enabled:'ENABLED',report:report(),channelId:CHANNEL,
    systemAlertsChannelId:CHANNEL,token:'test',transport,nowMs:NOW
  }),/configuration/);
  assert.equal(requests.length,0);
});

test('The approved private channel receives a mention-free Event notice once', async () => {
  const {transport,requests} = mockDiscord();
  const result = await publishEventSnapshot({
    enabled:'ENABLED',report:report(),channelId:CHANNEL,
    token:'test',transport,nowMs:NOW
  });
  assert.equal(result.status,'SENT');
  const posts = requests.filter(x=>x.method==='POST');
  assert.equal(posts.length,1);
  assert.equal(posts[0].path,'/api/v10/channels/' + CHANNEL + '/messages');
  assert.deepEqual(posts[0].body.allowed_mentions,{parse:[]});
  assert.equal(posts[0].body.embeds[0].description.includes('123456789123456781'),false);
  assert.match(posts[0].body.embeds[0].description,/advisory/);
  const already = mockDiscord([{author:{id:BOT},
    embeds:[{footer:{text:posts[0].body.embeds[0].footer.text}}]}]);
  const repeat = await publishEventSnapshot({
    enabled:'ENABLED',report:report(),channelId:CHANNEL,
    token:'test',transport:already.transport,nowMs:NOW
  });
  assert.equal(repeat.status,'UNCHANGED');
  assert.equal(already.requests.filter(x=>x.method==='POST').length,0);
});

test('Public channels and unresolved source data always fail closed', async () => {
  const calls=[];
  const transport = async (url,options) => {
    calls.push(options.method);
    return ok({id:CHANNEL,guild_id:GUILD,type:0,name:'operations-notifications',permission_overwrites:[]});
  };
  await assert.rejects(publishEventSnapshot({
    enabled:'ENABLED',report:report(),channelId:CHANNEL,
    token:'test',transport,nowMs:NOW
  }),/privacy/);
  assert.deepEqual(calls,['GET']);
});
