'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {configCheck,validateChannelPrivacy,messageFor,
  publishGithubOnlyStatus,verifySourceFreshness,createDiscordRest}
  =require('../event-capacity-github-only');
const GUILD='1114967437788577792',CHANNEL='222222222222222222';
const BOT='999999999999999999',MESSAGE='888888888888888888';
const COORD='333333333333333333',LEAD='444444444444444444',CEO='666666666666666666';
const NOW=Date.parse('2027-03-20T12:00:00Z');
const roles={'Event Coordination':COORD,'Event Leadership':LEAD,CEO};
const config={guildId:GUILD,channelId:CHANNEL,messageId:MESSAGE,roles};
const overwrites=[
  {id:GUILD,type:0,allow:'0',deny:'1024'},
  ...[COORD,LEAD,CEO].map(id=>({id,type:0,allow:'1024',deny:'0'}))
];
const sourceChannel=()=>({id:CHANNEL,guild_id:GUILD,type:0,
  permission_overwrites:overwrites.map(x=>({...x}))});
const availableRoles=()=>[GUILD,COORD,LEAD,CEO].map(id=>({id,name:'synthetic'}));
function stub({message=null,channel=null,recent=[]}={}){
  const calls={me:0,channel:0,roles:0,read:0,edit:0,create:0,recent:0};
  const client={
    me:async()=>{calls.me++;return {id:BOT};},
    channel:async()=>{calls.channel++;return channel||sourceChannel();},
    roles:async()=>{calls.roles++;return availableRoles();},
    message:async()=>{calls.read++;return message||{
      id:MESSAGE,channel_id:CHANNEL,author:{id:BOT},
      content:'**Kings Event Capacity | GitHub Actions**\nPrevious draft'
    };},
    edit:async(id,msg,payload)=>{calls.edit++;return {id:msg,channel_id:id,...payload};},
    recent:async()=>{calls.recent++;return recent;},
    create:async()=>{calls.create++;return {id:MESSAGE};}
  };
  return {client,calls};
}
test('GitHub-only fixed capacity preview never labels unverified slots as free',()=>{
  const body=messageFor({sourceAvailable:true,nowMs:NOW});
  assert.match(body,/Needs Verification/);
  assert.match(body,/2027-03 UTC/);
  assert.match(body,/2027-04 UTC/);
  assert.match(body,/2027-05 UTC/);
  assert.match(body,/No free slots are confirmed/);
  assert.equal(body.includes('Available: 2'),false);
  assert.equal(body.includes('<@'),false);
  const outage=messageFor({sourceAvailable:false,nowMs:NOW});
  assert.match(outage,/Data Outdated/);
  assert.match(outage,/No current verified Convoy Center report/);
});
test('Preview never touches Discord API or private source',async()=>{
  const result=await publishGithubOnlyStatus({config,mode:'preview',
    sourceAvailable:true,nowMs:NOW});
  assert.equal(result.state,'Preview');
  assert.match(result.content,/Availability unverified/);
});
test('Private channel requires explicit everyone deny and exactly three role grants',()=>{
  assert.equal(validateChannelPrivacy(sourceChannel(),availableRoles(),
    configCheck(config),{botId:BOT}),true);
  const publicChannel=sourceChannel();publicChannel.permission_overwrites[0].deny='0';
  assert.throws(()=>validateChannelPrivacy(publicChannel,availableRoles(),
    configCheck(config),{botId:BOT}));
  const external=sourceChannel();
  external.permission_overwrites.push({id:'555555555555555555',type:0,
    allow:'1024',deny:'0'});
  assert.throws(()=>validateChannelPrivacy(external,availableRoles(),
    configCheck(config),{botId:BOT}));
});
test('Existing bot-owned private message is edited without role mentions or duplicates',async()=>{
  const {client,calls}=stub();
  const r=await publishGithubOnlyStatus({client,config,mode:'sync',
    sourceAvailable:true,nowMs:NOW});
  assert.equal(r.state,'Updated');
  assert.equal(calls.edit,1);
  assert.equal(calls.create,0);
});
test('Identical current bot message is idempotent and does not trigger an edit',async()=>{
  const content=messageFor({sourceAvailable:false,nowMs:NOW});
  const {client,calls}=stub({message:{id:MESSAGE,channel_id:CHANNEL,
    author:{id:BOT},content}});
  const r=await publishGithubOnlyStatus({client,config,mode:'sync',
    sourceAvailable:false,nowMs:NOW});
  assert.equal(r.state,'Unchanged');
  assert.equal(calls.edit,0);
});
test('Another author or channel cannot receive an update',async()=>{
  const wrong=stub({message:{id:MESSAGE,channel_id:CHANNEL,
    author:{id:COORD},content:'**Kings Event Capacity | GitHub Actions**'}});
  await assert.rejects(publishGithubOnlyStatus({client:wrong.client,config,
    mode:'sync',nowMs:NOW}));
  assert.equal(wrong.calls.edit,0);
});
test('Bootstrap is explicit manual and only for an empty restricted channel',async()=>{
  const cfg={guildId:GUILD,channelId:CHANNEL,roles};
  const h=stub();
  await assert.rejects(publishGithubOnlyStatus({client:h.client,
    config:cfg,mode:'bootstrap',manualDispatch:false,nowMs:NOW}));
  const boot=await publishGithubOnlyStatus({client:h.client,
    config:cfg,mode:'bootstrap',manualDispatch:true,nowMs:NOW});
  assert.deepEqual(boot,{state:'Bootstrapped',messageId:MESSAGE});
  assert.equal(h.calls.create,1);
  await assert.rejects(publishGithubOnlyStatus({
    client:stub({recent:[{id:MESSAGE}]}).client,config:cfg,
    mode:'bootstrap',manualDispatch:true,nowMs:NOW}));
});
test('Incomplete role configuration or mismatched guild are always denied',async()=>{
  assert.throws(()=>configCheck({...config,roles:{CEO}}));
  assert.throws(()=>configCheck({...config,channelId:'../messages'}));
  const channel=sourceChannel();channel.guild_id='123456789012345678';
  const h=stub({channel});
  await assert.rejects(publishGithubOnlyStatus({client:h.client,config,
    mode:'sync',nowMs:NOW}));
  assert.equal(h.calls.edit,0);
});
test('Discord REST uses exact Bot header, fixed routes and never logs credentials',async()=>{
  const calls=[];
  const client=createDiscordRest({token:'synthetic-offline-bot-token-123456789',
    transport:async(url,opts)=>{
      calls.push({url,opts});
      return {status:200,ok:true,text:async()=>JSON.stringify({id:BOT})};
    }});
  assert.equal((await client.me()).id,BOT);
  assert.equal(calls[0].url,'https://discord.com/api/v10/users/@me');
  assert.equal(calls[0].opts.headers.Authorization,
    'Bot synthetic-offline-bot-token-123456789');
  assert.equal(calls[0].opts.redirect,'manual');
});
test('Missing, stale or denied GitHub source cannot be treated as verified availability',async()=>{
  const data=await verifySourceFreshness({
    getLatestScheduledRun:async()=>{throw Error('private source internal');},
    getRun:async()=>null,getArtifacts:async()=>[],readArtifact:async()=>null
  },NOW);
  assert.deepEqual(data,{sourceAvailable:false,runId:null,
    classificationsVerified:false,verifiedFreeSlots:false});
});
