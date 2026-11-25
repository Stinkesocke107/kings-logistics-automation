'use strict';
// Kings Event Invitation Tracker: private, bounded Discord REST GET-only source
// collector. Code-only claims remain UNTRUSTED even after real GET responses.
// Never logs/commits raw messages or equates a Staff entry with organizer proof.
const {createHash}=require('node:crypto');
const {PERMISSIONS,basePermissions,effectiveChannelPermissions}
  =require('./discord-permission-audit');
const {makeKingsDiscordReadOnlyRequest,reduceKingsDiscordReadOnlyPage}
  =require('./event-capacity-discord-rest-readonly-contract');
const {reviewKingsEventInvitationsOffline}
  =require('./event-invitation-tracker-offline');
const ERROR='Kings private Event Invitation source inspection refused.';
const ID=/^[1-9]\d{16,21}$/;
const INV=/^[A-Za-z0-9_.:-]{1,96}$/;
const EVENT=/^[A-Za-z0-9_-]{1,64}$/;
const PREFIX='KINGS_INVITE_V1 ';
const GUILD='1114967437788577792';
const MAX_PAGES=5,MAX_AUTHORS=25;
function fail(){throw Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function exact(x,keys){if(!plain(x)||Object.keys(x).sort().join(',')!==keys.slice().sort().join(','))fail();}
function ids(v,min=1,max=30){
  if(!Array.isArray(v)||v.length<min||v.length>max||
    v.some(x=>typeof x!=='string'||!ID.test(x))||
    new Set(v).size!==v.length)fail();
  return new Set(v);
}
function utc(x){
  if(typeof x!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x))fail();
  const ms=Date.parse(x);
  if(!Number.isFinite(ms)||new Date(ms).toISOString()!==x)fail();
  return ms;
}
function bits(x){
  if(typeof x!=='string'||!/^\d{1,22}$/.test(x))fail();
  return BigInt(x);
}
function has(v,bit){return (v&bit)===bit;}
function channelAuthorization({channel,roles,bot,me,guildId,channelId,staffIds,adminIds}){
  if(!plain(channel)||channel.id!==channelId||channel.guild_id!==guildId||
    channel.type!==0||!Array.isArray(channel.permission_overwrites)||
    channel.permission_overwrites.length>100||!Array.isArray(roles)||
    roles.length===0||roles.length>500||!plain(bot)||
    bot.user?.id!==me.id||!Array.isArray(bot.roles))fail();
  const byId=new Map();
  for(const role of roles){
    if(!plain(role)||!ID.test(role.id)||byId.has(role.id))fail();
    bits(role.permissions);
    byId.set(role.id,role);
  }
  if(!byId.has(guildId)||[...staffIds,...adminIds].some(x=>!byId.has(x)))fail();
  const botIds=ids(bot.roles,1,100);
  if([...botIds].some(x=>!byId.has(x)))fail();
  const seen=new Set();
  let everybodyDenied=false;
  for(const o of channel.permission_overwrites){
    if(!plain(o)||!ID.test(o.id)||![0,1].includes(o.type))fail();
    const allow=bits(o.allow),deny=bits(o.deny);
    if(o.type===0&&!byId.has(o.id))fail();
    const key=o.type+':'+o.id;if(seen.has(key))fail();seen.add(key);
    if(o.type===0&&o.id===guildId){
      if(has(allow,PERMISSIONS.VIEW_CHANNEL)||!has(deny,PERMISSIONS.VIEW_CHANNEL))fail();
      everybodyDenied=true;
    }
    if(has(allow,PERMISSIONS.VIEW_CHANNEL)&&!staffIds.has(o.id)&&
      !adminIds.has(o.id)&&!botIds.has(o.id)&&!(o.type===1&&o.id===me.id))fail();
    if(o.type===1&&o.id!==me.id)fail();
  }
  if(!everybodyDenied)fail();
  for(const r of roles){
    if(has(bits(r.permissions),PERMISSIONS.ADMINISTRATOR)&&
      !adminIds.has(r.id))fail();
  }
  if(has(basePermissions(guildId,[...botIds],roles),PERMISSIONS.ADMINISTRATOR))fail();
  const effective=effectiveChannelPermissions(channel,guildId,me.id,[...botIds],
    basePermissions(guildId,[...botIds],roles));
  if(!has(effective,PERMISSIONS.VIEW_CHANNEL)||
    !has(effective,PERMISSIONS.READ_MESSAGE_HISTORY))fail();
  return {byId,botIds};
}
function decodeMessage(m,channelId,now){
  if(!plain(m)||!ID.test(m.id)||m.channel_id!==channelId||
    !plain(m.author)||!ID.test(m.author.id)||m.author.bot!==false||
    typeof m.content!=='string'||m.content.length>2000||
    !m.content.startsWith(PREFIX))fail();
  const stamp=utc(m.timestamp);
  if(stamp>now)fail();
  let json;
  try{json=JSON.parse(m.content.slice(PREFIX.length));}catch{fail();}
  if(!plain(json)||!['invitation','status'].includes(json.kind))fail();
  const sourceDigest=createHash('sha256').update([
    'kings-outbound-discord-v1',channelId,m.id,m.timestamp,m.content
  ].join('\0')).digest('hex');
  if(json.kind==='invitation'){
    exact(json,['kind','invitationId','eventId','departureAtUtc','replyDueAtUtc']);
    if(!INV.test(json.invitationId)||
      (json.eventId!==null&&!EVENT.test(json.eventId))||
      utc(json.departureAtUtc)<=stamp||
      json.replyDueAtUtc!==null&&utc(json.replyDueAtUtc)<stamp)fail();
    return {kind:'invitation',authorId:m.author.id,at:stamp,id:m.id,
      item:{invitationId:json.invitationId,eventId:json.eventId,
        createdAtUtc:m.timestamp,departureAtUtc:json.departureAtUtc,
        replyDueAtUtc:json.replyDueAtUtc,sourceDigest}};
  }
  exact(json,['kind','invitationId','status']);
  if(!INV.test(json.invitationId)||
    !['Sent','Accepted','Declined','Withdrawn','Unknown'].includes(json.status))fail();
  return {kind:'status',authorId:m.author.id,at:stamp,id:m.id,
    item:{invitationId:json.invitationId,status:json.status,
      atUtc:m.timestamp,sourceDigest}};
}
async function scanKingsInvitationDiscordSource({client,config,asOfUtc}={}){
  try{
    if(!plain(client)||typeof client.get!=='function'||!plain(config)||
      config.guildId!==GUILD||!ID.test(config.channelId)||
      config.channelId===config.guildId)fail();
    const now=utc(asOfUtc);
    const staffIds=ids(config.staffRoleIds,1,20);
    const adminIds=ids(config.authorizedAdminRoleIds,1,20);
    if([...staffIds].some(x=>adminIds.has(x)))fail();
    const get=async path=>{
      if(typeof path!=='string'||path.length>250||!path.startsWith('/'))fail();
      let r;
      try{r=await client.get(path);}catch{fail();}
      if(!plain(r)||r.status!==200||r.data===undefined)fail();
      return r.data;
    };
    const [me,roles,channel]=await Promise.all([
      get('/users/@me'),get('/guilds/'+config.guildId+'/roles'),
      get('/channels/'+config.channelId)
    ]);
    if(!plain(me)||!ID.test(me.id)||me.bot!==true)fail();
    const bot=await get('/guilds/'+config.guildId+'/members/'+me.id);
    const authorization=channelAuthorization({
      channel,roles,bot,me,guildId:config.guildId,
      channelId:config.channelId,staffIds,adminIds
    });
    const messages=[],seen=new Set();
    let before=null,exhausted=false;
    for(let page=0;page<MAX_PAGES;page++){
      const plan=makeKingsDiscordReadOnlyRequest({
        guildId:config.guildId,channelId:config.channelId,
        sourceKind:'legacy-text',stream:'messages',before,limit:100
      });
      const raw=await get(plan.path);
      const receipt=reduceKingsDiscordReadOnlyPage({
        request:plan,response:{status:200,data:raw},fetchedAtUtc:asOfUtc
      });
      if(receipt.status!=='ok')fail();
      for(const m of raw){
        if(seen.has(m.id))fail();seen.add(m.id);
        messages.push(decodeMessage(m,config.channelId,now));
      }
      if(!receipt.hasMore){exhausted=true;break;}
      if(page===MAX_PAGES-1)fail();
      before=receipt.nextCursor;
      if(before===null)fail();
    }
    if(!exhausted)fail();
    const authors=new Set(messages.map(x=>x.authorId));
    if(authors.size>MAX_AUTHORS)fail();
    for(const author of authors){
      const member=await get('/guilds/'+config.guildId+'/members/'+author);
      if(!plain(member)||member.user?.id!==author||
        member.user.bot!==false||!Array.isArray(member.roles))fail();
      const authorRoles=ids(member.roles,0,100);
      if([...authorRoles].some(x=>!authorization.byId.has(x))||
        ![...authorRoles].some(x=>staffIds.has(x)))fail();
      const p=effectiveChannelPermissions(channel,config.guildId,author,
        [...authorRoles],basePermissions(config.guildId,[...authorRoles],roles));
      if(!has(p,PERMISSIONS.VIEW_CHANNEL)||
        !has(p,PERMISSIONS.READ_MESSAGE_HISTORY))fail();
    }
    messages.sort((a,b)=>a.at-b.at||
      (BigInt(a.id)<BigInt(b.id)?-1:1));
    const invitations=messages.filter(m=>m.kind==='invitation').map(m=>m.item);
    const changes=messages.filter(m=>m.kind==='status').map(m=>m.item);
    const privateClaimsDoNotLog={asOfUtc,invitations,changes};
    const review=reviewKingsEventInvitationsOffline(privateClaimsDoNotLog);
    if(review.safeToActivate!==false||
      review.discordSourceAuthenticatedHere!==false||
      review.eventBookingsCreated!==0)fail();
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      sourceAccess:'DISCORD_GET_OBSERVED_WITH_RUNTIME_BOT',
      privateClaimsDoNotLog,
      review,
      checkedCurrentStaffAuthors:authors.size,
      originalOrganizerResponsesIndependentlyVerified:false,
      authorsHistoricalRolesIndependentlyVerified:false,
      full24MonthHistoryIndependentlyVerified:false,
      sourceCompletenessBeyondBoundedChannelHistoryVerified:false,
      staffApprovalsCommitted:0,eventBookingsCreated:0,remindersSent:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={scanKingsInvitationDiscordSource};
