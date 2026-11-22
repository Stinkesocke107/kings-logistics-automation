'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const {encryptLegacyArchive,sanitizeLegacyPublicArchive}=require('../legacy-convoy-privacy');
const secret='synthetic-legacy-private-state-key-more-than-32-bytes';
const now=Math.floor(Date.now()/1000);
function setup({key=secret,alterPrivate=false,includePrivate=true}={}){
 const eventUnix=now+1800;
 const original={version:1,convoys:[{
  legacy:true,readOnly:true,legacyId:'old-calendar:101',sourceThreadId:'101',
  sourceThreadName:'INTERNAL PRIVATE STAFF NOTE',
  sourceMonth:'November 2026',
  eventId:'88888',eventDate:new Date(eventUnix*1000).toISOString().slice(0,10),
  eventUnix,eventTimeValid:true,meetingTime:'12:00 UTC',
  status:'Scheduled',slotStatus:'confirmed',confirmedKingsSlot:true,
  kingsSlot:'Confirmed — private staff text',
  kingsSlotImage:{messageId:'102',attachmentId:'501',
   filename:'slot.png',capturedUrl:'https://cdn.discordapp.com/attachments/101/501/slot.png',
   accompanyingText:'INTERNAL PRIVATE STAFF NOTE'},
  sourceNotes:[{text:'INTERNAL PRIVATE STAFF NOTE'}],
  truckersmp:{id:88888,name:'Public Partner Convoy',server:'Simulation 1'},
  name:'Public Partner Convoy'
 }]};
 const snapshot=sanitizeLegacyPublicArchive(original);
 const report={version:1,threads:[]};
 const privateState=JSON.stringify(encryptLegacyArchive(original,secret));
 const files={'data/legacy-convoys.json':JSON.stringify(snapshot),
  'output/convoy-check-results.json':JSON.stringify(report)};
 if(includePrivate)files['data/legacy-convoys-private.json']=alterPrivate?
   JSON.stringify(encryptLegacyArchive({...original,convoys:[{...original.convoys[0],eventUnix:eventUnix+3600}]},secret)):
   privateState;
 const posted=[];
 let callCount=0;
 const transport=async(url,opts={})=>{
  const parsed=new URL(url),method=opts.method||'GET',pathname=parsed.pathname;
  if(pathname.endsWith('/users/@me'))return new Response(JSON.stringify({id:'bot',username:'Kings Bot'}));
  if(pathname.endsWith('/guilds/1114967437788577792/roles'))
   return new Response(JSON.stringify([{id:'400',name:'Convoy Driver'}]));
  if(pathname.endsWith('/channels/500'))
   return new Response(JSON.stringify({id:'500',guild_id:'1114967437788577792',name:'convoy-reminders'}));
  if(pathname.endsWith('/channels/101/messages/102'))
   return new Response(JSON.stringify({id:'102',attachments:[{id:'501',filename:'slot.png',content_type:'image/png',
    url:'https://cdn.discordapp.com/attachments/101/501/slot.png'}]}));
  if(pathname.endsWith('/channels/500/messages')){
   if(method==='GET')return new Response(JSON.stringify([...posted].reverse()));
   if(method==='POST'){
    callCount++;
    const content=JSON.parse(opts.body);
    const item={...content,id:'88888'+callCount,author:{id:'bot',bot:true}};
    posted.push(item);return new Response(JSON.stringify(item));
   }
  }
  if(pathname.includes('/channels/500/messages/')&&method==='PATCH'){
   const id=pathname.split('/').at(-1),body=JSON.parse(opts.body);
   const old=posted.find(x=>x.id===id);
   Object.assign(old,body);return new Response(JSON.stringify(old));
  }
  throw Error('unexpected call '+method+' '+pathname);
 };
 async function run() {
  const st=sandbox('convoy-driver-reminders.js',{files,fetch:transport,env:{
   LEGACY_PRIVATE_STATE_KEY:key,CONVOY_DRY_RUN:'false',
   DISCORD_CONVOY_REMINDER_CHANNEL_ID:'500',DISCORD_DRIVER_ROLE_ID:'400'}});
  await st.run('main()');
  assert.equal(st.process.exitCode,0);
 }
 return {run,posted,snapshot,getCallCount:()=>callCount};
}
test('encrypted private Legacy proof enables one role-scoped reminder without public Discord identifiers',async()=>{
 const h=setup();
 assert.equal(h.snapshot.convoys[0].sourceThreadId,undefined);
 assert.deepEqual(h.snapshot.convoys[0].kingsSlotImage,{available:true});
 assert.doesNotMatch(JSON.stringify(h.snapshot),/INTERNAL PRIVATE STAFF NOTE|discord\.com\/channels|discordapp\.com/);
 await h.run();
 assert.equal(h.posted.length,1);
 assert.match(h.posted[0].content,/truckersmp.com\/events\/88888/);
 assert.match(h.posted[0].content,/<@&400>/);
 assert.deepEqual(h.posted[0].allowed_mentions,{parse:[],roles:['400']});
 assert.match(h.posted[0].embeds[0].image.url,/slot.png$/);
 await h.run();
 assert.equal(h.getCallCount(),1,'same reminder must not POST twice');
});
test('missing key or ciphertext disallows legacy reminder instead of falling back to public image URLs',async()=>{
 for(const options of [{key:'wrong-key-long-enough-32-characters'},{includePrivate:false},{alterPrivate:true}]){
  const h=setup(options);
  await h.run();
  assert.equal(h.posted.length,0,JSON.stringify(options));
 }
});
