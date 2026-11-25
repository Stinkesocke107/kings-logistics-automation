'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {setup}=require('./fixtures/event-capacity-historical-github-fixture.cjs');
const {crosscheckKingsHistoricalEvidenceClaims}
  =require('../event-capacity-historical-evidence-gap-audit');
const {prepareHistoricalTransition,signHistoricalTransitionOffline,
  appendOwnerSignedHistoricalTransition}
  =require('../event-capacity-historical-lifecycle-journal');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const NOW=Date.parse('2027-05-20T12:00:00.000Z');
const SECRET='synthetic and private workboard HMAC key for tests only';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function scenario(){
  const x=setup(),record={
    ref:'event:100',sourceKind:'current',sourceStatus:'Rescheduled',
    category:'Partner Convoy',departureAtUtc:'2027-04-20T18:00:00.000Z',
    sourceDigest:sha('synthetic source bytes'),
    evidenceDigests:[sha('e0'),sha('e1')]
  };
  const args={firstMonth:'2025-06',sourceRecords:[record],
    journal:x.afterJournal,scope:SCOPE,ownerPublicKey:x.ownerPublicKey,
    reviewSecret:SECRET,nowMs:NOW};
  const audit=(changes={})=>crosscheckKingsHistoricalEvidenceClaims({
    ...args,...changes
  });
  return {x,args,record,audit};
}
test('Signed reschedule and both claimed original evidence digests align without capacity certification',()=>{
  const s=scenario(),r=s.audit();
  assert.equal(r.signedJournalIntegrityVerified,true);
  assert.equal(r.counters.signedJournalEventsInWindow,1);
  assert.equal(r.counters.unresolvedEvidenceGaps,0);
  assert.equal(r.counters.monthsIndependentlySourceVerified,0);
  assert.equal(r.reviewWindowMonths,24);
  assert.equal(r.firstMonth,'2025-06');
  assert.equal(r.finalMonth,'2027-05');
  assert.equal(r.months.length,24);
  assert.equal(r.originalSourceRecordsIndependentlyAuthenticated,false);
  assert.equal(r.historicalCoverageCertified,false);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.anyEventDecisionCommitted,false);
});
test('Absent original sources are flagged even when journal signatures are valid',()=>{
  const s=scenario(),r=s.audit({sourceRecords:[]});
  assert.equal(r.counters.unresolvedEvidenceGaps,1);
  assert.equal(r.issues[0].reason,'signed-event-missing-from-source-inventory');
  assert.equal(r.freeSlotsCertified,false);
});
test('Missing original evidence for one signed reschedule makes a review gap',()=>{
  const s=scenario(),r=s.audit({sourceRecords:[{
    ...s.record,evidenceDigests:[sha('e0')]
  }]});
  assert.ok(r.issues.some(x=>x.reason==='signed-transition-missing-original-evidence'));
});
test('Unmatched claimed evidence cannot be misrepresented as signed journal transition',()=>{
  const s=scenario(),r=s.audit({sourceRecords:[{
    ...s.record,evidenceDigests:[...s.record.evidenceDigests,sha('unrelated')]
  }]});
  assert.ok(r.issues.some(x=>x.reason==='source-evidence-not-in-signed-history'));
});
test('Changed category, departure and completion status are separate urgent issues',()=>{
  const s=scenario(),r=s.audit({sourceRecords:[{
    ...s.record,category:'External Convoy',
    departureAtUtc:'2027-04-21T18:00:00.000Z',
    sourceStatus:'Completed'
  }]});
  assert.equal(r.counters.urgentGaps,3);
  assert.deepEqual(new Set(r.issues.map(x=>x.reason)),new Set([
    'source-category-conflict','source-departure-conflict',
    'source-status-conflict'
  ]));
  assert.ok(r.issues.every(x=>x.priority==='Urgent'));
});
test('Archived, deleted and legacy records trigger explicit additional human review',()=>{
  const s=scenario();
  const del=s.audit({sourceRecords:[{...s.record,sourceKind:'deleted'}]});
  assert.ok(del.issues.some(x=>x.reason==='deleted-source-needs-original-evidence'));
  assert.equal(del.counters.monthsIndependentlySourceVerified,0);
  const legacy=s.audit({sourceRecords:[{...s.record,sourceKind:'legacy'}]});
  assert.ok(legacy.issues.some(x=>x.reason==='legacy-source-needs-independent-review'));
  const archive=s.audit({sourceRecords:[{...s.record,sourceKind:'archived'}]});
  assert.equal(archive.months.find(x=>x.month==='2027-04').archivedOrDeletedClaims,1);
  assert.equal(archive.deletedArchivedEventCaptureVerified,false);
});
test('Unknown source status never becomes an assumed accepted event',()=>{
  const s=scenario(),r=s.audit({sourceRecords:[{
    ...s.record,sourceStatus:'Unknown'
  }]});
  assert.ok(r.issues.some(x=>x.reason==='source-status-unknown'));
  assert.ok(r.issues.some(x=>x.reason==='source-status-conflict'));
});
test('Duplicate source references fail rather than silently choose an event',()=>{
  const s=scenario();
  assert.throws(()=>s.audit({sourceRecords:[s.record,{...s.record,
    sourceDigest:sha('different source') }]}));
});
test('Unsafe duplicated or malformed evidence digests fail before any capacity review',()=>{
  const s=scenario();
  for(const evidenceDigests of [
    [sha('e0'),sha('e0')],['bad'],
    Array.from({length:81},(_,i)=>sha('evidence'+i))
  ])assert.throws(()=>s.audit({sourceRecords:[{
    ...s.record,evidenceDigests
  }]}));
});
test('Tampered owner signature, wrong public key and other guild scope fail closed',()=>{
  const s=scenario();
  const journal=structuredClone(s.args.journal);
  journal.history[1].payload.action='cancel';
  assert.throws(()=>s.audit({journal}));
  const key=crypto.generateKeyPairSync('ed25519').publicKey
    .export({type:'spki',format:'pem'});
  assert.throws(()=>s.audit({ownerPublicKey:key}));
  assert.throws(()=>s.audit({scope:{...SCOPE,forumId:'999999999999999999'}}));
});
test('Out-of-window source evidence and future 24-month windows cannot pass',()=>{
  const s=scenario();
  assert.throws(()=>s.audit({sourceRecords:[{
    ...s.record,departureAtUtc:'2024-01-20T18:00:00.000Z'
  }]}));
  assert.throws(()=>s.audit({firstMonth:'2026-07'}));
});
test('Malicious extra fields and raw secrets never enter an audit report',()=>{
  const s=scenario();
  assert.throws(()=>s.audit({sourceRecords:[{
    ...s.record,token:'synthetic-secret'
  }]}));
  const r=s.audit(),out=JSON.stringify(r);
  for(const value of [s.record.ref,s.record.sourceDigest,
    ...s.record.evidenceDigests,SECRET,'Partner Convoy','PRIVATE KEY'])
    assert.equal(out.includes(value),false);
  assert.ok(r.issues.every(i=>!('ref' in i)&&!('digest' in i)));
});
test('Crosscheck reports only aggregate month counts and HMAC review identifiers',()=>{
  const s=scenario(),r=s.audit({sourceRecords:[]});
  assert.match(r.issues[0].reviewKey,/^capacity-history:[a-f0-9]{40}$/);
  assert.equal(r.issues[0].month,'2027-04');
  assert.equal(r.months.find(m=>m.month==='2027-04').signedJournalEvents,1);
  assert.equal(r.months.find(m=>m.month==='2027-04').gaps,1);
  assert.equal(r.months[0].monthlyHistoryComplete,false);
  assert.equal(r.reviewItemsCreatedInDiscord,0);
});

test('Previously accepted in-window booking moved beyond the 24-month boundary remains a flagged obligation',()=>{
  const s=scenario(),p=prepareHistoricalTransition({
    journal:s.x.afterJournal,scope:SCOPE,ownerPublicKey:s.x.ownerPublicKey,
    expectedRevision:2,ref:'event:100',action:'reschedule',
    category:'Partner Convoy',departureAtUtc:'2027-06-20T18:00:00.000Z',
    evidenceDigest:sha('e2'),archiveDigest:sha('a2'),
    reviewedAt:'2027-05-01T10:00:00.000Z'
  });
  const signed=signHistoricalTransitionOffline({
    payload:p,ownerPrivateKey:s.x.ownerPrivateKey
  });
  const journal=appendOwnerSignedHistoricalTransition({
    journal:s.x.afterJournal,scope:SCOPE,ownerPublicKey:s.x.ownerPublicKey,
    receipt:signed,expectedRevision:2
  });
  const result=s.audit({journal,sourceRecords:[]});
  assert.ok(result.issues.some(i=>
    i.reason==='signed-event-moved-outside-review-window'));
  assert.equal(result.months.find(i=>i.month==='2027-03').signedJournalEvents,1);
  assert.equal(result.months.find(i=>i.month==='2027-04').signedJournalEvents,1);
  assert.equal(result.counters.unresolvedEvidenceGaps,2);
  assert.deepEqual(result.issues.map(i=>i.month),['2027-03','2027-04']);
  assert.equal(result.counters.monthsIndependentlySourceVerified,0);
  assert.equal(result.freeSlotsCertified,false);
});
test('An unsigned displayed Rescheduled status is never accepted as Scheduled',()=>{
  const s=scenario(),result=s.audit({
    journal:s.x.beforeJournal,
    sourceRecords:[{
      ...s.record,sourceStatus:'Rescheduled',
      departureAtUtc:'2027-03-20T18:00:00.000Z',
      evidenceDigests:[sha('e0')]
    }]
  });
  assert.ok(result.issues.some(x=>x.reason==='source-status-conflict'));
  assert.equal(result.counters.urgentGaps,1);
  assert.equal(result.freeSlotsCertified,false);
});
test('Archived source record requires separate original evidence review even if signed fields align',()=>{
  const s=scenario(),result=s.audit({
    sourceRecords:[{...s.record,sourceKind:'archived'}]
  });
  assert.ok(result.issues.some(x=>
    x.reason==='archived-source-needs-original-evidence'));
  assert.equal(result.months.find(x=>x.month==='2027-04').archivedOrDeletedClaims,1);
  assert.equal(result.counters.monthsIndependentlySourceVerified,0);
});

test('Future-issued owner historical reviews are not valid at an earlier inspection',()=>{
  const s=scenario();
  assert.throws(()=>s.audit({
    nowMs:Date.parse('2027-03-15T12:00:00.000Z')
  }));
  const result=s.audit({nowMs:NOW});
  assert.equal(result.signedJournalIntegrityVerified,true);
  assert.equal(result.freeSlotsCertified,false);
});
