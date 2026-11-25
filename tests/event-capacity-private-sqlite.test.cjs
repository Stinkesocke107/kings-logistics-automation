'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createEmptyLedger}=require('../event-capacity-decision-ledger');
const {signPrivateSnapshot}=require('../event-capacity-snapshot-attestation');
const {createPrivateSqliteSnapshotStore}=require('../event-capacity-private-sqlite');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const SECRET='synthetic-only-at-rest-secret-not-for-production-abcdefgh';
const SIGN='synthetic-only-signature-secret-not-for-production-1234567';
const NOW=Date.parse('2027-03-20T12:00:00Z');
const RUN='45502949674';
function fixture(runId=RUN,ledgerRevision=0){
  const ledger=createEmptyLedger(SCOPE,'2027-03-20T11:40:00Z');
  if(ledgerRevision!==0)throw Error('Only revision zero in synthetic fixture');
  const snapshot={
    integrityVerified:true,
    report:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:0,actualConvoys:0},threads:[]},
    overview:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{convoyReadErrors:0,realConvoySubmissions:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[]},
    ledger
  };
  snapshot.attestation=signPrivateSnapshot(snapshot,{
    scope:SCOPE,secret:SIGN,runId,attempt:1,nowMs:NOW,trustedProducer:true
  });
  return {
    scope:SCOPE,expected:null,
    next:{runId,attempt:1,ledgerRevision:0},
    snapshot,metadata:{runId,attempt:1,ledgerRevision:0,sourceVerified:true}
  };
}
function isolated(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kings-private-sqlite-test-'));
  fs.chmodSync(root,0o700);
  const stores=[];
  const open=(extra={})=>{
    const store=createPrivateSqliteSnapshotStore({
      directory:root,scope:SCOPE,encryptionSecret:SECRET,signingSecret:SIGN,
      nowMs:()=>NOW,...extra
    });
    stores.push(store);return store;
  };
  try{return fn(root,open);}finally{
    for(const s of stores.reverse())try{s.close();}catch{}
    fs.rmSync(root,{recursive:true,force:true});
  }
}
test('Private encrypted SQLite stores signed snapshot and cursor in one durable transaction',()=>isolated((root,open)=>{
  const store=open();
  assert.equal(store.readCursor(),null);
  assert.equal(store.readLatest(),null);
  assert.equal(store.commitSnapshot(fixture()),true);
  assert.deepEqual(store.readCursor(),fixture().next);
  const saved=store.readLatest();
  assert.equal(saved.metadata.sourceVerified,true);
  assert.equal(saved.snapshot.attestation.runId,RUN);
  assert.equal(saved.revision,1);
  assert.equal(store.checkpoint().revision,1);
  const bytes=fs.readFileSync(path.join(root,'event-capacity-snapshots.sqlite'));
  assert.equal(bytes.includes(Buffer.from('synthetic-only-at-rest')),false);
  assert.equal(bytes.includes(Buffer.from('registeredConvoys')),false);
  assert.equal(bytes.includes(Buffer.from(RUN)),false);
  assert.equal(bytes.includes(Buffer.from(SCOPE.guildId)),false);
  if(process.platform!=='win32')
    assert.equal(fs.statSync(path.join(root,'event-capacity-snapshots.sqlite')).mode&0o077,0);
}));
test('Closed and reopened store retains one consistent cursor and encrypted snapshot',()=>isolated((root,open)=>{
  const first=open();assert.equal(first.commitSnapshot(fixture()),true);first.close();
  const second=open();
  assert.equal(second.readLatest().revision,1);
  assert.deepEqual(second.readCursor(),fixture().next);
}));
test('Invalid, stale, or mismatched CAS cannot advance cursor or replace source data',()=>isolated((root,open)=>{
  const store=open(),data=fixture();
  assert.equal(store.commitSnapshot(data),true);
  const stale=fixture(String(BigInt(RUN)+1n));
  assert.equal(store.commitSnapshot(stale),false);
  assert.equal(store.readLatest().revision,1);
  assert.throws(()=>store.commitSnapshot({...stale,expected:data.next,
    next:{...stale.next,runId:RUN}}));
  assert.throws(()=>store.commitSnapshot({...stale,expected:data.next,
    snapshot:{...stale.snapshot,integrityVerified:false}}));
  assert.equal(store.readLatest().revision,1);
}));
test('Monotonic imports commit new encrypted payload and cursor together',()=>isolated((root,open)=>{
  const store=open(),first=fixture();
  assert.equal(store.commitSnapshot(first),true);
  const second=fixture(String(BigInt(RUN)+1n));
  assert.equal(store.commitSnapshot({...second,expected:first.next}),true);
  assert.equal(store.readLatest().revision,2);
  assert.deepEqual(store.readCursor(),second.next);
  assert.throws(()=>store.commitSnapshot({...first,expected:second.next}));
}));
test('Authenticated snapshot rejects different signing secret and tampered source',()=>isolated((root,open)=>{
  const store=open(),data=fixture();
  assert.throws(()=>store.commitSnapshot({...data,snapshot:{
    ...data.snapshot,report:{...data.snapshot.report,threads:[{private:'tampered'}]}
  }}));
  assert.equal(store.readCursor(),null);
  const wrong=open({signingSecret:'a-different-synthetic-signature-secret-0123456789'});
  assert.throws(()=>wrong.commitSnapshot(data));
}));
test('Wrong storage key or scope cannot read previously written private data',()=>isolated((root,open)=>{
  const store=open();
  store.commitSnapshot(fixture());
  const key=open({encryptionSecret:'completely-different-synthetic-storage-key-123456'});
  assert.throws(()=>key.readCursor());
  const scope=open({scope:{guildId:'222222222222222222',forumId:SCOPE.forumId}});
  assert.equal(scope.readCursor(),null);
  assert.throws(()=>scope.commitSnapshot(fixture()));
}));
test('Independent rollback floor refuses a restored older database revision',()=>isolated((root,open)=>{
  const store=open();
  store.commitSnapshot(fixture());
  const floor=open({externalMinimumRevision:()=>2});
  assert.throws(()=>floor.readCursor());
  assert.throws(()=>floor.readLatest());
  const fair=open({externalMinimumRevision:()=>1});
  assert.equal(fair.readLatest().revision,1);
}));
test('Expired source may retain cursor but must never be advertised as current',()=>isolated((root,open)=>{
  const store=open();
  store.commitSnapshot(fixture());
  const later=open({nowMs:()=>NOW+3600*1000});
  assert.deepEqual(later.readCursor(),fixture().next);
  assert.throws(()=>later.readLatest());
}));
test('Reject private directory inside repo and non-private or symlinked directory',()=>isolated((root,open)=>{
  assert.throws(()=>open({directory:path.resolve(__dirname,'..')}));
  const sub=path.join(root,'open');fs.mkdirSync(sub,{mode:0o700});fs.chmodSync(sub,0o755);
  if(process.platform!=='win32')assert.throws(()=>open({directory:sub}));
  const link=path.join(root,'link');fs.symlinkSync(root,link,'dir');
  assert.throws(()=>open({directory:link}));
}));
test('Reject permissive or symlinked SQLite state file',()=>isolated((root,open)=>{
  const store=open();
  store.commitSnapshot(fixture());store.close();
  const filename=path.join(root,'event-capacity-snapshots.sqlite');
  if(process.platform!=='win32'){
    fs.chmodSync(filename,0o644);
    assert.throws(()=>open());
    fs.chmodSync(filename,0o600);
  }
  const target=path.join(root,'alternate.sqlite');
  fs.renameSync(filename,target);
  fs.symlinkSync(target,filename);
  assert.throws(()=>open());
}));
test('Must not confuse public repository with private durable storage',()=>isolated((root,open)=>{
  assert.throws(()=>open({directory:'relative/path'}));
  assert.throws(()=>open({encryptionSecret:'short'}));
  assert.throws(()=>open({signingSecret:SECRET,encryptionSecret:SECRET}));
  assert.throws(()=>open({externalMinimumRevision:()=>NaN}).readCursor());
}));
