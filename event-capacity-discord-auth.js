'use strict';
// Discord Event Capacity gateway prototype. Authenticates signed Discord
// interactions and checks current membership/permissions READ ONLY.
// Does not create commands/channels, publish, or mutate a decision ledger.
// The caller MUST provide a durable, atomic consumeInteractionId callback.
// Role IDs must be explicitly verified/configured by the Kings owner.
const crypto=require('node:crypto');
const {
  PERMISSIONS,basePermissions,effectiveChannelPermissions
}=require('./discord-permission-audit');
const ERROR='Kings Event Capacity Discord authorization not verified.';
const ID=/^\d{17,22}$/;
const PUBLIC_KEY=/^[a-fA-F0-9]{64}$/;
const SIGNATURE=/^[a-fA-F0-9]{128}$/;
const TIMESTAMP=/^\d{10,11}$/;
const ACCESS=['Event Coordination','Event Leadership','CEO'];
const ALL=[...ACCESS,'Event Management'];
const SPKI_PREFIX=Buffer.from('302a300506032b6570032100','hex');
const has=(value,flag)=>(value&flag)===flag;
function fail(){throw new Error(ERROR);}
function roleConfiguration(roleIds){
  if(!roleIds||typeof roleIds!=='object'||Array.isArray(roleIds))fail();
  const config={};
  for(const key of ACCESS){
    if(!ID.test(String(roleIds[key]||'')))fail();
    config[key]=String(roleIds[key]);
  }
  if(roleIds['Event Management']!==undefined&&roleIds['Event Management']!==null){
    if(!ID.test(String(roleIds['Event Management'])))fail();
    config['Event Management']=String(roleIds['Event Management']);
  }
  if(new Set(Object.values(config)).size!==Object.keys(config).length)fail();
  return config;
}
function readSignedInteraction({rawBody,signature,signatureTimestamp,publicKey,nowMs=Date.now()}){
  if((!Buffer.isBuffer(rawBody)&&typeof rawBody!=='string')||
     typeof signature!=='string'||!SIGNATURE.test(signature)||
     typeof signatureTimestamp!=='string'||!TIMESTAMP.test(signatureTimestamp)||
     typeof publicKey!=='string'||!PUBLIC_KEY.test(publicKey)||
     !Number.isFinite(nowMs))fail();
  const body=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(rawBody,'utf8');
  if(body.length===0||body.length>65536)fail();
  const ts=Number(signatureTimestamp)*1000;
  if(!Number.isSafeInteger(ts)||Math.abs(nowMs-ts)>5*60*1000)fail();
  let authenticated=false;
  try{
    const key=crypto.createPublicKey({key:Buffer.concat([SPKI_PREFIX,Buffer.from(publicKey,'hex')]),format:'der',type:'spki'});
    authenticated=crypto.verify(null,Buffer.concat([Buffer.from(signatureTimestamp),body]),key,Buffer.from(signature,'hex'));
  }catch{fail();}
  if(!authenticated)fail();
  let data;
  try{data=JSON.parse(body.toString('utf8'));}catch{fail();}
  if(!data||typeof data!=='object'||Array.isArray(data)||![2,3].includes(data.type)||
     !ID.test(String(data.id||''))||!ID.test(String(data.guild_id||''))||
     !ID.test(String(data.channel_id||''))||
     !ID.test(String(data.member?.user?.id||'')))fail();
  if(data.user?.id&&String(data.user.id)!==String(data.member.user.id))fail();
  return data;
}
function checkPrivateChannel(channel,roles,config,guildId,channelId,memberId,memberRoleIds){
  if(!channel||String(channel.id)!==String(channelId)||String(channel.guild_id)!==String(guildId)||
     Number(channel.type)!==0||!Array.isArray(channel.permission_overwrites)||
     !Array.isArray(roles)||!roles.length)fail();
  const byId=new Map();
  for(const role of roles){
    if(!role||!ID.test(String(role.id||''))||byId.has(String(role.id))||
       !/^\d+$/.test(String(role.permissions||'')))fail();
    byId.set(String(role.id),role);
  }
  if(!byId.has(String(guildId)))fail();
  for(const id of Object.values(config))if(!byId.has(id))fail();
  // Discord Administrator bypasses channel overwrites. A role that is not
  // among the three authorized dashboard roles can expose a private channel,
  // even without any explicit VIEW_CHANNEL overwrite.
  const dashboardRoleIds=new Set(ACCESS.map(label=>config[label]));
  for(const role of roles){
    if(has(BigInt(String(role.permissions)),PERMISSIONS.ADMINISTRATOR)&&
      !dashboardRoleIds.has(String(role.id)))fail();
  }
  const overwriteKeys=new Set();
  const everyone=channel.permission_overwrites.filter(o=>
    String(o.id)===String(guildId)&&Number(o.type)===0);
  if(everyone.length!==1||
     !has(BigInt(String(everyone[0].deny??'0')),PERMISSIONS.VIEW_CHANNEL)||
     has(BigInt(String(everyone[0].allow??'0')),PERMISSIONS.VIEW_CHANNEL))fail();
  const accessIds=new Set(ACCESS.map(x=>config[x]));
  for(const overwrite of channel.permission_overwrites){
    if(!overwrite||!ID.test(String(overwrite.id||''))||
       ![0,1].includes(Number(overwrite.type))||
       !/^\d+$/.test(String(overwrite.allow??''))||
       !/^\d+$/.test(String(overwrite.deny??'')))fail();
    const key=String(overwrite.type)+':'+String(overwrite.id);
    if(overwriteKeys.has(key))fail();
    overwriteKeys.add(key);
    if(!has(BigInt(String(overwrite.allow)),PERMISSIONS.VIEW_CHANNEL))continue;
    // Never claim a protected channel when unrelated roles or individuals
    // can explicitly view it. Bot-specific grants require separate audit.
    if(Number(overwrite.type)!==0||!accessIds.has(String(overwrite.id)))fail();
  }
  if(memberRoleIds.some(id=>!byId.has(String(id))))fail();
  const base=basePermissions(guildId,memberRoleIds,roles);
  const perms=effectiveChannelPermissions(channel,guildId,memberId,memberRoleIds,base);
  if(!has(perms,PERMISSIONS.VIEW_CHANNEL)||
     !has(perms,PERMISSIONS.READ_MESSAGE_HISTORY)&&!has(perms,PERMISSIONS.ADMINISTRATOR))fail();
  // Extra guild-wide Administrator bypass is not fully proven absent by a
  // single user's permission check; full independent privacy audit required.
}
async function authorizeSignedInteraction(args){
  const {
    rawBody,signature,signatureTimestamp,publicKey,nowMs=Date.now(),
    guildId,channelId,roleIds,botToken,transport=fetch,consumeInteractionId
  }=args||{};
  const config=roleConfiguration(roleIds);
  if(!ID.test(String(guildId||''))||!ID.test(String(channelId||''))||
     typeof botToken!=='string'||!botToken.trim()||
     typeof transport!=='function'||typeof consumeInteractionId!=='function')fail();
  const interaction=readSignedInteraction({rawBody,signature,signatureTimestamp,publicKey,nowMs});
  if(String(interaction.guild_id)!==String(guildId)||
     String(interaction.channel_id)!==String(channelId))fail();
  const userId=String(interaction.member.user.id);
  async function getJson(route){
    let response;
    try{
      response=await transport('https://discord.com/api/v10'+route,{
        method:'GET',headers:{Authorization:'Bot '+botToken,Accept:'application/json'},
        signal:AbortSignal.timeout(12000)
      });
    }catch{fail();}
    if(!response||response.ok!==true)fail();
    let result;
    try{result=await response.json();}catch{fail();}
    if(!result||typeof result!=='object')fail();
    return result;
  }
  const [member,roles,channel]=await Promise.all([
    getJson('/guilds/'+guildId+'/members/'+userId),
    getJson('/guilds/'+guildId+'/roles'),
    getJson('/channels/'+channelId)
  ]);
  if(String(member.user?.id)!==userId||!Array.isArray(member.roles)||!Array.isArray(roles))fail();
  const currentRoleIds=[...new Set(member.roles.map(String))];
  if(currentRoleIds.length!==member.roles.length||currentRoleIds.some(x=>!ID.test(x)))fail();
  const current=new Set(currentRoleIds);
  const available=ALL.filter(label=>config[label]&&current.has(config[label]));
  if(!ACCESS.some(label=>available.includes(label)))fail();
  checkPrivateChannel(channel,roles,config,guildId,channelId,userId,currentRoleIds);
  // This callback must atomically reject reused IDs and persist TTL outside
  // this process. In-memory Sets are tests only, not a live replay defense.
  let consumed=false;
  try{
    consumed=await consumeInteractionId(String(interaction.id),nowMs+5*60*1000);
  }catch{fail();}
  if(consumed!==true)fail();
  return Object.freeze({
    actor:Object.freeze({
      id:userId,
      source:'trusted-server-gateway',
      verifiedRoles:Object.freeze(available)
    }),
    guildId:String(guildId),
    channelId:String(channelId),
    interactionId:String(interaction.id)
  });
}
module.exports={readSignedInteraction,authorizeSignedInteraction};
