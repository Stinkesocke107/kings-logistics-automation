'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {scanKingsInvitationDiscordSource:scan}
  =require('../event-invitation-discord-readonly-source');
const {configFromEnvironment,createDiscordReadClient}
  =require('../scripts/event-invitation-readonly-probe');
const G='1114967437788577792',CH='990000000000000001',
  BOT='990000000000000002',HUMAN='990000000000000003',
  STAFF='990000000000000004',ADMIN='990000000000000005',
  BOT_ROLE='990000000000000006',UNAUTH='990000000000000007',
  EXT='990000000000000008';
const NOW='2026-11-25T20:00:00.000Z';
const P=1024n,R=65536n;
function ow(id,type,allow=0n,deny=0n){
  return {id,type,allow:String(allow),deny:String(deny)};
}
function channel(){
  return {id:CH,guild_id:G,type:0,permission_overwrites:[
    ow(G,0,0n,P),ow(STAFF,0,P|R),ow(BOT_ROLE,0,P|R)]};
}
function roles(){
  return [{id:G,permissions:'0'},{id:STAFF,permissions:'0'},
    {id:ADMIN,permissions:'8'},{id:BOT_ROLE,permissions:'0'},
    {id:UNAUTH,permissions:'0'}];
}
function create(id='A',messageId='990000000000000101',patch={}){
  return {id:messageId,channel_id:CH,
    timestamp:'2026-11-20T10:00:00+00:00',
    author:{id:HUMAN},content:'KINGS_INVITE_V1 '+JSON.stringify({
      kind:'invitation',invitationId:id,eventId:'event-A',
      departureAtUtc:'2026-12-05T18:00:00.000Z',
      replyDueAtUtc:'2026-11-24T18:00:00.000Z',...patch
    })};
}
function sent(id='A',messageId='990000000000000102',status='Sent'){
  return {id:messageId,channel_id:CH,
    timestamp:'2026-11-21T12:00:00.000Z',
    author:{id:HUMAN,bot:false},
    content:'KINGS_INVITE_V1 '+JSON.stringify({kind:'status',invitationId:id,status})};
}
function fixture(){
  const cfg={guildId:G,channelId:CH,staffRoleIds:[STAFF],
    authorizedAdminRoleIds:[ADMIN]};
  const raw={me:{id:BOT,bot:true},roles:roles(),channel:channel(),
    botMember:{user:{id:BOT,bot:true},roles:[BOT_ROLE]},
    authorMember:{user:{id:HUMAN,bot:false},roles:[STAFF]},
    pages:[[sent(),create()]]};
  const seen=[];
  const client={get:async path=>{
    seen.push(path);
    if(path==='/users/@me')return {status:200,data:raw.me};
    if(path==='/guilds/'+G+'/roles')return {status:200,data:raw.roles};
    if(path==='/channels/'+CH)return {status:200,data:raw.channel};
    if(path==='/guilds/'+G+'/members/'+BOT)
      return {status:200,data:raw.botMember};
    if(path==='/guilds/'+G+'/members/'+HUMAN)
      return {status:200,data:raw.authorMember};
    if(path.startsWith('/channels/'+CH+'/messages?limit=100')){
      return {status:200,data:raw.pages.shift()??[]};
    }
    throw Error('unexpected test request');
  }};
  return {client,config:cfg,raw,seen,asOfUtc:NOW};
}
test('real-shape GET-only source uses existing pagination validator and original Discord timestamps',async()=>{
  const f=fixture(),r=await scan(f);
  assert.equal(r.readOnly,true);
  assert.equal(r.checkedCurrentStaffAuthors,1);
  assert.equal(r.review.counts.sent,1);
  assert.equal(r.review.counts.overdueReplyReview,1);
  assert.equal(r.privateClaimsDoNotLog.invitations[0].createdAtUtc,
    '2026-11-20T10:00:00.000Z');
  assert.equal(r.privateClaimsDoNotLog.changes[0].atUtc,
    '2026-11-21T12:00:00.000Z');
  assert.ok(f.seen.every(x=>x.startsWith('/')));
  assert.equal(r.originalOrganizerResponsesIndependentlyVerified,false);
  assert.equal(r.staffApprovalsCommitted,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Staff-entered accepted status never certifies actual organizer reply or event approval',async()=>{
  const f=fixture();f.raw.pages[0][0]=sent('A',undefined,'Accepted');
  await assert.rejects(()=>scan(f)); // Cannot jump Draft directly to Accepted.
  const g=fixture();
  const accepted=sent('A','990000000000000103','Accepted');
  accepted.timestamp='2026-11-22T12:00:00.000Z';
  g.raw.pages[0]=[accepted,sent(),create()];
  const r=await scan(g);
  assert.equal(r.review.counts.accepted,1);
  assert.equal(r.originalOrganizerResponsesIndependentlyVerified,false);
  assert.equal(r.authorsHistoricalRolesIndependentlyVerified,false);
  assert.equal(r.eventBookingsCreated,0);
  assert.equal(r.safeToActivate,false);
});
test('Provider data remains confined to the explicitly private claims object',async()=>{
  const r=await scan(fixture());
  const {privateClaimsDoNotLog,...safe}=r;
  const serialized=JSON.stringify(safe);
  for(const value of [HUMAN,BOT,CH,'event-A','990000000000000101',
    '2026-11-20T10:00:00.000Z'])
    assert.ok(!serialized.includes(value),value);
  assert.ok(!Object.hasOwn(r.review,'eventId'));
});
test('Non-private source channel is refused',async()=>{
  const f=fixture();f.raw.channel.permission_overwrites=[];
  await assert.rejects(()=>scan(f));
});
test('Unknown read-capable roles and member-specific exposure are refused',async()=>{
  const a=fixture();a.raw.channel.permission_overwrites.push(ow(UNAUTH,0,P|R));
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.channel.permission_overwrites.push(ow(HUMAN,1,P|R));
  await assert.rejects(()=>scan(b));
});
test('Unexpected global Administrator is not silently ignored',async()=>{
  const f=fixture();f.raw.roles.find(x=>x.id===UNAUTH).permissions='8';
  await assert.rejects(()=>scan(f));
});
test('Bot requires actual guild member and effective read/history grants',async()=>{
  const a=fixture();a.raw.botMember.user.id=UNAUTH;
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.channel.permission_overwrites=
    b.raw.channel.permission_overwrites.filter(x=>x.id!==BOT_ROLE);
  await assert.rejects(()=>scan(b));
  const c=fixture();c.raw.roles.find(x=>x.id===BOT_ROLE).permissions='8';
  await assert.rejects(()=>scan(c));
});
test('Invitation author must currently hold exact authorized Staff role',async()=>{
  const a=fixture();a.raw.authorMember.roles=[UNAUTH];
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.authorMember.user.bot=true;
  await assert.rejects(()=>scan(b));
});
test('Bot-authored, malformed or free-text records are not trusted invitation history',async()=>{
  const a=fixture();a.raw.pages[0][0].author.bot=true;
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.pages[0][0].content='Free-text yes from partner';
  await assert.rejects(()=>scan(b));
  const c=fixture();c.raw.pages[0][0].content=
    'KINGS_INVITE_V1 {"kind":"status","status":"Accepted","invitationId":"A","forged":true}';
  await assert.rejects(()=>scan(c));
});
test('Discord 403/429/source API errors fail closed; never mean no invitations',async()=>{
  for(const status of [403,404,429,503]){
    const f=fixture();const original=f.client.get;
    f.client.get=async path=>path.includes('messages?')?{status,data:{private:'secret'}}:original(path);
    await assert.rejects(()=>scan(f),/Kings private Event Invitation source inspection refused/);
  }
});
test('Wrong guild/channel or forged source identities fail closed',async()=>{
  const a=fixture();a.config.guildId='990000000000000009';
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.channel.guild_id=UNAUTH;
  await assert.rejects(()=>scan(b));
  const c=fixture();c.raw.pages[0][0].channel_id=UNAUTH;
  await assert.rejects(()=>scan(c));
});
test('Original source message timestamp must be a valid Discord UTC instant',async()=>{
  const a=fixture();a.raw.pages[0][1].timestamp='not-a-date';
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.pages[0][0].timestamp='2026-11-27T10:00:00.000Z';
  await assert.rejects(()=>scan(b));
});
test('Unsorted or duplicated message IDs are rejected by existing source contract',async()=>{
  const a=fixture();a.raw.pages[0].reverse();
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.pages[0][0].id=b.raw.pages[0][1].id;
  await assert.rejects(()=>scan(b));
});
test('Unknown invitation status or double Sent never creates a verified acceptance',async()=>{
  const a=fixture();a.raw.pages[0][0]=sent('A',undefined,'PendingApproval');
  await assert.rejects(()=>scan(a));
  const b=fixture();b.raw.pages[0].unshift(sent('A','990000000000000103','Sent'));
  await assert.rejects(()=>scan(b));
});
test('Manual main-only runtime refuses PR, schedule, missing source and unknown staff roles',()=>{
  const good={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
    KINGS_INVITATION_READONLY_PROBE:'true',KINGS_INVITATION_CONVOY_MODE:'dry-run',DISCORD_BOT_TOKEN:'x'.repeat(50),
    KINGS_EVENT_INVITATION_SOURCE_CHANNEL_ID:CH,
    KINGS_EVENT_INVITATION_STAFF_ROLE_IDS:STAFF,
    KINGS_EVENT_INVITATION_ADMIN_ROLE_IDS:ADMIN};
  assert.equal(configFromEnvironment(good).channelId,CH);
  for(const patch of [
    {GITHUB_EVENT_NAME:'pull_request'},{GITHUB_EVENT_NAME:'schedule'},
    {GITHUB_REF:'refs/heads/feature'},{KINGS_INVITATION_READONLY_PROBE:'false'},
    {KINGS_INVITATION_CONVOY_MODE:'live'},
    {KINGS_EVENT_INVITATION_SOURCE_CHANNEL_ID:''},
    {KINGS_EVENT_INVITATION_STAFF_ROLE_IDS:''},
    {KINGS_EVENT_INVITATION_ADMIN_ROLE_IDS:''}])
    assert.throws(()=>configFromEnvironment({...good,...patch}));
});
test('Runtime permits only exact Discord GET paths and rejects redirects / non-200',async()=>{
  const cfg=fixture().config,requests=[];
  const client=createDiscordReadClient({config:cfg,token:'TOKEN_NO_REAL_SECRET',
    fetchImpl:async (url,options)=>{
      requests.push({url,options});
      return {status:200,headers:{get:()=>null},text:async()=>JSON.stringify([])};
    }});
  const r=await client.get('/channels/'+CH+'/messages?limit=100');
  assert.deepEqual(r.data,[]);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.method,'GET');
  assert.equal(requests[0].options.redirect,'error');
  assert.match(requests[0].url,/^https:\/\/discord\.com\/api\/v10\//);
  for(const path of [
    '/channels/'+CH+'/messages','/channels/'+CH+'/messages?limit=1',
    '/channels/'+CH+'/messages?limit=100&after='+HUMAN,
    '/channels/'+UNAUTH+'/messages?limit=100',
    '/guilds/'+UNAUTH+'/roles','/channels/'+CH+'/messages?limit=100#bad',
    '/webhooks/'+CH,'https://example.com'])
    await assert.rejects(()=>client.get(path));
  const forbidden=createDiscordReadClient({config:cfg,token:'TOKEN_NO_REAL_SECRET',
    fetchImpl:async()=>({status:403,headers:{get:()=>null},text:async()=>'{ "token": "secret" }'})});
  await assert.rejects(()=>forbidden.get('/users/@me'),/KINGS_INVITATION_SOURCE_UNVERIFIED/);
});
test('Malformed roles, duplicate settings and non-canonical source configuration cannot pass',async()=>{
  const a=fixture();a.config.staffRoleIds=[STAFF,STAFF];
  await assert.rejects(()=>scan(a));
  const b=fixture();b.config.authorizedAdminRoleIds=[STAFF];
  await assert.rejects(()=>scan(b));
  const c=fixture();c.raw.roles.find(x=>x.id===STAFF).permissions='garbage';
  await assert.rejects(()=>scan(c));
});

test('External role may see configured private source but cannot author structured Staff statuses',async()=>{
  const f=fixture();
  f.config.externalContributorRoleIds=[EXT];
  f.raw.roles.push({id:EXT,permissions:'0'});
  f.raw.channel.permission_overwrites.push(ow(EXT,0,P|R));
  // Author's role is external-only. Structured invitation lifecycle remains
  // strictly internal; no external Accepted status can be imported.
  f.raw.authorMember.roles=[EXT];
  await assert.rejects(()=>scan(f));
});
test('External role can coexist with internal authored structured status without elevation',async()=>{
  const f=fixture();
  f.config.externalContributorRoleIds=[EXT];
  f.raw.roles.push({id:EXT,permissions:'0'});
  f.raw.channel.permission_overwrites.push(ow(EXT,0,P|R));
  const r=await scan(f);
  assert.equal(r.review.counts.sent,1);
  assert.equal(r.eventBookingsCreated,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Optional external role ID is separate from Staff and rejects invalid variable values',()=>{
  const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
    KINGS_INVITATION_READONLY_PROBE:'true',
    KINGS_INVITATION_CONVOY_MODE:'dry-run',
    DISCORD_BOT_TOKEN:'x'.repeat(50),
    KINGS_EVENT_INVITATION_SOURCE_CHANNEL_ID:CH,
    KINGS_EVENT_INVITATION_STAFF_ROLE_IDS:STAFF,
    KINGS_EVENT_INVITATION_ADMIN_ROLE_IDS:ADMIN,
    KINGS_EVENT_INVITATION_EXTERNAL_ROLE_IDS:EXT};
  const c=configFromEnvironment(env);
  assert.deepEqual(c.staffRoleIds,[STAFF]);
  assert.deepEqual(c.externalContributorRoleIds,[EXT]);
  assert.deepEqual(configFromEnvironment({...env,
    KINGS_EVENT_INVITATION_EXTERNAL_ROLE_IDS:''}).externalContributorRoleIds,[]);
  for(const invalid of ['not-id',EXT+','+EXT,EXT+','+STAFF,' ']){
    assert.throws(()=>configFromEnvironment({...env,
      KINGS_EVENT_INVITATION_EXTERNAL_ROLE_IDS:invalid}));
  }
});
