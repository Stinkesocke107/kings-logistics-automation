'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.env.DISCORD_BOT_TOKEN='synthetic-test-credential';
const A=require('../discord-protected-channel-access-audit');
const P=require('../discord-permission-audit').PERMISSIONS;
const guild='1114967437788577792',bot='1404524559214051499';
const roleManagement='1800000000000000001',roleBot='1800000000000000002',roleDriver='1800000000000000003';
const power=(...bits)=>bits.reduce((n,k)=>n|P[k],0n).toString();
const roles=[
 {id:guild,name:'@everyone',permissions:power('VIEW_CHANNEL','READ_MESSAGE_HISTORY')},
 {id:roleManagement,name:'Management',permissions:'0'},
 {id:roleBot,name:'Kings Systems',permissions:power('READ_MESSAGE_HISTORY'),tags:{bot_id:bot}},
 {id:roleDriver,name:'Kings Driver',permissions:'0'}
];
const overwrite=(id,type,allow='0',deny='0')=>({id,type,allow,deny});
const channel=()=>({
 id:A.REGISTER,guild_id:guild,type:0,
 permission_overwrites:[
  overwrite(guild,0,'0',power('VIEW_CHANNEL')),
  overwrite(roleManagement,0,power('VIEW_CHANNEL')),
  overwrite(roleBot,0,power('VIEW_CHANNEL','READ_MESSAGE_HISTORY'))
 ]
});
const target=A.TARGETS[0],context={guildId:guild,botId:bot,botRoleIds:[roleBot]};
test('management-only Driver register allows a verified bot reader but no ordinary Driver',()=>{
 const result=A.assessChannel(target,channel(),roles,context);
 assert.deepEqual(result,{status:'VERIFIED',reason:'protected-overwrites-and-bot-read-access-match'});
});
test('public or poorly isolated channels must never be considered private',()=>{
 let c=channel();c.permission_overwrites[0].deny='0';
 assert.equal(A.assessChannel(target,c,roles,context).reason,'everyone-view-not-safely-denied');
 c=channel();c.permission_overwrites[0].allow=power('VIEW_CHANNEL');
 assert.equal(A.assessChannel(target,c,roles,context).reason,'everyone-view-not-safely-denied');
 c=channel();c.guild_id='1999999999999999999';
 assert.equal(A.assessChannel(target,c,roles,context).status,'UNVERIFIED');
});
test('role grants to Drivers, Trials or unrecognized audience are not approved',()=>{
 const c=channel();c.permission_overwrites.push(overwrite(roleDriver,0,power('VIEW_CHANNEL')));
 assert.equal(A.assessChannel(target,c,roles,context).reason,'nonapproved-role-explicit-view-grant');
 c.permission_overwrites.pop();
 c.permission_overwrites.push(overwrite('1999999999999999999',0,power('VIEW_CHANNEL')));
 assert.equal(A.assessChannel(target,c,roles,context).reason,'nonapproved-role-explicit-view-grant');
});
test('individual human grants need private authorization and cannot be guessed from metadata',()=>{
 const c=channel();c.permission_overwrites.push(overwrite('1999999999999999999',1,power('VIEW_CHANNEL')));
 assert.equal(A.assessChannel(target,c,roles,context).reason,'individual-view-grant-needs-private-authorization');
});
test('an unrelated Administrator role without member-assignment proof is ADVISORY, never VERIFIED',()=>{
 const withAdmin=[...roles,{id:'1900000000000000000',name:'External Partner',permissions:power('ADMINISTRATOR')}];
 assert.deepEqual(A.assessChannel(target,channel(),withAdmin,context),{
  status:'ADVISORY',reason:'administrator-role-bypass-assignment-not-verified'
 });
});
test('a broad explicit view permission is a hard failure even if an Administrator role also exists',()=>{
 const withAdmin=[...roles,{id:'1900000000000000000',name:'External Partner',permissions:power('ADMINISTRATOR')}];
 const c=channel();c.permission_overwrites.push(overwrite(roleDriver,0,power('VIEW_CHANNEL')));
 assert.equal(A.assessChannel(target,c,withAdmin,context).reason,'nonapproved-role-explicit-view-grant');
});
test('@everyone with Administrator power is a hard failure, not a role-assignment advisory',()=>{
 const everyoneAdmin=roles.map(r=>r.id===guild?{...r,permissions:power('ADMINISTRATOR')}:r);
 assert.deepEqual(A.assessChannel(target,channel(),everyoneAdmin,context),{
  status:'UNVERIFIED',reason:'everyone-administrator-can-bypass-privacy'
 });
});
test('privacy failures take priority over non-approved Administrator advisory',()=>{
 const withAdmin=[...roles,{id:'1900000000000000000',name:'External Partner',permissions:power('ADMINISTRATOR')}];
 const notPrivate=channel();notPrivate.permission_overwrites[0].deny='0';
 assert.equal(A.assessChannel(target,notPrivate,withAdmin,context).reason,'everyone-view-not-safely-denied');
 assert.equal(A.assessChannel(target,channel(),withAdmin,{...context,botRoleIds:[]}).reason,'bot-minimum-read-access-unverified');
});
test('bot permission and bot Administrator policies fail closed',()=>{
 assert.equal(A.assessChannel(target,channel(),roles,{...context,botRoleIds:[]}).reason,'bot-minimum-read-access-unverified');
 const withBotAdmin=roles.map(role=>role.id===roleBot?{...role,permissions:power('ADMINISTRATOR')}:role);
 assert.equal(A.assessChannel(target,channel(),withBotAdmin,context).reason,'bot-global-administrator-privacy-bypass');
});
test('optional HR decision/case channels are distinguished from a passed security audit',()=>{
 assert.equal(A.configuration([{key:'reg',id:A.REGISTER},{key:'hr',id:A.REGISTER}]),'protected-channel-targets-must-be-distinct');
 assert.equal(A.configuration([{key:'reg',id:A.REGISTER},{key:'hr',id:'not-an-id'}]),'invalid-private-channel-configuration');
});
test('all Discord requests are GET and no message/history/human roster is fetched',async()=>{
 const requested=[];
 const transport=async(url,options)=>{
  requested.push({url,method:options.method});
  if(url.endsWith('/users/@me'))return new Response(JSON.stringify({id:bot}),{status:200});
  if(url.endsWith('/roles'))return new Response(JSON.stringify(roles),{status:200});
  if(url.endsWith('/channels'))return new Response(JSON.stringify([channel()]),{status:200});
  if(url.endsWith('/members/'+bot))return new Response(JSON.stringify({roles:[roleBot]}),{status:200});
  return new Response('{}',{status:404});
 };
 const result=await A.audit({transport,targets:[
  target,{key:'hr-decision-ledger',id:'',kind:'hr',required:false},
  {key:'hr-private-case-view',id:'',kind:'hr',required:false}
 ]});
 assert.equal(result[0].status,'VERIFIED');
 assert.deepEqual(result.slice(1).map(x=>x.status),['NOT_CONFIGURED','NOT_CONFIGURED']);
 assert.equal(requested.length,4);
 assert.ok(requested.every(r=>r.method==='GET'));
 assert.ok(!requested.some(r=>/messages|members\?|members\%3F/.test(r.url)));
});
test('read-only Discord audit reports administrator potential separately from a proven channel misconfiguration',async()=>{
 const requests=[];
 const withAdmin=[...roles,{id:'1900000000000000000',name:'External Partner',permissions:power('ADMINISTRATOR')}];
 const transport=async(url,options)=>{
  requests.push({url,method:options.method});
  if(url.endsWith('/users/@me'))return new Response(JSON.stringify({id:bot}),{status:200});
  if(url.endsWith('/roles'))return new Response(JSON.stringify(withAdmin),{status:200});
  if(url.endsWith('/channels'))return new Response(JSON.stringify([channel()]),{status:200});
  if(url.endsWith('/members/'+bot))return new Response(JSON.stringify({roles:[roleBot]}),{status:200});
  return new Response('{}',{status:404});
 };
 const results=await A.audit({transport,targets:[
  target,{key:'hr-decision-ledger',id:'',kind:'hr',required:false},
  {key:'hr-private-case-view',id:'',kind:'hr',required:false}
 ]});
 assert.deepEqual(results.map(r=>r.status),['ADVISORY','NOT_CONFIGURED','NOT_CONFIGURED']);
 assert.ok(requests.every(r=>r.method==='GET'));
 assert.ok(!requests.some(r=>r.url.includes('/messages')||/members\\?/.test(r.url)));
});
test('HR-specific approval roles differ from ordinary Staff',()=>{
 const hrTarget={key:'hr-decisions',id:A.REGISTER,kind:'hr'};
 assert.equal(A.assessChannel(hrTarget,channel(),roles,context).status,'VERIFIED');
 const c=channel();c.permission_overwrites.push(overwrite('1800000000000000004',0,power('VIEW_CHANNEL')));
 const withHrStaff=[...roles,{id:'1800000000000000004',name:'Staff',permissions:'0'}];
 assert.equal(A.assessChannel(hrTarget,c,withHrStaff,context).reason,'nonapproved-role-explicit-view-grant');
});
test('source contains no private message reads, role writes or person-data logging',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../discord-protected-channel-access-audit.js'),'utf8');
 assert.doesNotMatch(s,/method:\s*['"](?:POST|PATCH|DELETE|PUT)['"]/);
 assert.doesNotMatch(s,/(?:writeFileSync|appendFileSync|unlinkSync|readdirSync)\(/);
 assert.doesNotMatch(s,/console\.log\([^\n]*(?:channel\.name|role\.name|bot\.id|message\.content)/);
 assert.doesNotMatch(s,/\/messages\?/);
});
