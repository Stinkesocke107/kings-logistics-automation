'use strict';
// Delayed, READ-ONLY private staff text commands via GitHub Actions + Discord REST.
// No Gateway, interactive endpoint, task changes, event approvals or roles.
// Message-reference dedupe is a bounded best-effort safeguard, NOT a durable
// exactly-once ledger. Refuse incomplete channel history instead of guessing.
const {configCheck,validateChannelPrivacy}=require('./event-capacity-github-only');
const {dateValid}=require('./event-capacity-day-view');
const ERROR='Kings Event Capacity private staff command could not be verified.';
const ID=/^\d{17,22}$/;
const MARKER='**Kings Event Capacity | Staff Reply**';
const MAX_AGE=35*60*1000;
const MAX_PER_RUN=2;
const ADMIN=8n;
function fail(){throw new Error(ERROR);}
function utcMonth(s){
  return typeof s==='string'&&/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(s);
}
function parseTextCommand(content){
  if(typeof content!=='string'||content.length<9||content.length>80||
     /[\r\n\t\u0000-\u001f]/.test(content))return null;
  const clean=content.trim();
  if(clean==='!capacity'||clean==='!capacity help')return {kind:'help'};
  if(clean==='!capacity status')return {kind:'status'};
  const month=/^!capacity month (20\d{2}-(?:0[1-9]|1[0-2]))$/.exec(clean);
  if(month&&utcMonth(month[1]))return {kind:'month',date:month[1]};
  const day=/^!capacity day (20\d{2}-\d{2}-\d{2})$/.exec(clean);
  if(day&&dateValid(day[1]))return {kind:'day',date:day[1]};
  return null;
}
function replyText(query,sourceAvailable){
  if(!query||typeof query!=='object'||typeof sourceAvailable!=='boolean')fail();
  const status=sourceAvailable?'Needs Verification':'Data Outdated';
  if(query.kind==='help')return MARKER+'\n'+
    'Read-only commands: !capacity status, !capacity month YYYY-MM, !capacity day YYYY-MM-DD.\n'+
    'Replies run on the next scheduled GitHub Actions check; they are not instant.\n'+
    'No event is approved, rescheduled or cancelled by these commands.';
  if(query.kind==='status')return MARKER+'\n'+
    '**Source status: '+status+'**\n'+
    (sourceAvailable?'Convoy Checker source checked; staff acceptance evidence is not verified.':
      'No current verified Convoy Checker source was available.')+'\n'+
    '**Free slots: unverified.** Do not confirm requests from this response.';
  if(query.kind==='month'&&utcMonth(query.date))return MARKER+'\n'+
    '**UTC month: '+query.date+' | '+status+'**\n'+
    'Daily Partner + External combined limit: **2**.\n'+
    'Monthly limits: **20 Partner / 20 External**; Kings-owned unlimited.\n'+
    '**Actual usage and free slots: unverified.** Manual Event Coordination review required.';
  if(query.kind==='day'&&dateValid(query.date))return MARKER+'\n'+
    '**UTC day: '+query.date+' | '+status+'**\n'+
    'Combined Partner + External daily limit: **2**; Kings-owned unlimited.\n'+
    '**Accepted events, exceptions and available slots: unverified.**\n'+
    'No automatic acceptance or changes to the Convoy Center.';
  fail();
}
function checkedMember(member,memberId,roles,config){
  if(!member||String(member.user?.id)!==memberId||
    !Array.isArray(member.roles)||member.roles.length>100||
    !Array.isArray(roles)||!roles.length)fail();
  const ids=member.roles.map(String);
  if(ids.some(x=>!ID.test(x))||new Set(ids).size!==ids.length)fail();
  const byId=new Map();
  for(const r of roles){
    if(!r||!ID.test(String(r.id||''))||byId.has(String(r.id))||
      typeof r.permissions!=='string'||!/^\d{1,22}$/.test(r.permissions))fail();
    byId.set(String(r.id),r);
  }
  if(!byId.has(config.guildId))fail();
  const eligible=new Set(Object.values(config.roles));
  if(!ids.some(x=>eligible.has(x)))return false;
  if(ids.some(x=>!byId.has(x)))fail();
  // An unapproved Administrator role bypasses @everyone channel deny.
  // Do not process staff commands if other guild Administrator roles exist.
  if([...byId.values()].some(r=>
    (BigInt(r.permissions)&ADMIN)!==0n&&!eligible.has(String(r.id))))fail();
  return true;
}
function verifiedHistory(messages,config,botId,nowMs){
  if(!Array.isArray(messages)||messages.length>=100||
    !Number.isFinite(nowMs)||!ID.test(botId))fail();
  const seen=new Set(),replies=new Set(),commands=[];
  for(const m of messages){
    if(!m||!ID.test(String(m.id||''))||seen.has(String(m.id))||
      String(m.channel_id)!==config.channelId||
      !ID.test(String(m.author?.id||''))||
      typeof m.content!=='string'||typeof m.timestamp!=='string')fail();
    seen.add(String(m.id));
    const time=Date.parse(m.timestamp);
    if(!Number.isFinite(time)||time>nowMs+60000)fail();
    if(m.author.id===botId&&m.content.startsWith(MARKER)){
      const ref=String(m.message_reference?.message_id||'');
      if(ID.test(ref))replies.add(ref);
      continue;
    }
    if(m.author.bot===true||m.webhook_id||m.edited_timestamp!==null&&
      m.edited_timestamp!==undefined)continue;
    const command=parseTextCommand(m.content);
    if(!command||nowMs-time>MAX_AGE||time>nowMs)continue;
    commands.push({messageId:String(m.id),memberId:String(m.author.id),
      timestamp:m.timestamp,content:m.content,command});
  }
  commands.sort((a,b)=>BigInt(a.messageId)<BigInt(b.messageId)?-1:
    BigInt(a.messageId)>BigInt(b.messageId)?1:0);
  return {commands,replies};
}
async function pollPrivateStaffCommands({
  client,config,nowMs=Date.now(),sourceAvailable=false
}={}){
  const c=configCheck(config);
  if(typeof sourceAvailable!=='boolean'||!Number.isFinite(nowMs)||
    !client||['me','channel','roles','member','recent','message','create']
      .some(k=>typeof client[k]!=='function'))fail();
  let me,channel,roles,messages;
  try{
    [me,channel,roles]=await Promise.all([
      client.me(),client.channel(c.channelId),client.roles(c.guildId)
    ]);
    if(!ID.test(String(me?.id||'')))fail();
    validateChannelPrivacy(channel,roles,c,{botId:me.id});
    messages=await client.recent(c.channelId);
  }catch{fail();}
  const batch=verifiedHistory(messages,c,String(me.id),nowMs);
  let replied=0,skipped=0;
  for(const command of batch.commands){
    if(replied>=MAX_PER_RUN)break;
    if(batch.replies.has(command.messageId)){skipped++;continue;}
    let member,original,second,latestChannel,latestRoles;
    try{
      [member,original,second,latestChannel,latestRoles]=await Promise.all([
        client.member(c.guildId,command.memberId),
        client.message(c.channelId,command.messageId),
        client.recent(c.channelId),
        client.channel(c.channelId),
        client.roles(c.guildId)
      ]);
      validateChannelPrivacy(latestChannel,latestRoles,c,{botId:me.id});
      const recheck=verifiedHistory(second,c,String(me.id),nowMs);
      if(!recheck.commands.some(x=>x.messageId===command.messageId)||
        !original||String(original.id)!==command.messageId||
        String(original.channel_id)!==c.channelId||
        String(original.author?.id)!==command.memberId||
        original.content!==command.content||
        original.timestamp!==command.timestamp||
        original.edited_timestamp!==null&&original.edited_timestamp!==undefined)fail();
      if(recheck.replies.has(command.messageId)){skipped++;continue;}
      if(!checkedMember(member,command.memberId,latestRoles,c)){skipped++;continue;}
    }catch{fail();}
    const body=replyText(command.command,sourceAvailable);
    // message_reference allows delayed Discord replies without a Gateway.
    // replied_user=false is essential: never notify the author or any role.
    const payload={content:body,allowed_mentions:{parse:[],replied_user:false},
      message_reference:{
        message_id:command.messageId,channel_id:c.channelId,
        guild_id:c.guildId,fail_if_not_exists:true
      }};
    try{
      const response=await client.create(c.channelId,payload);
      if(!ID.test(String(response?.id||''))||
        String(response.channel_id)!==c.channelId||
        String(response.author?.id)!==String(me.id)||
        String(response.message_reference?.message_id)!==command.messageId)fail();
    }catch{fail();}
    replied++;
    batch.replies.add(command.messageId);
  }
  return Object.freeze({state:replied?'Replied':'NoNewRequests',
    replied,alreadyReplied:skipped});
}
module.exports={parseTextCommand,replyText,checkedMember,verifiedHistory,
  pollPrivateStaffCommands,MARKER};
