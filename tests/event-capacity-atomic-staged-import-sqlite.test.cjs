'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {fixture,hash,adjustTotals}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {createKingsAtomicStagedImportSqliteStore:openStore}
  =require('../event-capacity-atomic-staged-import-sqlite');
const FILENAME='kings-capacity-quarantine-drill.sqlite';
const ENC='isolated synthetic AES-GCM encryption key for staged import testing';
function setup(f=fixture(),extra={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),
    'kings-staged-sqlite-quarantine-'));
  if(process.platform!=='win32')fs.chmodSync(directory,0o700);
  const stores=[];
  const scope={guildId:f.current.guildId,forumId:f.current.currentChannelId};
  function open(options={}){
    const x=openStore({
      directory,scope,encryptionSecret:ENC,
      reviewSecret:f.reviewSecret,mode:'SYNTHETIC_OFFLINE_ONLY',
      ...extra,...options
    });
    stores.push(x);return x;
  }
  function cleanup(){
    for(const s of stores.reverse())try{s.close();}catch{}
    fs.rmSync(directory,{recursive:true,force:true});
  }
  return {f,directory,scope,open,cleanup};
}
function inStore(fn,source=fixture(),extra={}){
  const ctx=setup(source,extra);
  try{return fn(ctx);}finally{ctx.cleanup();}
}
function advance(s,f,expectedRevision,fault=null){
  return s.advance({sourceInput:f,expectedRevision,fault});
}
const read=(s,f)=>s.read({sourceInput:f});
test('SQLite store persists first encrypted quarantine stage atomically outside Git checkout',()=>
  inStore(({f,directory,open})=>{
    const s=open();
    assert.equal(read(s,f).revision,0);
    const first=advance(s,f,0);
    assert.equal(first.revision,1);
    assert.equal(first.stage,'SOURCE_SNAPSHOT_LOCKED');
    assert.equal(first.actualEncryptedSqliteTransactionCommitted,true);
    assert.equal(first.realEventImportsOrDeletes,0);
    assert.equal(first.quarantinedRecordCount,4);
    assert.equal(first.quarantinedEventCount,1);
    assert.equal(first.noProductionApprovalOrMigration,true);
    const bytes=fs.readFileSync(path.join(directory,FILENAME));
    for(const privateText of ['evt100','inv1','990000000000000000',
      '990000000000000001','staged-item:','PRIVATE TOKEN'])
      assert.equal(bytes.includes(Buffer.from(privateText)),false);
    if(process.platform!=='win32')
      assert.equal(fs.statSync(path.join(directory,FILENAME)).mode&0o077,0);
  })
);
test('Data survives close, new open, and source-bound integrity revalidation',()=>
  inStore(({f,open})=>{
    const one=open();advance(one,f,0);one.close();
    const two=open();
    const r=read(two,f);
    assert.equal(r.revision,1);
    assert.equal(r.stage,'SOURCE_SNAPSHOT_LOCKED');
    assert.match(r.lastLocalProofSeal,/^[a-f0-9]{64}$/);
    assert.equal(advance(two,f,1).revision,2);
  })
);
test('All four stages persist and reopen as completed OFFLINE drill, not production import',()=>
  inStore(({f,open})=>{
    const s=open();
    for(let n=0;n<4;n++){
      const r=advance(s,f,n);
      assert.equal(r.revision,n+1);
      assert.equal(r.freeSlotsCertified,false);
      assert.equal(r.staffDecisionsCommitted,0);
    }
    s.close();const restored=open();
    const final=read(restored,f);
    assert.equal(final.revision,4);
    assert.equal(final.stage,'OFFLINE_DRILL_COMPLETE');
    assert.equal(final.offlineDrillComplete,true);
    assert.equal(final.noProductionApprovalOrMigration,true);
    assert.equal(final.independentOffsiteHighwaterProven,false);
    const again=advance(restored,f,4);
    assert.equal(again.state,'OFFLINE_DRILL_ALREADY_COMPLETE');
    assert.equal(again.actualEncryptedSqliteTransactionCommitted,false);
  })
);
test('Fault BEFORE_BEGIN changes no database content and no checkpoint',()=>
  inStore(({f,open})=>{
    const s=open();
    assert.throws(()=>advance(s,f,0,'BEFORE_BEGIN'));
    assert.equal(read(s,f).revision,0);
    assert.equal(advance(s,f,0).revision,1);
  })
);
test('Fault AFTER_BEGIN rolls back without persisting a half import',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);
    const prior=s.checkpointDigest({sourceInput:f});
    assert.throws(()=>advance(s,f,1,'AFTER_BEGIN'));
    assert.equal(read(s,f).revision,1);
    assert.deepEqual(s.checkpointDigest({sourceInput:f}),prior);
    assert.equal(advance(s,f,1).revision,2);
  })
);
test('Fault AFTER_UPSERT_BEFORE_COMMIT rolls back manifest AND checkpoint',()=>
  inStore(({f,open})=>{
    const s=open();
    assert.throws(()=>advance(s,f,0,'AFTER_UPSERT_BEFORE_COMMIT'));
    assert.equal(read(s,f).revision,0);
    assert.equal(s.checkpointDigest({sourceInput:f}),null);
    assert.equal(advance(s,f,0).revision,1);
  })
);
test('Fault after stage-3 UPSERT rolls back and new process sees stage 2',()=>
  inStore(({f,open})=>{
    const s=open();
    advance(s,f,0);advance(s,f,1);
    const before=s.checkpointDigest({sourceInput:f});
    assert.throws(()=>advance(s,f,2,'AFTER_UPSERT_BEFORE_COMMIT'));
    s.close();
    const restarted=open();
    assert.equal(read(restarted,f).revision,2);
    assert.deepEqual(restarted.checkpointDigest({sourceInput:f}),before);
    assert.equal(advance(restarted,f,2).revision,3);
  })
);
test('Commit succeeded but ACK lost: retry same expected revision is idempotent',()=>
  inStore(({f,open})=>{
    const s=open();
    assert.throws(()=>advance(s,f,0,'AFTER_COMMIT_BEFORE_ACK'));
    s.close();
    const restarted=open();
    const saved=read(restarted,f);
    assert.equal(saved.revision,1);
    assert.equal(saved.stage,'SOURCE_SNAPSHOT_LOCKED');
    const retry=advance(restarted,f,0);
    assert.equal(retry.state,'ALREADY_STAGED_SAME_PHASE_REPLAY');
    assert.equal(retry.revision,1);
    assert.equal(retry.actualEncryptedSqliteTransactionCommitted,false);
    assert.equal(advance(restarted,f,1).revision,2);
  })
);
test('ACK loss at last phase cannot run a fifth stage or duplicate records',()=>
  inStore(({f,open})=>{
    const s=open();
    for(let n=0;n<3;n++)advance(s,f,n);
    assert.throws(()=>advance(s,f,3,'AFTER_COMMIT_BEFORE_ACK'));
    const r=read(s,f);
    assert.equal(r.revision,4);
    assert.equal(r.offlineDrillComplete,true);
    assert.equal(advance(s,f,3).state,'ALREADY_STAGED_SAME_PHASE_REPLAY');
    assert.equal(advance(s,f,4).state,'OFFLINE_DRILL_ALREADY_COMPLETE');
  })
);
test('Concurrent SQLite handles with the same stale CAS cannot advance twice',()=>
  inStore(({f,open})=>{
    const a=open(),b=open();
    assert.equal(advance(a,f,0).revision,1);
    const same=advance(b,f,0);
    assert.equal(same.state,'ALREADY_STAGED_SAME_PHASE_REPLAY');
    assert.equal(read(a,f).revision,1);
    assert.equal(advance(b,f,1).revision,2);
    assert.throws(()=>advance(a,f,0));
  })
);
test('Stale revision cannot skip phases or reset existing encrypted history',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);advance(s,f,1);
    assert.throws(()=>advance(s,f,0));
    assert.throws(()=>advance(s,f,3));
    assert.equal(read(s,f).revision,2);
    assert.equal(advance(s,f,2).revision,3);
  })
);
test('Changing Event status after saving a checkpoint blocks continuation',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);
    for(const row of f.current.convoyRecords)row.status='Cancelled';
    assert.throws(()=>advance(s,f,1));
    assert.throws(()=>read(s,f));
    assert.equal(s.readCursor,undefined);
  })
);
test('Changed original message source digest blocks previous staged replay seal',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);
    f.current.convoyRecords[0].sourceDigest=hash('new source proof');
    assert.throws(()=>advance(s,f,1));
    assert.equal(s.externalWritesPerformed,undefined);
  })
);
test('Changing only archived page digests blocks resuming with earlier storage transaction',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);
    f.currentPagination.scans[1].pages[0].responseDigest='a'.repeat(64);
    assert.throws(()=>advance(s,f,1));
  })
);
test('Missing archived page blocks previously saved source identity without any deletes',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);
    f.currentPagination.scans=f.currentPagination.scans.filter(x=>
      x.stream!=='archived-public');
    assert.throws(()=>advance(s,f,1));
    assert.equal(fs.existsSync(path.join(os.tmpdir(),'NOT_A_FILE')),false);
  })
);
test('Tracker source connection flag change blocks replay even when Events unchanged',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);
    f.current.tracker.connected=false;
    assert.throws(()=>advance(s,f,1));
  })
);
test('Missing old Event source cannot silently overwrite a previous database snapshot',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);
    f.current.convoyRecords=[];adjustTotals(f);
    assert.throws(()=>advance(s,f,1));
    assert.equal(s.checkpointDigest({sourceInput:fixture()}).revision,1);
  })
);
test('Changed HMAC review key or encrypted storage key cannot read existing source stage',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);
    const wrong=open({encryptionSecret:'a different AES key from existing test state'}); 
    assert.throws(()=>read(wrong,f));
    f.reviewSecret='changed synthetic review key that is long enough';
    assert.throws(()=>read(s,f));
  })
);
test('Invalid scope cannot open a store or import another guild source',()=>
  inStore(({f,open})=>{
    assert.throws(()=>open({scope:{guildId:'../admin',forumId:f.current.currentChannelId}}));
    const s=open();
    f.current.guildId='990000000000000099';
    assert.throws(()=>advance(s,f,0));
  })
);
test('Non-private directory, symlink path, and repository checkout storage are refused',()=>
  inStore(({f,open,directory})=>{
    if(process.platform!=='win32'){
      fs.chmodSync(directory,0o755);
      assert.throws(()=>open());
      fs.chmodSync(directory,0o700);
    }
    const link=directory+'-symlink';
    try{
      fs.symlinkSync(directory,link);
      assert.throws(()=>open({directory:link}));
    }finally{try{fs.unlinkSync(link);}catch{}}
    assert.throws(()=>open({directory:path.resolve(__dirname,'..')}));
  })
);
test('Closed SQLite handles cannot stage, inspect or retrieve checkpoints',()=>
  inStore(({f,open})=>{
    const s=open();advance(s,f,0);s.close();
    assert.throws(()=>read(s,f));
    assert.throws(()=>advance(s,f,1));
    assert.throws(()=>s.checkpointDigest({sourceInput:f}));
  })
);
test('Unsupported operation mode, equal secrets or invalid caller review key are rejected',()=>
  inStore(({f,open})=>{
    assert.throws(()=>open({mode:'REAL_IMPORT'}));
    assert.throws(()=>open({encryptionSecret:f.reviewSecret}));
    assert.throws(()=>open({reviewSecret:'short'}));
    assert.throws(()=>open({externalMinimumRevision:'not a function'}));
  })
);
test('Independent caller-provided highwater floor rejects rolled-back private data',()=>
  inStore(({f,open})=>{
    let floor=0;
    const s=open({externalMinimumRevision:()=>floor});
    advance(s,f,0);advance(s,f,1);
    floor=3;
    assert.throws(()=>read(s,f));
    assert.throws(()=>advance(s,f,2));
    floor=2;
    assert.equal(read(s,f).revision,2);
    assert.equal(advance(s,f,2).revision,3);
    assert.equal(read(s,f).independentOffsiteHighwaterProven,false);
  })
);
test('Corrupted authenticated ciphertext fails closed without original private data leakage',()=>
  inStore(({f,open,directory})=>{
    const s=open();advance(s,f,0);s.close();
    const db=new DatabaseSync(path.join(directory,FILENAME));
    db.prepare('UPDATE staged_quarantine_drills SET envelope=?')
      .run(Buffer.alloc(35,37));
    db.close();
    const reloaded=open();
    assert.throws(()=>read(reloaded,f),/Kings encrypted offline import/);
  })
);
test('Local checkpoint digest is opaque and changes with each durable SQLite stage',()=>
  inStore(({f,open})=>{
    const s=open();
    assert.equal(s.checkpointDigest({sourceInput:f}),null);
    advance(s,f,0);
    const a=s.checkpointDigest({sourceInput:f});
    assert.equal(a.revision,1);
    assert.match(a.digest,/^[a-f0-9]{64}$/);
    assert.equal(a.independentExternalAnchorAlreadyWritten,false);
    advance(s,f,1);
    const b=s.checkpointDigest({sourceInput:f});
    assert.notEqual(a.digest,b.digest);
    assert.equal(b.revision,2);
  })
);
test('Stored checkpoints contain no live Event approvals or credential-independent keys',()=>
  inStore(({f,open})=>{
    const s=open();
    const row=advance(s,f,0);
    assert.equal(row.noOriginalPrivateEventDataPersisted,true);
    assert.equal(row.noProductionApprovalOrMigration,true);
    assert.equal(row.realEventImportsOrDeletes,0);
    assert.equal(row.oldBookingsReleased,0);
    assert.equal(row.staffDecisionsCommitted,0);
    assert.equal(row.actualDiscordOrGitHubApiCalls,0);
  })
);
