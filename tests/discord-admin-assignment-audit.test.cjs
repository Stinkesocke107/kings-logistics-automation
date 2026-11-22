'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.env.DISCORD_BOT_TOKEN='synthetic-admin-audit-test-token';
const A=require('../discord-admin-assignment-audit');
const P=require('../discord-permission-audit').PERMISSIONS;
const GUILD='1114967437788577792',BOT='1404524559214051499';
const OWNER='1800000000000000001',BOT_ROLE='1800000000000000002';
const MANAGEMENT_ROLE='1800000000000000003',OTHER_ROLE='1800000000000000004';
const CEO_ROLE='1800000000000000005',GALAXY_ROLE='1800000000000000006',GALAXY_BOT='1800000000000000007';
const USER='1800000000000000025';
const bit=(...names)=>names.reduce((a,n)=>a|P[n],0n).toString();
function base(){
 const roles=[
  {id:GUILD,name:'@everyone',permissions:'0'},
  {id:MANAGEMENT_ROLE,name:'Management',permissions:'0'},
  {id:BOT_ROLE,name:'Kings Systems',permissions:bit('READ_MESSAGE_HISTORY'),tags:{bot_id:BOT}},
  {id:CEO_ROLE,name:'CEO',permissions:bit('ADMINISTRATOR')},
  {id:GALAXY_ROLE,name:'Galaxy',permissions:bit('ADMINISTRATOR'),managed:true,tags:{bot_id:GALAXY_BOT}},
  {id:OTHER_ROLE,name:'Unrelated Role',permissions:bit('ADMINISTRATOR')}
 ];
 const channel={id:'1572736232969084948',guild_id:GUILD,type:0,
  permission_overwrites:[
   {id:GUILD,type:0,allow:'0',deny:bit('VIEW_CHANNEL')},
   {id:MANAGEMENT_ROLE,type:0,allow:bit('VIEW_CHANNEL'),deny:'0'},
   {id:BOT_ROLE,type:0,allow:bit('VIEW_CHANNEL','READ_MESSAGE_HISTORY'),deny:'0'}
  ]};
 return {roles,channel};
}
function mockTransport({roles=base().roles,channel=base().channel,
 members=[{user:{id:OWNER},roles:[]},{user:{id:USER},roles:[]}],
 membersUnavailable=false,galaxyBotMember={user:{id:GALAXY_BOT,bot:true},roles:[GALAXY_ROLE]},onRequest=()=>{}}={}){
 return async (url,options)=>{
  onRequest(url,options);
  const p=new URL(url).pathname.replace(/^\/api\/v10/,'');
  if(p==='/users/@me')return new Response(JSON.stringify({id:BOT}));
  if(p==='/guilds/'+GUILD+'/roles')return new Response(JSON.stringify(roles));
  if(p==='/guilds/'+GUILD+'/channels')return new Response(JSON.stringify([channel]));
  if(p==='/guilds/'+GUILD+'/members/'+BOT)return new Response(JSON.stringify({roles:[BOT_ROLE]}));
  if(p==='/guilds/'+GUILD+'/members/'+GALAXY_BOT)return galaxyBotMember?new Response(JSON.stringify(galaxyBotMember)):new Response('{}',{status:404});
  if(p==='/guilds/'+GUILD)return new Response(JSON.stringify({id:GUILD,owner_id:OWNER}));
  if(p==='/guilds/'+GUILD+'/members'){
   if(membersUnavailable)return new Response('{}',{status:403});
   const after=BigInt(new URL(url).searchParams.get('after')||'0');
   const page=members.filter(m=>BigInt(m.user.id)>after).slice(0,1000);
   return new Response(JSON.stringify(page));
  }
  throw Error('Unexpected synthetic Discord route');
 };
}
test('Discord allowlist permits only necessary GETs and blocks other member/message routes',()=>{
 assert.equal(A.routeAllowed('/guilds/'+GUILD+'/members?limit=1000&after=0'),true);
 assert.equal(A.routeAllowed('/guilds/'+GUILD+'/roles'),true);
 assert.equal(A.routeAllowed('/guilds/'+GUILD+'/members/'+BOT),true);
 for(const p of [
  '/guilds/'+GUILD+'/members?limit=500&after=0',
  '/guilds/'+GUILD+'/members/search?query=foo',
  '/channels/1572736232969084948/messages?limit=100',
  '/guilds/'+GUILD+'/bans',
  '/guilds/'+GUILD+'/members/'+USER+'/roles/'+OTHER_ROLE
 ])assert.equal(A.routeAllowed(p),false,p);
});
test('unrelated Admin role metadata detected; legitimate Management and bot roles excluded',()=>{
 const {roles}=base();
 assert.deepEqual(A.roleCandidates(roles,BOT,GUILD),{guildWide:false,identities:[OTHER_ROLE],galaxy:[{roleId:GALAXY_ROLE,botId:GALAXY_BOT}]});
 const trusted=[...roles,{id:'1900000000000000000',name:'Head Management',permissions:bit('ADMINISTRATOR')}];
 assert.deepEqual(A.roleCandidates(trusted,BOT,GUILD).identities,[OTHER_ROLE,'1900000000000000000']);
 const everyoneAdmin=roles.map(r=>r.id===GUILD?{...r,permissions:bit('ADMINISTRATOR')}:r);
 assert.equal(A.roleCandidates(everyoneAdmin,BOT,GUILD).guildWide,true);
});
test('full roster with assigned outside Admin role -> review required, no user identity output',async()=>{
 const members=[{user:{id:OWNER},roles:[]},{user:{id:USER},roles:[OTHER_ROLE]}];
 const calls=[];
 const result=await A.audit({transport:mockTransport({members,onRequest:(url,opts)=>calls.push({url,opts})})});
 assert.equal(result.code,'ASSIGNED_PRIVATE_REVIEW_REQUIRED');
 assert.ok(calls.length>=6);
 assert.ok(calls.every(c=>c.opts.method==='GET'));
 assert.ok(calls.every(c=>!c.url.includes('/messages')));
 assert.doesNotMatch(JSON.stringify(result),new RegExp(USER+'|'+OTHER_ROLE));
});
test('full roster with no nonowner assignment -> no assignment observed',async()=>{
 assert.equal((await A.audit({transport:mockTransport()})).code,'NO_OTHER_ADMIN_ASSIGNMENTS_OBSERVED');
 const members=[{user:{id:OWNER},roles:[OTHER_ROLE]},{user:{id:USER},roles:[]}];
 assert.equal((await A.audit({transport:mockTransport({members})})).code,'NO_OTHER_ADMIN_ASSIGNMENTS_OBSERVED');
});
test('lack of privileged member-list access cannot be reported as a privacy clearance',async()=>{
 assert.equal((await A.audit({transport:mockTransport({membersUnavailable:true})})).code,'INCONCLUSIVE_MEMBER_LIST');
});
test('no unapproved Administrator role avoids unnecessary roster enumeration',async()=>{
 const roles=base().roles.filter(r=>r.id!==OTHER_ROLE);
 const urls=[];
 const result=await A.audit({transport:mockTransport({roles,onRequest:(u)=>urls.push(u)})});
 assert.equal(result.code,'APPROVED_CEO_AND_GALAXY_ONLY');
 assert.ok(!urls.some(u=>/members\?/.test(u)));
});
test('guild-wide Administrator and broad channel grants remain hard structural review',async()=>{
 const {roles,channel}=base();
 const everyone=roles.map(r=>r.id===GUILD?{...r,permissions:bit('ADMINISTRATOR')}:r);
 assert.equal((await A.audit({transport:mockTransport({roles:everyone})})).code,'STRUCTURAL_REVIEW_REQUIRED');
 const pub={...channel,permission_overwrites:[{id:GUILD,type:0,allow:bit('VIEW_CHANNEL'),deny:'0'}]};
 assert.equal((await A.audit({transport:mockTransport({channel:pub})})).code,'STRUCTURAL_REVIEW_REQUIRED');
});
test('1001 members require two paginated calls and last-page assignment is still detected',async()=>{
 const members=[];
 for(let i=1;i<=1001;i++)members.push({user:{id:(1900000000000000000n+BigInt(i)).toString()},roles:i===1001?[OTHER_ROLE]:[]});
 const urls=[];
 const result=await A.audit({transport:mockTransport({members,onRequest:u=>urls.push(u)})});
 assert.equal(result.code,'ASSIGNED_PRIVATE_REVIEW_REQUIRED');
 assert.equal(urls.filter(u=>u.includes('/members?')).length,2);
});
test('empty and unsorted member list are INCONCLUSIVE, never empty-assignment success',async()=>{
 assert.equal((await A.audit({transport:mockTransport({members:[]})})).code,'INCONCLUSIVE_MEMBER_LIST');
 const unsorted=[{user:{id:USER},roles:[]},{user:{id:OWNER},roles:[]}];
 assert.equal((await A.audit({transport:mockTransport({members:unsorted})})).code,'INCONCLUSIVE_MEMBER_LIST');
});
test('audit source has no Discord writes, message reads, identity logging or stored member data',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../discord-admin-assignment-audit.js'),'utf8');
 assert.doesNotMatch(s,/method\s*:\s*['"](POST|PATCH|PUT|DELETE)['"]/i);
 assert.doesNotMatch(s,/(?:writeFileSync|appendFileSync|unlinkSync|readdirSync)\(/);
 assert.doesNotMatch(s,/console\.log\([^;\n]*(?:member\.|role\.|owner_id|memberId|user\.id)/);
 assert.doesNotMatch(s,/\/channels\/[^'"\n]*\/messages/);
});

test('only the real managed Galaxy bot role and explicitly named CEO role are administrator exceptions',async()=>{
 const roles=base().roles.filter(r=>r.id!==OTHER_ROLE);
 const result=await A.audit({transport:mockTransport({roles})});
 assert.equal(result.code,'APPROVED_CEO_AND_GALAXY_ONLY');
 const names=roles.filter(A.isCeoAdminRole);
 assert.deepEqual(names.map(r=>r.id),[CEO_ROLE]);
 assert.equal(A.isCeoAdminRole({name:'Management'}),false);
 assert.equal(A.isCeoAdminRole({name:'Head Management'}),false);
 assert.equal(A.isGalaxyManagedBotRole(roles.find(r=>r.id===GALAXY_ROLE)),true);
 assert.equal(A.isGalaxyManagedBotRole({name:'Galaxy',managed:false,tags:{bot_id:GALAXY_BOT}}),false);
 assert.equal(A.isGalaxyManagedBotRole({name:'Galaxy',managed:true,tags:{}}),false);
});

test('role called Galaxy is NOT an approved exception without managed tag and matching verified bot identity',async()=>{
 const roles=base().roles;
 for(const variant of [
  {name:'Galaxy',managed:false,tags:{bot_id:GALAXY_BOT}},
  {name:'Galaxy',managed:true,tags:{}},
  {name:'Unknown Bot',managed:true,tags:{bot_id:GALAXY_BOT}}
 ]){
  const unsafe=roles.map(r=>r.id===GALAXY_ROLE?{...r,...variant}:r);
  assert.equal(A.roleCandidates(unsafe,BOT,GUILD).identities.includes(GALAXY_ROLE),true);
 }
 for(const member of [
  null,
  {user:{id:GALAXY_BOT,bot:false},roles:[GALAXY_ROLE]},
  {user:{id:GALAXY_BOT,bot:true},roles:[]},
  {user:{id:USER,bot:true},roles:[GALAXY_ROLE]}
 ]){
  const result=await A.audit({transport:mockTransport({roles:roles.filter(r=>r.id!==OTHER_ROLE),galaxyBotMember:member})});
  assert.equal(result.code,'GALAXY_IDENTITY_UNVERIFIED');
 }
});

test('ordinary Management or unrelated service role with global Admin is still subject to an assignment review',async()=>{
 const ordinary='1800000000000000099';
 const roles=base().roles.filter(r=>r.id!==OTHER_ROLE)
  .concat([{id:ordinary,name:'Management',permissions:bit('ADMINISTRATOR')}]);
 const members=[{user:{id:OWNER},roles:[]},{user:{id:USER},roles:[ordinary]}];
 const result=await A.audit({transport:mockTransport({roles,members})});
 assert.equal(result.code,'ASSIGNED_PRIVATE_REVIEW_REQUIRED');
});


test('Galaxy managed role may be non-admin while real Galaxy bot obtains Admin through a separate assigned role',async()=>{
  const galaxyRole=base().roles.map(role=>role.id===GALAXY_ROLE?{...role,permissions:'0'}:role);
  const members=[
    {user:{id:OWNER},roles:[]},
    {user:{id:GALAXY_BOT,bot:true},roles:[GALAXY_ROLE,OTHER_ROLE]},
    {user:{id:USER},roles:[]}
  ];
  const galaxyBotMember={user:{id:GALAXY_BOT,bot:true},roles:[GALAXY_ROLE,OTHER_ROLE]};
  const result=await A.audit({transport:mockTransport({roles:galaxyRole,members,galaxyBotMember})});
  assert.equal(result.code,'NO_OTHER_ADMIN_ASSIGNMENTS_OBSERVED');
  const candidates=A.roleCandidates(galaxyRole,BOT,GUILD);
  assert.deepEqual(candidates.identities,[OTHER_ROLE]);
  assert.deepEqual(candidates.galaxy,[{roleId:GALAXY_ROLE,botId:GALAXY_BOT}]);
});

test('Sharing Galaxy bot supplemental Administrator role with a human still fails closed',async()=>{
  const galaxyRole=base().roles.map(role=>role.id===GALAXY_ROLE?{...role,permissions:'0'}:role);
  const members=[
    {user:{id:OWNER},roles:[]},
    {user:{id:GALAXY_BOT,bot:true},roles:[GALAXY_ROLE,OTHER_ROLE]},
    {user:{id:USER},roles:[OTHER_ROLE]}
  ];
  const galaxyBotMember={user:{id:GALAXY_BOT,bot:true},roles:[GALAXY_ROLE,OTHER_ROLE]};
  assert.equal((await A.audit({transport:mockTransport({roles:galaxyRole,members,galaxyBotMember})})).code,'ASSIGNED_PRIVATE_REVIEW_REQUIRED');
});

test('Missing valid Galaxy managed role or missing effective Administrator is NOT a verified CEO-plus-Galaxy policy',async()=>{
  const noGalaxyRole=base().roles.filter(role=>role.id!==GALAXY_ROLE);
  assert.equal((await A.audit({transport:mockTransport({roles:noGalaxyRole})})).code,'GALAXY_MANAGED_ROLE_NOT_FOUND');
  const notAdmin=base().roles.filter(role=>role.id!==OTHER_ROLE).map(role=>
     role.id===GALAXY_ROLE?{...role,permissions:'0'}:role);
  assert.equal((await A.audit({transport:mockTransport({roles:notAdmin})})).code,'GALAXY_ADMIN_NOT_DETECTED');
});


test('Galaxy is detected from verified bot account even when managed role has unrelated display name',async()=>{
 const roles=base().roles.filter(r=>r.id!==OTHER_ROLE).map(r=>
  r.id===GALAXY_ROLE?{...r,name:'Ticket Manager'}:r
 );
 const galaxyBotMember={user:{id:GALAXY_BOT,bot:true,username:'Galaxy'},roles:[GALAXY_ROLE]};
 const calls=[];
 const result=await A.audit({transport:mockTransport({roles,galaxyBotMember,onRequest:(u)=>calls.push(u)})});
 assert.equal(result.code,'APPROVED_CEO_AND_GALAXY_ONLY');
 assert.ok(!calls.some(x=>/\/messages/.test(x)));
 assert.ok(calls.every(x=>!x.includes('/guilds/'+GUILD+'/members?')),'no human roster needed when CEO/Galaxy only roles exist');
});

test('renamed managed role with real Galaxy bot acquiring Admin through extra role still scans human assignments',async()=>{
 const roles=base().roles.map(r=>r.id===GALAXY_ROLE?{...r,name:'Ticket Manager',permissions:'0'}:r);
 const galaxyBotMember={user:{id:GALAXY_BOT,bot:true,username:'Galaxy'},roles:[GALAXY_ROLE,OTHER_ROLE]};
 const members=[
  {user:{id:OWNER},roles:[]},
  {user:{id:GALAXY_BOT,bot:true},roles:[GALAXY_ROLE,OTHER_ROLE]},
  {user:{id:USER},roles:[]}
 ];
 assert.equal((await A.audit({transport:mockTransport({roles,galaxyBotMember,members})})).code,
  'NO_OTHER_ADMIN_ASSIGNMENTS_OBSERVED');
 members[2].roles=[OTHER_ROLE];
 assert.equal((await A.audit({transport:mockTransport({roles,galaxyBotMember,members})})).code,
  'ASSIGNED_PRIVATE_REVIEW_REQUIRED');
});
test('managed bot role with arbitrary renamed account is not falsely identified as Galaxy',async()=>{
 const roles=base().roles.filter(r=>r.id!==OTHER_ROLE).map(r=>
  r.id===GALAXY_ROLE?{...r,name:'Ticket Manager'}:r);
 const galaxyBotMember={user:{id:GALAXY_BOT,bot:true,username:'Someone Else'},roles:[GALAXY_ROLE]};
 const outcome=await A.audit({transport:mockTransport({roles,galaxyBotMember})});
 assert.equal(outcome.code,'GALAXY_IDENTITY_UNVERIFIED');
 assert.equal(A.galaxyAccountLabel('GalaxyBot'),true);
 assert.equal(A.galaxyAccountLabel('Galaxy Ticket Bot'),true);
 assert.equal(A.galaxyAccountLabel('Galaxy Logistics'),false);
});
