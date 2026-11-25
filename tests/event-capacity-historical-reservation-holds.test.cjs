'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {prepareHistoricalTransition,signHistoricalTransitionOffline,
  appendOwnerSignedHistoricalTransition}
  =require('../event-capacity-historical-lifecycle-journal');
const {reviewSignedHistoricalReservationHolds}
  =require('../event-capacity-historical-reservation-holds');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function review(journal,ownerPublicKey,month='2027-04',nowMs=NOW){
  return reviewSignedHistoricalReservationHolds({
    journal,scope:SCOPE,ownerPublicKey,month,nowMs
  });
}
function append(x,journal,ref,action,category,departureAtUtc,when){
  const candidate=prepareHistoricalTransition({
    journal,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    expectedRevision:journal.revision,ref,action,category,departureAtUtc,
    evidenceDigest:hash('evidence:'+journal.revision),
    archiveDigest:hash('archive:'+journal.revision),reviewedAt:when
  });
  const receipt=signHistoricalTransitionOffline({
    payload:candidate,ownerPrivateKey:x.ownerPrivateKey
  });
  return appendOwnerSignedHistoricalTransition({
    journal,receipt,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    expectedRevision:journal.revision
  });
}
test('Signed reschedule keeps both original March and new April reservations under review',()=>{
  const x=setup(),march=review(x.afterJournal,x.ownerPublicKey,'2027-03'),
    april=review(x.afterJournal,x.ownerPublicKey,'2027-04');
  assert.equal(march.days.length,1);
  assert.equal(march.days[0].utcDate,'2027-03-20');
  assert.equal(march.days[0].partnerProvisionalHolds,1);
  assert.equal(april.days.length,1);
  assert.equal(april.days[0].utcDate,'2027-04-20');
  assert.equal(april.days[0].combinedProvisionalHolds,1);
  assert.equal(april.previousDatesNeverAutoReleaseAfterReschedule,true);
  assert.equal(april.freeSlotsCertified,false);
});
test('Cancellation never silently frees a previously approved partner reservation',()=>{
  const x=setup();
  const cancelled=append(x,x.afterJournal,'event:100','cancel','Partner Convoy',
    '2027-04-20T18:00:00.000Z','2027-05-01T10:00:00.000Z');
  const result=review(cancelled,x.ownerPublicKey);
  assert.equal(result.days[0].partnerProvisionalHolds,1);
  assert.equal(result.cancellationsNeverAutoRelease,true);
  assert.equal(result.staffDecisionsCommitted,false);
  assert.equal(result.freeSlotsCertified,false);
});
test('Completion never erases a signed historical reservation or proves attendance',()=>{
  const x=setup();
  const completed=append(x,x.afterJournal,'event:100','complete',
    'Partner Convoy','2027-04-20T18:00:00.000Z',
    '2027-05-01T10:00:00.000Z');
  const result=review(completed,x.ownerPublicKey);
  assert.equal(result.days[0].combinedProvisionalHolds,1);
  assert.equal(result.completionsNeverProveAttendance,true);
  assert.equal(result.staffAllocationReleasePermissionsVerified,false);
});
test('Distinct partner and external signed approvals flag the common daily quota boundary',()=>{
  const x=setup();
  let j=append(x,x.afterJournal,'event:201','accept','External Convoy',
    '2027-04-20T18:00:00.000Z','2027-05-01T10:00:00.000Z');
  j=append(x,j,'event:202','accept','External Convoy',
    '2027-04-20T19:00:00.000Z','2027-05-02T10:00:00.000Z');
  const result=review(j,x.ownerPublicKey);
  assert.equal(result.provisionalCounts.totalProvisionalDailyHolds,3);
  assert.equal(result.provisionalCounts.daysExceedingDailyLimit,1);
  assert.equal(result.days[0].partnerProvisionalHolds,1);
  assert.equal(result.days[0].externalProvisionalHolds,2);
  assert.equal(result.days[0].exceedsStandardDailyLimit,true);
  assert.equal(result.freeSlotsCertified,false);
});
test('A partner event rescheduled two times within one month retains two provisional day holds',()=>{
  const x=setup();
  const j=append(x,x.afterJournal,'event:100','reschedule',
    'Partner Convoy','2027-04-21T18:00:00.000Z',
    '2027-05-01T10:00:00.000Z');
  const result=review(j,x.ownerPublicKey);
  assert.equal(result.days.length,2);
  assert.equal(result.provisionalCounts.partnerUniqueHistoricalEventsInMonth,1);
  assert.equal(result.provisionalCounts.totalProvisionalDailyHolds,2);
  assert.equal(result.days.every(d=>d.availableSlotsCertified===false),true);
});
test('Kings-organized convoys are excluded from partner and external quota holds',()=>{
  const x=setup();
  const j=append(x,x.afterJournal,'event:300','accept',
    'Kings Convoy','2027-04-20T18:00:00.000Z',
    '2027-05-01T10:00:00.000Z');
  const result=review(j,x.ownerPublicKey);
  assert.equal(result.days[0].combinedProvisionalHolds,1);
  assert.equal(result.provisionalCounts.externalUniqueHistoricalEventsInMonth,0);
});
test('Signed events outside chosen month are not counted as that month holds',()=>{
  const x=setup();
  const result=review(x.afterJournal,x.ownerPublicKey,'2027-05');
  assert.equal(result.days.length,0);
  assert.equal(result.provisionalCounts.totalProvisionalDailyHolds,0);
  assert.equal(result.original24MonthSourceInventoryComplete,false);
  assert.equal(result.freeSlotsCertified,false);
});
test('Forged signature and wrong owner public key fail closed',()=>{
  const x=setup(),j=structuredClone(x.afterJournal);
  j.history[1].payload.category='External Convoy';
  assert.throws(()=>review(j,x.ownerPublicKey));
  const key=crypto.generateKeyPairSync('ed25519').publicKey
    .export({type:'spki',format:'pem'});
  assert.throws(()=>review(x.afterJournal,key));
});
test('Future-dated signoff and malformed UTC month refuse historical holds',()=>{
  const x=setup();
  assert.throws(()=>review(x.afterJournal,x.ownerPublicKey,'2027-13'));
  assert.throws(()=>review(x.afterJournal,x.ownerPublicKey,'2027-4'));
  assert.throws(()=>review(x.afterJournal,x.ownerPublicKey,'2027-04',
    Date.parse('2027-03-20T00:00:00.000Z')));
});
test('Privacy-safe summary never reveals signed original Event references or evidence digests',()=>{
  const x=setup();
  const result=review(x.afterJournal,x.ownerPublicKey);
  const serialized=JSON.stringify(result);
  for(const forbidden of [
    'event:100',hash('e0'),hash('e1'),'PRIVATE KEY','Partner Convoy'
  ])assert.equal(serialized.includes(forbidden),false);
  assert.equal(result.latestOwnerHighwaterIndependentlyVerified,false);
  assert.equal(result.sourceEvidenceAuthenticatedBeyondSignedJournal,false);
});
