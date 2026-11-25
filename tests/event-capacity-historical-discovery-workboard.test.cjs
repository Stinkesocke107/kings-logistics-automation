'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,page}=require('./fixtures/event-capacity-discord-pagination-fixture.cjs');
const {REQUIRED}=require('../event-capacity-historical-24month-readiness');
const {auditKingsHistoricalDiscoveryWorkboard:review}
  =require('../event-capacity-historical-discovery-workboard');
const claim=(m,patch={})=>({month:m,
  ...Object.fromEntries(REQUIRED.map(key=>[key,true])),
  unresolvedReviewItems:0,...patch});
const audit=change=>{
  const data={paginationInput:fixture(),monthlyClaims:[]};
  change?.(data);return review(data);
};
test('Twenty-four UTC months are present even with zero human review submissions',()=>{
  const r=audit();
  assert.equal(r.months.length,24);
  assert.equal(r.months[0].month,'2024-12');
  assert.equal(r.months.at(-1).month,'2026-11');
  assert.equal(r.counters.monthsWithoutHumanChecklist,24);
  assert.equal(r.counters.independentlyProviderVerifiedMonths,0);
  assert.equal(r.full24MonthOriginalSourceInventoryIndependentlyVerified,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('A claimed source page scan and complete checklist still do not prove real provider coverage',()=>{
  const r=audit(data=>{
    data.monthlyClaims=[claim('2026-10')];
  });
  const october=r.months.find(x=>x.month==='2026-10');
  assert.equal(october.channelSourcesClaimed,2);
  assert.equal(october.humanChecklistSubmitted,true);
  assert.match(october.reviewState,/INDEPENDENT DISCORD PROOF MISSING/);
  assert.equal(r.counters.monthsClaimedReadyOnlyOnUntrustedEvidence,1);
  assert.equal(r.counters.independentlyProviderVerifiedMonths,0);
});
test('Staff checkboxes claiming complete cannot hide an omitted archived-private stream',()=>{
  const r=audit(data=>{
    data.monthlyClaims=[claim('2026-10')];
    data.paginationInput.scans=data.paginationInput.scans.filter(
      x=>x.stream!=='archived-private');
  });
  const october=r.months.find(x=>x.month==='2026-10');
  assert.equal(october.humanChecklistSubmitted,true);
  assert.match(october.reviewState,/SCAN INCOMPLETE/);
  assert.equal(r.counters.monthsWithClaimedAllChecksButMissingSource,1);
  assert.equal(r.sourceReceiptChecks.missingStreams,1);
  assert.equal(r.freeSlotsCertified,false);
});
test('An entirely unknown month stays blocked even if Staff claimed full historical checks',()=>{
  const r=audit(data=>{
    data.paginationInput.channels[0].firstCoveredMonth='2026-11';
    data.monthlyClaims=[claim('2025-01')];
  });
  const jan=r.months.find(x=>x.month==='2025-01');
  assert.equal(jan.channelSourcesClaimed,0);
  assert.equal(jan.reviewState,'NO CLAIMED DISCORD SOURCE');
  assert.equal(r.counters.monthsWithClaimedAllChecksButMissingSource,1);
  assert.equal(r.unknownHistoricalSourceDoesNotMeanEmptyMonth,true);
});
test('Open human reviewer tasks remain visible even with a clean claimed stream',()=>{
  const r=audit(data=>{
    data.monthlyClaims=[claim('2026-10',{unresolvedReviewItems:3})];
  });
  const x=r.months.find(m=>m.month==='2026-10');
  assert.equal(x.reviewState,'HUMAN SOURCE CHECKLIST HAS OPEN ITEMS');
  assert.equal(x.humanOpenReviewItems,3);
  assert.equal(r.counters.monthsWithOpenHumanChecklist,1);
});
test('False archived/deleted checkboxes cannot become a green month',()=>{
  const r=audit(data=>{
    data.monthlyClaims=[claim('2026-10',{
      archivedDeletedThreadsReconciled:false,
      signedOwnerJournalCompared:false
    })];
  });
  assert.equal(r.counters.monthsWithOpenHumanChecklist,1);
  assert.equal(r.counters.monthsClaimedReadyOnlyOnUntrustedEvidence,0);
});
test('Twenty-four alleged complete monthly checklists never certify Event capacity',()=>{
  const r=audit(data=>{
    data.monthlyClaims=Array.from({length:24},(_,i)=>{
      const d=new Date('2024-12-01T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth()+i);
      return claim(d.toISOString().slice(0,7));
    });
  });
  assert.equal(r.counters.monthsWithoutHumanChecklist,0);
  assert.equal(r.counters.monthsClaimedReadyOnlyOnUntrustedEvidence,24);
  assert.equal(r.counters.independentlyProviderVerifiedMonths,0);
  assert.ok(r.months.every(x=>x.monthHistoricalCoverageCertified===false));
});
test('Interrupted pagination is not overridden by every monthly checklist being checked',()=>{
  const r=audit(data=>{
    data.paginationInput.scans[0].pages=[page(0,null,'unfinished',true)];
    data.monthlyClaims=[claim('2026-11')];
  });
  assert.equal(r.sourceReceiptChecks.unfinishedStreams,1);
  assert.equal(r.counters.monthsWithClaimedAllChecksButMissingSource,1);
  assert.match(r.months.at(-1).reviewState,/SCAN INCOMPLETE/);
});
test('Contradictory or duplicate checklist months abort rather than silently overwriting',()=>{
  assert.throws(()=>audit(data=>{
    data.monthlyClaims=[claim('2026-10'),claim('2026-10')];
  }));
  assert.throws(()=>audit(data=>{
    data.monthlyClaims=[claim('2027-01')];
  }));
});
test('Source first/final month mismatch never silently shifts historical scope',()=>{
  assert.throws(()=>audit(data=>{
    data.paginationInput.finalMonth='2026-10';
  }));
});
test('Review is deterministic and does not mutate input payload or old source records',()=>{
  const data={paginationInput:fixture(),monthlyClaims:[claim('2026-10')]};
  const before=structuredClone(data);
  assert.deepEqual(review(data),review(data));
  assert.deepEqual(data,before);
});
test('Aggregate report excludes guild/channel/cursor/secret identifiers',()=>{
  const data={paginationInput:fixture(),monthlyClaims:[claim('2026-10')]};
  const out=JSON.stringify(review(data));
  for(const raw of [data.paginationInput.guildId,
    data.paginationInput.channels[0].channelId,
    data.paginationInput.channels[1].channelId,
    'cursor1','synthetic private source review key'])
    assert.equal(out.includes(raw),false);
  assert.equal(out.includes('FREE SLOTS: 2'),false);
});
test('No part of the workboard may import or approve a real Event',()=>{
  const r=audit();
  assert.equal(r.realEventRecordsImported,0);
  assert.equal(r.autoReleasedHistoricalReservations,0);
  assert.equal(r.approvalDecisionsCommitted,0);
  assert.equal(r.actualDiscordMessagesReadByThisWorkboard,0);
  assert.equal(r.safeToActivate,false);
});
