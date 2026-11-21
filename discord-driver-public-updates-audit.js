'use strict';
// Read-only proof of existing Kings Driver Update webhook publications.
// Never log Discord message bodies, member/user IDs, webhook URLs or tokens.
// No personnel state is read, and no Discord POST/PATCH/DELETE can occur.
const {endpoint}=require('./discord-webhook-destination-audit');
const API='https://discord.com/api/v10';
const GUILD=process.env.DISCORD_GUILD_ID||'1114967437788577792';
const TOKEN=process.env.DISCORD_BOT_TOKEN||'';
const ID=/^\d{15,22}$/;
const ALLOWED_TITLES=new Set([
 '👑 Kings Logistics Member Update',
 '👑 Welcome to the Kings Family!',
 '🎉 Congratulations on Becoming a Kings Driver!'
]);
function valid(id){return ID.test(String(id||''));}
function checkDriverPost(message,webhookId,channelId) {
 if(!valid(webhookId)||!valid(channelId)||
    String(message?.webhook_id||'')!==String(webhookId)||
    String(message?.channel_id||'')!==String(channelId))
   return 'driver-post-publisher-or-location-mismatch';
 if(message.mention_everyone===true||
    (Array.isArray(message.mention_roles)&&message.mention_roles.length>0)||
    (Array.isArray(message.mentions)&&message.mentions.length>1))
   return 'driver-post-broad-mention-detected';
 const embeds=Array.isArray(message.embeds)?message.embeds:[];
 const matching=embeds.filter(e=>ALLOWED_TITLES.has(String(e.title||''))&&
    String(e.footer?.text||'')==='Kings Logistics • Driver Update');
 if(matching.length!==1)return 'driver-update-embed-contract-missing';
 if(!matching[0].description||String(matching[0].description).length>4096)
   return 'driver-update-description-invalid';
 if(matching[0].image?.url){
   try{if(new URL(matching[0].image.url).protocol!=='https:')return 'driver-update-banner-unsafe';}
   catch{return 'driver-update-banner-invalid';}
 }
 return null;
}
async function getJson(url,headers={}){
 const resp=await fetch(url,{
  method:'GET',headers:{Accept:'application/json',...headers},
  signal:AbortSignal.timeout(15000)
 });
 if(!resp.ok)throw Error('discord-get-unavailable');
 const data=await resp.json();
 if(!data||typeof data!=='object')throw Error('discord-get-invalid');
 return data;
}
async function main(){
 if(!TOKEN)throw Error('Discord auth unavailable');
 const conf=endpoint(process.env.DRIVER_UPDATES_WEBHOOK_URL);
 if(!conf)throw Error('Driver webhook config unavailable');
 const info=await getJson(conf.url);
 if(!valid(info?.id)||String(info.id)!==conf.id||
    String(info.guild_id||'')!==String(GUILD)||!valid(info.channel_id))
   throw Error('Driver webhook guild/identity mismatch');
 const headers={Authorization:'Bot '+TOKEN,'User-Agent':'Kings Driver Public Audit/1.0'};
 const messages=await getJson(API+'/channels/'+info.channel_id+'/messages?limit=100',headers);
 if(!Array.isArray(messages))throw Error('Driver channel history unavailable');
 const related=messages.filter(m=>String(m?.webhook_id||'')===String(info.id));
 if(!related.length){
   console.log('[Kings Driver Update Audit] UNVERIFIED (no-owned-publication-in-limited-channel-window)');
   throw Error('Driver public publication not verifiable from last 100 channel messages');
 }
 // Inspect the newest real Driver Update post. Later historic messages may be
 // from older Kings templates; no unsupported all-history claim is made.
 const newest=related[0];
 const issue=checkDriverPost(newest,info.id,info.channel_id);
 const label=issue?'UNVERIFIED':'VERIFIED';
 console.log('[Kings Driver Update Audit] '+label+' ('+(issue||'latest-webhook-embed-and-mentions-match')+')');
 console.log('Checked newest accessible Driver webhook publication only; no claim about every historical Driver event.');
 if(issue)throw Error('Driver public publication content contract failed');
}
if(require.main===module)main().catch(()=>{
 console.error('Kings Driver public publication read-only audit incomplete; no Discord changes attempted');
 process.exitCode=1;
});
module.exports={checkDriverPost,ALLOWED_TITLES};
