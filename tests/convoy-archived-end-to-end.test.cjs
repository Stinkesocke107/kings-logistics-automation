'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {sandbox}=require('./sandbox.cjs');

const guild='1114967437788577792',forum='1550619824005062697';
const threadId='101',eventId='36859',driverRole='400',channelId='500';
const eventTeamRole='1114967608920395866';
const j=x=>new Response(JSON.stringify(x));
function harness({locked=false,noImage=false,approved=true,cancelled=false}={}){
 const now=Date.now();
 const meetup=new Date(Math.ceil((now+30*60000)/60000)*60000).toISOString();
 const start=new Date(Date.parse(meetup)+60*60000).toISOString();
 const thread={
  id:threadId,name:'Upcoming SHL Partner Convoy',guild_id:guild,parent_id:forum,
  applied_tags:[],thread_metadata:{archived:true,locked}
 };
 const tags=['Scheduled','Cancelled','Needs Information','Completed','Ready for Approval'].map((name,i)=>({id:String(i+300),name}));
 const starter={id:threadId,author:{id:'driver'},timestamp:new Date(now-3600000).toISOString(),
  content:[
   'TruckersMP Event: https://truckersmp.com/events/'+eventId,
   'Event Type: Partner Convoy',
   'Responsible Staff: <@123456789012345678>',
   'Kings Slot: Confirmed Slot #5',
   'Route: Berlin → Prague',
   'Meeting Point: Berlin'
  ].join('\n'),
  attachments:noImage?[]:[{id:'501',filename:'kings-slot.png',content_type:'image/png',
   url:'https://cdn.discordapp.com/attachments/101/501/kings-slot.png'}]
 };
 const messages=[starter,{
  id:'102',author:{id:'staff'},member:{roles:approved?[eventTeamRole]:[]},
  timestamp:new Date(now-10000).toISOString(),content:'Approved'
 }];
 let tmpEvent={id:Number(eventId),name:'SHL Partner Convoy',meetup_at:meetup,start_at:start,
   departure:{city:'Berlin'},arrive:{city:'Prague'},server:'Simulation 1',cancelled};
 const reminders=[];
 let nextId=900,files={};
 const operations=[];
 const transport=async(url,opts={})=>{
  const pathname=new URL(url).pathname,method=opts.method||'GET';
  operations.push(method+' '+pathname);
  if(pathname.endsWith('/users/@me'))return j({id:'bot-123',username:'Kings Bot'});
  if(pathname.endsWith('/channels/'+forum))return j({id:forum,guild_id:guild,available_tags:tags,type:15});
  if(pathname.endsWith('/guilds/'+guild+'/threads/active'))return j({threads:[]});
  if(pathname.includes('/threads/archived/public'))return j({threads:[thread],has_more:false});
  if(pathname.endsWith('/guilds/'+guild+'/roles'))return j([{id:driverRole,name:'Convoy Driver'}]);
  if(pathname.endsWith('/channels/'+channelId))return j({id:channelId,name:'convoy-reminders',guild_id:guild});
  if(pathname.endsWith('/guilds/'+guild+'/members/staff'))return j({roles:[]});
  if(pathname.endsWith('/events/'+eventId))return j({response:tmpEvent});
  if(pathname.endsWith('/channels/'+threadId))return j(thread);
  const match=pathname.match(/\/channels\/(101|500)\/messages(?:\/(\d+))?$/);
  if(match){
   const list=match[1]===threadId?messages:reminders;
   if(method==='GET')return j(match[2] ? (list.find(m=>m.id===match[2])||{}) : [...list].reverse());
   const body=opts.body?JSON.parse(opts.body):{};
   if(method==='POST'){const m={id:String(nextId++),author:{id:'bot-123',bot:true},timestamp:new Date().toISOString(),...body};list.push(m);return j(m);}
   if(method==='PATCH'){const m=list.find(x=>x.id===match[2]);if(!m)throw Error('unknown PATCH');Object.assign(m,body);return j(m);}
  }
  throw Error('Unexpected '+method+' '+pathname);
 };
 async function stage(script,opts={}){
  const s=sandbox(script,{files,fetch:transport,
   env:{DISCORD_WRITE_MODE:'false',CONVOY_FINALIZE_WRITE_MODE:'true',
    DISCORD_GUILD_ID:guild,DISCORD_CONVOY_FORUM_ID:forum,
    DISCORD_CONVOY_REMINDER_CHANNEL_ID:channelId,DISCORD_DRIVER_ROLE_ID:driverRole,
    CONVOY_DRY_RUN:String(Boolean(opts.dryRun))
   }});
  await s.run('main()');
  assert.equal(s.process.exitCode,0,'stage '+script+' failed');
  files=Object.fromEntries(s.files);
  return JSON.parse(files['output/convoy-check-results.json']);
 }
 return {stage,reminders,operations,thread,messages,getEvent:()=>tmpEvent,setEvent:v=>tmpEvent=v};
}
test('ARCHIVED staff-approved future SHL is finalized read-only then receives ONE actual 1h reminder in isolated sandbox',async()=>{
 const h=harness();
 let report=await h.stage('convoy-checker.js');
 assert.equal(report.threads[0].archived,true);
 assert.equal(report.threads[0].staffStatus.status,'Scheduled');
 await h.stage('convoy-truckersmp-sync.js');
 report=await h.stage('convoy-finalize.js');
 const item=report.threads[0];
 assert.equal(item.archived,true);
 assert.equal(item.status,'Scheduled');
 assert.equal(item.eventTimeValid,true);
 assert.ok(item.eventUnix>0);
 assert.equal(item.validation.complete,true);
 assert.equal(item.discordStatusSync.action,'skipped');
 assert.equal(item.forumTagSync.action,'skipped');
 assert.equal(h.thread.thread_metadata.archived,true);
 assert.equal(h.operations.some(x=>/PATCH .*\/channels\/101|POST .*\/channels\/101/.test(x)),false);
 await h.stage('convoy-driver-reminders.js');
 assert.equal(h.reminders.length,1);
 assert.match(h.reminders[0].content,/Kings Driver Convoy Reminder — 1 Hour/);
 assert.match(h.reminders[0].content,/truckersmp.com\/events\/36859/);
 assert.match(h.reminders[0].content,/<@&400>/);
 assert.deepEqual(h.reminders[0].allowed_mentions,{parse:[],roles:['400']});
 assert.match(JSON.stringify(h.reminders[0].embeds),/kings-slot.png/);
 const before=h.operations.filter(x=>/POST .*\/channels\/500\/messages/.test(x)).length;
 await h.stage('convoy-driver-reminders.js');
 assert.equal(h.reminders.length,1,'rerun must not send a second reminder');
 assert.equal(h.operations.filter(x=>/POST .*\/channels\/500\/messages/.test(x)).length,before);
 assert.equal(h.operations.filter(x=>/PATCH .*\/channels\/500\/messages/.test(x)).length,0);
});
test('Archived event missing original confirmed slot image is never posted',async()=>{
 const h=harness({noImage:true});
 await h.stage('convoy-checker.js');await h.stage('convoy-truckersmp-sync.js');
 const report=await h.stage('convoy-finalize.js');
 assert.notEqual(report.threads[0].status,'Scheduled');
 await h.stage('convoy-driver-reminders.js');
 assert.equal(h.reminders.length,0);
});
test('Archived event locked by Event Leadership is not finalized or reminded',async()=>{
 const h=harness({locked:true});
 await h.stage('convoy-checker.js');await h.stage('convoy-truckersmp-sync.js');
 const report=await h.stage('convoy-finalize.js');
 assert.notEqual(report.threads[0].status,'Scheduled');
 await h.stage('convoy-driver-reminders.js');
 assert.equal(h.reminders.length,0);
});
test('Public organiser cancelled the approved archived event: no reminder',async()=>{
 const h=harness({cancelled:true});
 await h.stage('convoy-checker.js');await h.stage('convoy-truckersmp-sync.js');
 const report=await h.stage('convoy-finalize.js');
 assert.notEqual(report.threads[0].status,'Scheduled');
 await h.stage('convoy-driver-reminders.js');
 assert.equal(h.reminders.length,0);
});
test('An unauthorized apparent approval cannot authorize archived event reminders',async()=>{
 const h=harness({approved:false});
 await h.stage('convoy-checker.js');await h.stage('convoy-truckersmp-sync.js');
 const report=await h.stage('convoy-finalize.js');
 assert.notEqual(report.threads[0].status,'Scheduled');
 await h.stage('convoy-driver-reminders.js');
 assert.equal(h.reminders.length,0);
});
