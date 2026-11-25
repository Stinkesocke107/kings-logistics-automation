'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createEmptyLedger}=require('../event-capacity-decision-ledger');
const {createEmptyHistoricalJournal,prepareHistoricalTransition,signHistoricalTransitionOffline,
  appendOwnerSignedHistoricalTransition}=require('../event-capacity-historical-lifecycle-journal');
const {reconcileSignedHistoricalSource}=require('../event-capacity-historical-source-crosscheck');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const SECRET='synthetic private HMAC keys for history discrepancy tasks';
const NOW=Date.parse('2027-03-20T12:00:00Z');
const UTC='2027-03-21T18:00:00.000Z',OTHER='2027-03-22T18:00:00.000Z';
const THREAD='700000000000000010';
function event(status='Scheduled'){
  return {eventId:'10',threadId:THREAD,name:'Synthetic private Event',
    status,staffStatus:{status,authorId:'private-synthetic-driver',
      matchedRoleIds:['test-staff'],roleSource:'guild-member-lookup'},
    validation:{parsed:{departureAtUtc:UTC,eventType:'Partner Convoy'}}};
}
function source(items=[],legacy=[]){
  return {sourceKind:'authenticated-kings-convoy-checker',
    runId:'45502949674',attempt:1,artifactId:'70000000001',
    headSha:'1'.repeat(40),archiveDigest:'2'.repeat(64),
    report:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:items.length,actualConvoys:items.length},threads:items},
    overview:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{realConvoySubmissions:items.length,convoyReadErrors:0,
        legacyImportedConvoys:legacy.length,legacyDuplicatesSuppressed:0},
      registeredConvoys:[
        ...items.map(e=>({source:'convoy-center',eventId:e.eventId,
          threadId:e.threadId,status:e.status,
          departureAtUtc:e.validation.parsed.departureAtUtc})),
        ...legacy]}}
}
function setup(){
  const keys=crypto.generateKeyPairSync('ed25519');
  const ownerPublicKey=keys.publicKey.export({format:'pem',type:'spki'});
  const ownerPrivateKey=keys.privateKey.export({format:'pem',type:'pkcs8'});
  let journal=createEmptyHistoricalJournal({scope:SCOPE,at:'2027-03-20T11:00:00.000Z'});
  const ledger=createEmptyLedger(SCOPE,'2027-03-20T11:25:00Z');
  function add(ref='event:10',action='accept',date=UTC,at='2027-03-20T11:35:00.000Z'){
    const payload=prepareHistoricalTransition({journal,scope:SCOPE,
      ownerPublicKey,expectedRevision:journal.revision,ref,action,
      category:'Partner Convoy',departureAtUtc:date,reviewedAt:at,
      evidenceDigest:crypto.createHash('sha256').update('e'+journal.revision).digest('hex'),
      archiveDigest:crypto.createHash('sha256').update('a'+journal.revision).digest('hex')});
    journal=appendOwnerSignedHistoricalTransition({journal,scope:SCOPE,
      ownerPublicKey,expectedRevision:journal.revision,
      receipt:signHistoricalTransitionOffline({payload,ownerPrivateKey})});
  }
  function scan(items=[],options={}){
    const evidence=source(items,options.legacy||[]);
    return reconcileSignedHistoricalSource({source:evidence,ledger,journal,
      scope:SCOPE,ownerPublicKey,taskSecret:SECRET,nowMs:NOW,...options});
  }
  return {add,scan,get journal(){return journal;}};
}
const reasons=x=>x.issues.map(i=>i.reason);
test('Matching signed history does not certify complete records or free capacity',()=>{
  const x=setup();x.add();const result=x.scan([event()]);
  assert.equal(result.counts.newCrosscheckIssues,0);
  assert.equal(result.historicalCoverageCertified,false);
  assert.equal(result.freeSlotsCertified,false);
  assert.equal(result.sourceProvenanceTrustedByThisPureFunction,false);
  assert.equal(result.staffDecisionsCommitted,false);
});
test('Missing signed current acceptance requires human review with private HMAC tasks',()=>{
  const x=setup(),result=x.scan([event()]);
  assert.ok(reasons(result).includes('current-accepted-event-without-signed-history'));
  assert.equal(result.counts.acceptedCurrentWithoutSignedProof,1);
  assert.equal(JSON.stringify(result).includes('event:10'),false);
  assert.equal(JSON.stringify(result).includes('Synthetic private Event'),false);
  assert.equal(JSON.stringify(result).includes('private-synthetic-driver'),false);
});
test('Archived or deleted signed accepted event never silently disappears',()=>{
  const x=setup();x.add();const result=x.scan([]);
  assert.ok(reasons(result).includes('historical-signed-event-not-in-current-source'));
  assert.equal(result.freeSlotsCertified,false);
});
test('Category, UTC departure and status mismatches are urgent',()=>{
  const x=setup();x.add();
  const e=event('Cancelled');
  e.validation.parsed.departureAtUtc=OTHER;
  e.validation.parsed.eventType='External Convoy';
  const result=x.scan([e]);
  assert.ok(reasons(result).includes('signed-history-category-conflict'));
  assert.ok(reasons(result).includes('signed-history-departure-conflict'));
  assert.ok(reasons(result).includes('signed-history-status-conflict'));
  assert.equal(result.counts.urgentCrosscheckIssues,3);
});
test('Signed cancellation does not imply actual participation or automatic slot release',()=>{
  const x=setup();x.add();x.add('event:10','cancel',UTC,'2027-03-20T11:38:00.000Z');
  const result=x.scan([event('Cancelled')]);
  assert.equal(reasons(result).includes('signed-history-status-conflict'),false);
  assert.equal(result.slotReleaseInferred,false);
  assert.equal(result.calendarMutated,false);
});
test('Signed rescheduled date is compared to departure, not meeting date',()=>{
  const x=setup();x.add();x.add('event:10','reschedule',OTHER,'2027-03-20T11:38:00.000Z');
  const e=event('Rescheduled');e.validation.parsed.departureAtUtc=OTHER;
  const result=x.scan([e]);
  assert.equal(reasons(result).includes('signed-history-departure-conflict'),false);
});
test('Same current source entry signed under Event and Thread ID is ambiguous',()=>{
  const x=setup();x.add();x.add('thread:'+THREAD,'accept',UTC,'2027-03-20T11:38:00.000Z');
  const result=x.scan([event()]);
  assert.ok(reasons(result).includes('signed-history-ambiguous-identity'));
});
test('Legacy rows remain unresolved even with no signed historical journal',()=>{
  const x=setup();
  const legacy=[{source:'legacy-calendar',eventId:'prior-55',
    threadId:'799999999999999999',status:'Scheduled',departureAtUtc:UTC}];
  const result=x.scan([],{legacy});
  assert.equal(result.counts.legacyRowsNeedingReview,1);
  assert.ok(reasons(result).includes('legacy-event-requires-historical-review'));
});
test('Forged source, wrong scope, tampered journal and signer all fail closed',()=>{
  const x=setup();x.add();const raw=source([event()]);
  assert.throws(()=>x.scan([],{source:{...raw,headSha:'forged'}}));
  assert.throws(()=>x.scan([],{scope:{...SCOPE,forumId:'999999999999999999'}}));
  assert.throws(()=>x.scan([],{journal:{...x.journal,tip:'0'.repeat(64)}}));
  const pub=crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
  assert.throws(()=>x.scan([],{ownerPublicKey:pub}));
});
test('Duplicate current source Event IDs are refused instead of suppressing them',()=>{
  const x=setup(),duplicate=event();
  duplicate.threadId='700000000000000011';
  assert.throws(()=>x.scan([event(),duplicate]));
});
