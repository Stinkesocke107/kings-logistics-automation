'use strict';
// Kings Event Capacity — CEO-invoked, Discord GET-ONLY preflight.
// No webhook, new bot, OAuth Gateway, state writes or Event source reads.
// No private guild/channel/role/user/message IDs are returned or logged.
// This is a real runtime permission check only if run with real Discord GET
// responses from the existing protected main GitHub Actions workflow.
const {configCheck,validateChannelPrivacy}
  =require('./event-capacity-github-only');
const ERROR='Kings Event Capacity private channel preflight could not verify readiness.';
const GUILD='1114967437788577792';
const ID=/^\d{17,22}$/;
const MARKER='**Kings Event Capacity | GitHub Actions**';
const PERMS=Object.freeze({
  ADMIN:8n,VIEW:1024n,SEND:2048n,READ:65536n
});
function fail(){throw new Error(ERROR);}
function bits(value){
  if(typeof value!=='string'||!/^\d{1,22}$/.test(value))fail();
  return BigInt(value);
}
function checkedOverwrites(channel,roles,config,botId){
  if(!Array.isArray(channel?.permission_overwrites)||
    channel.permission_overwrites.length>100)fail();
  const known=new Set(roles.map(r=>String(r.id)));
  const unique=new Set();
  for(const x of channel.permission_overwrites){
    if(!x||!ID.test(String(x.id||''))||
      ![0,1].includes(Number(x.type))||
      typeof x.allow!=='string'||typeof x.deny!=='string')fail();
    bits(x.allow);bits(x.deny);
    const key=String(x.type)+':'+String(x.id);
    if(unique.has(key))fail();
    unique.add(key);
    if(Number(x.type)===0&&!known.has(String(x.id)))fail();
    if(Number(x.type)===1&&String(x.id)!==botId&&
      (bits(x.allow)&PERMS.VIEW)!==0n)fail();
  }
  validateChannelPrivacy(channel,roles,config,{botId});
}
function botCanReadAndWrite(channel,roles,config,member,botId){
  if(!member||String(member.user?.id)!==botId||
    !Array.isArray(member.roles)||member.roles.length>100)fail();
  const ids=member.roles.map(String);
  if(ids.some(x=>!ID.test(x))||new Set(ids).size!==ids.length)fail();
  const byId=new Map(roles.map(r=>[String(r.id),r]));
  if(!byId.has(config.guildId)||ids.some(x=>!byId.has(x)))fail();
  // Explicitly deny an overpowered bot credential in this integration.
  let permissions=bits(byId.get(config.guildId).permissions);
  for(const roleId of ids)permissions|=bits(byId.get(roleId).permissions);
  if((permissions&PERMS.ADMIN)!==0n)fail();
  checkedOverwrites(channel,roles,config,botId);
  function apply(value,x){
    if(!x)return value;
    return (value&~bits(x.deny))|bits(x.allow);
  }
  const overwrites=channel.permission_overwrites;
  permissions=apply(permissions,overwrites.find(x=>
    Number(x.type)===0&&String(x.id)===config.guildId));
  let allow=0n,deny=0n;
  for(const x of overwrites){
    if(Number(x.type)===0&&ids.includes(String(x.id))){
      allow|=bits(x.allow);deny|=bits(x.deny);
    }
  }
  permissions=(permissions&~deny)|allow;
  permissions=apply(permissions,overwrites.find(x=>
    Number(x.type)===1&&String(x.id)===botId));
  if((permissions&PERMS.VIEW)!==PERMS.VIEW||
    (permissions&PERMS.READ)!==PERMS.READ||
    (permissions&PERMS.SEND)!==PERMS.SEND)fail();
}
function verdict(state){
  if(!['READY_FOR_MANUAL_BOOTSTRAP','READY_FOR_READ_ONLY_SYNC',
    'MESSAGE_ID_NOT_CONFIGURED','CHANNEL_NOT_EMPTY',
    'MESSAGE_NOT_VERIFIED','CONFIGURATION_UNVERIFIED'].includes(state))fail();
  return Object.freeze({
    version:1,visibility:'PRIVATE_ONLY',
    state,readOnly:true,discordWrites:0,githubWrites:0,
    sourceRecordsRead:0,capacityApproved:false,
    freeSlotsCertified:false,automaticActivationAllowed:false
  });
}
async function inspectKingsPrivateEventCapacityChannel({client,config}={}){
  try{
    const c=configCheck(config);
    if(c.guildId!==GUILD||c.channelId===c.guildId||
      Object.values(c.roles).includes(c.channelId)||c.messageId===c.channelId)
      fail();
    if(!client||['me','roles','channel','member','message','recent']
      .some(k=>typeof client[k]!=='function'))fail();
    // All calls are bounded, credentialed GET requests in the actual runner;
    // no post/patch/create/edit functions are required by this interface.
    const [me,channel,roles]=await Promise.all([
      client.me(),client.channel(c.channelId),client.roles(c.guildId)
    ]);
    const botId=String(me?.id||'');
    if(!ID.test(botId)||!Array.isArray(roles))fail();
    const member=await client.member(c.guildId,botId);
    botCanReadAndWrite(channel,roles,c,member,botId);
    if(c.messageId!==undefined){
      let previous;
      try{previous=await client.message(c.channelId,c.messageId);}
      catch{return verdict('MESSAGE_NOT_VERIFIED');}
      if(String(previous?.id)!==c.messageId||
        String(previous?.author?.id)!==botId||
        String(previous?.channel_id)!==c.channelId||
        typeof previous?.content!=='string'||
        !previous.content.startsWith(MARKER))
        return verdict('MESSAGE_NOT_VERIFIED');
      return verdict('READY_FOR_READ_ONLY_SYNC');
    }
    let recent;
    try{recent=await client.recent(c.channelId);}
    catch{fail();}
    if(!Array.isArray(recent)||recent.length>100)fail();
    if(recent.length!==0){
      const hasOldBotMessage=recent.some(x=>x&&
        String(x.author?.id)===botId&&
        typeof x.content==='string'&&x.content.startsWith(MARKER));
      return verdict(hasOldBotMessage?'MESSAGE_ID_NOT_CONFIGURED':
        'CHANNEL_NOT_EMPTY');
    }
    return verdict('READY_FOR_MANUAL_BOOTSTRAP');
  }catch{return verdict('CONFIGURATION_UNVERIFIED');}
}
module.exports={inspectKingsPrivateEventCapacityChannel};
