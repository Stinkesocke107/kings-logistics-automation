'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {handlePrivateCapacityRead}=require('../event-capacity-read-service');
const {createEmptyLedger}=require('../event-capacity-decision-ledger');
const {signPrivateSnapshot}=require('../event-capacity-snapshot-attestation');
const GUILD='1114967437788577792',FORUM='1550619824005062697';
const CHANNEL='1550619865805754378',USER='111111111111111111';
const COORD='333333333333333333',LEAD='444444444444444444',CEO='666666666666666666';
const NOW=Date.parse('2027-03-20T12:00:00Z');
const SNAP_SECRET='synthetic-test-private-capacity-snapshot-signing-secret-v1';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const PUBLIC=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
let next=0;
function signed(data={name:'event-capacity'}){
  const body={type:2,id:String(900000000000000000n+BigInt(++next)),
    guild_id:GUILD,channel_id:CHANNEL,member:{user:{id:USER}},data};
  const rawBody=JSON.stringify(body);
  const signatureTimestamp=String(Math.floor(NOW/1000));
  return {rawBody,signatureTimestamp,publicKey:PUBLIC,
    signature:crypto.sign(null,Buffer.from(signatureTimestamp+rawBody),privateKey).toString('hex')};
}
function auth(memberRoles=[COORD]){
  const roles=[
    {id:GUILD,permissions:'65536'},
    {id:COORD,permissions:'66560'},
    {id:LEAD,permissions:'66560'},
    {id:CEO,permissions:'66560'}
  ];
  const channel={
    id:CHANNEL,guild_id:GUILD,type:0,
    permission_overwrites:[
      {id:GUILD,type:0,allow:'0',deny:'1024'},
      {id:COORD,type:0,allow:'1024',deny:'0'},
      {id:LEAD,type:0,allow:'1024',deny:'0'},
      {id:CEO,type:0,allow:'1024',deny:'0'}
    ]
  };
  const seen=new Set();
  return {
    guildId:GUILD,forumId:FORUM,channelId:CHANNEL,
    roleIds:{'Event Coordination':COORD,'Event Leadership':LEAD,'CEO':CEO},
    botToken:'SYNTHETIC_TEST_ONLY',snapshotSecret:SNAP_SECRET,
    consumeInteractionId:async id=>{if(seen.has(id))return false;seen.add(id);return true;},
    transport:async url=>{
      const route=new URL(url).pathname;
      if(route.endsWith('/members/'+USER))
        return {ok:true,json:async()=>({user:{id:USER},roles:memberRoles})};
      if(route.endsWith('/roles'))return {ok:true,json:async()=>roles};
      if(route.endsWith('/channels/'+CHANNEL))return {ok:true,json:async()=>channel};
      return {ok:false};
    }
  };
}
function snapshot(changes={}){
  const source={
    integrityVerified:true,
    report:{
      guildId:GUILD,forumId:FORUM,generatedAt:'2027-03-20T11:54:00Z',
      summary:{totalThreads:0,actualConvoys:0},
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      threads:[]
    },
    overview:{
      guildId:GUILD,forumId:FORUM,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{convoyReadErrors:0,realConvoySubmissions:0,legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[]
    },
    ledger:createEmptyLedger({guildId:GUILD,forumId:FORUM},'2027-03-20T11:55:00Z'),
    ...changes
  };
  return {...source,attestation:signPrivateSnapshot(source,{
    scope:{guildId:GUILD,forumId:FORUM},
    secret:SNAP_SECRET,runId:'45502949674',attempt:1,
    nowMs:NOW,trustedProducer:true
  })};
}
function params(extra={}){
  return {signed:signed(),authorization:auth(),nowMs:NOW,
    loadTrustedSnapshot:async()=>snapshot(),...extra};
}
test('Authenticated coordination command returns ephemeral 3-month dashboard, never public',async()=>{
  const response=await handlePrivateCapacityRead(params());
  assert.equal(response.type,4);
  assert.equal(response.data.flags,64);
  assert.equal(response.data.embeds.length,3);
  assert.equal(response.data.embeds[0].title,'Kings Event Capacity | 2027-03 UTC');
  assert.match(response.data.content,/Checked/);
  assert.deepEqual(response.data.allowed_mentions,{parse:[]});
});
test('Unrecognized command is rejected before reading protected event information',async()=>{
  let loads=0;
  await assert.rejects(handlePrivateCapacityRead(params({
    signed:signed({name:'not-event-capacity'}),
    loadTrustedSnapshot:async()=>{loads++;return snapshot();}
  })));
  assert.equal(loads,0);
});
test('Revoked Discord role cannot load protected source snapshot',async()=>{
  let loads=0;
  await assert.rejects(handlePrivateCapacityRead(params({
    authorization:auth([]),
    loadTrustedSnapshot:async()=>{loads++;return snapshot();}
  })));
  assert.equal(loads,0);
});
test('Unverified ingestion is shown as unverified, never guaranteed free',async()=>{
  const r=await handlePrivateCapacityRead(params({
    loadTrustedSnapshot:async()=>snapshot({integrityVerified:false})
  }));
  assert.match(r.data.content,/Data Outdated/);
  assert.match(r.data.embeds[0].description,/\?/);
});
test('Protected ledger from wrong guild or forum is refused',async()=>{
  const wrong=createEmptyLedger({guildId:'222222222222222222',forumId:FORUM},'2027-03-20T11:55:00Z');
  await assert.rejects(handlePrivateCapacityRead(params({
    loadTrustedSnapshot:async()=>snapshot({ledger:wrong})
  })));
});
test('Missing and malformed snapshots fail closed without publishing private data',async()=>{
  await assert.rejects(handlePrivateCapacityRead(params({
    loadTrustedSnapshot:async()=>({token:'NEVER_PRINT_THIS'})
  })),err=>!String(err).includes('NEVER_PRINT_THIS'));
  await assert.rejects(handlePrivateCapacityRead(params({
    loadTrustedSnapshot:async()=>{throw Error('private user data exposed in source failure');}
  })),err=>!String(err).includes('private user data exposed'));
});
test('Command from incorrect channel or forum context cannot reach private data',async()=>{
  await assert.rejects(handlePrivateCapacityRead(params({
    authorization:{...auth(),forumId:'wrong'}
  })));
  await assert.rejects(handlePrivateCapacityRead(params({
    authorization:{...auth(),channelId:'222222222222222222'}
  })));
});

function dayCommand(date='2027-03-20',page=null){
  const options=[{name:'date',type:3,value:date}];
  if(page!==null)options.push({name:'page',type:4,value:page});
  return signed({name:'event-capacity',options:[{name:'day',type:1,options}]});
}
test('Signed day command shows a private UTC daily detail from one scoped snapshot',async()=>{
  let loaded=0;
  const result=await handlePrivateCapacityRead(params({
    signed:dayCommand(),
    loadTrustedSnapshot:async()=>{
      loaded++;return snapshot();
    }
  }));
  assert.equal(loaded,1);
  assert.equal(result.type,4);
  assert.equal(result.data.flags,64);
  assert.deepEqual(result.data.allowed_mentions,{parse:[]});
  assert.match(result.data.content,/2027-03-20 UTC/);
  assert.match(result.data.content,/Remaining combined slots/);
});
test('Date option with an invalid UTC calendar date is denied before private data loads',async()=>{
  let calls=0;
  await assert.rejects(handlePrivateCapacityRead(params({
    signed:dayCommand('2027-02-30'),
    loadTrustedSnapshot:async()=>{calls++;return snapshot();}
  })));
  assert.equal(calls,0);
});
test('Unknown subcommand options are denied before private data loads',async()=>{
  let calls=0;
  const bad=signed({name:'event-capacity',
    options:[{name:'day',type:1,options:[{name:'date',type:3,value:'2027-03-20'},
      {name:'unknown',type:3,value:'test'}]}]});
  await assert.rejects(handlePrivateCapacityRead(params({
    signed:bad,loadTrustedSnapshot:async()=>{calls++;return snapshot();}
  })));
  assert.equal(calls,0);
});
test('Day detail pagination requires positive integer page and existing results',async()=>{
  const result=await handlePrivateCapacityRead(params({signed:dayCommand('2027-03-20',1)}));
  assert.match(result.data.content,/Page 1\/1/);
  await assert.rejects(handlePrivateCapacityRead(params({signed:dayCommand('2027-03-20',0)})));
  await assert.rejects(handlePrivateCapacityRead(params({signed:dayCommand('2027-03-20',2)})));
});
test('A valid day command must still pass current Discord role authorization',async()=>{
  let loads=0;
  await assert.rejects(handlePrivateCapacityRead(params({
    signed:dayCommand(),authorization:auth([]),
    loadTrustedSnapshot:async()=>{loads++;return snapshot();}
  })));
  assert.equal(loads,0);
});
test('Unverified source day view refuses to label open slots as verified',async()=>{
  const result=await handlePrivateCapacityRead(params({
    signed:dayCommand(),loadTrustedSnapshot:async()=>snapshot({integrityVerified:false})
  }));
  assert.match(result.data.content,/Availability unverified/);
  assert.match(result.data.content,/Data Outdated/);
});

test('Private read rejects a report modified after successful issuer attestation',async()=>{
  await assert.rejects(handlePrivateCapacityRead(params({
    loadTrustedSnapshot:async()=>{
      const source=snapshot();
      source.report.summary.totalThreads=999;
      return source;
    }
  })));
});
test('Private read rejects an unsigned report even when integrityVerified flag is true',async()=>{
  await assert.rejects(handlePrivateCapacityRead(params({
    loadTrustedSnapshot:async()=>{
      const source=snapshot();
      delete source.attestation;
      return source;
    }
  })));
});
test('Private read refuses a wrong private snapshot-signing key',async()=>{
  await assert.rejects(handlePrivateCapacityRead(params({
    authorization:{...auth(),snapshotSecret:'incorrect-synthetic-signing-secret-long-enough'},
    loadTrustedSnapshot:async()=>snapshot()
  })));
});


function searchCommand(options=[]){
  return signed({name:'event-capacity',options:[
    {name:'search',type:1,options}
  ]});
}
test('Signed search command returns private ephemeral ten-per-page view',async()=>{
  const response=await handlePrivateCapacityRead(params({
    signed:searchCommand([{name:'date_from',type:3,value:'2027-03-01'},
      {name:'type',type:3,value:'Partner Convoy'},{name:'page',type:4,value:1}])
  }));
  assert.equal(response.type,4);
  assert.equal(response.data.flags,64);
  assert.equal(response.data.embeds.length,1);
  assert.deepEqual(response.data.allowed_mentions,{parse:[]});
  assert.match(response.data.content,/Private Event Search/);
  assert.match(response.data.content,/Page 1\/1/);
});
test('Signed private search requires a current authorized Discord role before source lookup',async()=>{
  let lookups=0;
  await assert.rejects(handlePrivateCapacityRead(params({
    signed:searchCommand(),authorization:auth([]),
    loadTrustedSnapshot:async()=>{lookups++;return snapshot();}
  })));
  assert.equal(lookups,0);
});
test('Malformed or duplicate search filters reject before any protected data load',async()=>{
  for(const options of [
    [{name:'date_from',type:3,value:'2027-02-30'}],
    [{name:'status',type:3,value:'@everyone'}],
    [{name:'type',type:3,value:'Partner Convoy'},
      {name:'type',type:3,value:'Kings Convoy'}],
    [{name:'extra',type:3,value:'anything'}],
    [{name:'page',type:4,value:0}]
  ]){
    let reads=0;
    await assert.rejects(handlePrivateCapacityRead(params({
      signed:searchCommand(options),
      loadTrustedSnapshot:async()=>{reads++;return snapshot();}
    })));
    assert.equal(reads,0);
  }
});
