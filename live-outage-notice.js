'use strict';
// Kings Live Systems: show honest availability when an attempted live refresh
// fails. Read-only on stored measurements and history; Discord message edits only.
require('./kings-branding').installDiscordBranding();
const fs=require('node:fs');
const path=require('node:path');

const ROOT=__dirname;
const KINGS_BLUE=0x182DFF;
const MESSAGE_ID=/^\d{17,20}$/;
const SETTINGS=[
  {label:'Live Tracker',file:'live-tracker-snapshot.json',idKey:'discordMessageId',env:'DISCORD_WEBHOOK_URL',
   title:'👑 Kings Live Tracker — Live Data Unavailable'},
  {label:'Advanced Statistics',file:'statistics.json',idKey:'messageId',env:'STATS_DISCORD_WEBHOOK_URL',
   title:'👑 Kings Statistics — Live Data Unavailable'},
  {label:'Central Overview',file:'central-overview.json',idKey:'messageId',env:'CENTRAL_OVERVIEW_WEBHOOK_URL',
   title:'👑 Kings Central Overview — Live Data Unavailable'}
];
function readSafeState(file){
  try{
    const name=path.join(ROOT,'data',file);
    const obj=JSON.parse(fs.readFileSync(name,'utf8'));
    return obj && typeof obj==='object'&&!Array.isArray(obj)?obj:null;
  }catch{return null;}
}
function lastVerified(state,config){
  const value=config.label==='Advanced Statistics'?
    state?.sourceSnapshotAt:config.label==='Central Overview'?
    readSafeState('live-tracker-snapshot.json')?.updatedAt:state?.updatedAt;
  const ms=Date.parse(value||'');
  if(!Number.isFinite(ms)||ms<=0||ms>Date.now()+300000)return 'No confirmed recent sample';
  return '<t:'+Math.floor(ms/1000)+':F> (<t:'+Math.floor(ms/1000)+':R>)';
}
function outageEmbed(config,state){
  return {
    title:config.title,
    description:'⚠️ **Current TruckersMP player status is temporarily unavailable.**\n\n' +
      'The latest live refresh could not be verified. No one is being marked online or offline from missing information.\n\n' +
      'Previously confirmed statistics and historical records remain preserved.',
    color:KINGS_BLUE,
    fields:[{name:'Last confirmed player-data sample',value:lastVerified(state,config),inline:false},
      {name:'Current online count',value:'**Unavailable — not zero**',inline:false}],
    footer:{text:'Kings Systems | Live source unavailable; refresh will resume automatically after a successful verified run.'}
  };
}
function webhookBase(value){
  if(!value)return null;
  let url;
  try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||!['discord.com','discordapp.com'].includes(url.hostname))return null;
  if(!/^\/api(?:\/v\d+)?\/webhooks\/\d{17,20}\/[A-Za-z0-9._-]+\/?$/.test(url.pathname))return null;
  return url.origin+url.pathname.replace(/\/$/,'');
}
async function updateExisting(config){
  const state=readSafeState(config.file);
  const id=String(state?.[config.idKey]||'');
  const url=webhookBase(process.env[config.env]);
  if(!MESSAGE_ID.test(id)||!url){
    console.warn(config.label+': existing message ID or webhook not available; no new message created.');
    return {label:config.label,changed:false,reason:'no-target'};
  }
  const endpoint=url+'/messages/'+id;
  const get=await fetch(endpoint,{method:'GET',signal:AbortSignal.timeout(12000)});
  if(get.status===404){
    console.warn(config.label+': saved message was not found; not creating a new one.');
    return {label:config.label,changed:false,reason:'not-found'};
  }
  if(!get.ok)throw new Error(config.label+': failed to inspect existing Discord message (HTTP '+get.status+').');
  const existing=await get.json();
  if(existing?.embeds?.[0]?.title===config.title){
    console.log(config.label+': outage notice already shown; avoiding duplicate edits.');
    return {label:config.label,changed:false,reason:'already-shown'};
  }
  const response=await fetch(endpoint,{
    method:'PATCH',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(12000),
    body:JSON.stringify({
      content:'',embeds:[outageEmbed(config,state)],
      allowed_mentions:{parse:[]}
    })
  });
  if(!response.ok)throw new Error(config.label+': failed to update existing Discord message (HTTP '+response.status+').');
  console.log(config.label+': outage notice updated existing Discord message.');
  return {label:config.label,changed:true};
}
async function main(){
  let problems=0;
  for(const config of SETTINGS){
    try{await updateExisting(config);}
    catch(error){
      problems++;
      // Never print webhook secrets, Discord message bodies or player IDs.
      console.error(config.label+': status edit failed ('+String(error?.name||'Error')+').');
    }
  }
  if(problems)process.exitCode=1;
}
module.exports={SETTINGS,readSafeState,lastVerified,outageEmbed,webhookBase,updateExisting,main};
main().catch(error=>{console.error('Kings outage status could not finish.');process.exitCode=1;});
