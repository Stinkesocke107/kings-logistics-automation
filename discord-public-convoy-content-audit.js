'use strict';
// Read only: verified historical Kings Convoy post + 100 newest public messages.
// Never log contents, identities, or Discord credentials.
const fs=require('node:fs');
const path=require('node:path');
const API='https://discord.com/api/v10';
const TOKEN=process.env.DISCORD_BOT_TOKEN||'';
const GUILD=process.env.DISCORD_GUILD_ID||'1114967437788577792';
const CHANNEL=process.env.DISCORD_KINGS_CONVOY_ANNOUNCEMENT_CHANNEL_ID||'1351613882791366838';
const ID=/^\d{15,22}$/;
const EVENT_MARKER=/Event ID:\*\*\s*\x60(\d+)\x60/;
const EVENT_URL=/https:\/\/truckersmp\.com\/events\/(\d+)/i;
const valid=x=>ID.test(String(x||''));
function proof(){
 try{return JSON.parse(fs.readFileSync(path.join(__dirname,'data','public-convoy-live-proof.json'),'utf8'));}
 catch{return null;}
}
function verifyHistorical(message,saved,bot){
 if(!saved||!valid(saved.discordMessageId)||saved.discordChannelId!==CHANNEL||
    !Number.isSafeInteger(saved.eventId)||saved.eventId<1)return 'saved-proof-invalid';
 if(String(message?.id||'')!==String(saved.discordMessageId)||
    String(message?.channel_id||'')!==CHANNEL||
    String(message?.author?.id||'')!==String(bot)||
    (valid(saved.discordBotId)&&String(saved.discordBotId)!==String(bot)))
   return 'message-owner-or-location-mismatch';
 const c=String(message.content||'');
 if(!c.includes('Kings Convoy Announcement')||
    !c.includes('Event ID:')||
    !c.includes(String.fromCharCode(96)+saved.eventId+String.fromCharCode(96))||
    !c.includes('https://truckersmp.com/events/'+saved.eventId))
   return 'accepted-event-reference-missing';
 return null;
}
function inspectRecent(messages,bot){
 if(!Array.isArray(messages))return {status:'UNVERIFIED',reason:'channel-history-invalid'};
 const own=messages.filter(m=>String(m?.author?.id||'')===String(bot)&&
   String(m.content||'').includes('Kings Convoy Announcement'));
 if(!own.length)return {status:'NO_RECENT',reason:'no-current-post-in-latest-100'};
 const seen=new Set();
 for(const m of own){
   const c=String(m.content||'');
   const id=c.match(EVENT_MARKER),link=c.match(EVENT_URL);
   if(!id||!link||id[1]!==link[1])
     return {status:'UNVERIFIED',reason:'public-event-id-or-link-mismatch'};
   if(!/Kings Convoy Announcement — (2 Hours|Starting Now)/.test(c))
     return {status:'UNVERIFIED',reason:'public-type-marker-missing'};
   if(m.mention_everyone===true&&!c.includes('@everyone'))
     return {status:'UNVERIFIED',reason:'unexplained-everyone-mention'};
   if(Array.isArray(m.mention_roles)&&m.mention_roles.length)
     return {status:'UNVERIFIED',reason:'unexpected-role-mention'};
   if(seen.has(id[1]))return {status:'UNVERIFIED',reason:'public-event-duplicate-in-window'};
   seen.add(id[1]);
 }
 return {status:'VERIFIED',reason:'sampled-public-events-consistent'};
}
async function get(route){
 const response=await fetch(API+route,{
  method:'GET',headers:{Authorization:'Bot '+TOKEN,Accept:'application/json'},
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('discord-read-failed');
 return response.json();
}
async function main(){
 if(!TOKEN)throw Error('Bot read token unavailable');
 const saved=proof();
 if(!valid(saved?.discordMessageId))throw Error('Saved public proof missing');
 const [bot,channel,historical,recent]=await Promise.all([
  get('/users/@me'),get('/channels/'+CHANNEL),
  get('/channels/'+CHANNEL+'/messages/'+saved.discordMessageId),
  get('/channels/'+CHANNEL+'/messages?limit=100')
 ]);
 if(!valid(bot?.id)||String(channel?.guild_id||'')!==String(GUILD)||
    ![0,5].includes(Number(channel?.type)))throw Error('Guild/channel/bot binding invalid');
 const issue=verifyHistorical(historical,saved,bot.id);
 const current=inspectRecent(recent,bot.id);
 console.log('[Kings Convoy Public] historical-proof: '+(issue?'UNVERIFIED ('+issue+')':'VERIFIED (accepted-event-message-exists)'));
 console.log('[Kings Convoy Public] recent-window: '+current.status+' ('+current.reason+')');
 console.log('The verified historical event does not prove future announcements were due or delivered.');
 if(issue||current.status==='UNVERIFIED')throw Error('Public convoy evidence incomplete');
}
if(require.main===module)main().catch(()=>{
 console.error('Kings public convoy read-only audit incomplete; no Discord writes attempted');
 process.exitCode=1;
});
module.exports={verifyHistorical,inspectRecent};
