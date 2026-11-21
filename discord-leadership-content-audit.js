'use strict';
// Read-only audit of the five CURRENT consolidated Kings Leadership embeds.
// Excludes deprecated daily/weekly/monthly Legacy reports and external bots.
// Never log Discord message bodies, member identifiers, user names or credentials.
const fs=require('node:fs');
const path=require('node:path');
const API='https://discord.com/api/v10';
const TOKEN=process.env.DISCORD_BOT_TOKEN || '';
const ID=/^\d{17,22}$/;
const CONTRACTS=Object.freeze([
 {key:'driver',channel:'1551675577226887229',title:'Kings Driver Leadership Dashboard',
  description:['Driver totals cover the full TruckersMP VTC roster','Live online status is shown only when verified'],
  fields:['Live Overview','Last Completed Week','Last Completed Month'],
  footer:'Kings Logistics • Driver Leadership • Advisory only'},
 {key:'hr',channel:'1383508442857340969',title:'Kings HR Leadership Dashboard',
  description:['all HR and personnel decisions remain human'],
  fields:['VTC Driver & HR Overview','Kings Driver Registration — HR Review','Last Completed Week','Last Completed Month'],
  footer:'Kings Logistics • HR Leadership • Human review required'},
 {key:'staff',channel:'1551675877178474526',title:'Kings Staff Leadership Dashboard',
  description:['TruckersMP VTC classifications','Discord Staff-role membership is a different count'],
  fields:['VTC Staff Classification','Last Completed Week','Last Completed Month'],
  footer:'Kings Logistics • Staff Leadership • Advisory only'},
 {key:'event',channel:'1551675735633297418',title:'Kings Event Leadership Dashboard',
  description:['Verified convoy attendance/history remains a separate statistics dataset'],
  fields:['Live Overview','Last Completed Week','Last Completed Month'],
  footer:'Kings Logistics • Event Leadership • Internal operations'},
 {key:'management',channel:'1492936683304517792',title:'Kings Management Leadership Dashboard',
  description:['Drivers count the full TruckersMP VTC roster','Staff count uses VTC Staff classification','Discord role-member counts are separate'],
  fields:['VTC Drivers — Live','VTC Staff Classification','Events — Live','Last Completed Week','Last Completed Month'],
  footer:'Kings Logistics • Management Control • One-message dashboard'}
]);

function validId(value){return ID.test(String(value||''));}
function stateIds(dir=path.join(__dirname,'data')){
 try{
  const doc=JSON.parse(fs.readFileSync(path.join(dir,'leadership-dashboard-state.json'),'utf8'));
  return doc?.messageIds && typeof doc.messageIds==='object' ? doc.messageIds : null;
 }catch{return null;}
}
function verifyEmbed(message,def,botId,messageId){
 if(!validId(messageId)||!validId(botId)||String(message?.id||'')!==String(messageId)||
    String(message?.channel_id||'')!==String(def.channel)||
    String(message?.author?.id||'')!==String(botId))
    return 'message-identity-unverified';
 if(!Array.isArray(message.embeds))return 'embed-unavailable';
 const embeds=message.embeds.filter(e=>String(e?.title||'').includes(def.title));
 if(embeds.length!==1)return 'dashboard-title-missing-or-ambiguous';
 const embed=embeds[0];
 if(!def.description.every(piece=>String(embed.description||'').includes(piece)))
    return 'dashboard-source-qualification-missing';
 const fields=Array.isArray(embed.fields)?embed.fields:[];
 if(!def.fields.every(piece=>fields.some(f=>String(f?.name||'').includes(piece)&&
    typeof f?.value==='string'&&f.value.trim().length)))
    return 'dashboard-required-fields-missing';
 if(String(embed.footer?.text||'')!==def.footer)
    return 'dashboard-footer-unexpected';
 const at=Date.parse(embed.timestamp||'');
 if(!Number.isFinite(at)||at>Date.now()+300000)
    return 'dashboard-source-timestamp-invalid';
 return null;
}
async function json(route,transport=fetch){
 const resp=await transport(API+route,{
  method:'GET',
  headers:{Authorization:'Bot '+TOKEN,Accept:'application/json'},
  signal:AbortSignal.timeout(15000)
 });
 if(!resp.ok)throw Error('discord-get-unavailable');
 const doc=await resp.json();
 if(!doc||typeof doc!=='object')throw Error('discord-get-invalid');
 return doc;
}
async function audit(transport=fetch,ids=stateIds()){
 if(!TOKEN)throw Error('bot-read-configuration-missing');
 if(!ids)throw Error('dashboard-state-not-readable');
 let botId;
 try{botId=(await json('/users/@me',transport)).id;}catch{throw Error('bot-identity-unverified');}
 if(!validId(botId))throw Error('bot-identity-unverified');
 const results=[];
 for(const def of CONTRACTS){
  let reason;
  const msgId=ids[def.key];
  if(!validId(msgId))reason='stored-id-unavailable';
  else {
   try{reason=verifyEmbed(await json('/channels/'+def.channel+'/messages/'+msgId,transport),def,botId,msgId);}
   catch{reason='discord-message-unreadable';}
  }
  results.push(Object.freeze({key:def.key,status:reason?'UNVERIFIED':'VERIFIED',
   reason:reason||'current-dashboard-content-contract-matches'}));
 }
 return results;
}
async function main(){
 const results=await audit();
 for(const item of results)
  console.log('[Kings Leadership Content] '+item.key+': '+item.status+' ('+item.reason+')');
 const count=results.filter(x=>x.status==='VERIFIED').length;
 console.log('Kings consolidated Leadership content verified: '+count+'/'+results.length);
 console.log('Only fixed current dashboards were audited; old reports and private personnel decisions remain unverified.');
 if(count!==results.length)throw Error('Kings Leadership current content audit incomplete');
}
if(require.main===module)main().catch(()=>{
 console.error('Kings Leadership content read-only audit incomplete (no Discord write attempted)');
 process.exitCode=1;
});
module.exports={CONTRACTS,validId,stateIds,verifyEmbed,audit};
