'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {
  createEmptyHistoricalJournal,verifyHistoricalJournal,
  prepareHistoricalTransition,signHistoricalTransitionOffline,
  appendOwnerSignedHistoricalTransition
}=require('../event-capacity-historical-lifecycle-journal');
const SCOPE={guildId:'1114967437788577792',
  forumId:'1550619824005062697'};
const INIT='2027-03-20T11:00:00.000Z';
const AT='2027-03-20T11:10:00.000Z';
const MOVE_AT='2027-03-20T11:15:00.000Z';
const COMPLETE_AT='2027-03-22T18:00:00.000Z';
const DEPART='2027-03-21T16:00:00.000Z';
const NEW_DEPART='2027-04-01T00:15:00.000Z';
const TYPE='Partner Convoy';
const REF='event:20270';
function setup(){
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  const publicPem=publicKey.export({format:'pem',type:'spki'});
  const privatePem=privateKey.export({format:'pem',type:'pkcs8'});
  const empty=()=>createEmptyHistoricalJournal({scope:SCOPE,at:INIT});
  const opts={scope:SCOPE,ownerPublicKey:publicPem};
  function stage(journal,overrides={}){
    return prepareHistoricalTransition({
      journal,...opts,expectedRevision:journal.revision,
      ref:REF,action:'accept',category:TYPE,
      departureAtUtc:DEPART,evidenceDigest:'a'.repeat(64),
      archiveDigest:'b'.repeat(64),reviewedAt:AT,...overrides
    });
  }
  function add(journal,overrides={}){
    const payload=stage(journal,overrides);
    const receipt=signHistoricalTransitionOffline({
      payload,ownerPrivateKey:privatePem
    });
    return appendOwnerSignedHistoricalTransition({
      journal,...opts,receipt,expectedRevision:journal.revision
    });
  }
  return {empty,stage,add,publicPem,privatePem,opts};
}
test('Owner-signed historical accepted → rescheduled → completed is immutable linked journal',()=>{
  const x=setup(),base=x.empty();
  const accepted=x.add(base);
  const rescheduled=x.add(accepted,{
    action:'reschedule',departureAtUtc:NEW_DEPART,
    reviewedAt:MOVE_AT,evidenceDigest:'c'.repeat(64)
  });
  const completed=x.add(rescheduled,{
    action:'complete',departureAtUtc:NEW_DEPART,
    reviewedAt:COMPLETE_AT,evidenceDigest:'d'.repeat(64)
  });
  assert.equal(base.revision,0);
  assert.equal(accepted.revision,1);
  assert.equal(rescheduled.revision,2);
  assert.equal(completed.revision,3);
  assert.equal(completed.events[REF].status,'Completed');
  assert.equal(completed.events[REF].departureAtUtc,NEW_DEPART);
  assert.notEqual(base.tip,accepted.tip);
  assert.notEqual(accepted.tip,rescheduled.tip);
  assert.notEqual(rescheduled.tip,completed.tip);
  assert.equal(verifyHistoricalJournal(
    JSON.parse(JSON.stringify(completed)),x.opts).verified,true);
  assert.equal(completed.historicalCoverageCertified,false);
  assert.equal(completed.freeSlotsCertified,false);
});
test('Signed Cancelled status does not certify slot release or historical completeness',()=>{
  const x=setup(),accepted=x.add(x.empty());
  const cancelled=x.add(accepted,{
    action:'cancel',reviewedAt:MOVE_AT,evidenceDigest:'c'.repeat(64)
  });
  assert.equal(cancelled.events[REF].status,'Cancelled');
  assert.equal(cancelled.freeSlotsCertified,false);
  assert.equal('slotReleasedVerified' in cancelled,false);
  assert.equal('remainingVerified' in cancelled,false);
  assert.throws(()=>x.add(cancelled,{
    action:'accept',reviewedAt:COMPLETE_AT,evidenceDigest:'d'.repeat(64)
  }));
});
test('Missing owner signature or a different owner signing key cannot append evidence',()=>{
  const x=setup(),journal=x.empty(),payload=x.stage(journal);
  const outsider=crypto.generateKeyPairSync('ed25519');
  const outsiderPem=outsider.privateKey.export({format:'pem',type:'pkcs8'});
  const forged=signHistoricalTransitionOffline({
    payload,ownerPrivateKey:outsiderPem
  });
  assert.throws(()=>appendOwnerSignedHistoricalTransition({
    journal,...x.opts,receipt:forged,expectedRevision:0
  }));
  assert.throws(()=>appendOwnerSignedHistoricalTransition({
    journal,...x.opts,receipt:{payload,signature:'A'.repeat(86)+'=='},
    expectedRevision:0
  }));
});
test('Signed entry cannot be reused or quietly inserted under a different revision',()=>{
  const x=setup(),journal=x.empty(),payload=x.stage(journal);
  const receipt=signHistoricalTransitionOffline({
    payload,ownerPrivateKey:x.privatePem
  });
  const next=appendOwnerSignedHistoricalTransition({
    journal,...x.opts,receipt,expectedRevision:0
  });
  assert.throws(()=>appendOwnerSignedHistoricalTransition({
    journal:next,...x.opts,receipt,expectedRevision:1
  }));
  assert.throws(()=>appendOwnerSignedHistoricalTransition({
    journal,...x.opts,receipt,expectedRevision:1
  }));
  assert.throws(()=>x.add(next,{
    ref:'event:20271',reviewedAt:MOVE_AT,
    evidenceDigest:'a'.repeat(64)
  }));
});
test('Different event with new evidence can be independently signed and audited',()=>{
  const x=setup(),first=x.add(x.empty());
  const second=x.add(first,{ref:'event:20271',evidenceDigest:'c'.repeat(64),
    reviewedAt:MOVE_AT,category:'External Convoy'});
  assert.equal(second.events['event:20271'].status,'Accepted');
  assert.equal(second.events['event:20271'].category,'External Convoy');
  assert.equal(second.events[REF].category,'Partner Convoy');
  assert.equal(second.revision,2);
  assert.equal(verifyHistoricalJournal(second,x.opts).verified,true);
});
test('Tampering history content, event summary, chain SHA, signature, or scope is detected',()=>{
  const x=setup(),ok=x.add(x.empty());
  const mutations=[
    j=>{j.history[0].payload.category='Kings Convoy';},
    j=>{j.history[0].payload.evidenceDigest='0'.repeat(64);},
    j=>{j.history[0].payload.reviewedAt='2027-03-20T11:11:00.000Z';},
    j=>{j.history[0].signature='A'.repeat(86)+'==';},
    j=>{j.history[0].entryTip='f'.repeat(64);},
    j=>{j.tip='f'.repeat(64);},
    j=>{j.events[REF].status='Cancelled';},
    j=>{j.events[REF].category='External Convoy';},
    j=>{j.revision=7;},
    j=>{j.scope.forumId='999999999999999999';},
    j=>{j.historicalCoverageCertified=true;},
    j=>{j.freeSlotsCertified=true;},
    j=>{j.history[0].payload.extraApproval=true;}
  ];
  for(const mutate of mutations){
    const clone=structuredClone(ok);
    mutate(clone);
    assert.throws(()=>verifyHistoricalJournal(clone,x.opts));
  }
});
test('Transitions require real prior accepted state and correct date continuity',()=>{
  const x=setup(),empty=x.empty(),accepted=x.add(empty);
  for(const action of ['cancel','reschedule','complete']){
    assert.throws(()=>x.stage(empty,{
      action,reviewedAt:MOVE_AT,evidenceDigest:'c'.repeat(64)
    }));
  }
  assert.throws(()=>x.stage(accepted,{
    action:'accept',reviewedAt:MOVE_AT,evidenceDigest:'c'.repeat(64)
  }));
  assert.throws(()=>x.stage(accepted,{
    action:'reschedule',reviewedAt:MOVE_AT,evidenceDigest:'c'.repeat(64)
  }));
  assert.throws(()=>x.stage(accepted,{
    action:'cancel',departureAtUtc:NEW_DEPART,
    reviewedAt:MOVE_AT,evidenceDigest:'c'.repeat(64)
  }));
  assert.throws(()=>x.stage(accepted,{
    action:'complete',category:'External Convoy',
    reviewedAt:MOVE_AT,evidenceDigest:'c'.repeat(64)
  }));
});
test('Invalid UTC date, historical time reversal, oversized ref and weak evidence are denied',()=>{
  const x=setup(),accepted=x.add(x.empty());
  for(const overrides of [
    {reviewedAt:'2027-03-20T10:59:00.000Z'},
    {reviewedAt:'2027-03-20T11:09:00.000Z'},
    {reviewedAt:'yesterday'},
    {departureAtUtc:'2027-03-21T18:00:00+02:00'},
    {departureAtUtc:'2027-02-30T12:00:00.000Z'},
    {ref:'event:../../secrets'},
    {ref:'event:'.padEnd(300,'A')},
    {evidenceDigest:'weak'},
    {archiveDigest:'weak'},
    {category:'Unknown'}
  ])assert.throws(()=>x.stage(accepted,{
    action:'reschedule',departureAtUtc:NEW_DEPART,
    evidenceDigest:'c'.repeat(64),reviewedAt:MOVE_AT,
    ...overrides
  }));
});
test('No owner private key can be safely passed as a public verifier',()=>{
  const x=setup(),accepted=x.add(x.empty());
  const other=crypto.generateKeyPairSync('ed25519');
  const differentPub=other.publicKey.export({type:'spki',format:'pem'});
  assert.throws(()=>verifyHistoricalJournal(accepted,{
    scope:SCOPE,ownerPublicKey:differentPub
  }));
});
test('Historical ledger can never be treated as an authoritative complete archive',()=>{
  const x=setup(),record=x.add(x.empty());
  const v=verifyHistoricalJournal(record,x.opts);
  assert.equal(v.verified,true);
  assert.equal(v.historicalCoverageCertified,false);
  assert.equal(v.freeSlotsCertified,false);
  assert.equal(record.history[0].payload.archiveDigest.length,64);
  assert.equal('eventCountCertified' in v,false);
});
