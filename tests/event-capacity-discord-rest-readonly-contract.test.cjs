'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeKingsDiscordReadOnlyRequest:plan,
  reduceKingsDiscordReadOnlyPage:read}
  =require('../event-capacity-discord-rest-readonly-contract');
const guild='990000000000000000',channel='990000000000000001';
const thread='990000000000000003',older='990000000000000002';
const date='2026-11-25T16:30:00.000Z';
function request(stream='archived-public',patch={}){
  return plan({guildId:guild,channelId:channel,sourceKind:'current-forum',
    stream,...patch});
}
function archived(id=thread,at='2026-11-25T15:00:00.000Z',patch={}){
  return {id,parent_id:channel,
    thread_metadata:{archive_timestamp:at},...patch};
}
function reply(req,data,status=200){
  return read({request:req,response:{status,data},fetchedAtUtc:date});
}
test('Public forum archive plan has exact GET-only Discord v10 route and no Authorization header',()=>{
  const p=request();
  assert.equal(p.method,'GET');
  assert.equal(p.origin,'https://discord.com/api/v10');
  assert.equal(p.path,
    '/channels/'+channel+'/threads/archived/public?limit=100');
  assert.equal(p.mayWrite,false);
  assert.equal(p.noAuthorizationHeaderIncluded,true);
  assert.equal(p.runtimeTransportNotProvided,true);
});
test('Active guild threads use one unpaged guild GET instead of fabricated pagination',()=>{
  const p=request('active');
  assert.equal(p.path,'/guilds/'+guild+'/threads/active');
  assert.equal(p.before,null);
  assert.throws(()=>request('active',{before:'2026-11-25T15:00:00.000Z'}));
});
test('Forum public archive continuation cursor is an encoded ISO archive timestamp',()=>{
  const p=request('archived-public',{before:'2026-11-24T15:00:00.000Z'});
  assert.equal(p.path,
    '/channels/'+channel+'/threads/archived/public?limit=100&before=2026-11-24T15%3A00%3A00.000Z');
});
test('Private archived threads are not requested for a forum that cannot host private threads',()=>{
  assert.throws(()=>request('archived-private'));
  const p=plan({guildId:guild,channelId:channel,
    sourceKind:'legacy-thread-parent',stream:'archived-private'});
  assert.match(p.path,/threads\/archived\/private/);
  assert.equal(p.mayWrite,false);
});
test('A legacy text channel uses 100-message bounded snowflake before paging',()=>{
  const p=plan({guildId:guild,channelId:channel,
    sourceKind:'legacy-text',stream:'messages',before:thread});
  assert.equal(p.path,'/channels/'+channel+'/messages?limit=100&before='+thread);
  assert.throws(()=>plan({guildId:guild,channelId:channel,
    sourceKind:'legacy-text',stream:'messages',before:'hello'}));
});
test('Non-whitelisted endpoint type and invalid ID never enter a request path',()=>{
  for(const bad of ['../messages','DELETE','archived-secret','channels/all']){
    assert.throws(()=>request(bad));
  }
  assert.throws(()=>plan({guildId:guild,channelId:'../../secrets',
    sourceKind:'legacy-text',stream:'messages'}));
});
test('Only bounded valid numeric page limits can be built',()=>{
  for(const n of [-1,0,101,1.5,'100',Infinity])
    assert.throws(()=>request('archived-public',{limit:n}));
  assert.match(request('archived-public',{limit:12}).path,/limit=12/);
});
test('Archive page returns metadata-only count and a private next cursor, no source messages',()=>{
  const p=request();
  const r=reply(p,{threads:[archived()],has_more:true});
  assert.equal(r.status,'ok');
  assert.equal(r.itemCount,1);
  assert.equal(r.hasMore,true);
  assert.equal(r.nextCursor,'2026-11-25T15:00:00.000Z');
  assert.match(r.responseDigest,/^[a-f0-9]{64}$/);
  assert.equal(r.providerResponseAuthenticated,false);
  assert.equal(r.sourceRecordContentsRetained,false);
  assert.equal(JSON.stringify(r).includes(thread),false);
  assert.equal(JSON.stringify(r).includes('content'),false);
});
test('A final empty archived page with has_more=false is valid as a claimed empty response',()=>{
  const r=reply(request(),{threads:[],has_more:false});
  assert.equal(r.itemCount,0);
  assert.equal(r.hasMore,false);
  assert.equal(r.nextCursor,null);
  assert.equal(r.providerResponseAuthenticated,false);
});
test('Archive server saying has_more but giving no threads must be refused',()=>{
  assert.throws(()=>reply(request(),{threads:[],has_more:true}));
});
test('Archive response requires thread parent to be its requested channel',()=>{
  assert.throws(()=>reply(request(),{threads:[
    archived(thread,'2026-11-25T15:00:00.000Z',
      {parent_id:'990000000000000099'})
  ],has_more:false}));
});
test('Archive threads must be ordered newest to oldest without duplicate identities',()=>{
  assert.throws(()=>reply(request(),{threads:[
    archived(older,'2026-11-24T15:00:00.000Z'),
    archived(thread,'2026-11-25T15:00:00.000Z')
  ],has_more:false}));
  assert.throws(()=>reply(request(),{threads:[archived(),archived()],
    has_more:false}));
});
test('Non-progressive archive cursor after a previous page fails closed',()=>{
  const p=request('archived-public',{before:'2026-11-24T00:00:00.000Z'});
  assert.throws(()=>reply(p,{threads:[archived()],has_more:true}));
});
test('Read-only active guild threads are filtered to requested forum parent only',()=>{
  const p=request('active');
  const r=reply(p,{threads:[
    {id:thread,parent_id:channel,content:'PRIVATE TEXT NOT FOR REPORT'},
    {id:older,parent_id:'990000000000000088',
      content:'FOREIGN SOURCE PRIVATE CONTENT'}
  ]});
  assert.equal(r.itemCount,1);
  assert.equal(r.hasMore,false);
  assert.equal(r.nextCursor,null);
  assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
  assert.equal(r.sourceRecordContentsRetained,false);
});
test('Active guild response containing duplicate threads or malformed parent IDs fails',()=>{
  const p=request('active');
  assert.throws(()=>reply(p,{threads:[
    {id:thread,parent_id:channel},{id:thread,parent_id:channel}
  ]}));
  assert.throws(()=>reply(p,{threads:[{id:thread,parent_id:'missing'}]}));
});
test('Legacy message reader enforces descending snowflake IDs and excludes raw message content',()=>{
  const p=plan({guildId:guild,channelId:channel,
    sourceKind:'legacy-text',stream:'messages'});
  const r=reply(p,[{id:thread,channel_id:channel,content:'PERSONAL TEXT'},
    {id:older,channel_id:channel,content:'SECRET'}]);
  assert.equal(r.itemCount,2);
  assert.equal(r.hasMore,false);
  const raw=JSON.stringify(r);
  assert.equal(raw.includes('PERSONAL TEXT'),false);
  assert.equal(raw.includes(older),false);
});
test('A full bounded legacy message page indicates a continuation even if source might be exhausted',()=>{
  const p=plan({guildId:guild,channelId:channel,
    sourceKind:'legacy-text',stream:'messages',limit:2});
  const r=reply(p,[{id:thread},{id:older}]);
  assert.equal(r.hasMore,true);
  assert.equal(r.nextCursor,older);
  assert.equal(r.providerResponseAuthenticated,false);
});
test('Legacy messages claiming a foreign channel or wrong message order are refused',()=>{
  const p=plan({guildId:guild,channelId:channel,
    sourceKind:'legacy-text',stream:'messages'});
  assert.throws(()=>reply(p,[{id:thread,channel_id:'990000000000000099'}]));
  assert.throws(()=>reply(p,[{id:older},{id:thread}]));
});
test('A paginated legacy message response that does not advance before cursor fails',()=>{
  const p=plan({guildId:guild,channelId:channel,
    sourceKind:'legacy-text',stream:'messages',before:older,limit:1});
  assert.throws(()=>reply(p,[{id:thread}]));
});
test('Permissions, missing source, rate-limit and provider failures never masquerade as clean pages',()=>{
  for(const [status,name] of [[403,'forbidden'],[404,'not-found'],
    [429,'rate-limited'],[500,'error'],[503,'error']]){
    const r=reply(request(),{sensitive:'NEVER LOG'},status);
    assert.equal(r.status,name);
    assert.equal(r.itemCount,0);
    assert.equal(r.hasMore,false);
    assert.equal(r.rateLimitRetried,false);
    assert.equal(JSON.stringify(r).includes('NEVER LOG'),false);
  }
});
test('Unsupported success and redirect statuses cannot silently be accepted',()=>{
  for(const status of [201,204,301,401,418,600])
    assert.throws(()=>reply(request(),{},status));
});
test('A tampered GET route and false no-write/read-only claim are rejected',()=>{
  const p=request();
  assert.throws(()=>reply({...p,path:'/channels/'+channel+'/messages'},{}));
  assert.throws(()=>reply({...p,mayWrite:true},{}));
  assert.throws(()=>reply({...p,method:'POST'},{}));
  assert.throws(()=>reply({...p,noAuthorizationHeaderIncluded:false},{}));
});
test('Invalid timestamps and malformed archive response schema never return data',()=>{
  assert.throws(()=>reply(request(),{threads:[archived(thread,'invalid')],has_more:false}));
  assert.throws(()=>read({request:request(),
    response:{status:200,data:{threads:[],has_more:false}},
    fetchedAtUtc:'2026-11-31T00:00:00.000Z'}));
});
test('Replaying the same page is deterministic and cannot mutate source response',()=>{
  const req=request(),data={threads:[archived()],has_more:false};
  const before=structuredClone(data);
  assert.deepEqual(reply(req,data),reply(req,data));
  assert.deepEqual(data,before);
});
