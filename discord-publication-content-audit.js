'use strict';
// Kings independent read-only verification of ACTUAL Discord publications.
// Never log bodies, author/member IDs, private channel metadata or webhook URLs.
// The check does not publish, repair, delete, or alter private state.
const fs=require('node:fs');
const path=require('node:path');
const ROOT=__dirname;
const API='https://discord.com/api/v10';
const BOT=process.env.DISCORD_BOT_TOKEN||'';
const GUILD=process.env.DISCORD_GUILD_ID||'1114967437788577792';
const ID=/^\d{17,22}$/;
const OUTAGE=[
 {key:'live-tracker-outage',state:'live-tracker-snapshot.json',field:'discordMessageId',env:'DISCORD_WEBHOOK_URL',title:'👑 Kings Live Tracker — Live Data Unavailable'},
 {key:'statistics-outage',state:'statistics.json',field:'messageId',env:'STATS_DISCORD_WEBHOOK_URL',title:'👑 Kings Statistics — Live Data Unavailable'},
 {key:'central-overview-outage',state:'central-overview.json',field:'messageId',env:'CENTRAL_OVERVIEW_WEBHOOK_URL',title:'👑 Kings Central Overview — Live Data Unavailable'}
];
const STAFF_CHANNEL='1551675877178474526';
const CONVOY_CHANNEL='1550619865805754378';
const STAFF_TITLE='Kings Staff Leadership — Live Role Overview';
// kings-branding replaces 👑 with the Kings custom logo in actual message text.
const MONITOR_MARKER='Kings Systems — Live Monitor';
const CONVOY_MARKER='Kings Logistics | Convoy Overview';
 // Proven existing fixed targets from successful Kings production writers:
 // system-monitoring run 44949376230 / convoy-checker run 44948817547.
 // Both originals are older than the latest 100 channel messages; look them up
 // directly by ID, and inspect recent history separately for duplicates.
 const MONITOR_FIXED_MESSAGE_ID='1551779478269599746';
 const CONVOY_FIXED_MESSAGE_ID='1550990101838954508';

function read(file){
 try{return JSON.parse(fs.readFileSync(path.join(ROOT,'data',file),'utf8'));}
 catch{return null;}
}
function validId(id){return ID.test(String(id||''));}
function ageOk(value,minutes,now=Date.now()){
 const at=Date.parse(value||'');
 return Number.isFinite(at)&&at<=now+300000&&now-at>=0&&now-at<=minutes*60000;
}
function sourceIsFresh(now=Date.now()){
 const snap=read('live-tracker-snapshot.json');
 // Only a verified current global snapshot is evidence of "live".
 return ageOk(snap?.updatedAt,20,now)&&
   Number.isSafeInteger(snap?.online)&&snap.online>=0;
}
function webhookUrl(raw,messageId){
 if(!validId(messageId)||!raw)return null;
 try{
   const u=new URL(raw);
   if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.port)return null;
   if(!/^\/api(?:\/v(?:9|10))?\/webhooks\/\d{15,22}\/[A-Za-z0-9._-]+\/?$/.test(u.pathname))return null;
   return u.origin+u.pathname.replace(/\/$/,'')+'/messages/'+String(messageId);
 }catch{return null;}
}
function webhookIdentity(raw){
 if(!raw)return null;
 try{
   const u=new URL(raw);
   if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.port)return null;
   const match=u.pathname.match(/^\/api(?:\/v(?:9|10))?\/webhooks\/(\d{15,22})\/[A-Za-z0-9._-]+\/?$/);
   return match?.[1]||null;
 }catch{return null;}
}
async function getJson(url,headers={}) {
 const response=await fetch(url,{
   method:'GET',headers:{Accept:'application/json',...headers},
   signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw new Error('discord-read-unavailable');
 const result=await response.json();
 if(!result||typeof result!=='object')throw new Error('discord-response-invalid');
 return result;
}
function botHeaders(){return {Authorization:'Bot '+BOT,'User-Agent':'Kings Content Audit/1.0'};}
function result(key,status,reason){return {key,status,reason};}
function verifyOutage(message,title) {
 if(!Array.isArray(message?.embeds)||message.embeds.length===0)return 'missing-embed';
 const embed=message.embeds[0];
 if(String(embed?.title||'')!==title)return 'expected-outage-title-missing';
 const field=Array.isArray(embed.fields)?embed.fields.find(f=>f.name==='Current online count'):null;
 if(!field||!String(field.value||'').includes('Unavailable — not zero'))
   return 'outage-online-unavailable-field-missing';
 const desc=String(embed.description||'');
 if(!desc.includes('temporarily unavailable')||!/(?:No one is|not) being marked online or offline/i.test(desc))
   return 'outage-explanation-missing';
 return null;
}
function verifyNormal(message,title) {
 if(!Array.isArray(message?.embeds)||!message.embeds.length)return 'missing-embed';
 // A just-recovered live sample must NOT still show a synthetic outage notice.
 if(String(message.embeds[0]?.title||'')===title)return 'outage-still-shown-after-fresh-snapshot';
 return null;
}
function verifyStaff(message,state,summary,botId,now=Date.now()){
 if(!validId(state?.channelId)||state.channelId!==STAFF_CHANNEL||
    !validId(state?.messageId)||message?.id!==state.messageId)return 'staff-message-identity-mismatch';
 if(String(message?.channel_id||'')!==STAFF_CHANNEL||
    String(message?.author?.id||'')!==String(botId))return 'staff-message-owner-mismatch';
 if(!ageOk(state?.updatedAt,150,now))return 'staff-source-not-recent';
 if(!Array.isArray(message.embeds)||!message.embeds.some(x=>String(x.title||'').includes(STAFF_TITLE)))
   return 'staff-title-missing';
 const embed=message.embeds.find(x=>String(x.title||'').includes(STAFF_TITLE));
 if(!String(embed.description||'').includes('hierarchy roles only')||
    !String(embed.description||'').includes('does NOT prove an HR-approved Staff appointment'))
   return 'staff-source-qualification-missing';
 const count=embed.fields?.find(x=>x.name==='Total unique Staff members');
 const approval=embed.fields?.find(x=>x.name==='Staff appointment / HR authorization');
 if(!Number.isSafeInteger(state.totalStaff)||String(count?.value||'')!=='**'+state.totalStaff+'**')
   return 'staff-role-count-mismatch';
 if(!String(approval?.value||'').includes('Not verified'))
   return 'staff-unverified-appointments-not-marked';
 if(summary&&Number.isSafeInteger(summary.currentStaff)&&ageOk(summary.updatedAt,150,now)&&
   summary.currentStaff!==state.totalStaff)return 'staff-aggregate-source-disagrees';
 return null;
}
function verifyNews(message,state,expectedWebhook){
 if(!state||!validId(state.discordMessageId)||!validId(state.discordChannelId)||
   !expectedWebhook)return 'news-config-or-evidence-missing';
 if(String(message?.id||'')!==String(state.discordMessageId)||
    String(message?.channel_id||'')!==String(state.discordChannelId)||
    String(message?.webhook_id||'')!==String(expectedWebhook))return 'news-message-or-publisher-mismatch';
 if(!Array.isArray(message.embeds)||!message.embeds.some(e=>
    String(e.url||'')===String(state.url||'')&&
    String(e.title||'')===String(state.title||'').slice(0,256)))
    return 'news-current-article-contract-mismatch';
 return null;
}
function verifyMonitor(messages,botId,now=Date.now()){
 if(!Array.isArray(messages))return 'monitor-history-unavailable';
 const matching=messages.filter(m=>String(m?.author?.id||'')===String(botId)&&
   String(m?.content||'').includes(MONITOR_MARKER));
 if(matching.length!==1)return matching.length?'monitor-duplicate-visible':'monitor-message-missing';
 const m=matching[0],content=String(m.content||'');
 if(!content.includes('**Overall Status:**')||!content.includes('**Production Readiness:**')||
    !content.includes('**Automation Coverage:**'))return 'monitor-health-fields-missing';
 const match=content.match(/\*\*Last Check:\*\*\s*<t:(\d+):F>/);
 if(!match||!ageOk(new Date(Number(match[1])*1000).toISOString(),150,now))
   return 'monitor-check-timestamp-stale';
 return null;
}
function verifyConvoyOverview(messages,botId,now=Date.now()){
 if(!Array.isArray(messages))return 'convoy-history-unavailable';
 const matches=messages.filter(m=>String(m?.author?.id||'')===String(botId)&&
   String(m?.content||'').includes(CONVOY_MARKER));
 if(matches.length!==1)return matches.length?'convoy-overview-duplicate-visible':'convoy-overview-missing';
 const content=String(matches[0].content||'');
 const time=content.match(/Latest Kings Convoy Center snapshot\s*<t:(\d+):R>/);
 if(!time||!ageOk(new Date(Number(time[1])*1000).toISOString(),180,now))
   return 'convoy-overview-source-stale';
 if(!content.includes('Convoy Planning')||!content.includes('System Overview'))
   return 'convoy-overview-contract-missing';
 return null;
}
async function ownedFixedAndRecent(channelId,messageId,headers){
 if(!validId(channelId)||!validId(messageId))throw Error('invalid fixed target configuration');
 const [fixed,recent]=await Promise.all([
   getJson(API+'/channels/'+channelId+'/messages/'+messageId,headers),
   getJson(API+'/channels/'+channelId+'/messages?limit=100',headers)
 ]);
 if(!Array.isArray(recent)||String(fixed?.id||'')!==String(messageId))
   throw Error('message query has no trusted fixed-message evidence');
 // The fixed message may be in the recent page; count it only once.
 return [fixed,...recent.filter(m=>String(m?.id||'')!==String(fixed.id))];
}
function findUnique(channels,name){
 const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const selected=channels.filter(x=>[0,5].includes(Number(x?.type))&&norm(x?.name)===norm(name));
 return selected.length===1?selected[0].id:null;
}
async function inspectKey(key,fn){
 try{const issue=await fn();return result(key,issue?'UNVERIFIED':'VERIFIED',issue||'live-discord-contract-matches');}
 catch{return result(key,'UNVERIFIED','discord-get-failed');}
}
async function main(){
 if(!BOT)throw Error('Discord Bot token unavailable');
 const now=Date.now();
 const readOnly=botHeaders();
 const reports=[];
 const fresh=sourceIsFresh(now);
 for(const cfg of OUTAGE){
   reports.push(await inspectKey(cfg.key,async()=>{
     const state=read(cfg.state);
     const url=webhookUrl(process.env[cfg.env],state?.[cfg.field]);
     if(!url)return 'webhook-or-stored-message-missing';
     const message=await getJson(url);
     if(String(message?.id||'')!==String(state[cfg.field]))return 'fixed-message-id-mismatch';
     return fresh?verifyNormal(message,cfg.title):verifyOutage(message,cfg.title);
   }));
 }
 const id=await getJson(API+'/users/@me',readOnly).then(x=>x?.id);
 if(!validId(id))throw Error('Discord Bot identity unavailable');
 reports.push(await inspectKey('staff-live-role-overview',async()=>{
   const state=read('staff-leadership-live-overview.json');
   if(!state||!validId(state.messageId))return 'staff-stored-message-missing';
   const message=await getJson(API+'/channels/'+STAFF_CHANNEL+'/messages/'+state.messageId,readOnly);
   return verifyStaff(message,state,read('staff-discord-updates-summary.json'),id,now);
 }));
 reports.push(await inspectKey('latest-news-publication',async()=>{
   const state=read('news-publication-state.json');
   if(!validId(state?.discordMessageId)||!validId(state?.discordChannelId))
     return 'news-publication-evidence-missing';
   const webhook=webhookIdentity(process.env.NEWS_DISCORD_WEBHOOK_URL);
   if(!webhook)return 'news-publisher-config-missing';
   const message=await getJson(API+'/channels/'+state.discordChannelId+'/messages/'+state.discordMessageId,readOnly);
   return verifyNews(message,state,webhook);
 }));
 const channels=await getJson(API+'/guilds/'+GUILD+'/channels',readOnly);
 const monitorId=Array.isArray(channels)?findUnique(channels,'system-monitor'):null;
 reports.push(await inspectKey('system-monitor-content',async()=>{
   if(!monitorId)return 'monitor-destination-missing';
   const messages=await ownedFixedAndRecent(monitorId,MONITOR_FIXED_MESSAGE_ID,readOnly);
   return verifyMonitor(messages,id,now);
 }));
 reports.push(await inspectKey('convoy-overview-content',async()=>{
   const messages=await ownedFixedAndRecent(CONVOY_CHANNEL,CONVOY_FIXED_MESSAGE_ID,readOnly);
   return verifyConvoyOverview(messages,id,now);
 }));
 for(const row of reports){
   console.log('[Kings Publication Content] '+row.key+': '+row.status+' ('+row.reason+')');
 }
 const total=reports.length,verified=reports.filter(x=>x.status==='VERIFIED').length;
 console.log('Kings direct content contracts verified: '+verified+'/'+total);
 console.log('Only selected existing publications are checked: no assertion about all historic/event-driven posts or their policies.');
 if(verified!==total)throw Error('Some Kings publication content contracts are UNVERIFIED; review recorded reason categories');
}
if(require.main===module)main().catch(()=>{
 console.error('Kings read-only publication content audit incomplete; no Discord writes attempted.');
 process.exitCode=1;
});
module.exports={OUTAGE,validId,ageOk,sourceIsFresh,webhookUrl,webhookIdentity,verifyOutage,verifyNormal,verifyStaff,verifyNews,verifyMonitor,verifyConvoyOverview,findUnique,ownedFixedAndRecent,MONITOR_FIXED_MESSAGE_ID,CONVOY_FIXED_MESSAGE_ID};
