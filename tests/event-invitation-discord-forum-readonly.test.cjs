'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {scanKingsInvitationDiscordSource:scan}
  =require('../event-invitation-discord-readonly-source');
const {createDiscordReadClient}
  =require('../scripts/event-invitation-readonly-probe');
const G='1114967437788577792',F='990000000000000001',
  BOT='990000000000000002',HUMAN='990000000000000003',
  STAFF='990000000000000004',ADMIN='990000000000000005',
  BOTROLE='990000000000000006',T='990000000000000101',
  OTHER='990000000000000199',M1='990000000000000201',
  M2='990000000000000202',NOW='2026-11-25T21:00:00.000Z';
const P=1024n,H=65536n;
const ow=(id,type,allow=0n,deny=0n)=>({
  id,type,allow:String(allow),deny:String(deny)});
function fixture(){
  const config={guildId:G,channelId:F,staffRoleIds:[STAFF],
    authorizedAdminRoleIds:[ADMIN]};
  const raw={
    me:{id:BOT,bot:true},
    roles:[{id:G,permissions:'0'},{id:STAFF,permissions:'0'},
      {id:ADMIN,permissions:'8'},{id:BOTROLE,permissions:'0'}],
    channel:{id:F,guild_id:G,type:15,permission_overwrites:[
      ow(G,0,0n,P),ow(STAFF,0,P|H),ow(BOTROLE,0,P|H)]},
    bot:{user:{id:BOT,bot:true},roles:[BOTROLE]},
    author:{user:{id:HUMAN,bot:false},roles:[STAFF]},
    active:{threads:[{id:T,parent_id:F,name:'Event https://truckersmp.com/events/12345'}]},
    archived:{threads:[],has_more:false},
    messages:[
      {id:M2,channel_id:T,timestamp:'2026-11-21T10:00:00+00:00',
        author:{id:HUMAN,bot:false},
        content:'VTC: Test Company\nVTC Link: https://truckersmp.com/vtc/11\nInvited by: <@990000000000000003>'},
      {id:M1,channel_id:T,timestamp:'2026-11-20T10:00:00+00:00',
        author:{id:HUMAN,bot:false},
        content:'Kings Convoy: https://truckersmp.com/events/12345'}
    ]
  };
  const seen=[];
  const client={get:async p=>{
    seen.push(p);
    if(p==='/users/@me')return {status:200,data:raw.me};
    if(p==='/guilds/'+G+'/roles')return {status:200,data:raw.roles};
    if(p==='/channels/'+F)return {status:200,data:raw.channel};
    if(p==='/guilds/'+G+'/members/'+BOT)return {status:200,data:raw.bot};
    if(p==='/guilds/'+G+'/members/'+HUMAN)return {status:200,data:raw.author};
    if(p==='/guilds/'+G+'/threads/active')return {status:200,data:raw.active};
    if(p==='/channels/'+F+'/threads/archived/public?limit=100')
      return {status:200,data:raw.archived};
    if(p==='/channels/'+T+'/messages?limit=100')
      return {status:200,data:raw.messages};
    throw Error('unexpected test route');
  }};
  return {client,config,raw,seen,asOfUtc:NOW};
}
test('Existing Kings invite-tracker forum thread is read only as staff-entered claims, never confirmed invite',async()=>{
  const f=fixture(),r=await scan(f);
  assert.equal(r.sourceKind,'EXISTING_OUTBOUND_INVITE_FORUM_REVIEW');
  assert.equal(r.forumThreadClaims,1);
  assert.equal(r.staffInvitationEntryClaims,1);
  assert.equal(r.threadsWithoutSingleEventLink,0);
  assert.equal(r.currentlyAuthorizedEntryAuthors,1);
  assert.equal(r.structuredInvitationLifecycleImported,0);
  assert.equal(r.organizerRepliesIndependentlyVerified,false);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.eventBookingsCreated,0);
  assert.ok(f.seen.some(x=>x.endsWith('/threads/active')));
  assert.ok(f.seen.some(x=>x.includes('/threads/archived/public?limit=100')));
  assert.ok(f.seen.some(x=>x.includes('/messages?limit=100')));
});
test('Forum output omits all raw private VTC, Discord actor, Event and thread identifiers',async()=>{
  const r=await scan(fixture()),serialized=JSON.stringify(r);
  for(const hidden of [F,T,HUMAN,BOT,M1,M2,'12345','Test Company',
    'https://truckersmp.com/vtc/11'])
    assert.equal(serialized.includes(hidden),false,hidden);
});
test('Unknown or multiple official Event links trigger review, never Event approval',async()=>{
  const a=fixture();a.raw.active.threads[0].name='No original event URL';
  a.raw.messages[1].content='No event URL';
  const r=await scan(a);
  assert.equal(r.threadsWithoutSingleEventLink,1);
  assert.equal(r.safeToActivate,false);
  const b=fixture();
  b.raw.active.threads[0].name='https://truckersmp.com/events/12345 and https://truckersmp.com/events/54321';
  const s=await scan(b);
  assert.equal(s.threadsWithAmbiguousEventLinks,1);
  assert.equal(s.eventBookingsCreated,0);
});
test('Archived forum threads are included but not assumed to restore deleted history',async()=>{
  const f=fixture();
  f.raw.active.threads=[];
  f.raw.archived.threads=[{id:T,parent_id:F,
    thread_metadata:{archive_timestamp:'2026-11-24T10:00:00.000Z'},
    name:'https://truckersmp.com/events/12345'}];
  const r=await scan(f);
  assert.equal(r.forumThreadClaims,1);
  assert.equal(r.historicalEventCoverageVerified,false);
  assert.equal(r.staffInvitationEntryClaims,1);
});
test('Unexpected forum exposure, actor permissions, or missing authorized Staff source is refused',async()=>{
  const a=fixture();a.raw.channel.permission_overwrites=[];
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.author.roles=[];
  await assert.rejects(()=>scan(b));
  const c=fixture();c.raw.channel.type=5;
  await assert.rejects(()=>scan(c));
});
test('Cross-forum thread, duplicate messages and invalid forum responses are blocked',async()=>{
  const a=fixture();a.raw.active.threads[0].parent_id=OTHER;
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.messages[0].id=b.raw.messages[1].id;
  await assert.rejects(()=>scan(b));
  const c=fixture();c.raw.archived.has_more=true;
  await assert.rejects(()=>scan(c));
});
test('Bot and outsider content cannot be promoted to human Staff invitation records',async()=>{
  const a=fixture();a.raw.messages[0].author.bot=true;
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.author.roles=[ADMIN];
  await assert.rejects(()=>scan(b));
});
test('GET-only runtime registers only authenticated forum-child thread IDs and rejects arbitrary channels',async()=>{
  const cfg=fixture().config;
  const client=createDiscordReadClient({config:cfg,token:'SYNTHETIC_TOKEN',
    fetchImpl:async url=>({
      status:200,headers:{get:()=>null},
      text:async()=>JSON.stringify(url.endsWith('/guilds/'+G+'/threads/active')
        ?{threads:[{id:T,parent_id:F}]}:[])
    })});
  await assert.rejects(()=>client.get('/channels/'+T+'/messages?limit=100'));
  await client.get('/guilds/'+G+'/threads/active');
  await client.get('/channels/'+T+'/messages?limit=100');
  await assert.rejects(()=>client.get('/channels/'+OTHER+'/messages?limit=100'));
  await assert.rejects(()=>client.get('/channels/'+T+'/messages?limit=100&after='+M1));
});
