'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {eventSnapshot,eventEmbed,publishEventSnapshot}=require('../kings-operations-notifications');
const {roleList,validatePrivateOperationsChannel}=require('../kings-operations-privacy');

const GUILD='1114967437788577792',CHANNEL='1551676060645597256';
const SYSTEM_ALERTS='1551676060645597255';
const BOT='123456789123456789',BOT_ROLE='123456789123456790';
const STAFF_ROLE='123456789123456791',OTHER_ROLE='123456789123456792';
const OUTSIDER='123456789123456793';
const NOTICE='123456789123456780',NOW=Date.parse('2026-11-27T01:00:00Z');
const MARKER='KINGS_OPS_EVENT:';
function report(){
  return {generatedAt:new Date(NOW-60000).toISOString(),mode:'READ_ONLY',
    finalization:{mode:'TRUCKERSMP_FIRST_WITH_KINGS_OVERRIDES',
      finalizedAt:new Date(NOW-30000).toISOString()},
    summary:{errors:0,actualConvoys:3,testThreads:1},
    threads:[
      {threadId:'123456789123456781',status:'Ready for Approval'},
      {threadId:'123456789123456782',status:'Needs Information'},
      {threadId:'123456789123456783',status:'Scheduled',testThread:true}
    ]};
}
const respond=payload=>({ok:true,async json(){return payload;}});
function scenario({history=[],overwrites=null,name='operations-notifications',
  approved=[STAFF_ROLE,BOT_ROLE],roles=null,botRoles=[BOT_ROLE],full=false,
  readbackOverride=null}={}){
  const calls=[];
  const current=history.slice();
  const roleData=roles||[
    {id:GUILD,permissions:'0'},
    {id:STAFF_ROLE,permissions:'0'},
    {id:OTHER_ROLE,permissions:'0'},
    {id:BOT_ROLE,permissions:'0'}
  ];
  const acl=overwrites||[
    {id:GUILD,type:0,allow:'0',deny:'1024'},
    {id:STAFF_ROLE,type:0,allow:'1024',deny:'0'},
    {id:BOT_ROLE,type:0,allow:'3072',deny:'0'}
  ];
  const transport=async(url,options)=>{
    const route=new URL(url).pathname,method=options.method;
    const body=options.body?JSON.parse(options.body):null;
    calls.push({route,method,body,redirect:options.redirect});
    if(method==='GET' && route.endsWith('/channels/'+CHANNEL))
      return respond({id:CHANNEL,guild_id:GUILD,type:0,name,permission_overwrites:acl});
    if(method==='GET' && route.endsWith('/users/@me'))
      return respond({id:BOT,bot:true});
    if(method==='GET' && route.endsWith('/guilds/'+GUILD+'/roles'))
      return respond(roleData);
    if(method==='GET' && route.endsWith('/guilds/'+GUILD+'/members/'+BOT))
      return respond({roles:botRoles});
    if(method==='GET' && route.endsWith('/channels/'+CHANNEL+'/messages'))
      return respond(full?Array.from({length:100},(_,i)=>({
        id:String(BigInt(NOTICE)+BigInt(i)),author:{id:OUTSIDER},embeds:[]})):current);
    const one=route.match(new RegExp('/channels/'+CHANNEL+'/messages/(\\d+)$'));
    if(method==='GET' && one){
      if(readbackOverride)return respond(readbackOverride);
      const m=current.find(x=>x.id===one[1]);
      return respond(m||{id:one[1],author:{id:OUTSIDER},embeds:[]});
    }
    if((method==='POST'||method==='PATCH')&&
       route.startsWith('/api/v10/channels/'+CHANNEL+'/messages')){
      const id=method==='POST'?NOTICE:route.split('/').at(-1);
      const old=current.findIndex(x=>x.id===id);
      const next={id,channel_id:CHANNEL,author:{id:BOT,bot:true},embeds:body.embeds};
      if(old>=0)current[old]=next;else current.unshift(next);
      return respond({id});
    }
    throw Error('Unexpected mocked Discord call');
  };
  const publish=(source=report(),extra={})=>publishEventSnapshot({
    report:source,enabled:'ENABLED',token:'test-token',channelId:CHANNEL,
    systemAlertsChannelId:SYSTEM_ALERTS,approvedRoleIds:approved,
    guildId:GUILD,transport,nowMs:NOW,...extra
  });
  return {calls,current,publish,transport};
}

test('Only fresh finalized reconciled Convoy statuses may enter Operations notices',()=>{
  const source=report();
  const initial=eventSnapshot(source,NOW);
  assert.equal(initial.total,2);
  assert.equal(initial.counts['Ready for Approval'],1);
  assert.equal(initial.counts['Needs Information'],1);
  assert.equal(initial.counts.Scheduled,0);
  assert.equal(initial.digest.length,24);
  source.threads[0].error='failed';
  assert.throws(()=>eventSnapshot(source,NOW),/unverified/);
  delete source.threads[0].error;
  source.summary.errors=1;
  assert.throws(()=>eventSnapshot(source,NOW),/incomplete/);
  source.summary.errors=0;
  delete source.finalization;
  assert.throws(()=>eventSnapshot(source,NOW),/incomplete/);
  source.finalization={mode:'TRUCKERSMP_FIRST_WITH_KINGS_OVERRIDES',
    finalizedAt:new Date(NOW-30000).toISOString()};
  const changed=structuredClone(source);
  changed.threads[0].status='Scheduled';
  changed.threads[1].status='Ready for Approval';
  assert.notEqual(eventSnapshot(changed,NOW).digest,initial.digest,
    'changing individual event statuses must not be hidden by equal totals');
  changed.generatedAt='2026-11-01T00:00:00Z';
  assert.throws(()=>eventSnapshot(changed,NOW),/stale|incomplete/);
});

test('Approved role IDs are immutable, deduplicated and never come from names',()=>{
  assert.deepEqual(roleList(STAFF_ROLE),[STAFF_ROLE]);
  assert.throws(()=>roleList(STAFF_ROLE+','+STAFF_ROLE),/privacy/);
  assert.throws(()=>roleList('Staff,Management'),/privacy/);
  assert.throws(()=>roleList(''),/privacy/);
});

test('Default-off and System Alerts separation perform no Discord calls',async()=>{
  const x=scenario();
  const off=await x.publish(undefined,{enabled:'DISABLED'});
  assert.equal(off.status,'DISABLED');
  await assert.rejects(x.publish(undefined,{systemAlertsChannelId:CHANNEL}),/configuration/);
  await assert.rejects(x.publish(undefined,{systemAlertsChannelId:null}),/configuration/);
  assert.equal(x.calls.length,0);
});

test('First permitted private Event notice posts once and verifies Discord readback',async()=>{
  const x=scenario();
  const outcome=await x.publish();
  assert.equal(outcome.status,'SENT');
  assert.equal(outcome.writes,1);
  const writes=x.calls.filter(x=>x.method==='POST'||x.method==='PATCH');
  assert.equal(writes.length,1);
  assert.equal(writes[0].method,'POST');
  assert.equal(writes[0].route,'/api/v10/channels/'+CHANNEL+'/messages');
  assert.deepEqual(writes[0].body.allowed_mentions,{parse:[]});
  assert.ok(writes[0].body.embeds[0].footer.text.startsWith(MARKER));
  assert.equal(writes[0].body.embeds[0].description.includes('123456789123456781'),false);
  assert.ok(x.calls.every(c=>['GET','POST','PATCH'].includes(c.method)));
  assert.ok(x.calls.filter(c=>c.method==='GET').every(c=>c.redirect==='error'));
  assert.ok(x.calls.some(c=>c.route.endsWith('/messages/'+NOTICE)&&c.method==='GET'));
  const second=await x.publish();
  assert.equal(second.status,'UNCHANGED');
  assert.equal(x.calls.filter(c=>c.method==='POST'||c.method==='PATCH').length,1);
});

test('Changed source updates exactly its own previous notice, never deletes or creates another',async()=>{
  const x=scenario();
  await x.publish();
  const source=report();
  source.threads[0].status='Scheduled';
  const result=await x.publish(source);
  assert.equal(result.status,'UPDATED');
  const writes=x.calls.filter(c=>['POST','PATCH','DELETE'].includes(c.method));
  assert.deepEqual(writes.map(c=>c.method),['POST','PATCH']);
  assert.equal(writes[1].route,'/api/v10/channels/'+CHANNEL+'/messages/'+NOTICE);
  assert.equal(x.current.length,1);
  assert.equal((await x.publish(source)).status,'UNCHANGED');
});

test('Private channel rejects unauthorized role/member visibility and incomplete role grants',async()=>{
  const baseline=scenario();
  await baseline.publish();
  for(const overwrite of [
    {id:OTHER_ROLE,type:0,allow:'1024',deny:'0'},
    {id:OUTSIDER,type:1,allow:'1024',deny:'0'},
    {id:STAFF_ROLE,type:0,allow:'1024',deny:'1024'}
  ]){
    const x=scenario({overwrites:[
      {id:GUILD,type:0,allow:'0',deny:'1024'},
      {id:STAFF_ROLE,type:0,allow:'1024',deny:'0'},
      {id:BOT_ROLE,type:0,allow:'3072',deny:'0'},overwrite
    ]});
    await assert.rejects(x.publish(),/privacy/);
    assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
  }
  for(const x of [
    scenario({name:'system-alerts'}),
    scenario({overwrites:[]}),
    scenario({approved:[OTHER_ROLE]}),
    scenario({botRoles:[OUTSIDER]})
  ]){
    await assert.rejects(x.publish(),/privacy/);
    assert.equal(x.calls.filter(c=>c.method!=='GET').length,0);
  }
});

test('Duplicate/full history and failed Discord readback are never accepted',async()=>{
  const sample=eventSnapshot(report(),NOW);
  const owned=()=>({id:NOTICE,author:{id:BOT,bot:true},
    embeds:[{footer:{text:MARKER+sample.digest}}]});
  const multi=scenario({history:[owned(),{...owned(),id:'123456789123456784'}]});
  await assert.rejects(multi.publish(),/Multiple original/);
  assert.equal(multi.calls.filter(c=>c.method!=='GET').length,0);
  const full=scenario({full:true});
  await assert.rejects(full.publish(),/exhaustive/);
  assert.equal(full.calls.filter(c=>c.method!=='GET').length,0);
  const lost=scenario({readbackOverride:{id:NOTICE,author:{id:OUTSIDER},embeds:[]}});
  await assert.rejects(lost.publish(),/readback/);
  assert.equal(lost.calls.filter(c=>c.method==='POST').length,1);
});

test('Operations notice never trusts an unchanged footer when actual Discord content was edited',async()=>{
  const x=scenario();
  assert.equal((await x.publish()).status,'SENT');
  const notice=x.current[0];
  const canonical=notice.embeds[0].description;
  notice.embeds[0].description='Tampered content with unchanged marker';
  const repaired=await x.publish();
  assert.equal(repaired.status,'UPDATED');
  assert.equal(x.current[0].embeds[0].description,canonical);
  assert.deepEqual(x.calls.filter(c=>['POST','PATCH'].includes(c.method))
    .map(c=>c.method),['POST','PATCH']);
  // Even a visually correct primary notice must not keep extra embeds.
  x.current[0].embeds.push({title:'Unapproved extra'});
  assert.equal((await x.publish()).status,'UPDATED');
  assert.equal(x.current[0].embeds.length,1);
});

test('Operations notice rejects forged complete-footer readback and wrong destination',async()=>{
  const expected=eventEmbed(eventSnapshot(report(),NOW));
  for(const altered of [
    {id:NOTICE,channel_id:CHANNEL,author:{id:BOT,bot:true},
      embeds:[{...expected,description:'Modified despite same digest'}]},
    {id:NOTICE,channel_id:OTHER_ROLE,author:{id:BOT,bot:true},
      embeds:[expected]},
    {id:NOTICE,channel_id:CHANNEL,author:{id:BOT,bot:true},
      embeds:[{...expected,fields:[{name:'extra',value:'data'}]}]}
  ]){
    const x=scenario({readbackOverride:altered});
    await assert.rejects(x.publish(),/readback/);
    assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
  }
});
