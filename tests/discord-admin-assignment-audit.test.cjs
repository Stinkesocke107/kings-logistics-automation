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
const USER='1800000000000000025';
const bit=(...names)=>names.reduce((a,n)=>a|P[n],0n).toString();
function base(){
 const roles=[
  {id:GUILD,name:'@everyone',permissions:'0'},
  {id:MANAGEMENT_ROLE,name:'Management',permissions:'0'},
  {id:BOT_ROLE,name:'Kings Systems',permissions:bit('READ_MESSAGE_HISTORY'),tags:{bot_id:BOT}},
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
 membersUnavailable=false,onRequest=()=>{}}={}){
 return async (url,options)=>{
  onRequest(url,options);
  const p=new URL(url).pathname;
  if(p==='/users/@me')return new Response(JSON.stringify({id:BOT}));
  if(p==='/guilds/'+GUILD+'/roles')return new Response(JSON.stringify(roles));
  if(p==='/guilds/'+GUILD+'/channels')return new Response(JSON.stringify([channel]));
  if(p==='/guilds/'+GUILD+'/members/'+BOT)return new Response(JSON.stringify({roles:[BOT_ROLE]}));
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
 assert.deepEqual(A.roleCandidates(roles,BOT,GUILD),{guildWide:false,identities:[OTHER_ROLE]});
 const trusted=[...roles,{id:'1900000000000000000',name:'Head Management',permissions:bit('ADMINISTRATOR')}];
 assert.deepEqual(A.roleCandidates(trusted,BOT,GUILD).identities,[OTHER_ROLE]);
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
 assert.equal((await A.audit({transport:mockTransport()})).code,'NO_NONOWNER_ASSIGNMENTS_OBSERVED');
 const members=[{user:{id:OWNER},roles:[OTHER_ROLE]},{user:{id:USER},roles:[]}];
 assert.equal((await A.audit({transport:mockTransport({members})})).code,'NO_NONOWNER_ASSIGNMENTS_OBSERVED');
});
test('lack of privileged member-list access cannot be reported as a privacy clearance',async()=>{
 assert.equal((await A.audit({transport:mockTransport({membersUnavailable:true})})).code,'INCONCLUSIVE_MEMBER_LIST');
});
test('no unapproved Administrator role avoids unnecessary roster enumeration',async()=>{
 const roles=base().roles.filter(r=>r.id!==OTHER_ROLE);
 const urls=[];
 const result=await A.audit({transport:mockTransport({roles,onRequest:(u)=>urls.push(u)})});
 assert.equal(result.code,'NO_UNAPPROVED_ADMIN_ROLES');
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
