'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPrivateCapacitySnapshotReader}
  =require('../event-capacity-snapshot-provider');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const snapshot={integrityVerified:true,
  attestation:{scope:SCOPE,runId:'45502949674',attempt:1},
  report:{threads:[]},overview:{registeredConvoys:[]},ledger:{revision:0}};
const latest={snapshot,metadata:{runId:'45502949674',sourceVerified:true}};
test('Verified private source is passed to signed reader after exact scope check',async()=>{
  let calls=0;
  const reader=createPrivateCapacitySnapshotReader({scope:SCOPE,
    store:{readLatest:()=>{calls++;return latest;}}});
  assert.equal(await reader(SCOPE),snapshot);
  assert.equal(calls,1);
});
test('Wrong guild or forum fails before private storage is accessed',async()=>{
  let calls=0;
  const reader=createPrivateCapacitySnapshotReader({scope:SCOPE,
    store:{readLatest:()=>{calls++;return latest;}}});
  await assert.rejects(reader({...SCOPE,guildId:'222222222222222222'}));
  await assert.rejects(reader({...SCOPE,forumId:'222222222222222222'}));
  assert.equal(calls,0);
});
test('Missing, stale, out-of-scope or unauthenticated source refuses a read',async()=>{
  const make=value=>createPrivateCapacitySnapshotReader({scope:SCOPE,
    store:{readLatest:()=>value}});
  await assert.rejects(make(null)(SCOPE));
  await assert.rejects(make({...latest,metadata:{sourceVerified:false}})(SCOPE));
  await assert.rejects(make({...latest,snapshot:{...snapshot,integrityVerified:false}})(SCOPE));
  await assert.rejects(make({...latest,snapshot:{...snapshot,
    attestation:{...snapshot.attestation,scope:{...SCOPE,forumId:'222222222222222222'}}}})(SCOPE));
});
test('Storage failures never expose private event or secret text',async()=>{
  const reader=createPrivateCapacitySnapshotReader({scope:SCOPE,
    store:{readLatest:()=>{throw Error('private route / secret auth token');}}});
  await assert.rejects(reader(SCOPE),e=>{
    assert.equal(String(e).includes('private route'),false);
    assert.equal(String(e).includes('auth token'),false);
    return true;
  });
});
test('Malformed configuration cannot create a protected source reader',()=>{
  assert.throws(()=>createPrivateCapacitySnapshotReader({scope:SCOPE,store:{}}));
  assert.throws(()=>createPrivateCapacitySnapshotReader({scope:{...SCOPE,guildId:'bad'},
    store:{readLatest:()=>latest}}));
});

test('Asynchronous independent checkpoint service must complete before source is returned',async()=>{
  let requested=0;
  const reader=createPrivateCapacitySnapshotReader({scope:SCOPE,
    store:{readLatest:async()=>{requested++;return latest;}}});
  assert.equal(await reader(SCOPE),snapshot);
  assert.equal(requested,1);
});
test('Asynchronous rejected external checkpoint is sanitized without leaking private source',async()=>{
  const reader=createPrivateCapacitySnapshotReader({scope:SCOPE,
    store:{readLatest:async()=>{throw Error('PRIVATE-ANCHOR-SECRET-DO-NOT-LEAK');}}});
  await assert.rejects(reader(SCOPE),err=>
    !String(err).includes('PRIVATE-ANCHOR-SECRET-DO-NOT-LEAK'));
});
