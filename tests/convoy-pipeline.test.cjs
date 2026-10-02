const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sandbox } = require('./sandbox.cjs');
const json = x => new Response(JSON.stringify(x));

test('convoy pipeline: submission → API sync → approval → reminder → follow-up → completion → archive',async()=>{
  const guild='1114967437788577792',forum='1550619824005062697',threadId='101';
  const tags=['Scheduled','Completed','Cancelled','Needs Information','Ready for Approval'].map((name,i)=>({id:String(200+i),name}));
  const thread={id:threadId,name:'Integration convoy',guild_id:guild,parent_id:forum,applied_tags:[],thread_metadata:{archived:false}};
  const messages=[
    {id:'101',author:{id:'human'},timestamp:new Date().toISOString(),content:'https://truckersmp.com/events/42\nResponsible Staff: Staff\nKings Slot: Slot 5\nMeeting Point: Berlin',attachments:[{filename:'route.png',content_type:'image/png'}]},
    {id:'102',author:{id:'staff'},member:{roles:['1114967608920395866']},timestamp:new Date(Date.now()+1).toISOString(),content:'Approved'}
  ];
  const reminders=[];
  let nextId=300;
  let event={id:42,name:'Kings Logistics Monthly Convoy #Test',meetup_at:new Date(Date.now()+1800000).toISOString(),start_at:new Date(Date.now()+3600000).toISOString(),departure:{city:'Berlin'},arrive:{city:'Prague'},server:'Simulation 1',vtc:{name:'Kings Logistics'}};
  let files={};
  const transport=async(url,opts={})=>{
    const pathname=new URL(url).pathname,method=opts.method||'GET';
    if(pathname.endsWith('/users/@me')) return json({id:'bot',username:'Kings'});
    if(pathname.endsWith(`/channels/${forum}`)) return json({id:forum,guild_id:guild,available_tags:tags,type:15});
    if(pathname.endsWith('/threads/active')) return json({threads:thread.thread_metadata.archived?[]:[thread]});
    if(pathname.includes('/threads/archived/public')) return json({threads:thread.thread_metadata.archived?[thread]:[],has_more:false});
    if(pathname.endsWith(`/guilds/${guild}/roles`)) return json([{id:'400',name:'Convoy Driver'}]);
    if(pathname.endsWith('/channels/500')) return json({id:'500',name:'convoy-reminders',guild_id:guild});
    if(pathname.endsWith('/events/42')) return json({response:event});
    if(pathname.endsWith(`/channels/${threadId}`)) {
      if(method==='PATCH') {const body=JSON.parse(opts.body); if(body.archived) thread.thread_metadata.archived=true; if(body.applied_tags) thread.applied_tags=body.applied_tags;}
      return json(thread);
    }
    const match=pathname.match(/\/channels\/(101|500)\/messages(?:\/(\d+))?$/);
    if(match) {
      const list=match[1]==='101'?messages:reminders;
      if(method==='GET') return json(list);
      const payload=opts.body?JSON.parse(opts.body):{};
      if(method==='POST') {const m={id:String(nextId++),author:{id:'bot',bot:true},timestamp:new Date().toISOString(),...payload};list.push(m);return json(m);}
      if(method==='PATCH') {const m=list.find(m=>m.id===match[2]);Object.assign(m,payload);return json(m);}
      if(method==='DELETE') {list.splice(list.findIndex(m=>m.id===match[2]),1);return new Response(null,{status:204});}
    }
    throw new Error(`Unexpected ${method} ${pathname}`);
  };
  async function stage(script) {
    const s=sandbox(script,{files,env:{DISCORD_WRITE_MODE:'false',DISCORD_CONVOY_REMINDER_CHANNEL_ID:'500',DISCORD_DRIVER_ROLE_ID:'400'},fetch:transport});
    await s.run('main()');
    assert.equal(s.process.exitCode,0,script);
    files=Object.fromEntries(s.files);
    return JSON.parse(files['output/convoy-check-results.json']);
  }
  let report=await stage('convoy-checker.js');
  assert.equal(report.threads[0].status,'Needs Information');
  await stage('convoy-truckersmp-sync.js');
  report=await stage('convoy-time-display.js');
  assert.equal(report.threads[0].status,'Scheduled');
  assert.equal(report.threads[0].validation.parsed.kingsSlot,'Slot 5');
  assert.equal(report.threads[0].eventTimeValid,true);
  await stage('convoy-notifications.js');
  await stage('convoy-driver-reminders.js');
  await stage('convoy-driver-reminders.js');
  assert.equal(reminders.length,1);
  assert.match(reminders[0].content,/1 Hour/);
  assert.match(reminders[0].content,/Convoy:\*\* Kings Logistics Monthly Convoy #Test/);
  assert.match(reminders[0].content,/Kings Slot:\*\* Slot 5/);
  await stage('convoy-overview.js');
  assert.equal(JSON.parse(files['output/convoy-overview.json']).overall.upcomingScheduledConvoys,1);
  // Advance fixture event past the follow-up and archive thresholds.
  event={...event,meetup_at:new Date(Date.now()-80*3600000).toISOString(),start_at:new Date(Date.now()-79*3600000).toISOString()};
  await stage('convoy-truckersmp-sync.js');await stage('convoy-time-display.js');
  report=await stage('convoy-reminders.js');
  assert.equal(report.threads[0].status,'Needs Information');
  messages.push({id:String(nextId++),author:{id:'staff'},member:{roles:['1114967608920395866']},timestamp:new Date(Date.now()+1000).toISOString(),content:'Completed'});
  await stage('convoy-checker.js');await stage('convoy-truckersmp-sync.js');
  report=await stage('convoy-time-display.js');
  assert.equal(report.threads[0].status,'Completed');
  await stage('convoy-archive.js');
  assert.equal(thread.thread_metadata.archived,true);
  assert.ok(thread.applied_tags.includes(tags.find(t=>t.name==='Completed').id));
});
