'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {issueHistoricalArchivePinOffline}
  =require('../event-capacity-historical-github-reader');
const {inspectHistoricalOwnerReceiptContinuity}
  =require('../event-capacity-historical-owner-receipt-audit');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
function audit(x,changes={}){
  return inspectHistoricalOwnerReceiptContinuity({
    journal:x.afterJournal,
    receipts:[x.previousOwnerReceipt,x.nextOwnerReceipt],
    expectedCheckpoint:x.next.checkpoint,
    scope:SCOPE,ownerPublicKey:x.ownerPublicKey,nowMs:NOW,...changes
  });
}
test('Two owner-signed archive versions bind to the exact historical transition tips',()=>{
  const x=setup(),out=audit(x);
  assert.equal(out.state,'Signed Receipt Sequence Structurally Verified');
  assert.equal(out.validatedOwnerReceipts,2);
  assert.equal(out.historicalTransitions,2);
  assert.equal(out.missingIntermediateReceiptCount,0);
  assert.equal(out.latestOwnerReceiptMatchesJournal,true);
  assert.equal(out.suppliedCheckpointMatchesLatestReceipt,true);
  assert.equal(out.externalOwnerReceiptCustodyAuthenticated,false);
  assert.equal(out.latestIndependentOwnerHighwaterVerified,false);
  assert.equal(out.historicalCoverageCertified,false);
  assert.equal(out.freeSlotsCertified,false);
  assert.doesNotMatch(JSON.stringify(out),/event:100|Partner Convoy/);
});
test('Missing latest offline owner signature never implies a current highwater',()=>{
  const x=setup(),out=audit(x,{receipts:[x.previousOwnerReceipt]});
  assert.equal(out.state,'Latest Signed Receipt Missing');
  assert.equal(out.missingIntermediateReceiptCount,1);
  assert.deepEqual(out.firstMissingRevisionNumbers,[2]);
  assert.equal(out.latestOwnerReceiptMatchesJournal,false);
  assert.equal(out.freeSlotsCertified,false);
});
test('Only the latest retained owner receipt does not prove an unbroken receipt sequence',()=>{
  const x=setup(),out=audit(x,{receipts:[x.nextOwnerReceipt]});
  assert.equal(out.validatedOwnerReceipts,1);
  assert.equal(out.latestOwnerReceiptMatchesJournal,true);
  assert.equal(out.missingIntermediateReceiptCount,1);
  assert.deepEqual(out.firstMissingRevisionNumbers,[1]);
  assert.equal(out.latestIndependentOwnerHighwaterVerified,false);
});
test('Zero receipts cannot establish independently held historical highwater',()=>{
  const x=setup(),out=audit(x,{receipts:[]});
  assert.equal(out.state,'No Independently Supplied Receipts');
  assert.equal(out.validatedOwnerReceipts,0);
  assert.equal(out.missingIntermediateReceiptCount,2);
  assert.equal(out.suppliedCheckpointMatchesLatestReceipt,false);
});
test('Old or forged supplied highwater cannot be misreported as latest confirmed',()=>{
  const x=setup();
  const old=audit(x,{expectedCheckpoint:x.prior.checkpoint});
  assert.equal(old.suppliedCheckpointMatchesLatestReceipt,false);
  assert.equal(old.state,'External Checkpoint Confirmation Missing');
  const bad=audit(x,{expectedCheckpoint:{...x.next.checkpoint,
    archiveDigest:'0'.repeat(64)}});
  assert.equal(bad.suppliedCheckpointMatchesLatestReceipt,false);
});
test('Out-of-order, duplicate, future and revision-out-of-range receipts fail closed',()=>{
  const x=setup();
  for(const receipts of [
    [x.nextOwnerReceipt,x.previousOwnerReceipt],
    [x.previousOwnerReceipt,x.previousOwnerReceipt],
    [x.nextOwnerReceipt,x.nextOwnerReceipt],
    [x.previousOwnerReceipt,{...x.nextOwnerReceipt,
      payload:{...x.nextOwnerReceipt.payload,revision:3}}]
  ])assert.throws(()=>audit(x,{receipts}));
  const future=issueHistoricalArchivePinOffline({scope:SCOPE,
    checkpoint:x.next.checkpoint,ownerPrivateKey:x.ownerPrivateKey,
    issuedAt:'2027-06-18T10:00:00.000Z'});
  assert.throws(()=>audit(x,{receipts:[future]}));
});
test('Tampered owner signature, receipt scope and signing key are refused',()=>{
  const x=setup();
  const bad=structuredClone(x.nextOwnerReceipt);
  bad.payload.tip='0'.repeat(64);
  assert.throws(()=>audit(x,{receipts:[bad]}));
  assert.throws(()=>audit(x,{scope:{guildId:'999999999999999999',
    forumId:SCOPE.forumId}}));
  const attacker=crypto.generateKeyPairSync('ed25519');
  const attackerPublic=attacker.publicKey.export({type:'spki',format:'pem'});
  assert.throws(()=>audit(x,{ownerPublicKey:attackerPublic}));
});
test('Signed owner pin for an unrelated historical tip or tampered journal is rejected',()=>{
  const x=setup();
  const wrong=issueHistoricalArchivePinOffline({scope:SCOPE,
    checkpoint:{...x.next.checkpoint,tip:'0'.repeat(64)},
    issuedAt:'2027-05-18T10:00:00.000Z',ownerPrivateKey:x.ownerPrivateKey});
  assert.throws(()=>audit(x,{receipts:[x.previousOwnerReceipt,wrong]}));
  assert.throws(()=>audit(x,{journal:{...x.afterJournal,tip:'0'.repeat(64)}}));
});
test('No private Ed25519 signing key or real Event identity is required by read-only audit',()=>{
  const x=setup();
  const out=audit(x);
  assert.equal(out.automaticApproval,false);
  assert.equal(out.readOnly,true);
  assert.equal(JSON.stringify(out).includes(x.ownerPrivateKey),false);
  assert.equal(JSON.stringify(out).includes('event:100'),false);
  assert.equal(JSON.stringify(out).includes('thread:700000000000000100'),false);
});
