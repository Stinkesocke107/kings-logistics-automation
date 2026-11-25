'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspectKingsPrivateEventCapacityChannel:inspect}
  =require('../event-capacity-private-channel-preflight');
const GUILD='1114967437788577792';
const CHAN='222222222222222222',BOT='999999999999999999';
const MESSAGE='888888888888888888';
const COORD='333333333333333333',LEAD='444444444444444444';
const CEO='666666666666666666';
const TOKEN='VERY_PRIVATE_DISCORD_TOKEN_SHOULD_NEVER_APPEAR';
const config={guildId:GUILD,channelId:CHAN,messageId:MESSAGE,
  roles:{'Event Coordination':COORD,'Event Leadership':LEAD,CEO}};
const roleInventory=()=>[GUILD,COORD,LEAD,CEO].map(id=>({
  id,permissions:id===GUILD?'68608':'68608'
}));
const channel=()=>({id:CHAN,guild_id:GUILD,type:0,
  permission_overwrites:[
    {id:GUILD,type:0,allow:'0',deny:'1024'},
    ...[COORD,LEAD,CEO].map(id=>({id,type:0,allow:'1024',deny:'0'})),
    {id:BOT,type:1,allow:'1024',deny:'0'}
  ]});
const previous=()=>({id:MESSAGE,channel_id:CHAN,
  author:{id:BOT},content:'**Kings Event Capacity | GitHub Actions**\nPrivate'});
function client(settings={}){
  const calls={me:0,roles:0,channel:0,member:0,recent:0,message:0,
    create:0,edit:0};
  return {calls,api:{
    me:async()=>{calls.me++;return settings.me??{id:BOT};},
    roles:async()=>{calls.roles++;return settings.roles??roleInventory();},
    channel:async()=>{calls.channel++;return settings.channel??channel();},
    member:async()=>{calls.member++;return settings.member??{
      user:{id:BOT},roles:[]};},
    message:async()=>{calls.message++;if(settings.error)throw Error(TOKEN);
      return settings.message??previous();},
    recent:async()=>{calls.recent++;if(settings.error)throw Error(TOKEN);
      return settings.recent??[];}
  }};
}
test('GET-only preflight checks current private channel and a bot-owned message',async()=>{
  const {api,calls}=client();
  const result=await inspect({client:api,config});
  assert.deepEqual(result,{
    version:1,visibility:'PRIVATE_ONLY',
    state:'READY_FOR_READ_ONLY_SYNC',readOnly:true,discordWrites:0,
    githubWrites:0,sourceRecordsRead:0,capacityApproved:false,
    freeSlotsCertified:false,automaticActivationAllowed:false
  });
  assert.equal(calls.member,1);
  assert.equal(calls.message,1);
  assert.equal(calls.recent,0);
  assert.equal('create' in api,false);
  assert.equal('edit' in api,false);
});
test('Empty configured private channel is safe for a separate manual bootstrap',async()=>{
  const {api,calls}=client();
  const r=await inspect({client:api,config:{...config,messageId:null}});
  assert.equal(r.state,'READY_FOR_MANUAL_BOOTSTRAP');
  assert.equal(calls.message,0);
  assert.equal(calls.recent,1);
  assert.equal(calls.create,0);
});
test('An existing bot-owned marker with missing ID requires manual config, never duplicate',async()=>{
  const {api,calls}=client({recent:[previous()]});
  const r=await inspect({client:api,config:{...config,messageId:null}});
  assert.equal(r.state,'MESSAGE_ID_NOT_CONFIGURED');
  assert.equal(calls.create,0);
});
test('Foreign messages in target prevent first publication',async()=>{
  const {api}=client({recent:[{id:MESSAGE,author:{id:LEAD},content:'some text'}]});
  const r=await inspect({client:api,config:{...config,messageId:null}});
  assert.equal(r.state,'CHANNEL_NOT_EMPTY');
});
test('Wrong author, thread or marker cannot be used as private status',async()=>{
  for(const body of [
    {...previous(),author:{id:LEAD}},
    {...previous(),channel_id:'777777777777777777'},
    {...previous(),content:'Unrelated post'},
    {...previous(),id:'777777777777777777'}
  ]){
    const r=await inspect({client:client({message:body}).api,config});
    assert.equal(r.state,'MESSAGE_NOT_VERIFIED');
  }
});
test('Bot guild member must have effective VIEW, READ and SEND permissions',async()=>{
  const b=channel();b.permission_overwrites=b.permission_overwrites
    .filter(x=>x.id!==BOT);
  const noView=await inspect({client:client({channel:b}).api,config});
  assert.equal(noView.state,'CONFIGURATION_UNVERIFIED');
  const noSend=roleInventory().map(x=>({...x,
    permissions:x.id===GUILD?'66560':x.permissions}));
  const noSendResult=await inspect({
    client:client({roles:noSend}).api,config});
  assert.equal(noSendResult.state,'CONFIGURATION_UNVERIFIED');
  const noRead=roleInventory().map(x=>({...x,
    permissions:x.id===GUILD?'3072':x.permissions}));
  const noReadResult=await inspect({
    client:client({roles:noRead}).api,config});
  assert.equal(noReadResult.state,'CONFIGURATION_UNVERIFIED');
});
test('Actual member inventory cannot include nonexistent roles or fake identity',async()=>{
  for(const member of [
    {user:{id:LEAD},roles:[]},
    {user:{id:BOT},roles:['777777777777777777']},
    {user:{id:BOT},roles:[COORD,COORD]},
    {user:{id:BOT},roles:'string'}
  ]){
    const r=await inspect({client:client({member}).api,config});
    assert.equal(r.state,'CONFIGURATION_UNVERIFIED');
  }
});
test('Misconfigured roles, public viewers and Admin bypass are all blockers',async()=>{
  const publicChannel=channel();
  publicChannel.permission_overwrites[0].deny='0';
  const outside=channel();
  outside.permission_overwrites.push({id:'777777777777777777',
    type:0,allow:'1024',deny:'0'});
  const admin=[...roleInventory(),{id:'777777777777777777',
    permissions:'8'}];
  for(const settings of [
    {channel:publicChannel},{channel:outside},{roles:admin}
  ]){
    assert.equal((await inspect({client:client(settings).api,config})).state,
      'CONFIGURATION_UNVERIFIED');
  }
  assert.equal((await inspect({client:client().api,config:{
    ...config,channelId:'not-an-id'
  }})).state,'CONFIGURATION_UNVERIFIED');
});
test('Duplicate bot overwrite or Admin bot permissions do not pass',async()=>{
  const duplicate=channel();
  duplicate.permission_overwrites.push({id:BOT,type:1,allow:'1024',deny:'0'});
  assert.equal((await inspect({client:client({channel:duplicate}).api,config})).state,
    'CONFIGURATION_UNVERIFIED');
  const admin=roleInventory();admin[0].permissions='68616';
  assert.equal((await inspect({client:client({roles:admin}).api,config})).state,
    'CONFIGURATION_UNVERIFIED');
});
test('API errors fail closed without throwing or exposing sensitive source',async()=>{
  const r=await inspect({client:client({error:true}).api,config});
  assert.equal(r.state,'MESSAGE_NOT_VERIFIED');
  assert.equal(JSON.stringify(r).includes(TOKEN),false);
  const bad=await inspect({client:{
    me:async()=>{throw Error(TOKEN);}
  },config});
  assert.equal(bad.state,'CONFIGURATION_UNVERIFIED');
  assert.equal(JSON.stringify(bad).includes(TOKEN),false);
});
test('Workflow lets a manually dispatched OFF-by-default read-only preflight run safely',()=>{
  const root=path.join(__dirname,'..');
  const yaml=fs.readFileSync(path.join(root,
    '.github/workflows/convoy-checker.yml'),'utf8');
  const runner=fs.readFileSync(path.join(root,
    'scripts/event-capacity-github-actions.js'),'utf8');
  assert.match(yaml,/^\s+- preflight$/m);
  assert.match(yaml,/inputs\.capacity_action == 'preflight'/);
  assert.match(yaml,/CAPACITY_ACTION.*preflight/);
  assert.match(yaml,/DRY_RUN="true"/);
  assert.match(yaml,/Require private Event Capacity preflight readiness/);
  assert.match(yaml,/CONVOY_DRY_RUN:.*steps\.mode\.outputs\.dry_run/);
  assert.match(runner,/\['preflight','source-preflight'\]\.includes\(mode\)/);
  assert.match(runner,/env\.CONVOY_DRY_RUN!=='true'/);
  assert.match(runner,/inspectKingsPrivateEventCapacityChannel/);
  assert.equal(fs.readFileSync(path.join(root,'convoy-checker.js'),'utf8')
    .includes('event-capacity-private-channel-preflight'),false);
});
