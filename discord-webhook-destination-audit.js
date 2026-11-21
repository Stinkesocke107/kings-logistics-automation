'use strict';
// Read-only Kings Discord webhook destination audit.
// Never print webhook URLs, tokens, channel names, members, message bodies,
// private channel metadata or raw webhook JSON.
const fs=require('node:fs');
const path=require('node:path');
const API='https://discord.com/api/v10';
const GUILD=process.env.DISCORD_GUILD_ID||'1114967437788577792';
const ID=/^\d{15,22}$/;
const TARGETS=Object.freeze([
 {key:'live-tracker-webhook',secret:'DISCORD_WEBHOOK_URL'},
 {key:'advanced-statistics-webhook',secret:'STATS_DISCORD_WEBHOOK_URL'},
 {key:'central-overview-webhook',secret:'CENTRAL_OVERVIEW_WEBHOOK_URL'},
 {key:'news-webhook',secret:'NEWS_DISCORD_WEBHOOK_URL',expectedChannel:'news-publication-state.json'},
 {key:'changelog-webhook',secret:'CHANGELOG_DISCORD_WEBHOOK_URL'},
 {key:'milestones-webhook',secret:'MILESTONE_DISCORD_WEBHOOK_URL'},
 {key:'driver-updates-webhook',secret:'DRIVER_UPDATES_WEBHOOK_URL'},
 {key:'monthly-report-webhook',secret:'MONTHLY_REPORT_DISCORD_WEBHOOK_URL'}
]);
function readJson(file){
 try{return JSON.parse(fs.readFileSync(path.join(__dirname,'data',file),'utf8'));}
 catch{return null;}
}
function endpoint(value){
 if(!value)return null;
 try{
   const u=new URL(value);
   if(u.protocol!=='https:'||u.port||!['discord.com','discordapp.com'].includes(u.hostname))return null;
   const m=u.pathname.match(/^\/api(?:\/v(?:9|10))?\/webhooks\/(\d{15,22})\/([A-Za-z0-9._-]+)\/?$/);
   if(!m)return null;
   return {url:u.origin+u.pathname.replace(/\/$/,''),id:m[1]};
 }catch{return null;}
}
function verifyDestination(webhook,config,channels,guildId,expectedChannel=null) {
 if(!webhook||!ID.test(String(webhook.id||''))||String(webhook.id)!==String(config.id))
   return 'webhook-identity-mismatch';
 if(String(webhook.guild_id||'')!==String(guildId))
   return 'webhook-guild-mismatch';
 if(!ID.test(String(webhook.channel_id||'')))return 'webhook-channel-not-identified';
 const selected=channels.filter(c=>String(c?.id||'')===String(webhook.channel_id));
 if(selected.length!==1||![0,5].includes(Number(selected[0]?.type)))
   return 'webhook-channel-not-accessible-in-kings-guild';
 if(selected[0].guild_id && String(selected[0].guild_id)!==String(guildId))
   return 'webhook-channel-guild-mismatch';
 if(expectedChannel && String(webhook.channel_id)!==String(expectedChannel))
   return 'webhook-publication-target-drift';
 if(Number(webhook.type)!==1)return 'not-an-incoming-webhook';
 return null;
}
async function getJson(url,options={}){
 const response=await fetch(url,{
   method:'GET',headers:{Accept:'application/json',...(options.headers||{})},
   signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('discord-read-failed');
 return response.json();
}
async function main(){
 const bot=process.env.DISCORD_BOT_TOKEN||'';
 if(!bot)throw Error('No Discord read-only channel access configured');
 const channels=await getJson(API+'/guilds/'+GUILD+'/channels',{
   headers:{Authorization:'Bot '+bot}
 });
 if(!Array.isArray(channels)||!channels.length)throw Error('Kings guild channel source incomplete');
 const evidence=readJson('news-publication-state.json');
 const results=[];
 for(const target of TARGETS){
   let status='UNVERIFIED',reason='webhook-unavailable';
   const parsed=endpoint(process.env[target.secret]);
   if(!parsed)reason='missing-or-invalid-webhook-config';
   else{
     try{
       const details=await getJson(parsed.url);
       const expected=target.expectedChannel?evidence?.discordChannelId:null;
       const issue=target.expectedChannel&&!ID.test(String(expected||''))
         ? 'news-current-publication-evidence-missing'
         : verifyDestination(details,parsed,channels,GUILD,expected);
       status=issue?'UNVERIFIED':'VERIFIED';
       reason=issue||'webhook-target-verified';
     }catch{reason='webhook-read-not-verified';}
   }
   results.push({key:target.key,status,reason});
   console.log('[Kings Webhook Destination] '+target.key+': '+status+' ('+reason+')');
 }
 const verified=results.filter(x=>x.status==='VERIFIED').length;
 console.log('Kings live webhook destinations confirmed: '+verified+'/'+results.length);
 console.log('This audit confirms webhook routing only. No article, event or scheduled publication is created.');
 if(verified!==results.length)throw Error('One or more Kings webhook destinations remain unverified');
}
if(require.main===module)main().catch(()=>{
 console.error('Kings webhook destination audit incomplete (read-only; no private details disclosed)');
 process.exitCode=1;
});
module.exports={TARGETS,endpoint,verifyDestination};
