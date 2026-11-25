'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {issueOwnerReceipt,verifyOwnerReceipt,createOwnerPinnedVault}
  =require('../event-capacity-owner-highwater');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const OTHER={guildId:'222222222222222222',forumId:SCOPE.forumId};
const AT='2027-03-20T12:00:00.000Z',NOW=Date.parse(AT);
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const H0={revision:0,digest:A},H1={revision:1,digest:B},
  H2={revision:2,digest:C};
function keys(){
  const kp=crypto.generateKeyPairSync('ed25519');
  return {privateKey:kp.privateKey.export({type:'pkcs8',format:'pem'}),
    publicKey:kp.publicKey.export({type:'spki',format:'pem'})};
}
function fixture(initial=H1){
  const {privateKey,publicKey}=keys();
  const receipt=issueOwnerReceipt({scope:SCOPE,checkpoint:initial,
    issuedAt:AT,privateKey});
  let current={...initial},stored={checkpoint:{...initial},
    ledger:{revision:initial.revision}},commits=0;
  const witness={load:async()=>current};
  const vault={
    read:async()=>stored,
    commitDecision:async()=>{
      commits++;
      current={revision:current.revision+1,digest:
        current.revision===0?B:C};
      stored={checkpoint:{...current},
        ledger:{revision:current.revision}};
      return {checkpoint:{...current},sha:'f'.repeat(40)};
    }
  };
  const create=(options={})=>createOwnerPinnedVault({
    vault,witness,scope:SCOPE,ownerReceipt:receipt,ownerPublicKey:publicKey,
    nowMs:()=>NOW,...options
  });
  return {create,receipt,publicKey,privateKey,
    setCurrent:value=>{current=value;},
    setStored:value=>{stored=value;},commits:()=>commits};
}
test('Offline Ed25519 owner key signs a scope-bound highwater receipt',()=>{
  const f=fixture();
  const trusted=verifyOwnerReceipt({receipt:f.receipt,
    publicKey:f.publicKey,scope:SCOPE,nowMs:NOW});
  assert.deepEqual(trusted.checkpoint,H1);
  assert.equal(trusted.issuedAt,AT);
  assert.equal(f.receipt.signature.length,88);
  assert.equal(JSON.stringify(f.receipt).includes('PRIVATE KEY'),false);
  const second=verifyOwnerReceipt({receipt:f.receipt,
    publicKey:f.publicKey,scope:SCOPE,nowMs:NOW+90*86400000});
  assert.deepEqual(second.checkpoint,H1);
});
test('Wrong public key, forged revision, scope and digest cannot validate the receipt',()=>{
  const f=fixture(),newKeys=keys();
  for(const params of [
    {publicKey:newKeys.publicKey},
    {scope:OTHER},
    {receipt:{...f.receipt,checkpoint:H2}},
    {receipt:{...f.receipt,issuedAt:'2027-03-21T12:00:00.000Z'}},
    {receipt:{...f.receipt,signature:'A'.repeat(86)+'==' }}
  ])assert.throws(()=>verifyOwnerReceipt({
    receipt:f.receipt,publicKey:f.publicKey,scope:SCOPE,nowMs:NOW,
    ...params
  }));
});
test('Malformed receipt and signatures are denied rather than trusted',()=>{
  const f=fixture();
  assert.throws(()=>verifyOwnerReceipt({scope:SCOPE,
    publicKey:f.publicKey,receipt:{...f.receipt,extra:true},nowMs:NOW}));
  assert.throws(()=>verifyOwnerReceipt({scope:SCOPE,
    publicKey:f.publicKey,receipt:{...f.receipt,checkpoint:{
      revision:-1,digest:A}},nowMs:NOW}));
  assert.throws(()=>verifyOwnerReceipt({scope:SCOPE,
    publicKey:f.publicKey,receipt:f.receipt,nowMs:NOW-120000}));
});
test('Coordinated rollback of both private GitHub repositories below owner highwater is blocked',async()=>{
  const f=fixture(H2);
  const pinned=f.create();
  assert.equal((await pinned.read()).ledger.revision,2);
  f.setCurrent({...H1});
  f.setStored({checkpoint:{...H1},ledger:{revision:1}});
  await assert.rejects(pinned.read());
  await assert.rejects(pinned.commitDecision({}));
  assert.equal(f.commits(),0);
});
test('Different digest at the same signed revision is blocked',async()=>{
  const f=fixture(H1);
  f.setCurrent({revision:1,digest:A});
  await assert.rejects(f.create().read());
  await assert.rejects(f.create().commitDecision({}));
  assert.equal(f.commits(),0);
});
test('Exactly one separately approved write succeeds, then future writes require newly signed owner receipt',async()=>{
  const f=fixture(H0),p=f.create();
  assert.equal((await p.read()).ledger.revision,0);
  const accepted=await p.commitDecision({});
  assert.equal(accepted.ownerReceiptUpdateRequired,true);
  assert.deepEqual(accepted.checkpoint,H1);
  assert.equal((await p.read()).ledger.revision,1);
  await assert.rejects(p.commitDecision({}));
  assert.equal(f.commits(),1);
});
test('Receipt floor does not certify unseen higher revisions and never fabricates latest approval',async()=>{
  const f=fixture(H1);
  f.setCurrent(H2);
  f.setStored({checkpoint:{...H2},ledger:{revision:2}});
  const p=f.create();
  assert.equal((await p.guard()).revision,2);
  assert.equal((await p.read()).ledger.revision,2);
  await assert.rejects(p.commitDecision({}));
});
test('Witness changing during read is rejected rather than returning mixed ledger state',async()=>{
  const f=fixture(H1);
  const witness={load:async()=>H1};
  let reads=0;
  const p=f.create({witness,vault:{
    read:async()=>{
      reads++;
      witness.load=async()=>H2;
      return {checkpoint:H1,ledger:{revision:1}};
    },
    commitDecision:async()=>{throw Error('unreachable');}
  }});
  await assert.rejects(p.read());
  assert.equal(reads,1);
});
test('Unsigned receipt or caller-injected owner metadata cannot authorize a write',async()=>{
  const f=fixture();
  await assert.rejects(f.create({
    ownerReceipt:{...f.receipt,signature:'B'.repeat(86)+'=='}
  }).commitDecision({}));
  assert.equal(f.commits(),0);
});
