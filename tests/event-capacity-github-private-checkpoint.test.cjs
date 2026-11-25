'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createPrivateGitHubCheckpoint}
  =require('../event-capacity-github-private-checkpoint');
const {createPrivateGitHubLedgerVault}
  =require('../event-capacity-github-private-vault');
const {createGithubOnlyPrivateDecisionStorage}
  =require('../event-capacity-github-private-storage');
const SCOPE={guildId:'1114967437788577792',
  forumId:'1550619824005062697'};
const OTHER={guildId:'222222222222222222',
  forumId:'1550619824005062697'};
const DATA='KingsData/event-capacity-locked';
const WITNESS='KingsWitness/ledger-checkpoints';
const PUBLIC='Stinkesocke107/kings-logistics-automation';
const DTOKEN='synthetic-data-repository-token-000000001';
const WTOKEN='synthetic-witness-repository-token-0000002';
const WKEY='synthetic-separate-witness-hmac-key-0000003';
const LKEY='synthetic-separate-ledger-encryption-key-0000004';
const AT='2027-03-20T12:00:00Z';
const D1='a'.repeat(64),D2='b'.repeat(64),D3='c'.repeat(64);
function sha(b){
  return crypto.createHash('sha1').update('blob '+b.length+'\0')
    .update(b).digest('hex');
}
function http(value,status=200){
  const body=Buffer.from(JSON.stringify(value));
  return {status,ok:status>=200&&status<300,
    headers:{get:x=>x==='content-length'?String(body.length):null},
    body:{getReader:()=>{
      let emitted=false;
      return {read:async()=>{
        if(emitted)return {done:true};
        emitted=true;return {done:false,value:body};
      },cancel:async()=>{}};
    }}
  };
}
function suite(){
  const repos={
    [DATA]:{file:null,private:true,commits:0,token:DTOKEN,
      filename:'/contents/capacity-data/decisions.encrypted.json'},
    [WITNESS]:{file:null,private:true,commits:0,token:WTOKEN,
      filename:'/contents/capacity-control/ledger-checkpoint.json'}
  };
  const requests=[];
  let witnessWriteFail=false,witnessConflict=false;
  let tamperData=false;
  const transport=async(input,options)=>{
    const u=new URL(input);
    const found=Object.keys(repos).find(x=>
      u.pathname==='/repos/'+x||u.pathname.startsWith('/repos/'+x+'/'));
    if(!found||u.host!=='api.github.com'||u.protocol!=='https:'||
      options.redirect!=='manual')throw Error('illegal route');
    const data=repos[found],route=u.pathname.slice(('/repos/'+found).length);
    const token=String(options.headers?.Authorization||'');
    if(token!=='Bearer '+data.token)throw Error('credential crossed fault domains');
    requests.push({repo:found,method:options.method,route,
      authorization:token,redirect:options.redirect});
    if(route===''&&options.method==='GET')
      return http({full_name:found,private:data.private,
        archived:false,disabled:false,default_branch:'main'});
    if(route!==data.filename)throw Error('unsupported route');
    if(options.method==='GET'){
      if(!data.file)return http({message:'Not found'},404);
      const item=data.file;
      return http({type:'file',path:data.filename.slice('/contents/'.length),
        encoding:'base64',sha:item.sha,
        size:item.bytes.length,content:item.bytes.toString('base64')});
    }
    if(options.method==='PUT'){
      if(found===WITNESS&&witnessWriteFail)throw Error('witness outage');
      if(found===WITNESS&&witnessConflict){
        witnessConflict=false;return http({message:'Conflict'},409);
      }
      const payload=JSON.parse(options.body);
      if(payload.branch!=='main')throw Error('wrong branch');
      if(data.file){
        if(payload.sha!==data.file.sha)return http({message:'Conflict'},409);
      }else if(Object.hasOwn(payload,'sha'))return http({message:'Conflict'},409);
      const raw=Buffer.from(payload.content,'base64');
      if(raw.toString('base64')!==payload.content)throw Error('wrong encoding');
      data.file={sha:sha(raw),bytes:raw};
      data.commits++;
      if(found===DATA&&tamperData){
        tamperData=false;
        data.file.bytes=Buffer.from('tampered');
        data.file.sha=sha(data.file.bytes);
      }
      return http({content:{sha:sha(raw)},
        commit:{sha:('a'.repeat(39)+String(data.commits%10))}},200);
    }
    throw Error('unexpected method');
  };
  const witness=()=>createPrivateGitHubCheckpoint({
    repository:WITNESS,dataRepository:DATA,
    token:WTOKEN,dataToken:DTOKEN,signingSecret:WKEY,scope:SCOPE,
    transport
  });
  const vault=()=>createPrivateGitHubLedgerVault({
    repository:DATA,token:DTOKEN,secret:LKEY,scope:SCOPE,
    anchor:witness(),transport
  });
  return {repos,transport,witness,vault,requests,
    witnessWriteFails:value=>{witnessWriteFail=value;},
    witnessConflicts:value=>{witnessConflict=value;},
    tamperNextDataWrite:()=>{tamperData=true;}};
}
test('Separate private witness initializes revision zero, verifies signature and advances',async()=>{
  const f=suite(),w=f.witness();
  assert.equal(await w.load({scope:SCOPE}),null);
  assert.equal(await w.compareAndAdvance({
    scope:SCOPE,expected:null,next:{revision:0,digest:D1}
  }),true);
  assert.deepEqual(await w.load({scope:SCOPE}),{revision:0,digest:D1});
  const record=JSON.parse(f.repos[WITNESS].file.bytes.toString('utf8'));
  assert.deepEqual(record.scope,SCOPE);
  assert.equal(record.previousDigest,null);
  assert.equal(record.digest,D1);
  assert.match(record.signature,/^[a-f0-9]{64}$/);
  assert.equal(await w.compareAndAdvance({
    scope:SCOPE,expected:{revision:0,digest:D1},
    next:{revision:1,digest:D2}
  }),true);
  assert.deepEqual(await w.load({scope:SCOPE}),{revision:1,digest:D2});
  const next=JSON.parse(f.repos[WITNESS].file.bytes.toString('utf8'));
  assert.equal(next.previousDigest,D1);
  assert.notEqual(next.signature,record.signature);
  assert.equal(f.repos[WITNESS].commits,2);
});
test('Same revision/old checkpoint never advances: strict predecessor and CAS',async()=>{
  const f=suite(),w=f.witness();
  await assert.rejects(w.compareAndAdvance({
    scope:SCOPE,expected:null,next:{revision:1,digest:D1}
  }));
});
test('Malformed revision and wrong scope fail closed with no network writes',async()=>{
  const f=suite(),w=f.witness();
  for(const next of [
    {revision:1,digest:D1}, // bootstrap MUST be revision 0
    {revision:0,digest:'INVALID'},
    {revision:-1,digest:D1}
  ]){
    await assert.rejects(w.compareAndAdvance({
      scope:SCOPE,expected:null,next
    }));
  }
  await assert.rejects(w.load({scope:OTHER}));
  await assert.rejects(w.compareAndAdvance({
    scope:OTHER,expected:null,next:{revision:0,digest:D1}
  }));
  assert.equal(f.repos[WITNESS].commits,0);
});
test('Wrong checkpoint signing key, different scope and tampered file all fail',async()=>{
  const f=suite(),w=f.witness();
  await w.compareAndAdvance({scope:SCOPE,expected:null,
    next:{revision:0,digest:D1}});
  const wrong=createPrivateGitHubCheckpoint({
    repository:WITNESS,dataRepository:DATA,token:WTOKEN,dataToken:DTOKEN,
    signingSecret:'different-synthetic-checkpoint-secret-111111111',
    scope:SCOPE,transport:f.transport
  });
  await assert.rejects(wrong.load({scope:SCOPE}));
  const changed=createPrivateGitHubCheckpoint({
    repository:WITNESS,dataRepository:DATA,token:WTOKEN,dataToken:DTOKEN,
    signingSecret:WKEY,scope:OTHER,transport:f.transport
  });
  await assert.rejects(changed.load({scope:OTHER}));
  const original=f.repos[WITNESS].file;
  const bytes=Buffer.from(original.bytes);
  bytes[bytes.length-15]^=0x01;
  f.repos[WITNESS].file={bytes,sha:sha(bytes)};
  await assert.rejects(w.load({scope:SCOPE}));
});
test('Reject public, shared, malformed and non-private witness repository',async()=>{
  const f=suite();
  for(const [repo,data] of [
    [PUBLIC,DATA],[DATA,DATA],['../secret',DATA],['Org/.hidden',DATA]
  ]){
    assert.throws(()=>createPrivateGitHubCheckpoint({
      repository:repo,dataRepository:data,token:WTOKEN,dataToken:DTOKEN,
      signingSecret:WKEY,scope:SCOPE,transport:f.transport
    }));
  }
  assert.throws(()=>createPrivateGitHubCheckpoint({
    repository:WITNESS,dataRepository:DATA,token:DTOKEN,dataToken:DTOKEN,
    signingSecret:WKEY,scope:SCOPE,transport:f.transport
  }));
  f.repos[WITNESS].private=false;
  await assert.rejects(f.witness().load({scope:SCOPE}));
  assert.equal(f.repos[WITNESS].commits,0);
});
test('GH Contents version conflict does not advance signed witness',async()=>{
  const f=suite(),w=f.witness();
  await w.compareAndAdvance({scope:SCOPE,expected:null,
    next:{revision:0,digest:D1}});
  f.witnessConflicts(true);
  await assert.rejects(w.compareAndAdvance({
    scope:SCOPE,expected:{revision:0,digest:D1},
    next:{revision:1,digest:D2}
  }));
  assert.deepEqual(await w.load({scope:SCOPE}),{revision:0,digest:D1});
  assert.equal(f.repos[WITNESS].commits,1);
  assert.equal(await w.compareAndAdvance({
    scope:SCOPE,expected:{revision:0,digest:D3},
    next:{revision:1,digest:D2}
  }),false);
});
test('Encrypted private ledger and signed separate witness persist across new GitHub runs',async()=>{
  const f=suite();
  const first=await f.vault().initializeEmpty({at:AT});
  assert.equal(first.checkpoint.revision,0);
  assert.equal(f.repos[DATA].commits,1);
  assert.equal(f.repos[WITNESS].commits,1);
  const fresh=await f.vault().read();
  assert.equal(fresh.ledger.revision,0);
  const STAFF={id:'111111111111111111',source:'trusted-server-gateway',
    verifiedRoles:['Event Coordination']};
  await f.vault().commitDecision({
    command:{
      ref:'event:synthetic20',action:'classification',value:'Partner Convoy',
      evidenceRef:'test-evidence-only',expectedRevision:0
    },actor:STAFF,at:AT
  });
  const after=await f.vault().read();
  assert.equal(after.ledger.revision,1);
  assert.equal(after.ledger.history.length,1);
  assert.equal(after.ledger.entries['event:synthetic20'].eventType,'Partner Convoy');
  assert.deepEqual(await f.witness().load({scope:SCOPE}),after.checkpoint);
  assert.equal(f.repos[DATA].file.bytes.includes(Buffer.from(STAFF.id)),false);
  assert.equal(f.repos[WITNESS].file.bytes.includes(Buffer.from(STAFF.id)),false);
  const privateCalls=f.requests.filter(x=>x.method==='PUT');
  assert.equal(privateCalls.length,4);
  assert.deepEqual(privateCalls.map(x=>x.repo),
    [DATA,WITNESS,DATA,WITNESS]);
  assert.equal(privateCalls[0].authorization,'Bearer '+DTOKEN);
  assert.equal(privateCalls[1].authorization,'Bearer '+WTOKEN);
});
test('Rewound encrypted ledger is rejected against newer signed witness',async()=>{
  const f=suite();
  await f.vault().initializeEmpty({at:AT});
  const prior=f.repos[DATA].file;
  await f.vault().commitDecision({
    command:{ref:'event:synthetic',action:'classification',
      value:'Partner Convoy',evidenceRef:'test-approval',
      expectedRevision:0},
    actor:{id:'111111111111111111',source:'trusted-server-gateway',
      verifiedRoles:['Event Coordination']},at:AT
  });
  f.repos[DATA].file=prior;
  await assert.rejects(f.vault().read());
});
test('After data GitHub commit with witness outage, both future read and write fail closed',async()=>{
  const f=suite();
  await f.vault().initializeEmpty({at:AT});
  f.witnessWriteFails(true);
  await assert.rejects(f.vault().commitDecision({
    command:{ref:'event:synthetic',action:'classification',
      value:'Partner Convoy',evidenceRef:'test-evidence',
      expectedRevision:0},
    actor:{id:'111111111111111111',source:'trusted-server-gateway',
      verifiedRoles:['Event Coordination']},at:AT
  }));
  assert.equal(f.repos[DATA].commits,2);
  assert.equal(f.repos[WITNESS].commits,1);
  await assert.rejects(f.vault().read());
  await assert.rejects(f.vault().commitDecision({
    command:{ref:'event:synthetic',action:'classification',
      value:'Partner Convoy',evidenceRef:'test-evidence',
      expectedRevision:0},
    actor:{id:'111111111111111111',source:'trusted-server-gateway',
      verifiedRoles:['Event Coordination']},at:AT
  }));
});
test('Simultaneous rollback of both repos is NOT detected; require external owner witness',async()=>{
  const f=suite();
  const w=f.witness();
  await w.compareAndAdvance({scope:SCOPE,expected:null,
    next:{revision:0,digest:D1}});
  const older=f.repos[WITNESS].file;
  await w.compareAndAdvance({scope:SCOPE,
    expected:{revision:0,digest:D1},next:{revision:1,digest:D2}});
  // A malicious admin could rewrite BOTH repo histories to a matching old
  // signed state. A signed checkpoint alone does not make Git monotonic.
  f.repos[WITNESS].file=older;
  assert.deepEqual(await w.load({scope:SCOPE}),{revision:0,digest:D1});
});

test('Composition factory enforces distinct repositories, tokens and cryptographic keys',async()=>{
  const f=suite();
  const options={
    dataRepository:DATA,checkpointRepository:WITNESS,
    dataToken:DTOKEN,checkpointToken:WTOKEN,
    ledgerSecret:LKEY,checkpointSecret:WKEY,
    scope:SCOPE,transport:f.transport
  };
  for(const invalid of [
    {checkpointRepository:DATA},
    {checkpointRepository:DATA.toLowerCase()},
    {checkpointToken:DTOKEN},
    {checkpointSecret:LKEY}
  ])assert.throws(()=>createGithubOnlyPrivateDecisionStorage({
    ...options,...invalid
  }));
  const pair=createGithubOnlyPrivateDecisionStorage(options);
  const saved=await pair.vault.initializeEmpty({at:AT});
  assert.deepEqual(await pair.checkpoint.load({scope:SCOPE}),
    saved.checkpoint);
  assert.equal((await pair.vault.read()).ledger.revision,0);
  assert.equal(f.repos[DATA].commits,1);
  assert.equal(f.repos[WITNESS].commits,1);
});
