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
const availableRoles=()=>[GUILD,COORD,LEAD,CEO].map(id=>({id,name:'synthetic',permissions:'66560'}));
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


function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){
    c^=b;
    for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;
  }
  return (c^0xffffffff)>>>0;
}
function zipForPreview(overviewTime='2027-03-20T11:57:00Z'){
  const objs={
    'convoy-check-results.json':{
      guildId:GUILD,forumId:'1550619824005062697',
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:0,actualConvoys:0},threads:[]
    },
    'convoy-overview.json':{
      guildId:GUILD,forumId:'1550619824005062697',
      generatedAt:overviewTime,
      overall:{realConvoySubmissions:0,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[]
    }
  };
  const locals=[],centrals=[];
  let offset=0;
  for(const [name,obj] of Object.entries(objs)){
    const filename=Buffer.from(name),bytes=Buffer.from(JSON.stringify(obj));
    const hash=crc32(bytes),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(0x800,6);local.writeUInt32LE(hash,14);
    local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);
    local.writeUInt16LE(filename.length,26);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(0x0314,4);
    central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);
    central.writeUInt32LE(hash,16);central.writeUInt32LE(bytes.length,20);
    central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);
    central.writeUInt32LE((0o100600*0x10000)>>>0,38);
    central.writeUInt32LE(offset,42);
    locals.push(local,filename,bytes);centrals.push(central,filename);
    offset+=local.length+filename.length+bytes.length;
  }
  const idx=Buffer.concat(centrals),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(2,8);
  end.writeUInt16LE(2,10);end.writeUInt32LE(idx.length,12);
  end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,idx,end]);
}
function readerForPreview(bytes,metadata={}){
  const runId='45502949674',sha='1'.repeat(40);
  return {
    getLatestScheduledRun:async()=>({runId,attempt:1}),
    getRun:async()=>({
      id:Number(runId),name:'Kings Convoy Checker',
      path:'.github/workflows/convoy-checker.yml',
      repository:{full_name:'Stinkesocke107/kings-logistics-automation'},
      head_repository:{full_name:'Stinkesocke107/kings-logistics-automation'},
      head_branch:'main',head_sha:sha,status:'completed',conclusion:'success',
      event:'schedule',run_attempt:1,run_started_at:'2027-03-20T11:53:00Z',
      updated_at:'2027-03-20T11:59:00Z',...metadata
    }),
    getArtifacts:async()=>[{
      id:70000000001,name:'kings-convoy-reports',expired:false,
      size_in_bytes:bytes.length,
      workflow_run:{id:Number(runId),head_sha:sha,head_branch:'main'}
    }],
    readArtifact:async()=>bytes
  };
}
test('Valid completed Kings scheduled ZIP is checked but never certifies free slots',async()=>{
  const verified=await verifySourceFreshness(readerForPreview(zipForPreview()),NOW);
  assert.equal(verified.sourceAvailable,true);
  assert.equal(verified.classificationsVerified,false);
  assert.equal(verified.verifiedFreeSlots,false);
  assert.match(messageFor({sourceAvailable:verified.sourceAvailable,nowMs:NOW}),
    /Needs Verification/);
});
test('Completed GitHub run does not make an old or tampered report fresh',async()=>{
  const old=await verifySourceFreshness(readerForPreview(
    zipForPreview('2027-03-20T10:57:00Z')),NOW);
  assert.equal(old.sourceAvailable,false);
  const zip=zipForPreview();zip[55]^=255;
  const tampered=await verifySourceFreshness(readerForPreview(zip),NOW);
  assert.equal(tampered.sourceAvailable,false);
});

test('Unexpected Administrator role bypass is rejected even when @everyone is denied',()=>{
  const roleList=[...availableRoles(),{
    id:'555555555555555555',permissions:'8',name:'Unapproved Administrator'
  }];
  assert.throws(()=>validateChannelPrivacy(sourceChannel(),roleList,
    configCheck(config),{botId:BOT}));
});
test('Incomplete role-permission inventory cannot certify a private channel',()=>{
  const roleList=availableRoles();
  delete roleList[0].permissions;
  assert.throws(()=>validateChannelPrivacy(sourceChannel(),roleList,
    configCheck(config),{botId:BOT}));
});


test('Opted-in source-bound Staff review reports only aggregate counts, never approval',async()=>{
  const supplied={
    reviewCandidates:2,needsHumanReview:1,conflicts:1,
    sourceDisagreements:0,unknownSource:0,
    approvalsApplied:0,freeSlotsCertified:false
  };
  let inspections=0;
  const verified=await verifySourceFreshness(
    readerForPreview(zipForPreview()),NOW,async ({report,overview,nowMs})=>{
      inspections++;
      assert.equal(report.guildId,GUILD);
      assert.equal(overview.guildId,GUILD);
      assert.equal(nowMs,NOW);
      return supplied;
    });
  assert.equal(inspections,1);
  assert.equal(verified.sourceAvailable,true);
  assert.equal(verified.classificationsVerified,false);
  assert.equal(verified.verifiedFreeSlots,false);
  assert.equal(verified.evidenceStatus,'Review Candidates');
  const body=messageFor({sourceAvailable:verified.sourceAvailable,
    evidenceStatus:verified.evidenceStatus,
    evidenceAggregate:verified.evidenceAggregate,nowMs:NOW});
  assert.match(body,/2 review candidate/);
  assert.match(body,/None is an approval/);
  assert.match(body,/No free slots are confirmed/);
});
test('Unreachable Staff evidence review is separately Unavailable without faking source outage',async()=>{
  const verified=await verifySourceFreshness(
    readerForPreview(zipForPreview()),NOW,async ()=>{
      throw Error('PRIVATE-EVIDENCE-DETAILS-NEVER-LOG');
    });
  assert.equal(verified.sourceAvailable,true);
  assert.equal(verified.evidenceStatus,'Unavailable');
  assert.equal(verified.evidenceAggregate,null);
  assert.equal(verified.verifiedFreeSlots,false);
  const rendered=messageFor({sourceAvailable:true,
    evidenceStatus:verified.evidenceStatus,nowMs:NOW});
  assert.match(rendered,/Staff evidence review: Unavailable/);
  assert.equal(rendered.includes('PRIVATE-EVIDENCE'),false);
});
test('Fabricated proof of free slots cannot cross the read-only source boundary',async()=>{
  const forged=await verifySourceFreshness(readerForPreview(zipForPreview()),
    NOW,async()=>({
      reviewCandidates:1,needsHumanReview:0,conflicts:0,
      sourceDisagreements:0,unknownSource:0,
      approvalsApplied:1,freeSlotsCertified:true
    }));
  assert.equal(forged.sourceAvailable,true);
  assert.equal(forged.evidenceStatus,'Unavailable');
  assert.equal(forged.evidenceAggregate,null);
  assert.throws(()=>messageFor({
    sourceAvailable:true,evidenceStatus:'Review Candidates',
    evidenceAggregate:{
      reviewCandidates:1,conflicts:0,approvalsApplied:1,
      freeSlotsCertified:true
    },nowMs:NOW
  }));
});
