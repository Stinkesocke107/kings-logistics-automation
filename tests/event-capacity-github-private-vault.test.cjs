'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createPrivateGitHubLedgerVault}
  =require('../event-capacity-github-private-vault');
const SCOPE={guildId:'1114967437788577792',
  forumId:'1550619824005062697'};
const OTHER={guildId:'222222222222222222',
  forumId:'1550619824005062697'};
const REPO='KingsPrivate/secured-event-capacity';
const SECRET='synthetic-github-private-ledger-encryption-key-00000001';
const WRONG='synthetic-github-private-ledger-encryption-key-00000002';
const TOKEN='synthetic-fine-grained-private-repo-token-for-offline-testing';
const AT='2027-03-20T12:00:00Z';
const STAFF={id:'111111111111111111',
  source:'trusted-server-gateway',verifiedRoles:['Event Coordination']};
const CEO={id:'666666666666666666',
  source:'trusted-server-gateway',verifiedRoles:['CEO']};
function sha(bytes){
  return crypto.createHash('sha1').update('blob '+bytes.length+'\0')
    .update(bytes).digest('hex');
}
function reply(value,status=200){
  const raw=Buffer.from(JSON.stringify(value));
  return {
    ok:status>=200&&status<300,status,
    headers:{get:x=>x==='content-length'?String(raw.length):null},
    body:{getReader:()=>{
      let sent=false;
      return {read:async()=>{
        if(sent)return {done:true};
        sent=true;return {done:false,value:raw};
      },cancel:async()=>{}};
    }}
  };
}
function fixture({isPrivate=true,failAnchor=false,simulateConflict=false}={}){
  let file=null,remote=null,blockAnchor=failAnchor,conflict=simulateConflict,
    commit=0,requests=[],metadataChecks=0;
  const root='/repos/'+REPO;
  const transport=async(url,request)=>{
    const u=new URL(url);
    requests.push({host:u.host,method:request.method,
      path:u.pathname,headers:request.headers,
      redirect:request.redirect});
    if(u.host!=='api.github.com'||request.redirect!=='manual')
      throw Error('unexpected test routing');
    if(u.pathname===root&&request.method==='GET'){
      metadataChecks++;
      return reply({full_name:REPO,private:isPrivate,
        archived:false,disabled:false,default_branch:'main'});
    }
    if(u.pathname!==root+'/contents/capacity-data/decisions.encrypted.json')
      throw Error('unexpected test routing');
    if(request.method==='GET'){
      if(!file)return reply({message:'Not Found'},404);
      return reply({type:'file',path:'capacity-data/decisions.encrypted.json',
        encoding:'base64',sha:file.sha,content:file.base64,
        size:file.bytes.length});
    }
    if(request.method==='PUT'){
      if(conflict){conflict=false;return reply({message:'Conflict'},409);}
      const posted=JSON.parse(request.body),bytes=Buffer.from(posted.content,'base64');
      if(posted.branch!=='main'||bytes.toString('base64')!==posted.content)
        throw Error('wrong test write');
      if(file){
        if(posted.sha!==file.sha)return reply({message:'Conflict'},409);
      }else if(Object.hasOwn(posted,'sha'))return reply({message:'Conflict'},409);
      file={sha:sha(bytes),bytes,base64:posted.content};
      commit++;
      return reply({content:{sha:file.sha},commit:{sha:('a'.repeat(39)+
        String(commit%10))}},file?200:201);
    }
    throw Error('unsupported mocked method');
  };
  const anchor={
    load:async({scope})=>{assert.deepEqual(scope,SCOPE);return remote;},
    compareAndAdvance:async({scope,expected,next})=>{
      assert.deepEqual(scope,SCOPE);
      if(blockAnchor||JSON.stringify(expected)!==JSON.stringify(remote))return false;
      remote=next;return true;
    }
  };
  const create=(override={})=>createPrivateGitHubLedgerVault({
    repository:REPO,token:TOKEN,secret:SECRET,scope:SCOPE,
    anchor,transport,...override
  });
  return {create,requests,getFile:()=>file,getRemote:()=>remote,
    setFile:v=>{file=v},setPrivate:v=>{isPrivate=v},
    setAnchorFail:v=>{blockAnchor=v},setConflict:v=>{conflict=v},
    getCommits:()=>commit,getMetaChecks:()=>metadataChecks};
}
function command(revision,action='classification',value='Partner Convoy'){
  return {
    ref:'event:20270',action,value,evidenceRef:'synthetic-private-approval-proof',
    expectedRevision:revision
  };
}
test('Explicit empty bootstrap persists ONLY encrypted content in a different private repo',async()=>{
  const f=fixture(),vault=f.create();
  await assert.rejects(vault.read());
  const saved=await vault.initializeEmpty({at:AT});
  assert.equal(saved.checkpoint.revision,0);
  assert.equal(f.getFile().sha,saved.sha);
  const plaintext=f.getFile().bytes.toString('utf8');
  assert.equal(plaintext.includes(SCOPE.guildId),false);
  assert.equal(plaintext.includes('event:20270'),false);
  assert.equal(plaintext.includes(SECRET),false);
  assert.match(plaintext,/"algorithm":"aes-256-gcm"/);
  assert.equal(f.getRemote().digest,saved.checkpoint.digest);
  assert.equal(f.getMetaChecks()>0,true);
  const a=f.requests.find(x=>x.method==='PUT');
  assert.equal(a.host,'api.github.com');
  assert.equal(a.redirect,'manual');
  assert.equal(a.headers.Authorization,'Bearer '+TOKEN);
  await assert.rejects(vault.initializeEmpty({at:AT}));
});
test('Across two independent Actions runs the same protected ledger is recovered',async()=>{
  const f=fixture();
  await f.create().initializeEmpty({at:AT});
  const newRun=f.create();
  const first=await newRun.read();
  assert.equal(first.ledger.revision,0);
  await newRun.commitDecision({command:command(0),actor:STAFF,at:AT});
  const after=f.create();
  const second=await after.read();
  assert.equal(second.ledger.revision,1);
  assert.equal(second.ledger.entries['event:20270'].eventType,'Partner Convoy');
  assert.equal(second.ledger.history.length,1);
  assert.equal(second.ledger.history[0].actorId,STAFF.id);
  assert.equal(f.getFile().bytes.includes(Buffer.from(STAFF.id)),false);
  assert.equal(f.getFile().bytes.includes(Buffer.from('event:20270')),false);
});
test('An authorized later reschedule is individually versioned and preserves old history',async()=>{
  const f=fixture(),vault=f.create();
  await vault.initializeEmpty({at:AT});
  await vault.commitDecision({command:command(0),actor:STAFF,at:AT});
  await vault.commitDecision({command:command(1,'departure',
    '2027-03-21T16:00:00Z'),actor:STAFF,at:AT});
  await vault.commitDecision({command:command(2,'reschedule',
    '2027-03-22T16:00:00Z'),actor:CEO,at:AT});
  const state=(await f.create().read()).ledger;
  assert.equal(state.revision,3);
  assert.equal(state.history.length,3);
  assert.equal(state.entries['event:20270'].status,'Rescheduled');
  assert.equal(state.entries['event:20270'].rescheduleHistory.length,1);
});
test('Wrong encryption key and wrong scope fail closed without leaking plaintext',async()=>{
  const f=fixture(),vault=f.create();
  await vault.initializeEmpty({at:AT});
  await assert.rejects(f.create({secret:WRONG}).read());
  await assert.rejects(f.create({scope:OTHER}).read());
});
test('Public repo and the Kings public code repo are forbidden as a private data store',async()=>{
  const f=fixture({isPrivate:false});
  await assert.rejects(f.create().initializeEmpty({at:AT}));
  assert.equal(f.getFile(),null);
  assert.throws(()=>f.create({repository:'Stinkesocke107/kings-logistics-automation'}));
  assert.throws(()=>f.create({repository:'../../repo'}));
  assert.throws(()=>f.create({repository:'../private'}));
  assert.throws(()=>f.create({repository:'KingsPrivate/..'}));
  assert.throws(()=>f.create({repository:'KingsPrivate/.hidden'}));
});
test('GitHub SHA compare-and-swap conflict cannot silently overwrite an old decision',async()=>{
  const f=fixture(),vault=f.create();
  await vault.initializeEmpty({at:AT});
  f.setConflict(true);
  await assert.rejects(vault.commitDecision({
    command:command(0),actor:STAFF,at:AT
  }));
  assert.equal((await vault.read()).ledger.revision,0);
  assert.equal(f.getCommits(),1);
});
test('Concurrent external rollback to old encrypted bytes fails checkpoint verification',async()=>{
  const f=fixture(),vault=f.create();
  await vault.initializeEmpty({at:AT});
  const old=f.getFile();
  await vault.commitDecision({command:command(0),actor:STAFF,at:AT});
  f.setFile(old);
  await assert.rejects(vault.read());
  await assert.rejects(vault.commitDecision({
    command:command(1,'end','2027-03-21T19:00:00Z'),
    actor:STAFF,at:AT
  }));
});
test('After a GitHub commit but failed independent anchor, reads and future writes halt',async()=>{
  const f=fixture(),vault=f.create();
  await vault.initializeEmpty({at:AT});
  f.setAnchorFail(true);
  await assert.rejects(vault.commitDecision({
    command:command(0),actor:STAFF,at:AT
  }));
  assert.equal(f.getCommits(),2);
  assert.equal(f.getRemote().revision,0);
  await assert.rejects(vault.read());
  await assert.rejects(vault.commitDecision({
    command:command(0),actor:STAFF,at:AT
  }));
});
test('Direct forged exception, unverified actor and stale revision are not stored',async()=>{
  const f=fixture(),vault=f.create();
  await vault.initializeEmpty({at:AT});
  await assert.rejects(vault.commitDecision({
    command:command(0,'exception',true),actor:STAFF,at:AT
  }));
  await assert.rejects(vault.commitDecision({
    command:command(0),actor:{...STAFF,verifiedRoles:[]},at:AT
  }));
  await vault.commitDecision({command:command(0),actor:STAFF,at:AT});
  await assert.rejects(vault.commitDecision({
    command:command(0,'end','2027-03-21T19:00:00Z'),
    actor:STAFF,at:AT
  }));
  assert.equal(f.getCommits(),2);
  assert.equal((await vault.read()).ledger.revision,1);
});
test('Tampered encrypted record fails proof verification and is not accepted',async()=>{
  const f=fixture(),vault=f.create();
  await vault.initializeEmpty({at:AT});
  const old=f.getFile();
  const bytes=Buffer.from(old.bytes);
  bytes[bytes.length-2]^=0x01;
  f.setFile({...old,bytes,base64:bytes.toString('base64'),sha:sha(bytes)});
  await assert.rejects(vault.read());
});
