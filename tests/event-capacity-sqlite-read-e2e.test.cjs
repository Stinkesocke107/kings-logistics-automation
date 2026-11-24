'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createEmptyLedger}=require('../event-capacity-decision-ledger');
const {signPrivateSnapshot}=require('../event-capacity-snapshot-attestation');
const {createPrivateSqliteSnapshotStore}=require('../event-capacity-private-sqlite');
const {createPrivateCapacitySnapshotReader}=require('../event-capacity-snapshot-provider');
const {handlePrivateCapacityRead}=require('../event-capacity-read-service');

const GUILD='1114967437788577792',FORUM='1550619824005062697';
const CHANNEL='1550619865805754378',USER='111111111111111111';
const COORD='333333333333333333',LEAD='444444444444444444',CEO='666666666666666666';
const SCOPE={guildId:GUILD,forumId:FORUM};
const NOW=Date.parse('2027-03-20T12:00:00Z');
const STORAGE_SECRET='isolated-e2e-sqlite-key-not-production-0123456789';
const SIGN_SECRET='isolated-e2e-snapshot-signing-key-not-production-987654321';
const RUN='45502949674';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const PUBLIC=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
let seq=0;
function signed(data={name:'event-capacity'}){
  const body={type:2,id:String(900000000000000000n+BigInt(++seq)),
    guild_id:GUILD,channel_id:CHANNEL,member:{user:{id:USER}},data};
  const rawBody=JSON.stringify(body);
  const signatureTimestamp=String(Math.floor(NOW/1000));
  return {rawBody,signatureTimestamp,publicKey:PUBLIC,
    signature:crypto.sign(null,Buffer.from(signatureTimestamp+rawBody),privateKey).toString('hex')};
}
function auth(roles=[COORD]){
  const roleInfo=[
    {id:GUILD,permissions:'65536'},
    {id:COORD,permissions:'66560'},
    {id:LEAD,permissions:'66560'},
    {id:CEO,permissions:'66560'}
  ];
  const channel={id:CHANNEL,guild_id:GUILD,type:0,
    permission_overwrites:[
      {id:GUILD,type:0,allow:'0',deny:'1024'},
      {id:COORD,type:0,allow:'1024',deny:'0'},
      {id:LEAD,type:0,allow:'1024',deny:'0'},
      {id:CEO,type:0,allow:'1024',deny:'0'}
    ]};
  const used=new Set();
  return {guildId:GUILD,forumId:FORUM,channelId:CHANNEL,
    roleIds:{'Event Coordination':COORD,'Event Leadership':LEAD,'CEO':CEO},
    botToken:'SYNTHETIC_ONLY',snapshotSecret:SIGN_SECRET,
    consumeInteractionId:async id=>{if(used.has(id))return false;used.add(id);return true;},
    transport:async url=>{
      const name=new URL(url).pathname;
      if(name.endsWith('/members/'+USER))
        return {ok:true,json:async()=>({user:{id:USER},roles})};
      if(name.endsWith('/roles'))return {ok:true,json:async()=>roleInfo};
      if(name.endsWith('/channels/'+CHANNEL))
        return {ok:true,json:async()=>channel};
      return {ok:false};
    }
  };
}
function fixture(){
  const source={
    integrityVerified:true,
    report:{guildId:GUILD,forumId:FORUM,generatedAt:'2027-03-20T11:54:00Z',
      summary:{totalThreads:0,actualConvoys:0},
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},threads:[]},
    overview:{guildId:GUILD,forumId:FORUM,generatedAt:'2027-03-20T11:57:00Z',
      overall:{convoyReadErrors:0,realConvoySubmissions:0,legacyImportedConvoys:0,
        legacyDuplicatesSuppressed:0},registeredConvoys:[]},
    ledger:createEmptyLedger(SCOPE,'2027-03-20T11:40:00Z')
  };
  const attestation=signPrivateSnapshot(source,{scope:SCOPE,secret:SIGN_SECRET,
    runId:RUN,attempt:1,nowMs:NOW,trustedProducer:true});
  return {scope:SCOPE,expected:null,next:{runId:RUN,attempt:1,ledgerRevision:0},
    snapshot:{...source,attestation},
    metadata:{runId:RUN,attempt:1,ledgerRevision:0,sourceVerified:true}};
}
async function withPrivateStore(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-sqlite-e2e-'));
  fs.chmodSync(dir,0o700);
  const store=createPrivateSqliteSnapshotStore({
    directory:dir,scope:SCOPE,encryptionSecret:STORAGE_SECRET,
    signingSecret:SIGN_SECRET,nowMs:()=>NOW
  });
  try{assert.equal(store.commitSnapshot(fixture()),true);return await fn(store);}
  finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('Protected stored snapshot reaches only signed authorized ephemeral calendar',async()=>
  withPrivateStore(async store=>{
    const reader=createPrivateCapacitySnapshotReader({scope:SCOPE,store});
    const result=await handlePrivateCapacityRead({
      signed:signed(),authorization:auth(),nowMs:NOW,loadTrustedSnapshot:reader
    });
    assert.equal(result.type,4);
    assert.equal(result.data.flags,64);
    assert.equal(result.data.embeds.length,3);
    assert.deepEqual(result.data.allowed_mentions,{parse:[]});
    assert.match(result.data.embeds[0].title,/Kings Event Capacity/);
  })
);
test('Role-revoked Discord user cannot trigger protected database lookup',async()=>
  withPrivateStore(async store=>{
    let reads=0;
    const reader=createPrivateCapacitySnapshotReader({scope:SCOPE,
      store:{readLatest:()=>{reads++;return store.readLatest();}}});
    await assert.rejects(handlePrivateCapacityRead({
      signed:signed(),authorization:auth([]),nowMs:NOW,loadTrustedSnapshot:reader
    }));
    assert.equal(reads,0);
  })
);
test('Expired encrypted snapshot cannot serve a verified free-capacity dashboard',async()=>
  withPrivateStore(async store=>{
    const reader=createPrivateCapacitySnapshotReader({scope:SCOPE,store:{
      readLatest:()=>{throw Error('private source expired');}
    }});
    await assert.rejects(handlePrivateCapacityRead({
      signed:signed(),authorization:auth(),nowMs:NOW,loadTrustedSnapshot:reader
    }),error=>!String(error).includes('private source expired'));
    assert.ok(store.readCursor());
  })
);
