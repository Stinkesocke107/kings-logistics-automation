'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseTextCommand,replyText,pollPrivateStaffCommands,MARKER}
  =require('../event-capacity-github-staff-commands');
const NOW=Date.parse('2027-03-20T12:00:00Z');
const GUILD='1114967437788577792',CHANNEL='222222222222222222';
const BOT='999999999999999999',USER='111111111111111111',OTHER='222222222222222222';
const COORD='333333333333333333',LEAD='444444444444444444',CEO='666666666666666666';
const ROGUE='555555555555555555';
const config={guildId:GUILD,channelId:CHANNEL,
  messageId:'888888888888888888',
  roles:{'Event Coordination':COORD,'Event Leadership':LEAD,CEO}};
const at=new Date(NOW-10*60000).toISOString();
const command=(id='777777777777777777',content='!capacity status',extra={})=>({
  id,channel_id:CHANNEL,author:{id:USER,bot:false},content,
  timestamp:at,edited_timestamp:null,...extra
});
function setup({messages=[command()],memberRoles=[COORD],
  channelOverride={},rolesOverride=[],memberOverride=null,
  modifiedOnRead=false}={}){
  const state={messages:messages.map(m=>structuredClone(m)),writes:[],reads:0,
    memberCalls:0,rolesCalls:0,channelCalls:0};
  const roleData=[GUILD,COORD,LEAD,CEO,ROGUE].map(id=>({
    id,permissions:id===ROGUE?'0':'66560',
    ...rolesOverride.find(x=>x.id===id)
  }));
  const chan={
    id:CHANNEL,guild_id:GUILD,type:0,
    permission_overwrites:[
      {id:GUILD,type:0,allow:'0',deny:'1024'},
      ...[COORD,LEAD,CEO].map(id=>({id,type:0,allow:'1024',deny:'0'}))
    ],...channelOverride
  };
  let replyId=0;
  const client={
    me:async()=>({id:BOT}),
    channel:async()=>{state.channelCalls++;return chan;},
    roles:async()=>{state.rolesCalls++;return roleData;},
    recent:async()=>{
      state.reads++;return structuredClone(state.messages);
    },
    message:async(_,id)=>{
      const found=state.messages.find(m=>m.id===id);
      if(!found)return null;
      if(modifiedOnRead)return {...structuredClone(found),
        content:found.content+' modified',
        edited_timestamp:'2027-03-20T11:55:00Z'};
      return structuredClone(found);
    },
    member:async(_,id)=>{
      state.memberCalls++;
      if(memberOverride)return memberOverride(id);
      return {user:{id},roles:memberRoles};
    },
    create:async(id,payload)=>{
      state.writes.push({id,payload});
      const response={
        id:String(800000000000000000n+BigInt(++replyId)),
        channel_id:id,author:{id:BOT,bot:true},
        content:payload.content,timestamp:new Date(NOW).toISOString(),
        message_reference:payload.message_reference
      };
      state.messages.unshift(response);
      return response;
    }
  };
  return {client,state};
}
test('Strict text grammar accepts only a few read-only Event Capacity commands',()=>{
  assert.deepEqual(parseTextCommand('!capacity'),{kind:'help'});
  assert.deepEqual(parseTextCommand('!capacity help'),{kind:'help'});
  assert.deepEqual(parseTextCommand('!capacity status'),{kind:'status'});
  assert.deepEqual(parseTextCommand('!capacity month 2027-03'),
    {kind:'month',date:'2027-03'});
  assert.deepEqual(parseTextCommand('!capacity day 2027-03-20'),
    {kind:'day',date:'2027-03-20'});
  for(const bad of [
    '!capacity approve 123','!capacity accept 123','!capacity day 2027-02-30',
    '!capacity month 2027-13','!capacity status\n@everyone',
    '!capacity status <@1234>', '!CAPACITY status',
    '!capacity month 2027-03 extra'
  ])assert.equal(parseTextCommand(bad),null);
});
test('All replies explicitly preserve uncertainty and forbid acceptance',()=>{
  for(const type of [
    {kind:'help'},{kind:'status'},{kind:'day',date:'2027-03-20'},
    {kind:'month',date:'2027-03'}
  ]){
    const text=replyText(type,true);
    assert.ok(text.startsWith(MARKER));
    assert.ok(!text.includes('available: 2'));
    assert.ok(!text.includes('Approved by'));
    assert.ok(!text.includes('<@'));
    assert.ok(text.length<1800);
  }
  assert.match(replyText({kind:'status'},false),/Data Outdated/);
});
test('Authorized staff command is replied to once with no mentions or approvals',async()=>{
  const {client,state}=setup();
  const first=await pollPrivateStaffCommands({client,config,nowMs:NOW,
    sourceAvailable:true});
  assert.equal(first.state,'Replied');
  assert.equal(first.replied,1);
  assert.equal(state.writes.length,1);
  assert.equal(state.writes[0].id,CHANNEL);
  assert.equal(state.writes[0].payload.message_reference.message_id,
    '777777777777777777');
  assert.deepEqual(state.writes[0].payload.allowed_mentions,
    {parse:[],replied_user:false});
  assert.match(state.writes[0].payload.content,/Needs Verification/);
  const next=await pollPrivateStaffCommands({client,config,nowMs:NOW,
    sourceAvailable:true});
  assert.equal(next.state,'NoNewRequests');
  assert.equal(next.replied,0);
  assert.equal(state.writes.length,1);
});
test('Unauthorized and revoked staff role cannot cause an Event reply',async()=>{
  for(const memberships of [[],[ROGUE]]){
    const {client,state}=setup({memberRoles:memberships});
    const result=await pollPrivateStaffCommands({client,config,nowMs:NOW});
    assert.equal(result.replied,0);
    assert.equal(state.writes.length,0);
  }
});
test('Missing current member lookup or forged identity fails closed',async()=>{
  const {client,state}=setup({memberOverride:()=>({
    user:{id:OTHER},roles:[COORD]
  })});
  await assert.rejects(pollPrivateStaffCommands({client,config,nowMs:NOW}));
  assert.equal(state.writes.length,0);
});
test('Unapproved administrator role invalidates channel privacy for text replies',async()=>{
  const {client,state}=setup({rolesOverride:[{id:ROGUE,permissions:'8'}]});
  await assert.rejects(pollPrivateStaffCommands({client,config,nowMs:NOW}));
  assert.equal(state.writes.length,0);
});
test('Public channel or unknown viewing grant fails before member or message access',async()=>{
  const {client,state}=setup({channelOverride:{
    permission_overwrites:[{id:GUILD,type:0,allow:'1024',deny:'0'}]
  }});
  await assert.rejects(pollPrivateStaffCommands({client,config,nowMs:NOW}));
  assert.equal(state.writes.length,0);
  assert.equal(state.memberCalls,0);
  assert.equal(state.reads,0);
});
test('Exactly 100 recent messages is incomplete history and cannot dedupe safely',async()=>{
  const messages=[command()];
  for(let i=0;i<99;i++)messages.push(command(
    String(700000000000000000n+BigInt(i)), 'not a command',
    {author:{id:OTHER,bot:false}}
  ));
  const {client,state}=setup({messages});
  await assert.rejects(pollPrivateStaffCommands({client,config,nowMs:NOW}));
  assert.equal(state.writes.length,0);
});
test('Edited, deleted and stale messages are never processed',async()=>{
  for(const m of [
    command(undefined,undefined,{edited_timestamp:at}),
    command(undefined,undefined,{timestamp:'2027-03-20T10:00:00Z'}),
    command(undefined,undefined,{author:{id:BOT,bot:true}})
  ]){
    const {client,state}=setup({messages:[m]});
    const result=await pollPrivateStaffCommands({client,config,nowMs:NOW});
    assert.equal(result.replied,0);
    assert.equal(state.writes.length,0);
  }
  const changed=setup({modifiedOnRead:true});
  await assert.rejects(pollPrivateStaffCommands({
    client:changed.client,config,nowMs:NOW}));
  assert.equal(changed.state.writes.length,0);
});
test('Bounded batch replies to at most two oldest commands per GitHub run',async()=>{
  const messages=[
    command('777777777777777779','!capacity day 2027-03-20'),
    command('777777777777777778','!capacity month 2027-03'),
    command('777777777777777777','!capacity status')
  ];
  const {client,state}=setup({messages});
  const first=await pollPrivateStaffCommands({client,config,nowMs:NOW});
  assert.equal(first.replied,2);
  assert.equal(state.writes.length,2);
  assert.deepEqual(state.writes.map(x=>x.payload.message_reference.message_id),
    ['777777777777777777','777777777777777778']);
  const second=await pollPrivateStaffCommands({client,config,nowMs:NOW});
  assert.equal(second.replied,1);
  assert.equal(state.writes.length,3);
});
test('Unknown commands and bot outputs never trigger commands or accept events',async()=>{
  const {client,state}=setup({messages:[
    command('777777777777777777','!capacity approve 345'),
    command('777777777777777778','!capacity status',{
      author:{id:BOT,bot:true}
    })
  ]});
  const result=await pollPrivateStaffCommands({client,config,nowMs:NOW});
  assert.equal(result.replied,0);
  assert.equal(state.writes.length,0);
});
test('Malformed Discord reply acknowledgement fails closed without leaking private source',async()=>{
  const {client}=setup();
  client.create=async()=>{throw Error('PROTECTED_MEMBER_TOKEN_IS_NOT_FOR_LOGS');};
  await assert.rejects(pollPrivateStaffCommands({client,config,nowMs:NOW}),
    err=>!String(err).includes('PROTECTED_MEMBER_TOKEN_IS_NOT_FOR_LOGS'));
});
