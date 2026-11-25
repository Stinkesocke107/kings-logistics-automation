'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createExternallyAnchoredSnapshotStore,checkpoint}
  =require('../event-capacity-external-anchor');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const HASH1='a'.repeat(64),HASH2='b'.repeat(64),HASH3='c'.repeat(64);
function make({local=null,remote=null,failAnchor=false,failBeforeCommit=false}={}){
  let record=local,held=remote,commits=0,reads=0;
  const store={
    checkpoint:()=>record,
    readCursor:()=>record?{runId:String(record.revision+100000),attempt:1,ledgerRevision:0}:null,
    readLatest:()=>record?{privateSource:true}:null,
    commitSnapshot:()=>{
      commits++;
      if(failBeforeCommit)return false;
      record={revision:(record?.revision||0)+1,
        digest:[HASH1,HASH2,HASH3][record?.revision||0]};
      return true;
    }
  };
  const anchor={
    load:({scope})=>{reads++;assert.deepEqual(scope,SCOPE);return held;},
    compareAndAdvance:({scope,expected,next})=>{
      assert.deepEqual(scope,SCOPE);
      if(failAnchor||JSON.stringify(expected)!==JSON.stringify(held))return false;
      held=next;return true;
    }
  };
  return {wrapped:createExternallyAnchoredSnapshotStore({store,anchor,scope:SCOPE}),
    local:()=>record,remote:()=>held,localRollback:()=>{record=null;},
    replaceLocal:value=>{record=value;},commitCount:()=>commits,anchorLoads:()=>reads};
}
test('Independent trusted anchor accepts first protected snapshot and verifies both copies',async()=>{
  const h=make();
  assert.equal(await h.wrapped.readLatest(),null);
  assert.equal(await h.wrapped.commitSnapshot({scope:SCOPE}),true);
  assert.deepEqual(h.local(),h.remote());
  assert.equal((await h.wrapped.readLatest()).privateSource,true);
  assert.equal((await h.wrapped.readCursor()).runId,'100001');
});
test('External anchor CAS advances on each verified encrypted snapshot revision',async()=>{
  const h=make();
  await h.wrapped.commitSnapshot({scope:SCOPE});
  await h.wrapped.commitSnapshot({scope:SCOPE});
  assert.equal(h.local().revision,2);
  assert.deepEqual(h.local(),h.remote());
});
test('An unauthorized scope never reaches the local database',async()=>{
  const h=make();
  await assert.rejects(h.wrapped.commitSnapshot({scope:{
    guildId:'222222222222222222',forumId:SCOPE.forumId
  }}));
  assert.equal(h.commitCount(),0);
});
test('SQLite write failed without advancing the external checkpoint',async()=>{
  const h=make({failBeforeCommit:true});
  assert.equal(await h.wrapped.commitSnapshot({scope:SCOPE}),false);
  assert.equal(h.remote(),null);
  assert.equal(h.local(),null);
});
test('Crash gap after SQLite commits but before independent checkpoint blocks all reads and writes',async()=>{
  const h=make({failAnchor:true});
  await assert.rejects(h.wrapped.commitSnapshot({scope:SCOPE}));
  assert.equal(h.local().revision,1);
  assert.equal(h.remote(),null);
  await assert.rejects(h.wrapped.readLatest());
  await assert.rejects(h.wrapped.readCursor());
  await assert.rejects(h.wrapped.commitSnapshot({scope:SCOPE}));
  assert.equal(h.commitCount(),1);
});
test('Old restored database under newer external checkpoint is rejected',async()=>{
  const h=make({local:{revision:1,digest:HASH1},remote:{revision:2,digest:HASH2}});
  await assert.rejects(h.wrapped.readLatest());
  assert.equal(h.commitCount(),0);
});
test('Same revision but different ciphertext digest is rejected',async()=>{
  const h=make({local:{revision:1,digest:HASH1},remote:{revision:1,digest:HASH2}});
  await assert.rejects(h.wrapped.readLatest());
  await assert.rejects(h.wrapped.commitSnapshot({scope:SCOPE}));
});
test('Missing local or remote checkpoint is never trusted after bootstrap',async()=>{
  await assert.rejects(make({local:{revision:1,digest:HASH1}}).wrapped.readLatest());
  await assert.rejects(make({remote:{revision:1,digest:HASH1}}).wrapped.readCursor());
});
test('The checkpoint contract rejects invalid digest and rollback proof',()=>{
  assert.deepEqual(checkpoint({revision:1,digest:HASH1}),{
    revision:1,digest:HASH1
  });
  assert.throws(()=>checkpoint({revision:0,digest:HASH1}));
  assert.throws(()=>checkpoint({revision:1,digest:'bad'}));
  assert.throws(()=>checkpoint({revision:1,digest:HASH1,privateData:'leaked'}));
});

test('Protected reads fail closed if source revision changes during the read',async()=>{
  const original={revision:1,digest:HASH1};
  let local={...original},remote={...original};
  const wrapped=createExternallyAnchoredSnapshotStore({
    scope:SCOPE,
    store:{
      checkpoint:async()=>local,
      readCursor:async()=>{
        local={revision:2,digest:HASH2};remote={revision:2,digest:HASH2};
        return {runId:'100002',attempt:1,ledgerRevision:0};
      },
      readLatest:async()=>{
        local={revision:2,digest:HASH2};remote={revision:2,digest:HASH2};
        return {privateSnapshot:true};
      },
      commitSnapshot:async()=>true
    },
    anchor:{load:async()=>remote,compareAndAdvance:async()=>true}
  });
  await assert.rejects(wrapped.readCursor());
  local={...original};remote={...original};
  await assert.rejects(wrapped.readLatest());
});
