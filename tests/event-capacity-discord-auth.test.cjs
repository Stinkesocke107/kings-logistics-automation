'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {readSignedInteraction,authorizeSignedInteraction}=require('../event-capacity-discord-auth');
const GUILD='1114967437788577792';
const CHANNEL='1550619865805754378';
const USER='111111111111111111';
const OTHER='222222222222222222';
const COORD='333333333333333333';
const LEAD='444444444444444444';
const MANAGEMENT='555555555555555555';
const CEO='666666666666666666';
const UNKNOWN='777777777777777777';
const ROLE_IDS={'Event Coordination':COORD,'Event Leadership':LEAD,'Event Management':MANAGEMENT,CEO};
const NOW=Date.parse('2027-03-20T12:00:00.000Z');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const PUBLIC=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
let counter=0;
const role=(id,permissions='66560')=>({id,permissions});
function signed(modifications={}){
  const interaction={
    type:2,id:String(900000000000000000n+BigInt(++counter)),
    guild_id:GUILD,channel_id:CHANNEL,
    member:{user:{id:USER}}
  };
  const data={...interaction,...modifications};
  const rawBody=JSON.stringify(data);
  const signatureTimestamp=String(Math.floor(NOW/1000));
  const signature=crypto.sign(null,Buffer.from(signatureTimestamp+rawBody),privateKey).toString('hex');
  return {rawBody,signature,signatureTimestamp,publicKey:PUBLIC,nowMs:NOW};
}
function fixture(memberRoles=[COORD],options={}){
  const roles=[
    role(GUILD,'65536'),role(COORD),role(LEAD),role(MANAGEMENT),
    role(CEO),role(UNKNOWN)
  ];
  const overwrites=[
    {id:GUILD,type:0,allow:'0',deny:'1024'},
    {id:COORD,type:0,allow:'1024',deny:'0'},
    {id:LEAD,type:0,allow:'1024',deny:'0'},
    {id:CEO,type:0,allow:'1024',deny:'0'},
    ...(options.extraOverwrites||[])
  ];
  const channel={id:CHANNEL,guild_id:GUILD,type:0,permission_overwrites:overwrites};
  const member={user:{id:USER},roles:memberRoles};
  let calls=0;
  const transport=async (url,args)=>{
    calls++;
    assert.equal(args.method,'GET');
    assert.equal(args.headers.Authorization,'Bot TEST_ONLY_TOKEN');
    const route=new URL(url).pathname;
    if(route==='/api/v10/guilds/'+GUILD+'/members/'+USER)return {ok:true,json:async()=>options.member||member};
    if(route==='/api/v10/guilds/'+GUILD+'/roles')return {ok:true,json:async()=>options.roles||roles};
    if(route==='/api/v10/channels/'+CHANNEL)return {ok:true,json:async()=>options.channel||channel};
    throw Error('Unexpected request');
  };
  const used=new Set();
  const consumeInteractionId=async id=>{
    if(used.has(id))return false;
    used.add(id);return true;
  };
  return {transport,consumeInteractionId,roleIds:ROLE_IDS,guildId:GUILD,channelId:CHANNEL,
    botToken:'TEST_ONLY_TOKEN',getCalls:()=>calls};
}
test('Valid signed Discord interaction produces trusted actor only after fresh REST role lookup',async()=>{
  const f=fixture([COORD]);
  const s=signed();
  const auth=await authorizeSignedInteraction({...s,...f});
  assert.equal(auth.actor.id,USER);
  assert.deepEqual(auth.actor.verifiedRoles,['Event Coordination']);
  assert.equal(auth.actor.source,'trusted-server-gateway');
  assert.equal(f.getCalls(),3);
});
test('Verified Event Management alone cannot view the Coordination-only channel',async()=>{
  const f=fixture([MANAGEMENT]);
  await assert.rejects(authorizeSignedInteraction({...signed(),...f}));
});
test('Event Leadership can access, management right does not widen channel access',async()=>{
  const f=fixture([LEAD,MANAGEMENT]);
  const result=await authorizeSignedInteraction({...signed(),...f});
  assert.deepEqual(result.actor.verifiedRoles,['Event Leadership','Event Management']);
});
test('CEO role can access without Coordinator role',async()=>{
  const f=fixture([CEO]);
  const result=await authorizeSignedInteraction({...signed(),...f});
  assert.deepEqual(result.actor.verifiedRoles,['CEO']);
});
test('Forged signature is rejected before any Discord API call',async()=>{
  const f=fixture();
  const s=signed();
  await assert.rejects(authorizeSignedInteraction({...s,signature:'0'.repeat(128),...f}));
  assert.equal(f.getCalls(),0);
});
test('Edited signed body is rejected without trusting interaction-member roles',async()=>{
  const f=fixture();
  const s=signed();
  await assert.rejects(authorizeSignedInteraction({...s,rawBody:s.rawBody+' ',...f}));
  assert.equal(f.getCalls(),0);
});
test('Old or future timestamp fails closed',async()=>{
  const f=fixture(),s=signed();
  await assert.rejects(authorizeSignedInteraction({...s,nowMs:NOW+6*60*1000,...f}));
  await assert.rejects(authorizeSignedInteraction({...s,nowMs:NOW-6*60*1000,...f}));
});
test('Signed interaction from different channel or guild cannot act on capacity channel',async()=>{
  const f=fixture();
  await assert.rejects(authorizeSignedInteraction({...signed({channel_id:OTHER}),...f}));
  await assert.rejects(authorizeSignedInteraction({...signed({guild_id:OTHER}),...f}));
});
test('Current member lookup mismatch or revoked role is not authorized',async()=>{
  const forged=fixture([COORD],{member:{user:{id:OTHER},roles:[COORD]}});
  await assert.rejects(authorizeSignedInteraction({...signed(),...forged}));
  const revoked=fixture([]);
  await assert.rejects(authorizeSignedInteraction({...signed(),...revoked}));
});
test('Public or unrelated channel role View grant fails privacy gate',async()=>{
  const bad=fixture([COORD],{extraOverwrites:[{id:UNKNOWN,type:0,allow:'1024',deny:'0'}]});
  await assert.rejects(authorizeSignedInteraction({...signed(),...bad}));
});
test('Missing @everyone privacy deny is a blocker',async()=>{
  const f=fixture([COORD],{channel:{
    id:CHANNEL,guild_id:GUILD,type:0,
    permission_overwrites:[{id:COORD,type:0,allow:'1024',deny:'0'}]
  }});
  await assert.rejects(authorizeSignedInteraction({...signed(),...f}));
});
test('Role configuration may not reuse IDs or infer names',async()=>{
  const f=fixture();
  await assert.rejects(authorizeSignedInteraction({...signed(),...f,roleIds:{...ROLE_IDS,CEO:COORD}}));
  await assert.rejects(authorizeSignedInteraction({...signed(),...f,roleIds:{'Event Coordination':COORD}}));
});
test('A verified Discord interaction cannot be replayed',async()=>{
  const f=fixture(),s=signed();
  await authorizeSignedInteraction({...s,...f});
  await assert.rejects(authorizeSignedInteraction({...s,...f}));
});
test('The signed interaction must have a guild member with matching identity',()=>{
  const s=signed({member:{user:{id:USER}},user:{id:OTHER}});
  assert.throws(()=>readSignedInteraction(s));
});
test('Unauthorized API errors are not returned with token or sensitive URL',async()=>{
  const f=fixture();
  await assert.rejects(authorizeSignedInteraction({
    ...signed(),...f,
    transport:async()=>{throw Error('Bearer secret in internal HTTP error');}
  }),err=>{
    assert.equal(String(err.message).includes('Bearer secret'),false);
    return true;
  });
});

test('An unrelated Administrator role is a private-channel privacy blocker',async()=>{
  const roles=[
    role(GUILD,'65536'),role(COORD),role(LEAD),role(MANAGEMENT),
    role(CEO),role(UNKNOWN,'8')
  ];
  const f=fixture([COORD],{roles});
  await assert.rejects(authorizeSignedInteraction({...signed(),...f}));
});
test('An authorized CEO Administrator role does not authorize unrelated non-CEO members',async()=>{
  const roles=[
    role(GUILD,'65536'),role(COORD),role(LEAD),role(MANAGEMENT),
    role(CEO,'66568'),role(UNKNOWN)
  ];
  const f=fixture([COORD],{roles});
  const result=await authorizeSignedInteraction({...signed(),...f});
  assert.deepEqual(result.actor.verifiedRoles,['Event Coordination']);
});
