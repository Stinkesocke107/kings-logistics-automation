'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,adjustTotals,hash}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {createKingsStagedImportQuarantinePlan:plan}
  =require('../event-capacity-staged-import-quarantine-plan');
const review=fn=>{const f=fixture();fn?.(f);return plan(f);};
const items=(r,kind)=>r.quarantineItems.filter(x=>x.kind===kind);
test('Identical claimed sources create four UNVERIFIED records and zero import approvals',()=>{
  const r=review();
  assert.equal(r.counts.total,4);
  assert.equal(r.counts.events,1);
  assert.equal(r.counts.invitations,1);
  assert.equal(r.counts.channels,2);
  assert.equal(r.counts.unchangedUnverified,4);
  assert.equal(r.counts.changedQuarantined,0);
  assert.equal(r.importOperationsCommitted,0);
  assert.equal(r.externalWritesPerformed,0);
  assert.equal(r.stagingReadyForProduction,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('A repeated identical import dry-run has one stable replay seal and no mutations',()=>{
  const f=fixture(),before=structuredClone(f);
  const a=plan(f),b=plan(f);
  assert.deepEqual(a,b);
  assert.match(a.replaySeal,/^staged-plan:[a-f0-9]{64}$/);
  assert.deepEqual(f,before);
});
test('Thread ordering does not alter deduplication or replay seal',()=>{
  const f=fixture(),first=plan(f);
  f.previous.convoyRecords.reverse();
  f.current.convoyRecords.reverse();
  const rerun=plan(f);
  assert.equal(first.replaySeal,rerun.replaySeal);
  assert.deepEqual(first.quarantineItems,rerun.quarantineItems);
});
test('A changed departure date is quarantined, never an auto-scheduled slot',()=>{
  const r=review(f=>{
    for(const x of f.current.convoyRecords)
      x.departureAtUtc='2026-11-23T19:00:00.000Z';
  });
  assert.equal(items(r,'event')[0].status,'CHANGED_QUARANTINED');
  assert.equal(r.counts.changedQuarantined,1);
  assert.equal(r.oldDepartureDatesNeverAutomaticallyReleased,true);
  assert.equal(r.realEventApprovalsCommitted,0);
});
test('Cancellation of previous scheduled Event is classified changed but not accepted',()=>{
  const r=review(f=>{
    for(const x of f.current.convoyRecords)x.status='Cancelled';
  });
  assert.equal(items(r,'event')[0].status,'CHANGED_QUARANTINED');
  assert.equal(items(r,'event')[0].approvedForImport,false);
  assert.equal(r.outboundAcceptedNotEventCapacityApproval,true);
});
test('Completed and Rescheduled are both reviewed without releasing old slots',()=>{
  for(const status of ['Completed','Rescheduled']){
    const r=review(f=>{
      for(const x of f.current.convoyRecords)x.status=status;
    });
    assert.equal(items(r,'event')[0].status,'CHANGED_QUARANTINED',status);
    assert.equal(items(r,'event')[0].oldReservationsReleased,0);
  }
});
test('Old message hash changed but unchanged status still quarantines original evidence',()=>{
  const r=review(f=>{
    f.current.convoyRecords[0].sourceDigest=hash('changed private message');
  });
  assert.equal(r.counts.changedQuarantined,1);
  assert.equal(items(r,'event')[0].status,'CHANGED_QUARANTINED');
  assert.equal(r.original24MonthHistoryIndependentlyVerified,false);
});
test('Omitted revision digest does not get silently folded into unchanged Event',()=>{
  const r=review(f=>{
    f.current.convoyRecords[0].revisionDigests=[];
  });
  assert.equal(items(r,'event')[0].status,'CHANGED_QUARANTINED');
  assert.equal(r.originalUrgentReviewItems>0,true);
});
test('Missing entire Event becomes NOT OBSERVED and is never deleted',()=>{
  const r=review(f=>{f.current.convoyRecords=[];adjustTotals(f);});
  assert.equal(r.counts.notObservedQuarantined,1);
  assert.equal(items(r,'event')[0].status,'NOT_OBSERVED_QUARANTINED');
  assert.equal(r.sourceRecordsNotObservedDoNotProveDeletion,true);
  assert.equal(r.importOperationsCommitted,0);
});
test('One old channel thread missing from same canonical Event remains CHANGED not a newly approved booking',()=>{
  const r=review(f=>{
    f.current.convoyRecords.pop();adjustTotals(f);
  });
  assert.equal(items(r,'event')[0].status,'CHANGED_QUARANTINED');
  assert.equal(r.counts.events,1);
  assert.equal(r.oldDepartureDatesNeverAutomaticallyReleased,true);
});
test('A completely new canonical Event is added to QUARANTINE, not published',()=>{
  const r=review(f=>{
    f.current.convoyRecords.push({...f.current.convoyRecords[1],
      threadId:'990000000000000099',eventId:'freshNewEvent',
      sourceDigest:hash('new source')});
    adjustTotals(f);
  });
  assert.equal(r.counts.newUnverifiedQuarantined,1);
  assert.equal(r.counts.events,2);
  assert.equal(r.realEventApprovalsCommitted,0);
});
test('Old Event canonical key reassigned to new Event ID cannot be silently updated',()=>{
  const r=review(f=>{
    for(const x of f.current.convoyRecords)x.eventId='newCanonicalEvent';
  });
  assert.equal(r.counts.notObservedQuarantined,1);
  assert.equal(r.counts.newUnverifiedQuarantined,1);
  assert.equal(r.counts.events,2);
  assert.equal(r.stagingReadyForProduction,false);
});
test('Unknown canonical Event ID requires explicit linking even with matching source rows',()=>{
  const r=review(f=>{
    for(const x of [...f.previous.convoyRecords,...f.current.convoyRecords])
      x.eventId=null;
  });
  assert.equal(r.counts.events,2);
  assert.equal(r.counts.unlinkedQuarantined,2);
  assert.ok(items(r,'event').every(x=>x.explicitCanonicalLinkRequired));
  assert.equal(r.freeSlotsCertified,false);
});
test('Conflicting Center and legacy statuses cause AMBIGUOUS quarantine even on replay',()=>{
  const r=review(f=>{
    f.previous.convoyRecords[0].status='Cancelled';
    f.current.convoyRecords[0].status='Cancelled';
  });
  assert.equal(items(r,'event')[0].status,'AMBIGUOUS_SOURCE_QUARANTINED');
  assert.equal(r.originalReviewItems>0,true);
});
test('Multiple VTC invitations for same Event stay separate records, not extra accepted Convoys',()=>{
  const r=review(f=>{
    f.current.tracker.records.push({
      ...f.current.tracker.records[0],invitationId:'inv2',
      sourceDigest:hash('second recipient invite'),status:'Sent'
    });
  });
  assert.equal(r.counts.invitations,2);
  assert.equal(r.counts.events,1);
  assert.equal(r.counts.newUnverifiedQuarantined,1);
  assert.equal(r.outboundAcceptedNotEventCapacityApproval,true);
});
test('Outgoing Accepted changing to Declined only quarantines invitation, not incoming Event',()=>{
  const r=review(f=>{
    f.current.tracker.records[0].status='Declined';
  });
  assert.equal(items(r,'outbound-invitation')[0].status,'CHANGED_QUARANTINED');
  assert.equal(items(r,'event')[0].status,'UNCHANGED_UNVERIFIED');
});
test('Outbound invitation absent from second source is not automatically withdrawn',()=>{
  const r=review(f=>{f.current.tracker.records=[];});
  assert.equal(items(r,'outbound-invitation')[0].status,'NOT_OBSERVED_QUARANTINED');
  assert.equal(r.realEventApprovalsCommitted,0);
});
test('New claimed source channel is quarantined without overwriting old source list',()=>{
  const r=review(f=>{
    f.current.channelInventory.push({
      ...f.current.channelInventory[1],
      channelId:'990000000000000099',claimedThreadCount:0,
      claimedArchivedCount:0,claimedDeletedCount:0
    });
  });
  assert.equal(r.counts.newUnverifiedQuarantined,1);
  assert.equal(r.counts.channels,3);
  assert.equal(r.stagingReadyForProduction,false);
});
test('Missing claimed old channel cannot be silently removed',()=>{
  const r=review(f=>{
    const id=f.current.channelInventory[1].channelId;
    f.current.channelInventory.pop();
    f.current.convoyRecords=f.current.convoyRecords.filter(x=>x.channelId!==id);
  });
  assert.equal(items(r,'source-channel').filter(x=>
    x.status==='NOT_OBSERVED_QUARANTINED').length,1);
  assert.equal(r.sourceRecordsNotObservedDoNotProveDeletion,true);
});
test('Channel coverage interval change quarantines its source record',()=>{
  const r=review(f=>{
    f.current.channelInventory[1].firstCoveredMonth='2026-11';
    f.current.channelInventory[1].lastCoveredMonth='2026-11';
  });
  assert.equal(items(r,'source-channel').filter(x=>
    x.status==='CHANGED_QUARANTINED').length,1);
});
test('Unfinished Discord archive receipts never turn unchanged source records into trusted data',()=>{
  const r=review(f=>{
    f.currentPagination.scans=f.currentPagination.scans.filter(x=>
      x.stream!=='archived-public');
  });
  assert.equal(r.laterClaimPaginationInternallyComplete,false);
  assert.equal(r.counts.unchangedUnverified,4);
  assert.equal(r.allItemsRequireAuthenticatedOriginalSourceAndHumanReview,true);
  assert.equal(r.stagingReadyForProduction,false);
});
test('Altering a single private message digest changes replay seal without exposing digest',()=>{
  const f=fixture(),oldPlan=plan(f);
  const raw=hash('private changed');
  f.current.convoyRecords[0].sourceDigest=raw;
  const nextPlan=plan(f);
  assert.notEqual(oldPlan.replaySeal,nextPlan.replaySeal);
  assert.equal(JSON.stringify(nextPlan).includes(raw),false);
  assert.equal(nextPlan.importOperationsCommitted,0);
});
test('Rotating HMAC private review key rotates opaque identity and replay seals',()=>{
  const f=fixture(),a=plan(f);
  f.reviewSecret='another independent synthetic HMAC review signing key';
  const b=plan(f);
  assert.notEqual(a.replaySeal,b.replaySeal);
  assert.notDeepEqual(a.quarantineItems.map(i=>i.itemKey),
    b.quarantineItems.map(i=>i.itemKey));
  assert.deepEqual(a.counts,b.counts);
});
test('Quarantine report contains no guild, channel, Event, invitation, message or secret IDs',()=>{
  const r=review(),out=JSON.stringify(r);
  for(const secret of ['evt100','inv1','990000000000000000',
    '990000000000000001','990000000000000002',
    '990000000000000003','synthetic private source-handoff'])
    assert.equal(out.includes(secret),false);
  assert.ok(r.quarantineItems.every(x=>
    /^staged-item:[a-f0-9]{40}$/.test(x.itemKey)));
});
test('Report is always private, all rows require review, no approval or real writes',()=>{
  const r=review();
  assert.equal(r.visibility,'PRIVATE_ONLY');
  assert.equal(r.discordMessagesSent,0);
  assert.equal(r.externalWritesPerformed,0);
  assert.ok(r.quarantineItems.every(x=>x.humanReconciliationRequired&&
    !x.approvedForImport&&!x.actualBookingApproval&&
    !x.independentlyAuthenticatedSource));
});
test('Invalid scope, wrong old-new timeline and malformed sensitive extra fields fail',()=>{
  for(const change of [
    f=>{f.current.guildId='990000000000000088';},
    f=>{f.current.nowMs=f.previous.nowMs-1;
      f.currentPagination.nowMs=f.current.nowMs;},
    f=>{f.current.convoyRecords[0].botToken='PRIVATE'},
    f=>{f.previousPagination.nowMs=f.current.nowMs;}
  ]){
    const f=fixture();change(f);
    assert.throws(()=>plan(f));
  }
});
