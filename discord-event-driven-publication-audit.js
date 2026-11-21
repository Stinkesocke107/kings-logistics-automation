'use strict';
// Kings read-only audit: only existing event-driven public publications.
// No Discord POST/PATCH/DELETE, no private member records, no logs of message bodies.
const fs=require('node:fs');
const path=require('node:path');
const {endpoint}=require('./discord-webhook-destination-audit');
const API='https://discord.com/api/v10';
const TOKEN=process.env.DISCORD_BOT_TOKEN||'';
const GUILD=process.env.DISCORD_GUILD_ID||'1114967437788577792';
const SNOWFLAKE=/^\d{15,22}$/;

function read(name){
  try{return JSON.parse(fs.readFileSync(path.join(__dirname,'data',name),'utf8'));}
  catch{return null;}
}
function status(key,state,reason){return {key,status:state,reason};}
function validId(value){return SNOWFLAKE.test(String(value||''));}
function timestamp(value){const ms=Date.parse(value||'');return Number.isFinite(ms)?ms:null;}
async function getJson(url,headers={},transport=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  const retryCodes=new Set([429,500,502,503,504]);
  for(let attempt=0;attempt<3;attempt++){
    let response;
    try{
      response=await transport(url,{
        method:'GET',headers:{Accept:'application/json',...headers},
        signal:AbortSignal.timeout(15000)
      });
    }catch{
      if(attempt===2)throw Error('discord-read-network-failed');
      await wait(Math.min(2500,(attempt+1)*700));
      continue;
    }
    if(retryCodes.has(response.status)){
      if(attempt===2)throw Error('discord-read-transient-exhausted');
      const seconds=Number(response.headers?.get?.('retry-after'));
      const delay=Number.isFinite(seconds)&&seconds>0
        ? Math.min(10000,Math.ceil(seconds*1000))
        : Math.min(2500,(attempt+1)*700);
      await wait(delay);
      continue;
    }
    if(!response.ok)throw Error('discord-read-http-'+response.status);
    try{
      const data=await response.json();
      if(!data||typeof data!=='object')throw Error('discord-read-invalid-json');
      return data;
    }catch{
      throw Error('discord-read-invalid-json');
    }
  }
  throw Error('discord-read-unavailable');
}
function botHeaders(){
  return {Authorization:'Bot '+TOKEN,'User-Agent':'Kings Public Event Audit/1.0'};
}
async function webhookMetadata(name){
  const parsed=endpoint(process.env[name]);
  if(!parsed)throw Error('webhook-unconfigured');
  const info=await getJson(parsed.url);
  if(!validId(info?.id)||String(info.id)!==parsed.id||
     String(info?.guild_id||'')!==String(GUILD)||!validId(info?.channel_id))
    throw Error('webhook-target-mismatch');
  return info;
}
async function getDiscordMessage(channel,id){
  if(!validId(channel)||!validId(id))throw Error('invalid-message-evidence');
  return getJson(API+'/channels/'+channel+'/messages/'+id,botHeaders());
}
function checkMonthlyMessage(message,entry,webhookId){
  if(!entry||!validId(entry.discordMessageId)||!validId(entry.discordChannelId))
    return 'monthly-publication-state-missing';
  if(String(message?.id||'')!==String(entry.discordMessageId)||
     String(message?.channel_id||'')!==String(entry.discordChannelId)||
     String(message?.webhook_id||'')!==String(webhookId))
    return 'monthly-publication-owner-or-location-mismatch';
  const content=String(message.content||'');
  if(!content.includes('Kings Logistics — '+entry.month+' Monthly Report')||content.includes('PREVIEW'))
    return 'monthly-marker-mismatch';
  if(entry.key==='2026-10'&&
     Number.isSafeInteger(entry.convoysParticipated)&&
     Number.isSafeInteger(entry.convoysWithConfirmedSlot)&&
     (!content.includes('Convoys Participated: **'+entry.convoysParticipated+'**')||
      !content.includes('With Confirmed Kings Slot: **'+entry.convoysWithConfirmedSlot+'**')))
    return 'monthly-convoy-backfill-mismatch';
  return null;
}
async function monthlyAudit(){
  const state=read('monthly-report-state.json');
  if(state?.version!==2||!Array.isArray(state.publishedMonths)||!state.publishedMonths.length)
    return status('monthly-reports','UNVERIFIED','monthly-state-unavailable');
  const info=await webhookMetadata('MONTHLY_REPORT_DISCORD_WEBHOOK_URL');
  for(const entry of state.publishedMonths){
    const message=await getDiscordMessage(entry.discordChannelId,entry.discordMessageId);
    const issue=checkMonthlyMessage(message,entry,info.id);
    if(issue)return status('monthly-reports','UNVERIFIED',issue);
  }
  return status('monthly-reports','VERIFIED','published-month-message-contracts-match');
}
async function boundedMessages(channelId,beforeTime,maxPages=15){
  let before=null,complete=false;
  const collected=[];
  for(let i=0;i<maxPages;i++){
    const u=API+'/channels/'+channelId+'/messages?limit=100'+(before?'&before='+before:'');
    const page=await getJson(u,botHeaders());
    if(!Array.isArray(page))throw Error('discord-history-invalid');
    collected.push(...page);
    if(page.length===0||page.length<100){complete=true;break;}
    const last=page.at(-1);
    if(!validId(last?.id))throw Error('discord-pagination-invalid');
    if(timestamp(last.timestamp)!==null&&timestamp(last.timestamp)<beforeTime){
      complete=true;break;
    }
    if(last.id===before)throw Error('discord-pagination-stuck');
    before=last.id;
  }
  return {messages:collected,complete};
}
function checkChangelogMessages(messages,release,webhookId){
  const time=timestamp(release?.publishedAt);
  if(!time||!/^S\d{2}-KL\d{2}$/.test(String(release.id||''))||
     !Number.isSafeInteger(release.discordMessageCount)||release.discordMessageCount<1)
    return 'changelog-publication-evidence-invalid';
  const selected=messages.filter(message=>{
    const at=timestamp(message?.timestamp);
    return String(message?.webhook_id||'')===String(webhookId)&&
      at!==null&&at>=time-15*60000&&at<=time+2*60000;
  });
  if(selected.length!==release.discordMessageCount)return 'changelog-message-count-mismatch';
  const heading='Changelog – '+release.season+' – KL'+String(release.number).padStart(2,'0');
  if(!selected.some(m=>String(m.content||'').includes(heading)))return 'changelog-release-title-missing';
  if(!selected.some(m=>String(m.content||'').includes('Connecting the world, creating friendships.')))
    return 'changelog-release-footer-missing';
  if(selected.filter(m=>String(m.content||'').includes('Kings Logistics Changelog — Continued')).length!==Math.max(0,release.discordMessageCount-1))
    return 'changelog-continuation-mismatch';
  return null;
}
async function changelogAudit(){
  const history=read('changelog-history.json');
  const arr=history?.changelogs;
  if(!Array.isArray(arr)||!arr.length)return status('latest-changelog','UNVERIFIED','changelog-history-unavailable');
  const release=arr.at(-1);
  const at=timestamp(release?.publishedAt);
  if(!at)return status('latest-changelog','UNVERIFIED','changelog-publication-date-invalid');
  const info=await webhookMetadata('CHANGELOG_DISCORD_WEBHOOK_URL');
  const page=await boundedMessages(info.channel_id,at-15*60000);
  // The old release did not persist individual Discord IDs. A short channel
  // history MUST be treated as unverified, never as proof that it was deleted.
  if(!page.complete)return status('latest-changelog','UNVERIFIED','changelog-history-window-insufficient');
  const issue=checkChangelogMessages(page.messages,release,info.id);
  return status('latest-changelog',issue?'UNVERIFIED':'VERIFIED',issue||'release-parts-match-history');
}
function milestoneExpectation(state){
  if(!state||!Array.isArray(state.reachedMilestones)||
     !Number.isSafeInteger(state.memberCountAtLastUpdate)||state.memberCountAtLastUpdate<1)
    return status('milestones','UNVERIFIED','milestone-source-invalid');
  if(state.memberCountAtLastUpdate<150&&state.reachedMilestones.length===0)
    return status('milestones','NO_EVENT','no-milestone-due-below-first-threshold');
  return status('milestones','UNVERIFIED','published-milestone-message-evidence-required');
}
function staffExpectation(summary){
  if(!summary||summary.mode!=='live'||!Number.isSafeInteger(summary.published)||summary.published<0)
    return status('staff-public-updates','UNVERIFIED','staff-live-summary-not-usable');
  const at=timestamp(summary.updatedAt);
  if(!at||at>Date.now()+300000||Date.now()-at>24*3600000)
    return status('staff-public-updates','UNVERIFIED','staff-summary-not-recent');
  if(summary.published===0)
    return status('staff-public-updates','NO_EVENT','latest-staff-sync-had-no-new-publications');
  return status('staff-public-updates','UNVERIFIED','staff-event-needs-direct-message-proof');
}
function alertMessageIsTechnical(message,botId){
  if(String(message?.author?.id||'')!==String(botId))return false;
  return Array.isArray(message.embeds)&&message.embeds.some(embed=>
    /Kings System Alert — (Critical|Warning|Escalated|Resolved)/.test(String(embed.title||''))&&
    String(embed.footer?.text||'').includes('Kings Logistics • System Monitoring'));
}
async function alertsAudit(){
  const channels=await getJson(API+'/guilds/'+GUILD+'/channels',botHeaders());
  if(!Array.isArray(channels))return status('system-alerts','UNVERIFIED','alert-channel-inventory-invalid');
  const normalize=name=>String(name||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
  const found=channels.filter(c=>[0,5].includes(Number(c.type))&&normalize(c.name)===normalize('system-alerts'));
  if(found.length!==1)return status('system-alerts','UNVERIFIED','alert-channel-ambiguous-or-missing');
  const bot=await getJson(API+'/users/@me',botHeaders());
  if(!validId(bot?.id))return status('system-alerts','UNVERIFIED','bot-identity-unavailable');
  const messages=await getJson(API+'/channels/'+found[0].id+'/messages?limit=100',botHeaders());
  if(!Array.isArray(messages))return status('system-alerts','UNVERIFIED','alert-history-unreadable');
  return messages.some(x=>alertMessageIsTechnical(x,bot.id))
    ?status('system-alerts','VERIFIED','technical-alert-publisher-confirmed-in-recent-window')
    :status('system-alerts','NO_EVENT','no-recent-technical-alert-in-limited-window');
}
async function safely(name,callback){
  try{return await callback();}
  catch(error){
    // Only emit standardized non-sensitive failure classes; never raw API
    // responses, URLs, member content, or webhook credentials.
    const known=new Set([
      'discord-read-network-failed','discord-read-transient-exhausted',
      'discord-read-invalid-json','discord-read-unavailable','webhook-unconfigured',
      'webhook-target-mismatch'
    ]);
    const message=String(error?.message||'');
    const reason=known.has(message)?message:
      /^discord-read-http-(401|403|404)$/.test(message)?message:'read-only-proof-unavailable';
    return status(name,'UNVERIFIED',reason);
  }
}
async function main(){
  if(!TOKEN)throw Error('Kings Bot auth unavailable');
  const results=[
    await safely('monthly-reports',monthlyAudit),
    await safely('latest-changelog',changelogAudit),
    milestoneExpectation(read('milestones.json')),
    staffExpectation(read('staff-discord-updates-summary.json')),
    await safely('system-alerts',alertsAudit)
  ];
  for(const item of results)
    console.log('[Kings Event-Driven Audit] '+item.key+': '+item.status+' ('+item.reason+')');
  const count=results.filter(x=>x.status==='VERIFIED').length;
  const notDue=results.filter(x=>x.status==='NO_EVENT').length;
  const missing=results.filter(x=>x.status==='UNVERIFIED').length;
  console.log('Kings event publication audit: '+count+' verified; '+notDue+' not triggered; '+missing+' unverified');
  console.log('No-event results are NOT evidence that historical content was verified.');
  if(missing)throw Error('One or more Kings event-driven publication contracts remain unverified');
}
if(require.main===module)main().catch(()=>{
  console.error('Kings event-driven read-only publication audit incomplete; no Discord writes attempted');
  process.exitCode=1;
});
module.exports={checkMonthlyMessage,checkChangelogMessages,milestoneExpectation,staffExpectation,alertMessageIsTechnical,boundedMessages,getJson};
