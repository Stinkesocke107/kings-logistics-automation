'use strict';
// #18: staff-only Discord message commands, polled via GitHub Actions.
// Discord is strictly GET-only; only the already encrypted Event state
// receives journal and replay-cursor updates. No slash app/hosting required.
const {
  resolvePrivateToken,applyManualReview
}=require('./event-operations-manual-review-state');
const GUILD='1114967437788577792';
const API='https://discord.com/api/v10';
const ID=/^\d{17,22}$/;
const VIEW=1n<<10n,SEND=1n<<11n,ADMIN=1n<<3n;
const MAX_PAGES=8;
const MAX_COMMANDS=800;
const CMD=/^!kings-review (KR[a-f0-9]{24}) (start|block|reopen|record_check)(?: (ORIGINAL_DISCORD|ORIGINAL_EVENT_PAGE|STAFF_RECORD) (ORIGINAL_RECORDS_CHECKED))?$/;
const STAFF_NAMES=new Set([
  'Event Coordinator','Event Coordinators',
  'Event Coordination Lead','Event Coordinator Lead'
]);
function reject(){throw Error('Kings Event Operations Discord source unverified');}
function roleIdsFromSecret(text){
  if(typeof text!=='string'||!text||text.length>512)reject();
  const ids=text.split(',').map(x=>x.trim());
  if(ids.length<1||ids.length>8||ids.some(x=>!ID.test(x))||
    new Set(ids).size!==ids.length||ids.includes(GUILD))reject();
  return Object.freeze(ids);
}
function bits(value){
  try{return BigInt(String(value));}catch{reject();}
}
function has(value,flag){return (bits(value)&flag)===flag;}
function validatePrivateChannel({channel,roles,bot,botMember,allowedRoles,channelId}){
  if(!channel||channel.id!==channelId||channel.guild_id!==GUILD||
    channel.type!==0||!Array.isArray(channel.permission_overwrites)||
    !Array.isArray(roles)||!roles.length||
    !ID.test(String(bot?.id||''))||bot.bot!==true||
    !Array.isArray(botMember?.roles)||!allowedRoles?.length)reject();
  const roleById=new Map(roles.map(r=>[String(r?.id),r]));
  if(roleById.size!==roles.length||!roleById.has(GUILD))reject();
  if(has(roleById.get(GUILD).permissions,ADMIN))reject();
  for(const id of allowedRoles){
    const role=roleById.get(id);
    if(!role||!STAFF_NAMES.has(role.name)||has(role.permissions,ADMIN))
      reject();
  }
  const overrides=channel.permission_overwrites;
  const everyone=overrides.filter(x=>x.id===GUILD&&x.type===0);
  if(everyone.length!==1||!has(everyone[0].deny,VIEW)||
    has(everyone[0].allow,VIEW))reject();
  const seen=new Set();
  const botRoles=new Set(botMember.roles.map(String));
  for(const item of overrides){
    if(!ID.test(String(item?.id||''))||
      ![0,1].includes(item?.type))reject();
    const key=item.type+':'+item.id;
    if(seen.has(key))reject();
    seen.add(key);
    if(item.type===1&&item.id!==bot.id&&has(item.allow,VIEW))
      reject();
    if(item.type===0&&item.id!==GUILD&&has(item.allow,VIEW)&&
      !allowedRoles.includes(item.id)&&!botRoles.has(item.id))
      reject();
    if(item.type===0&&!roleById.has(item.id))reject();
  }
  for(const id of allowedRoles){
    const overwrite=overrides.find(x=>x.type===0&&x.id===id);
    if(!overwrite||!has(overwrite.allow,VIEW)||
      !has(overwrite.allow,SEND)||has(overwrite.deny,VIEW)||
      has(overwrite.deny,SEND))reject();
  }
  return true;
}
function parseCommand(content){
  if(typeof content!=='string'||content.length>256)reject();
  const match=CMD.exec(content);
  if(!match)return null;
  if(match[2]==='record_check'){
    if(!match[3]||!match[4])return null;
  }else if(match[3]||match[4])return null;
  return Object.freeze({
    token:match[1],action:match[2],
    evidenceKind:match[3]||'NONE',confirmation:match[4]||''
  });
}
function validateMessage(message,channelId){
  if(!message||!ID.test(String(message.id))||
    message.channel_id!==channelId||
    !ID.test(String(message.author?.id||''))||
    typeof message.content!=='string')reject();
}
function initializedCursor(state){
  const cursor=state?.discordReviewCursor;
  if(cursor===undefined)return null;
  if(cursor!=='0'&&!ID.test(cursor))reject();
  return cursor;
}
function getMessageIds(messages,cursor,channelId){
  if(!Array.isArray(messages)||messages.length>100)reject();
  let last=null;
  for(const m of messages){
    validateMessage(m,channelId);
    if(last!==null&&BigInt(m.id)>=BigInt(last))reject();
    last=m.id;
  }
  return messages.filter(m=>BigInt(m.id)>BigInt(cursor));
}
async function ingest({state,secret,token,channelId,staffRoleIds,
  transport=fetch,nowMs=Date.now()}={}){
  if(!state||typeof state!=='object'||!ID.test(channelId)||
    !Array.isArray(staffRoleIds)||!staffRoleIds.length||
    !staffRoleIds.every(id=>ID.test(id))||
    typeof token!=='string'||!token||
    !Number.isSafeInteger(nowMs)||nowMs<=0||
    typeof secret!=='string'||secret.length<32)reject();
  async function get(route){
    const url=API+route;
    const response=await transport(url,{
      method:'GET',headers:{Authorization:'Bot '+token}
    });
    if(!response||!response.ok)reject();
    return response.json();
  }
  // Always revalidate channel privacy and the real Discord member roles,
  // not claimed usernames, message mentions, or a public user-supplied role.
  const [channel,roles,bot]=await Promise.all([
    get('/channels/'+channelId),
    get('/guilds/'+GUILD+'/roles'),
    get('/users/@me')
  ]);
  if(!ID.test(String(bot?.id||'')))reject();
  const botMember=await get('/guilds/'+GUILD+'/members/'+bot.id);
  validatePrivateChannel({
    channel,roles,bot,botMember,allowedRoles:staffRoleIds,channelId
  });
  const originalCursor=initializedCursor(state);
  const messages=[];
  let before=null,done=false;
  for(let page=0;page<MAX_PAGES;page++){
    const url='/channels/'+channelId+'/messages?limit=100'+
      (before?'&before='+before:'');
    const batch=await get(url);
    const since=getMessageIds(batch,originalCursor||'0',channelId);
    messages.push(...since);
    if(messages.length>MAX_COMMANDS)reject();
    if(batch.length<100||since.length<batch.length){done=true;break;}
    if(!batch.length){done=true;break;}
    before=batch[batch.length-1].id;
  }
  if(!done)reject(); // Never skip commands in a burst beyond pagination.
  const newest=messages[0]?.id||originalCursor||'0';
  if(originalCursor===null){
    // First activation is bootstrap-only: never execute stale messages
    // that already existed before the explicitly approved integration.
    return Object.freeze({
      state:{...state,discordReviewCursor:newest},
      changed:true,mode:'BOOTSTRAPPED',readOnlyDiscord:true
    });
  }
  if(newest===originalCursor)return Object.freeze({
    state,changed:false,mode:'NO_NEW_MESSAGES',readOnlyDiscord:true
  });
  let next=state,applied=0,ignored=0;
  for(const message of messages.reverse()){
    if(message.author.bot)continue;
    if(message.content==='')reject(); // MESSAGE_CONTENT intent not verified.
    const command=parseCommand(message.content);
    if(!command)continue;
    const member=await get('/guilds/'+GUILD+'/members/'+message.author.id);
    if(!Array.isArray(member?.roles))reject();
    if(!member.roles.some(role=>staffRoleIds.includes(String(role)))){
      ignored++;continue;
    }
    try{
      const resolved=resolvePrivateToken({
        state:next,token:command.token,secret,nowMs
      });
      next=applyManualReview({
        state:next,scope:resolved.scope,code:resolved.code,
        month:resolved.month,action:command.action,
        actor:'discord-'+message.author.id,
        evidenceKind:command.evidenceKind,
        confirmation:command.confirmation,nowMs
      });
      applied++;
    }catch{
      // Stale tokens or invalid transitions must never become approvals.
      // Skip once, so one old command cannot permanently block the queue.
      ignored++;
    }
  }
  if(applied+ignored>MAX_COMMANDS)reject();
  const prior=Number.isSafeInteger(next.discordReviewIgnored)?
    next.discordReviewIgnored:0;
  if(prior+ignored>1000000)reject();
  return Object.freeze({
    state:{...next,discordReviewCursor:newest,
      discordReviewIgnored:prior+ignored},
    changed:true,mode:applied?'SOURCE_REVIEWS_RECORDED':'CURSOR_ADVANCED',
    readOnlyDiscord:true
  });
}
module.exports={
  GUILD,ID,roleIdsFromSecret,validatePrivateChannel,parseCommand,
  ingest,MAX_PAGES,MAX_COMMANDS
};
