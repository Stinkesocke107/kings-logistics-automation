'use strict';
// Kings protected HR/Driver channels: structural permission audit ONLY.
// Never GET message content, private register entries, decision records,
// other member profiles/rosters, or emit role/channel/user identifiers.
// This script cannot grant/revoke access or modify production state.
const fs=require('node:fs');
const path=require('node:path');
const {managementRole}=require('./driver-loyalty-register');
const {hrApproverRole}=require('./hr-driver-decision-source');
const {
  PERMISSIONS,basePermissions,effectiveChannelPermissions
}=require('./discord-permission-audit');

const GUILD=process.env.DISCORD_GUILD_ID || '1114967437788577792';
const TOKEN=process.env.DISCORD_BOT_TOKEN || '';
const REGISTER='1572736232969084948';
const API='https://discord.com/api/v10';
const ID=/^\d{17,22}$/;
const BITS=PERMISSIONS;
const TARGETS=Object.freeze([
 {key:'driver-identity-register',id:REGISTER,kind:'management',required:true},
 {key:'hr-decision-ledger',id:process.env.KINGS_HR_DECISIONS_CHANNEL_ID||'',kind:'hr',required:false},
 {key:'hr-private-case-view',id:process.env.KINGS_HR_CASE_VIEW_CHANNEL_ID||'',kind:'hr',required:false}
]);

function contains(value,flag){
 try{return (BigInt(String(value??'0')) & flag)===flag;}catch{return false;}
}
function authorizedRole(role,kind,botId){
 if(!role)return false;
 if(String(role?.tags?.bot_id||'')===String(botId))return true;
 return kind==='management' ? managementRole(role) : hrApproverRole(role);
}
function decision(status,reason){return Object.freeze({status,reason});}
function assessChannel(target,channel,roles,{guildId,botId,botRoleIds=[]}){
 if(!channel||String(channel.id)!==String(target.id)||
    String(channel.guild_id)!==String(guildId)||Number(channel.type)!==0||
    !Array.isArray(channel.permission_overwrites))
    return decision('UNVERIFIED','protected-channel-identity-or-overwrites-unavailable');
 if(!Array.isArray(roles)||!roles.length||!ID.test(String(botId||''))||
    !Array.isArray(botRoleIds))
    return decision('UNVERIFIED','role-or-bot-evidence-unavailable');
 const overwrites=channel.permission_overwrites;
 const everyone=overwrites.filter(x=>String(x.id)===String(guildId)&&Number(x.type)===0);
 if(everyone.length!==1||!contains(everyone[0].deny,BITS.VIEW_CHANNEL)||
    contains(everyone[0].allow,BITS.VIEW_CHANNEL))
    return decision('UNVERIFIED','everyone-view-not-safely-denied');
 const byId=new Map(roles.map(r=>[String(r.id),r]));
 if(byId.size!==roles.length)
    return decision('UNVERIFIED','ambiguous-role-metadata');
 // Administrator bypasses private channel denies. Without a human member
 // roster we can prove only a POTENTIAL bypass from configured role powers.
 for(const role of roles){
  if(contains(role.permissions,BITS.ADMINISTRATOR)&&
     !authorizedRole(role,target.kind,botId))
    return decision('UNVERIFIED','unrelated-administrator-role-may-bypass-privacy');
 }
 const seen=new Set();
 for(const item of overwrites){
  const key=String(item.type)+':'+String(item.id);
  if(seen.has(key))return decision('UNVERIFIED','duplicate-permission-overwrite');
  seen.add(key);
  if(!contains(item.allow,BITS.VIEW_CHANNEL))continue;
  if(Number(item.type)===0){
   if(String(item.id)===String(guildId)||
      !authorizedRole(byId.get(String(item.id)),target.kind,botId))
     return decision('UNVERIFIED','nonapproved-role-explicit-view-grant');
  }else if(Number(item.type)===1){
   // An individual Management/HR exception cannot be approved from channel
   // metadata alone; an authorized human must check membership privately.
   if(String(item.id)!==String(botId))
     return decision('UNVERIFIED','individual-view-grant-needs-private-authorization');
  }else return decision('UNVERIFIED','unsupported-permission-overwrite');
 }
 const base=basePermissions(guildId,botRoleIds,roles);
 if(contains(base,BITS.ADMINISTRATOR))
   return decision('UNVERIFIED','bot-global-administrator-privacy-bypass');
 const effective=effectiveChannelPermissions(channel,guildId,botId,botRoleIds,base);
 if(!contains(effective,BITS.VIEW_CHANNEL)||!contains(effective,BITS.READ_MESSAGE_HISTORY))
   return decision('UNVERIFIED','bot-minimum-read-access-unverified');
 return decision('VERIFIED','protected-overwrites-and-bot-read-access-match');
}
function configuration(targets=TARGETS){
 const configured=targets.filter(x=>x.id);
 if(configured.some(x=>!ID.test(String(x.id))))
  return 'invalid-private-channel-configuration';
 if(new Set(configured.map(x=>String(x.id))).size!==configured.length)
  return 'protected-channel-targets-must-be-distinct';
 return null;
}
async function getJson(route,transport=fetch){
 if(!/^\/(?:users\/@me|guilds\/\d{17,22}\/(?:roles|channels|members\/\d{17,22}))$/.test(route))
  throw Error('blocked-read-route');
 const response=await transport(API+route,{
   method:'GET',
   headers:{Authorization:'Bot '+TOKEN,Accept:'application/json'},
   signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('discord-permissions-read-unavailable');
 const json=await response.json();
 if(!json||typeof json!=='object')throw Error('discord-permissions-json-invalid');
 return json;
}
async function audit({transport=fetch,targets=TARGETS}={}){
 if(!TOKEN)throw Error('bot-token-unavailable');
 const issue=configuration(targets);
 if(issue)throw Error(issue);
 // Only the registered Kings Systems bot member is queried. No human member
 // list, individual identities, channel history or confidential messages.
 const [bot,roles,channels]=await Promise.all([
  getJson('/users/@me',transport),
  getJson('/guilds/'+GUILD+'/roles',transport),
  getJson('/guilds/'+GUILD+'/channels',transport)
 ]);
 if(!ID.test(String(bot?.id||''))||!Array.isArray(roles)||
    !Array.isArray(channels)||!roles.length||!channels.length)
  throw Error('incomplete-guild-permission-evidence');
 const self=await getJson('/guilds/'+GUILD+'/members/'+bot.id,transport);
 if(!Array.isArray(self?.roles))
  throw Error('bot-role-membership-unavailable');
 return targets.map(target=>{
  if(!target.id)return {key:target.key,...decision('NOT_CONFIGURED','optional-hr-channel-unconfigured')};
  const matches=channels.filter(c=>String(c?.id)===String(target.id));
  const check=matches.length===1
   ? assessChannel(target,matches[0],roles,{
     guildId:GUILD,botId:bot.id,botRoleIds:self.roles
    })
   : decision('UNVERIFIED','protected-channel-missing-or-ambiguous');
  return {key:target.key,...check};
 });
}
async function main(){
 const results=await audit();
 for(const r of results)
  console.log('[Kings Protected Channel Access] '+r.key+': '+r.status+' ('+r.reason+')');
 console.log('Protected channel audit reads structural permission metadata and ONE bot role membership only. No private messages, no HR decisions, no role changes.');
 if(results.some(x=>x.status==='UNVERIFIED'))throw Error('Protected HR/Driver permission evidence incomplete');
}
if(require.main===module)main().catch(()=>{
 console.error('Kings protected channel audit incomplete; details withheld and NO Discord writes attempted.');
 process.exitCode=1;
});
module.exports={REGISTER,TARGETS,contains,authorizedRole,assessChannel,configuration,getJson,audit};
