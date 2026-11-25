'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {issueHistoricalArchivePinOffline}=require('../event-capacity-historical-github-reader');
const {createHistoricalArchiveRecoveryInspector}
  =require('../event-capacity-historical-github-recovery');
const repo='kings-private-example/historical-decisions';
const scope={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const token='synthetic-no-real-credentials-readwrite-private-token';
const encryptionSecret='synthetic private encryption secret for test only and never production';
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
function inspector(x,overrides={}){
  return createHistoricalArchiveRecoveryInspector({repository:repo,scope,token,
    ownerPublicKey:x.ownerPublicKey,previousOwnerReceipt:x.previousOwnerReceipt,
    nextOwnerReceipt:x.nextOwnerReceipt,encryptionSecret,
    transport:x.transport,nowMs:()=>NOW,...overrides});
}
function assertUncertified(value){
  assert.equal(value.readOnly,true);
  assert.equal(value.humanReconciliationRequired,true);
  assert.equal(value.originalSourceVerified,false);
  assert.equal(value.historicalCoverageCertified,false);
  assert.equal(value.freeSlotsCertified,false);
}
test('Old verified archive observed: never retries an uncommitted candidate',async()=>{
  const x=setup();
  const result=await inspector(x).inspect();
  assert.equal(result.state,'PREVIOUS_ARCHIVE_OBSERVED_REVIEW_STAGED_SEGMENTS');
  assert.equal(result.observedRevision,1);
  assertUncertified(result);
  assert.equal(x.calls.filter(x=>x.method==='PUT').length,0);
});
test('Completed candidate archive still requires independent retained owner highwater',async()=>{
  const x=setup();await x.writer().commitOne({archive:x.next.archive});
  const count=x.calls.filter(x=>x.method==='PUT').length;
  const result=await inspector(x).inspect();
  assert.equal(result.state,'CANDIDATE_ARCHIVED_OWNER_HIGHWATER_PENDING');
  assert.equal(result.observedRevision,2);
  assert.equal(result.ownerHighwaterUpdateRequired,true);
  assertUncertified(result);
  assert.equal(x.calls.filter(x=>x.method==='PUT').length,count);
});
test('Ambiguous remote commit detected as new archive without rerun or rollback',async()=>{
  const x=setup();x.setAmbiguous();
  await assert.rejects(x.writer().commitOne({archive:x.next.archive}));
  const count=x.calls.filter(x=>x.method==='PUT').length;
  const result=await inspector(x).inspect();
  assert.equal(result.state,'CANDIDATE_ARCHIVED_OWNER_HIGHWATER_PENDING');
  assertUncertified(result);
  assert.equal(x.calls.filter(x=>x.method==='PUT').length,count);
});
test('Failed segment stage is reported only as previously observed',async()=>{
  const x=setup();x.setDenySegments();
  await assert.rejects(x.writer().commitOne({archive:x.next.archive}));
  const before=x.calls.filter(x=>x.method==='PUT').length;
  const result=await inspector(x).inspect();
  assert.equal(result.state,'PREVIOUS_ARCHIVE_OBSERVED_REVIEW_STAGED_SEGMENTS');
  assertUncertified(result);
  assert.equal(x.calls.filter(x=>x.method==='PUT').length,before);
});
test('CAS collision never triggers a repair write',async()=>{
  const x=setup();x.setConflict();
  await assert.rejects(x.writer().commitOne({archive:x.next.archive}));
  const before=x.calls.filter(x=>x.method==='PUT').length;
  assert.equal((await inspector(x).inspect()).state,
    'PREVIOUS_ARCHIVE_OBSERVED_REVIEW_STAGED_SEGMENTS');
  assert.equal(x.calls.filter(x=>x.method==='PUT').length,before);
});
test('Unreachable store has unknown status, not a false empty archive',async()=>{
  const x=setup();
  const result=await inspector(x,{transport:async()=>{throw new Error('secret');}}).inspect();
  assert.equal(result.state,'RECONCILIATION_REQUIRED');
  assert.equal(result.observedRevision,null);
  assertUncertified(result);
});
test('Forged receipt rejected before any fetch',async()=>{
  const x=setup(),bad=structuredClone(x.nextOwnerReceipt);
  bad.payload.tip='0'.repeat(64);
  await assert.rejects(inspector(x,{nextOwnerReceipt:bad}).inspect());
  assert.equal(x.calls.length,0);
});
test('Public repository cannot be mistaken for verified prior or next archive',async()=>{
  const x=setup();x.setPublic();
  const result=await inspector(x).inspect();
  assert.equal(result.state,'RECONCILIATION_REQUIRED');
  assertUncertified(result);
});

test('New archive must extend the exact owner-signed previous tip, not any old revision',async()=>{
  const x=setup();await x.writer().commitOne({archive:x.next.archive});
  const wrong=issueHistoricalArchivePinOffline({scope,
    checkpoint:{...x.prior.checkpoint,tip:'0'.repeat(64)},
    issuedAt:'2027-05-18T10:00:00.000Z',ownerPrivateKey:x.ownerPrivateKey});
  await assert.rejects(inspector(x,{previousOwnerReceipt:wrong}).inspect());
});
