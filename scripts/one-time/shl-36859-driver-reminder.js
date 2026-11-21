'use strict';
// One-time CEO-authorized recovery of the SHL Driver 1h reminder.
// The normal workflow stays dry-run on the triggering GitHub push.
// This script is enabled ONLY by an exact one-time release marker, scoped to
// official Event 36859, the confirmed Kings slot image and valid 1h window.
// No channel/thread/status/roles are changed. All writes target one message.
const fs=require('node:fs');
const path=require('node:path');
const GUILD='1114967437788577792';
const CHANNEL='1550997669596631200';
const ROLE='1476774746480709675';
const SOURCE='1573471889127514252';
const EVENT='36859';
const EXPECTED_MEETUP='2026-11-22T00:00:00.000Z';
const EXPECTED_DEPARTURE='2026-11-22T01:00:00.000Z';
const BOT_ID='1404524559214051499';
const MARKER='🚨 **Kings Driver Convoy Reminder — 1 Hour**';
const URL='https://truckersmp.com/events/'+EVENT;
const TOKEN=process.env.DISCORD_BOT_TOKEN;
const REPORT=path.join(__dirname,'..','..','output','convoy-check-results.json');
const API='https://discord.com/api/v10';

function verifiedSource(report){
 const a=(report?.threads||[]).filter(x=>
  String(x?.eventId)===EVENT&&String(x?.threadId)===SOURCE);
 if(a.length!==1)throw Error('exact-event-source-not-found');
 const item=a[0], v=item.validation||{}, c=v.checks||{};
 if(item.ignored||item.error||item.testThread||item.duplicateEventId||
    item.staffStatus?.status!=='Scheduled'||
    item.staffStatus?.roleSource!=='guild-member-lookup'||
    !Array.isArray(item.staffStatus?.matchedRoleIds)||
    item.staffStatus.matchedRoleIds.length===0||
    item.locked||c.eventLink!==true||c.eventType!==true||
    c.responsibleStaff!==true||c.kingsSlotConfirmed!==true||
    c.imageProof!==true||v.parsed?.eventType!=='Partner Convoy'||
    !v.parsed?.kingsSlotImage?.messageId||
    !v.parsed?.kingsSlotImage?.attachmentId){
   throw Error('shl-approved-slot-contract-not-met');
 }
 return item;
}
function unwrap(payload){
 let p=payload;
 for(let i=0;i<5;i++){
  if(!p||typeof p!=='object')throw Error('official-event-unavailable');
  if(p.id && (p.meetup_at||p.start_at))return p;
  p=p.response||p.data||p.event;
 }
 throw Error('official-event-invalid');
}
function verifyOfficialEvent(event, nowUnix){
 if(String(event?.id)!==EVENT||
    new Date(event?.meetup_at).toISOString()!==EXPECTED_MEETUP||
    new Date(event?.start_at).toISOString()!==EXPECTED_DEPARTURE||
    event?.cancelled===true||event?.is_cancelled===true||
    /cancel(?:l?ed)/i.test(String(event?.status||''))){
   throw Error('official-event-time-or-status-no-longer-approved');
 }
 const meet=Math.floor(Date.parse(EXPECTED_MEETUP)/1000);
 const delta=meet-nowUnix;
 if(delta<=0||delta>3600)throw Error('not-within-approved-one-hour-window');
 return meet;
}
function existingOneHourReminder(messages){
 return messages.some(m=>{
  const t=String(m?.content||'');
  const sameEvent=t.includes(URL)||
    (t.includes('Event ID')&&t.includes('`'+EVENT+'`'));
  const sameTier=t.includes(MARKER)||
    /(?:Convoy Reminder|SHL Reminder).*?(?:1\s*Hour|1h|One Hour)/i.test(t);
  return sameEvent && sameTier;
 });
}
function body(meet, image, event){
 const departure=Math.floor(Date.parse(EXPECTED_DEPARTURE)/1000);
 const server=typeof event.server==='string'?event.server:event.server?.name||'[US] Simulation';
 const route='Lille — Slot → Erfurt — Quarry';
 const content=[
  MARKER,
  '🔒 **Source Thread:** `'+SOURCE+'`',
  '',
  '<@&'+ROLE+'>',
  '',
  '# 🚨 Convoy Reminder — 1 Hour',
  '',
  'The SHL convoy meeting is coming up shortly. Please check your confirmed Kings parking slot and arrive before the meeting time.',
  '',
  '🚛 **Convoy:** Inter Shipeados Logistica (SHL) — Monthly Convoy',
  '🕒 **Meeting Time:** <t:'+meet+':F> · <t:'+meet+':R>',
  '🚦 **Departure Time:** <t:'+departure+':t>',
  '🎙️ **Server:** '+String(server).slice(0,90),
  '🛣️ **Route:** '+route,
  '🚚 **Kings Slot:** Confirmed — see attached parking image',
  '🔗 **TruckersMP Event:** '+URL,
  '',
  'Please arrive on time. <:kings_heart:1500949819110326352>'
 ].join('\n');
 if(content.length>2000||/@everyone|@here/i.test(content))throw Error('unsafe-reminder-content');
 if(!image||!/^(?:https:\/\/)?(?:cdn\.|media\.)discordapp\.(?:com|net)\//.test(image))
  throw Error('slot-image-not-revalidated');
 return {content,embeds:[{title:'🚚 Kings Slot',image:{url:image}}],
  allowed_mentions:{parse:[],roles:[ROLE]}};
}
async function request(url,options={}){
 const ctrl=AbortSignal.timeout(15000);
 const response=await fetch(url,{...options,signal:ctrl});
 const txt=await response.text();
 if(!response.ok)throw Error('remote-api-error-status-'+response.status);
 return txt?JSON.parse(txt):null;
}
async function discord(p,options={}){
 return request(API+p,{
  method:options.method||'GET',
  headers:{Authorization:'Bot '+TOKEN,'Content-Type':'application/json','User-Agent':'Kings-One-Time-SHL-Reminder/1.0'},
  body:options.body?JSON.stringify(options.body):undefined
 });
}
async function findPreviousMessage(){
 let before=null;
 for(let page=0;page<10;page++){
  const q=new URLSearchParams({limit:'100'});
  if(before)q.set('before',before);
  const messages=await discord('/channels/'+CHANNEL+'/messages?'+q);
  if(!Array.isArray(messages))throw Error('history-response-invalid');
  if(existingOneHourReminder(messages))return true;
  if(messages.length<100)return false;
  before=messages.at(-1)?.id;
  if(!before)throw Error('history-page-invalid');
 }
 throw Error('deduplication-history-exhausted');
}
async function main(){
 if(process.env.KINGS_ONE_TIME_SHL_RECOVERY!=='explicit-ceo-authorized-36859')
  throw Error('recovery-not-explicitly-authorized');
 if(!TOKEN)throw Error('bot-token-not-configured');
 const source=verifiedSource(JSON.parse(fs.readFileSync(REPORT,'utf8')));
 const event=unwrap(await request('https://api.truckersmp.com/v2/events/'+EVENT,{headers:{Accept:'application/json'}}));
 const meet=verifyOfficialEvent(event,Math.floor(Date.now()/1000));
 const me=await discord('/users/@me');
 if(String(me?.id)!==BOT_ID)throw Error('unexpected-discord-bot-identity');
 const channel=await discord('/channels/'+CHANNEL);
 if(String(channel?.guild_id)!==GUILD||![0,5].includes(channel.type))
  throw Error('unexpected-discord-target-channel');
 const meta=source.validation.parsed.kingsSlotImage;
 const sourceMessage=await discord('/channels/'+SOURCE+'/messages/'+meta.messageId);
 const img=(sourceMessage?.attachments||[]).find(a=>
  String(a.id)===String(meta.attachmentId)&&
  (String(a.content_type||'').startsWith('image/')||/\.(?:png|jpe?g|webp)$/i.test(a.filename||'')));
 if(!img?.url)throw Error('original-kings-slot-image-not-found');
 // The POST happens only AFTER the complete readable history has passed the
 // duplicate-1h check. Re-runs stop at this same marker.
 if(await findPreviousMessage()){
  console.log('[SHL 36859] SKIPPED_ALREADY_HAS_ONE_HOUR_REMINDER. No duplicate role ping.');
  return;
 }
 const payload=body(meet,img.url,event);
 const posted=await discord('/channels/'+CHANNEL+'/messages',{method:'POST',body:payload});
 if(!posted?.id)throw Error('discord-post-without-confirmed-message-id');
 const verify=await discord('/channels/'+CHANNEL+'/messages/'+posted.id);
 if(String(verify?.id)!==String(posted.id)||String(verify?.author?.id)!==BOT_ID||
    !String(verify?.content||'').includes(MARKER)||!String(verify?.content||'').includes(URL))
  throw Error('post-sent-but-post-verification-failed');
 console.log('[SHL 36859] VERIFIED_BOT_SENT: https://discord.com/channels/'+GUILD+'/'+CHANNEL+'/'+posted.id);
}
if(require.main===module)main().catch(e=>{console.error('[SHL 36859] NO_CONFIRMED_SEND: '+e.message);process.exitCode=1});
module.exports={verifiedSource,unwrap,verifyOfficialEvent,existingOneHourReminder,body};
