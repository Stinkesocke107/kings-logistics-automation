'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseEvidence,inspectStaffEvidence,publicSafeAggregate}
  =require('../event-capacity-github-decision-evidence');
const GUILD='1114967437788577792',FORUM='1550619824005062697';
const CHANNEL='222222222222222222',BOT='999999999999999999';
const COORD='333333333333333333',LEAD='444444444444444444',
  CEO='666666666666666666',USER='111111111111111111';
const NOW=Date.parse('2027-03-20T12:00:00Z');
const THREAD='777777777777777777';
const config={guildId:GUILD,channelId:CHANNEL,
  roles:{'Event Coordination':COORD,'Event Leadership':LEAD,CEO}};
const status='Scheduled',depart='2027-03-21T16:00:00Z';
const command=(id='888888888888888888',
  content='!capacity evidence event:20270 category partner',more={})=>({
    id,channel_id:CHANNEL,author:{id:USER,bot:false},
    content,timestamp:'2027-03-20T11:55:00Z',edited_timestamp:null,...more
  });
function reports(){
  const source={
    threadId:THREAD,eventId:'20270',name:'Synthetic convoy',status,
    validation:{parsed:{eventType:'Partner Convoy',departureAtUtc:depart}}
  };
  return {
    report:{guildId:GUILD,forumId:FORUM,
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:1,actualConvoys:1},threads:[source]},
    overview:{guildId:GUILD,forumId:FORUM,generatedAt:'2027-03-20T11:57:00Z',
      overall:{realConvoySubmissions:1,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[{source:'convoy-center',threadId:THREAD,eventId:'20270',
        status,departureAtUtc:depart}]
    }
  };
}
function harness({messages=[command()],roles=[COORD],alterOriginal=false,
  extraRoles=[],channelViewAllowed=false}={}){
  const channel={id:CHANNEL,guild_id:GUILD,type:0,
    permission_overwrites:[
      {id:GUILD,type:0,allow:'0',deny:channelViewAllowed?'0':'1024'},
      ...[COORD,LEAD,CEO].map(id=>({id,type:0,allow:'1024',deny:'0'}))
    ]};
  const listed=[GUILD,COORD,LEAD,CEO].map(id=>({id,permissions:'66560'}));
  listed.push(...extraRoles);
  let current=messages.map(x=>structuredClone(x));
  const stats={read:0,member:0,message:0,write:0};
  const client={
    me:async()=>({id:BOT}),
    channel:async()=>channel,
    roles:async()=>listed,
    recent:async()=>{stats.read++;return structuredClone(current);},
    member:async(_,id)=>{
      stats.member++;
      return {user:{id},roles};
    },
    message:async(_,id)=>{
      stats.message++;
      const m=current.find(x=>x.id===id);
      if(!m)return null;
      return alterOriginal?{...structuredClone(m),
        content:m.content+' altered'}:structuredClone(m);
    }
  };
  return {client,stats,setMessages:x=>{current=x.map(m=>structuredClone(m));}};
}
async function inspect(opts={},reportsValue=reports()){
  return inspectStaffEvidence({client:harness(opts).client,
    config,report:reportsValue.report,overview:reportsValue.overview,
    nowMs:NOW});
}
test('Exact source-bound Staff evidence grammar is deliberately non-approving',()=>{
  assert.deepEqual(parseEvidence('!capacity evidence event:20270 category partner'),
    {ref:'event:20270',field:'category',value:'Partner Convoy'});
  assert.deepEqual(parseEvidence('!capacity evidence thread:'+THREAD+' end 2027-03-21T19:00:00Z'),
    {ref:'thread:'+THREAD,field:'end',value:'2027-03-21T19:00:00Z'});
  assert.deepEqual(parseEvidence('!capacity evidence event:20270 departure '+depart),
    {ref:'event:20270',field:'departure',value:depart});
  for(const raw of [
    '!capacity evidence event:20270 category fake',
    '!capacity evidence event:20270 category partner @everyone',
    '!capacity approve event:20270',
    '!capacity evidence event:20270 exception CEO',
    '!capacity evidence event:20270 departure 2027-02-30T16:00:00Z',
    '!capacity evidence event:20270 departure 2027-03-21T17:00:00+01:00',
    '!capacity evidence event:20270 category partner\nsecret',
    '!capacity evidence thread:bad category kings'
  ])assert.equal(parseEvidence(raw),null);
});
test('Staff message with current role and exact source produces review-only proposal',async()=>{
  const h=harness();
  const data=reports();
  const result=await inspectStaffEvidence({
    client:h.client,config,...data,nowMs:NOW
  });
  assert.equal(result.totalProposals,1);
  assert.equal(result.needsHumanReview,1);
  assert.equal(result.proposals[0].reviewStatus,'Needs Human Review');
  assert.equal(result.proposals[0].classificationApproved,false);
  assert.equal(result.proposals[0].capacityConfirmed,false);
  assert.equal(result.certifiedFreeSlots,false);
  assert.equal(result.acceptedDecisions,0);
  assert.equal(h.stats.write,0);
  const aggregate=publicSafeAggregate(result);
  assert.deepEqual(aggregate,{
    reviewCandidates:1,needsHumanReview:1,conflicts:0,
    sourceDisagreements:0,unknownSource:0,
    approvalsApplied:0,freeSlotsCertified:false
  });
  assert.equal(JSON.stringify(aggregate).includes(USER),false);
  assert.equal(JSON.stringify(aggregate).includes('event:20270'),false);
});
test('Unmatched event ID is not silently inserted into the accepted ledger',async()=>{
  const r=await inspect({messages:[
    command('888888888888888888','!capacity evidence event:not-in-source category partner')
  ]});
  assert.equal(r.totalProposals,1);
  assert.equal(r.unknownSource,1);
  assert.equal(r.acceptedDecisions,0);
});
test('Mismatch between source type and Staff proposal requires correction',async()=>{
  const r=await inspect({messages:[
    command('888888888888888888','!capacity evidence event:20270 category external')
  ]});
  assert.equal(r.sourceDisagreements,1);
  assert.equal(r.proposals[0].reviewStatus,'Source Disagreement');
  assert.equal(r.proposals[0].classificationApproved,false);
});
test('Opposing proposals to the same event/field remain explicit conflicts',async()=>{
  const r=await inspect({messages:[
    command('888888888888888888','!capacity evidence event:20270 category partner'),
    command('888888888888888889','!capacity evidence event:20270 category external')
  ]});
  assert.equal(r.totalProposals,2);
  assert.equal(r.conflicts,2);
  assert.equal(r.proposals.every(x=>x.reviewStatus==='Conflicting Proposals'),true);
});
test('An unverified or revoked role never produces an evidence proposal',async()=>{
  const r=await inspect({roles:[]});
  assert.equal(r.totalProposals,0);
  assert.equal(r.acceptedDecisions,0);
});
test('Messages from bots, webhooks, edited or stale requests are ignored',async()=>{
  const r=await inspect({messages:[
    command('888888888888888888',undefined,{
      edited_timestamp:'2027-03-20T11:56:00Z'}),
    command('888888888888888889',undefined,{author:{id:BOT,bot:true}}),
    command('888888888888888890',undefined,{timestamp:'2027-03-20T11:00:00Z'}),
    command('888888888888888891',undefined,{webhook_id:'777777777777777779'})
  ]});
  assert.equal(r.totalProposals,0);
});
test('Edited-on-read evidence, public channel or unapproved Administrator fail closed',async()=>{
  const d=reports();
  const altered=harness({alterOriginal:true});
  await assert.rejects(inspectStaffEvidence({
    client:altered.client,config,...d,nowMs:NOW}));
  const publicChannel=harness({channelViewAllowed:true});
  await assert.rejects(inspectStaffEvidence({
    client:publicChannel.client,config,...d,nowMs:NOW}));
  const admin=harness({extraRoles:[
    {id:'555555555555555555',permissions:'8'}]});
  await assert.rejects(inspectStaffEvidence({
    client:admin.client,config,...d,nowMs:NOW}));
});
test('Missing source coverage, wrong scope and stale reports refuse all review evidence',async()=>{
  const good=reports();
  good.report.summary.totalThreads=2;
  await assert.rejects(inspect({},good));
  const wrong=reports();wrong.overview.guildId='222222222222222222';
  await assert.rejects(inspect({},wrong));
  const stale=reports();stale.overview.generatedAt='2027-03-20T10:00:00Z';
  await assert.rejects(inspect({},stale));
});
test('Full 100-message page cannot imply complete audit evidence history',async()=>{
  const messages=[command()];
  for(let i=0;i<99;i++)messages.push(command(
    String(700000000000000000n+BigInt(i)),'unrelated'));
  await assert.rejects(inspect({messages}));
});
test('No private message text, raw user identity or event ID in aggregate results',async()=>{
  const r=await inspect();
  const aggregate=publicSafeAggregate(r);
  const text=JSON.stringify(aggregate);
  assert.equal(text.includes('20270'),false);
  assert.equal(text.includes(USER),false);
  assert.equal(text.includes('!capacity'),false);
  assert.throws(()=>publicSafeAggregate({...r,acceptedDecisions:1}));
});
test('Source duplication, even if records appear identical, refuses all proof',async()=>{
  const fake=reports();
  fake.report.threads.push({...fake.report.threads[0],
    threadId:'777777777777777778'});
  fake.report.summary.totalThreads=2;
  fake.report.summary.actualConvoys=2;
  fake.overview.overall.realConvoySubmissions=2;
  fake.overview.registeredConvoys.push({...fake.overview.registeredConvoys[0],
    threadId:'777777777777777778'});
  await assert.rejects(inspect({},fake));
});

test('Missing Discord Message Content fails closed rather than claiming zero Staff proposals',async()=>{
  const request=command('888888888888888888','');
  const {client}=harness({messages:[request]});
  await assert.rejects(inspectStaffEvidence({
    client,config,...reports(),nowMs:NOW
  }));
});
