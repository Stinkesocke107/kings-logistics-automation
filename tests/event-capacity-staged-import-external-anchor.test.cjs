'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture,hash}=require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {createKingsAtomicStagedImportSqliteStore:openDb}
  =require('../event-capacity-atomic-staged-import-sqlite');
const {createKingsExternallyWitnessedStagedImportStore:wrap}
  =require('../event-capacity-staged-import-external-anchor');
const ENC='synthetic separated AES encryption secret for offline sqlite test';
const FILE='kings-capacity-quarantine-drill.sqlite';
function setup(){
  const sourceInput=fixture();
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),
    'kings-staged-offsite-anchor-'));
  if(process.platform!=='win32')fs.chmodSync(directory,0o700);
  const scope={guildId:sourceInput.current.guildId,
    forumId:sourceInput.current.currentChannelId};
  let remote=null,allow=true,throwOnLoad=false,lieOnCAS=false;
  const stores=[];
  const anchor={
    load:async({scope:given})=>{
      assert.deepEqual(given,scope);
      if(throwOnLoad)throw Error('PRIVATE REMOTE ERROR');
      return remote?structuredClone(remote):null;
    },
    compareAndAdvance:async({scope:given,expected,next})=>{
      assert.deepEqual(given,scope);
      if(!allow)return false;
      if(!assert.deepEqual(expected,remote)){
        // assert.deepEqual returns undefined, only used to validate
      }
      if(lieOnCAS)return true;
      remote=structuredClone(next);
      return true;
    }
  };
  function open(extra={}){
    const store=openDb({
      directory,scope,encryptionSecret:ENC,
      reviewSecret:sourceInput.reviewSecret,
      mode:'SYNTHETIC_OFFLINE_ONLY',...extra
    });
    stores.push(store);
    return {store,worker:wrap({scope,store,anchor})};
  }
  const cleanup=()=>{
    for(const s of stores.reverse())try{s.close();}catch{}
    fs.rmSync(directory,{recursive:true,force:true});
  };
  return {sourceInput,scope,directory,anchor,open,cleanup,
    remote:()=>remote,setRemote:v=>{remote=v;},
    setAllow:x=>{allow=x;},setThrowOnLoad:x=>{throwOnLoad=x;},
    setLieOnCAS:x=>{lieOnCAS=x;}};
}
async function withStore(fn){
  const f=setup();try{return await fn(f);}finally{f.cleanup();}
}
test('Empty private SQLite and empty injected witness compare without claiming independent custody',
  async()=>withStore(async({sourceInput,open})=>{
    const {worker}=open(),s=await worker.inspect({sourceInput});
    assert.equal(s.revision,0);
    assert.equal(s.physicalWitnessIndependenceVerified,false);
    assert.equal(s.independentlyStoredOffsiteBackupVerified,false);
    const view=await worker.read({sourceInput});
    assert.equal(view.quarantinedRecordCount,0);
    assert.equal(view.freeSlotsCertified,false);
  }));
test('A real local SQLite stage persists and a separately injected CAS witness matches its digest',
  async()=>withStore(async({sourceInput,remote,open})=>{
    const {worker}=open();
    const r=await worker.advance({sourceInput,expectedRevision:0});
    assert.equal(r.state,'WITNESSED_OFFLINE_SQLITE_STEP');
    assert.equal(r.revision,1);
    assert.equal(r.durableLocalQuarantineStepCommittedNow,true);
    assert.equal(remote().revision,1);
    assert.match(remote().digest,/^[a-f0-9]{64}$/);
    assert.equal((await worker.read({sourceInput})).revision,1);
    assert.equal(r.productionImportCommitted,false);
  }));
test('Completed 4-phase local drill can be replayed without a fifth remote revision',
  async()=>withStore(async({sourceInput,open,remote})=>{
    const {worker,store}=open();
    for(let i=0;i<4;i++){
      const r=await worker.advance({sourceInput,expectedRevision:i});
      assert.equal(r.revision,i+1);
    }
    assert.equal((await worker.read({sourceInput})).revision,4);
    const after=await worker.advance({sourceInput,expectedRevision:3});
    assert.equal(after.state,'ALREADY_STAGED_SAME_PHASE_REPLAY');
    assert.equal(after.durableLocalQuarantineStepCommittedNow,false);
    assert.equal(remote().revision,4);
    assert.equal((await worker.advance({sourceInput,expectedRevision:4})).state,
      'OFFLINE_DRILL_ALREADY_COMPLETE');
    assert.equal(store.checkpointDigest({sourceInput}).revision,4);
  }));
test('Restart opens same encrypted sqlite and continues from matching externally claimed checkpoint',
  async()=>withStore(async({sourceInput,open})=>{
    const {worker,store}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    store.close();
    const next=open();
    assert.equal((await next.worker.read({sourceInput})).revision,1);
    assert.equal((await next.worker.advance({sourceInput,expectedRevision:1})).revision,2);
  }));
test('Duplicate request already witnessed returns idempotent status without new CAS',
  async()=>withStore(async({sourceInput,open,remote})=>{
    const {worker}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    const digest=remote().digest;
    const replay=await worker.advance({sourceInput,expectedRevision:0});
    assert.equal(replay.state,'ALREADY_STAGED_SAME_PHASE_REPLAY');
    assert.equal(remote().digest,digest);
  }));
test('Remote witness fails after local commit: deny all reads and subsequent writes',
  async()=>withStore(async({sourceInput,open,remote,setAllow})=>{
    const {worker,store}=open();
    setAllow(false);
    await assert.rejects(worker.advance({sourceInput,expectedRevision:0}));
    assert.equal(store.checkpointDigest({sourceInput}).revision,1);
    assert.equal(remote(),null);
    await assert.rejects(worker.read({sourceInput}));
    await assert.rejects(worker.inspect({sourceInput}));
    await assert.rejects(worker.advance({sourceInput,expectedRevision:1}));
  }));
test('A liar CAS success response without actual remote advance is detected immediately',
  async()=>withStore(async({sourceInput,open,setLieOnCAS})=>{
    const {worker}=open();setLieOnCAS(true);
    await assert.rejects(worker.advance({sourceInput,expectedRevision:0}));
    await assert.rejects(worker.read({sourceInput}));
  }));
test('A local commit with lost acknowledgment leaves anchor behind and is not auto-healed',
  async()=>withStore(async({sourceInput,open,remote})=>{
    const {worker,store}=open();
    assert.throws(()=>store.advance({
      sourceInput,expectedRevision:0,fault:'AFTER_COMMIT_BEFORE_ACK'
    }));
    assert.equal(store.checkpointDigest({sourceInput}).revision,1);
    assert.equal(remote(),null);
    await assert.rejects(worker.advance({sourceInput,expectedRevision:0}));
    await assert.rejects(worker.read({sourceInput}));
  }));
test('Local staged commit without witness authorisation must be treated as unauthenticated fork',
  async()=>withStore(async({sourceInput,open})=>{
    const {worker,store}=open();
    store.advance({sourceInput,expectedRevision:0});
    await assert.rejects(worker.read({sourceInput}));
    await assert.rejects(worker.advance({sourceInput,expectedRevision:1}));
  }));
test('Different same-revision remote ciphertext digest is denied even if version matches',
  async()=>withStore(async({sourceInput,open,setRemote,remote})=>{
    const {worker}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    setRemote({revision:1,digest:'f'.repeat(64)});
    assert.notEqual(remote().digest,'abc');
    await assert.rejects(worker.read({sourceInput}));
    await assert.rejects(worker.advance({sourceInput,expectedRevision:1}));
  }));
test('A witness claiming a later revision rejects an older locally restored database',
  async()=>withStore(async({sourceInput,open,setRemote})=>{
    const {worker}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    setRemote({revision:2,digest:'c'.repeat(64)});
    await assert.rejects(worker.inspect({sourceInput}));
    await assert.rejects(worker.read({sourceInput}));
  }));
test('Deleting the local SQLite file without deleting remote witness is fail-closed',
  async()=>withStore(async({sourceInput,open,directory})=>{
    const {worker,store}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    store.close();
    fs.unlinkSync(path.join(directory,FILE));
    const restored=open();
    await assert.rejects(restored.worker.read({sourceInput}));
    await assert.rejects(restored.worker.advance({sourceInput,expectedRevision:0}));
  }));
test('Real older SQLite file restored under newer witness cannot pass exact checkpoint validation',
  async()=>withStore(async({sourceInput,open,directory})=>{
    const first=open();
    await first.worker.advance({sourceInput,expectedRevision:0});
    first.store.close();
    const filename=path.join(directory,FILE);
    const oldBytes=fs.readFileSync(filename);
    const second=open();
    await second.worker.advance({sourceInput,expectedRevision:1});
    second.store.close();
    fs.writeFileSync(filename,oldBytes);
    const third=open();
    assert.equal(third.store.checkpointDigest({sourceInput}).revision,1);
    await assert.rejects(third.worker.read({sourceInput}));
    await assert.rejects(third.worker.advance({sourceInput,expectedRevision:1}));
  }));
test('Remote witness missing after a local previous commit never allows empty rebootstrap',
  async()=>withStore(async({sourceInput,open,setRemote})=>{
    const {worker}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    setRemote(null);
    await assert.rejects(worker.inspect({sourceInput}));
    await assert.rejects(worker.advance({sourceInput,expectedRevision:0}));
  }));
test('Injected witness outage blocks all guarded reads/writes with generic error',
  async()=>withStore(async({sourceInput,open,setThrowOnLoad})=>{
    const {worker}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    setThrowOnLoad(true);
    await assert.rejects(worker.read({sourceInput}),/witness mismatch or unavailable/);
    await assert.rejects(worker.advance({sourceInput,expectedRevision:1}));
  }));
test('Changed source original digest blocks against SQLite before any witness reconciliation',
  async()=>withStore(async({sourceInput,open})=>{
    const {worker}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    sourceInput.current.convoyRecords[0].sourceDigest=hash('changed source');
    await assert.rejects(worker.read({sourceInput}));
    await assert.rejects(worker.advance({sourceInput,expectedRevision:1}));
  }));
test('Wrong source scope rejects before local checkpoint can be accepted',
  async()=>withStore(async({sourceInput,open})=>{
    const {worker}=open();
    sourceInput.current.guildId='990000000000000077';
    await assert.rejects(worker.inspect({sourceInput}));
    await assert.rejects(worker.read({sourceInput}));
  }));
test('Forged malformed witness digest or extra private fields cannot be accepted',
  async()=>withStore(async({sourceInput,open,setRemote})=>{
    const {worker}=open();await worker.advance({sourceInput,expectedRevision:0});
    for(const forged of [
      {revision:1,digest:'not-a-digest'},
      {revision:1,digest:'a'.repeat(64),token:'PRIVATE'},
      {revision:0,digest:'b'.repeat(64)},
      {revision:5,digest:'a'.repeat(64)}
    ]){
      setRemote(forged);
      await assert.rejects(worker.inspect({sourceInput}));
    }
  }));
test('A protected read detects remote witness advancing while local read is in progress',
  async()=>withStore(async({sourceInput,open,setRemote,remote})=>{
    const {store,worker}=open();
    await worker.advance({sourceInput,expectedRevision:0});
    const good=remote();
    let once=true;
    const intercept={
      checkpointDigest:x=>store.checkpointDigest(x),
      advance:x=>store.advance(x),
      read:x=>{
        const result=store.read(x);
        if(once){once=false;setRemote({revision:2,digest:'c'.repeat(64)});}
        return result;
      }
    };
    const guarded=wrap({store:intercept,
      anchor:{load:async()=>remote(),compareAndAdvance:async()=>false},
      scope:{guildId:sourceInput.current.guildId,
        forumId:sourceInput.current.currentChannelId}});
    await assert.rejects(guarded.read({sourceInput}));
    setRemote(good);
    assert.equal((await worker.read({sourceInput})).revision,1);
  }));
test('Concurrent requests on same expected revision cannot both commit an independent checkpoint',
  async()=>withStore(async({sourceInput,open,remote})=>{
    const {worker}=open();
    const all=await Promise.allSettled([
      worker.advance({sourceInput,expectedRevision:0}),
      worker.advance({sourceInput,expectedRevision:0})
    ]);
    assert.equal(all.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(all.filter(x=>x.status==='rejected').length,1);
    assert.equal(remote().revision,1);
  }));
test('Strict constructor rejects missing injected witness, wrong scope, or unusable provider',
  async()=>withStore(async({scope,anchor,open})=>{
    const {store}=open();
    assert.throws(()=>wrap({scope,store,anchor:{load:()=>null}}));
    assert.throws(()=>wrap({scope,store,anchor:null}));
    assert.throws(()=>wrap({scope:{guildId:'bad',forumId:scope.forumId},
      store,anchor}));
  }));
