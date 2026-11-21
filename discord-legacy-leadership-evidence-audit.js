'use strict';
// Legacy reports: direct GET evidence only. These are NOT the current
// consolidated Leadership dashboards. Never infer delivery from publishedKeys.
const fs=require('node:fs');
const path=require('node:path');
const TOKEN=process.env.DISCORD_BOT_TOKEN||'';
const GUILD=process.env.DISCORD_GUILD_ID||'1114967437788577792';
const API='https://discord.com/api/v10';
const STAFF_CHANNEL='1551675877178474526';
const MANAGEMENT_CHANNEL='1492936683304517792';
const IDS=/^\d{17,22}$/;
const reportDefs=[
 {key:'legacy-staff-daily',channel:STAFF_CHANNEL,state:'staff-leadership-report-state.json',field:'daily',marker:'Kings Staff Leadership — Daily Changes'},
 {key:'legacy-staff-weekly',channel:STAFF_CHANNEL,state:'staff-leadership-report-state.json',field:'weekly',marker:'Kings Staff Leadership — Weekly Review'},
 {key:'legacy-staff-monthly',channel:STAFF_CHANNEL,state:'staff-leadership-report-state.json',field:'monthly',marker:'Kings Staff Leadership — Monthly Report'},
 {key:'legacy-management-weekly',channel:MANAGEMENT_CHANNEL,state:'management-weekly-overview-state.json',field:'messageId',marker:'Kings Management Weekly Review'}
];
function read(name){
 try{return JSON.parse(fs.readFileSync(path.join(__dirname,'data',name),'utf8'));}
 catch{return null;}
}
function storedId(def,state){return def.field==='messageId'?state?.messageId:state?.messageIds?.[def.field];}
function verifyReport(message,def,id,bot){
 if(String(message?.id||'')!==String(id)||String(message?.channel_id||'')!==String(def.channel)||
    String(message?.author?.id||'')!==String(bot))
   return 'legacy-message-identity-mismatch';
 const combined=String(message?.content||'')+'\n'+
   (Array.isArray(message.embeds)?message.embeds.map(e=>String(e?.title||'')+'\n'+String(e?.description||'')).join('\n'):'');
 if(!combined.includes(def.marker))return 'legacy-report-marker-missing';
 return null;
}
async function get(route){
 const res=await fetch(API+route,{
   method:'GET',headers:{Authorization:'Bot '+TOKEN,Accept:'application/json'},
   signal:AbortSignal.timeout(15000)
 });
 if(res.status===404)return null;
 if(!res.ok)throw Error('discord-read-failed');
 return res.json();
}
async function main(){
 if(!TOKEN)throw Error('Bot read token unavailable');
 const [bot,staff,management]=await Promise.all([
   get('/users/@me'),get('/channels/'+STAFF_CHANNEL),get('/channels/'+MANAGEMENT_CHANNEL)
 ]);
 if(!IDS.test(String(bot?.id||''))||String(staff?.guild_id||'')!==String(GUILD)||
    String(management?.guild_id||'')!==String(GUILD))
   throw Error('Legacy channel/bot permissions unverified');
 let present=0,notVisible=0,errors=0;
 for(const def of reportDefs){
   const state=read(def.state),id=storedId(def,state);
   if(!IDS.test(String(id||''))){
     console.log('[Kings Legacy Leadership] '+def.key+': UNVERIFIED (stored-id-not-available)');
     errors++;continue;
   }
   try{
     const msg=await get('/channels/'+def.channel+'/messages/'+id);
     if(!msg){
       notVisible++;
       console.log('[Kings Legacy Leadership] '+def.key+': NOT_VISIBLE (historical-message-not-found)');
       continue;
     }
     const issue=verifyReport(msg,def,id,bot.id);
     if(issue){errors++;console.log('[Kings Legacy Leadership] '+def.key+': UNVERIFIED ('+issue+')');}
     else{present++;console.log('[Kings Legacy Leadership] '+def.key+': HISTORICAL_PRESENT (not-current-report)');}
   }catch{
     errors++;
     console.log('[Kings Legacy Leadership] '+def.key+': UNVERIFIED (discord-read-failed)');
   }
 }
 console.log('Legacy Leadership messages: '+present+' historical present, '+notVisible+' no longer visible, '+errors+' unverified.');
 console.log('Published-keys/snapshot updates from before fix #122 are NOT independent proof of delivery; consolidated dashboards remain current.');
 if(errors)throw Error('Unverified historical Leadership message identity');
}
if(require.main===module)main().catch(()=>{
 console.error('Kings historical Leadership read-only audit incomplete; no Discord write attempted');
 process.exitCode=1;
});
module.exports={reportDefs,storedId,verifyReport};
