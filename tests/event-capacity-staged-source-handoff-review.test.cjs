'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,review,has,adjustTotals,hash,OLD,NEW}
  =require('./fixtures/event-capacity-staged-source-handoff-fixture.cjs');
const {rehearseKingsStagedSourceHandoff:handoff}
  =require('../event-capacity-staged-source-handoff-review');
test('Two claimed matching snapshots preserve one Event identity across current Center and legacy channel',()=>{
  const r=review(),c=r.counts;
  assert.equal(c.previousDistinctIdentities,1);
  assert.equal(c.newDistinctIdentities,1);
  assert.equal(c.unchangedEventClaims,1);
  assert.equal(c.missingPreviouslySeenEventClaims,0);
  assert.equal(c.newEventClaims,0);
  assert.equal(c.outboundInvitationAdded,0);
  assert.equal(r.earlierPagination.sourceClaimScanInternallyComplete,true);
  assert.equal(r.laterPagination.sourceClaimScanInternallyComplete,true);
  assert.equal(r.unresolvedHumanReviewItems>0,true);
  assert.equal(r.snapshotOrEventsCommitted,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Missing original Center event in later source is only NOT OBSERVED, never deleted',()=>{
  const r=review(f=>{f.current.convoyRecords=[];adjustTotals(f);});
  assert.equal(r.counts.missingPreviouslySeenEventClaims,1);
  assert.equal(r.counts.previouslySeenSourceThreadMissing,2);
  assert.ok(has(r,'previous-event-not-observed-in-later-source'));
  assert.equal(r.missingFromLaterSourceNeverMeansDeleted,true);
  assert.equal(r.physicalRecordsDeleted,0);
  assert.equal(r.freeSlotsCertified,false);
});
test('Absent old channel thread while current Center event remains is a separate preservation issue',()=>{
  const r=review(f=>{
    f.current.convoyRecords=f.current.convoyRecords.filter(
      x=>x.sourceKind==='current');
    adjustTotals(f);
  });
  assert.equal(r.counts.missingPreviouslySeenEventClaims,0);
  assert.equal(r.counts.missingSourceThreadsWithinKnownEvent,1);
  assert.equal(r.counts.previouslySeenSourceThreadMissing,1);
  assert.ok(has(r,'previous-original-thread-not-observed'));
  assert.equal(r.staffDecisionsCommitted,0);
});
test('A previously accepted-like cancelled event retains a review indicator for the old date',()=>{
  const r=review(f=>{
    for(const row of f.current.convoyRecords)row.status='Cancelled';
  });
  assert.equal(r.counts.changedStatusClaims,1);
  assert.equal(r.counts.cancellationClaimTransitions,1);
  assert.equal(r.counts.unchangedEventClaims,0);
  assert.equal(r.provisionalOldDateReviewMonths.length,1);
  assert.equal(r.provisionalOldDateReviewMonths[0].month,'2026-11');
  assert.equal(r.provisionalOldDateReviewMonths[0].provisionalPreviouslyObservedEventClaims,1);
  assert.ok(has(r,'cancellation-needs-signed-staff-decision'));
  assert.equal(r.cancellationsDoNotProveActualSignedDecision,true);
});
test('Reschedule changes both lifecycle and departure, without releasing previous day',()=>{
  const r=review(f=>{
    for(const row of f.current.convoyRecords){
      row.status='Rescheduled';
      row.departureAtUtc='2026-11-22T18:00:00.000Z';
    }
  });
  assert.equal(r.counts.changedDateClaims,1);
  assert.equal(r.counts.rescheduleClaimTransitions,1);
  assert.equal(r.provisionalOldDateReviewMonths[0].month,'2026-11');
  assert.ok(has(r,'departure-date-claim-changed-previous-date-retained'));
  assert.equal(r.reschedulesDoNotReleasePreviouslyClaimedDates,true);
});
test('Completion changes status but is never an independent signed attendance decision',()=>{
  const r=review(f=>{
    for(const row of f.current.convoyRecords)row.status='Completed';
  });
  assert.equal(r.counts.completionClaimTransitions,1);
  assert.ok(has(r,'completion-needs-signed-staff-evidence'));
  assert.equal(r.staffDecisionsCommitted,0);
});
test('Changing category requires urgent review, not automatic Partner-to-External migration',()=>{
  const r=review(f=>{
    for(const row of f.current.convoyRecords)row.category='External Convoy';
  });
  assert.equal(r.counts.changedCategoryClaims,1);
  assert.ok(has(r,'event-category-claim-changed'));
  assert.equal(r.snapshotOrEventsCommitted,0);
});
test('Changing original message digest without a new revision is not treated as authentic edit',()=>{
  const r=review(f=>{
    f.current.convoyRecords[0].sourceDigest=hash('modified content');
  });
  assert.equal(r.counts.sourceDigestChanges,1);
  assert.equal(r.counts.missingEditRevisionProofClaims,1);
  assert.ok(has(r,'message-changed-without-new-revision-proof'));
});
test('Appending new revision digest records content change as review without alleging missing revision',()=>{
  const r=review(f=>{
    f.current.convoyRecords[0].sourceDigest=hash('modified content');
    f.current.convoyRecords[0].revisionDigests.push(hash('second revision'));
  });
  assert.equal(r.counts.sourceDigestChanges,1);
  assert.equal(r.counts.missingEditRevisionProofClaims,0);
  assert.ok(has(r,'original-source-message-digest-changed'));
  assert.equal(r.originalDiscordProviderAuthenticated,false);
});
test('Removing historical revision digest is an evidence loss even if current message hash is unchanged',()=>{
  const r=review(f=>{
    f.current.convoyRecords[0].revisionDigests=[];
  });
  assert.equal(r.counts.missingEditRevisionProofClaims,1);
  assert.ok(has(r,'previous-edit-revision-evidence-not-retained'));
});
test('Changing source from current to archived is not a capacity cancellation',()=>{
  const r=review(f=>{
    f.current.convoyRecords[0].sourceKind='archived';
    adjustTotals(f);
  });
  assert.equal(r.counts.archivedOrDeletedSourceTransitions,1);
  assert.equal(r.counts.changedEventClaims,1);
  assert.equal(r.staffDecisionsCommitted,0);
});
test('A new source thread linked to same canonical Event does not create a second accepted booking',()=>{
  const r=review(f=>{
    f.current.convoyRecords.push({
      ...f.current.convoyRecords[1],
      threadId:'990000000000000077',
      sourceDigest:hash('new historical thread')
    });
    adjustTotals(f);
  });
  assert.equal(r.counts.newSourceThreadsForKnownEvent,1);
  assert.equal(r.counts.newEventClaims,0);
  assert.equal(r.sourceClaimsCanOverlapAcrossCurrentLegacyAndTracker,true);
});
test('A completely new Event identity can only enter the Staff review queue',()=>{
  const r=review(f=>{
    f.current.convoyRecords.push({
      ...f.current.convoyRecords[1],
      threadId:'990000000000000077',
      eventId:'new-event-77',
      sourceDigest:hash('new event')
    });
    adjustTotals(f);
  });
  assert.equal(r.counts.newEventClaims,1);
  assert.ok(has(r,'new-source-event-requires-staff-review'));
  assert.equal(r.snapshotOrEventsCommitted,0);
});
test('Changing canonical Event identity of a previously observed thread is never silently renamed',()=>{
  const r=review(f=>{
    for(const row of f.current.convoyRecords)row.eventId='renamedEvent';
  });
  assert.equal(r.counts.previouslySeenSourceThreadIdentityChanged,2);
  assert.equal(r.counts.missingPreviouslySeenEventClaims,1);
  assert.equal(r.counts.newEventClaims,1);
  assert.ok(has(r,'same-thread-canonical-event-identity-changed'));
});
test('Conflicting status between current and legacy snapshots remains ambiguous',()=>{
  const r=review(f=>{f.current.convoyRecords[0].status='Cancelled';});
  assert.equal(r.counts.ambiguousMultiSourceEventClaims,1);
  assert.ok(has(r,'same-event-multiple-conflicting-source-states'));
  assert.equal(r.freeSlotsCertified,false);
});
test('A vanished source channel is not automatically removed or assumed empty',()=>{
  const r=review(f=>{
    const legacy=f.current.channelInventory[1].channelId;
    f.current.channelInventory.pop();
    f.current.convoyRecords=f.current.convoyRecords.filter(x=>x.channelId!==legacy);
  });
  assert.equal(r.counts.sourceChannelMissing,1);
  assert.ok(has(r,'previous-channel-not-in-later-inventory'));
  assert.equal(r.physicalRecordsDeleted,0);
});
test('A declared month coverage shrink is an urgent review issue even with no record deleted',()=>{
  const r=review(f=>{
    f.current.channelInventory[1].firstCoveredMonth='2026-11';
    f.current.channelInventory[1].lastCoveredMonth='2026-11';
  });
  assert.equal(r.counts.sourceChannelCoverageChanged,1);
  assert.ok(has(r,'source-channel-coverage-or-kind-changed'));
});
test('Outbound invitation dropped from later tracker is not auto-withdrawn or cancelled',()=>{
  const r=review(f=>{f.current.tracker.records=[];});
  assert.equal(r.counts.outboundInvitationNotObserved,1);
  assert.ok(has(r,'previous-outbound-invitation-not-observed'));
  assert.equal(r.outboundAcceptedDoesNotAuthorizeKingsCapacity,true);
});
test('Outgoing invitation status/date/event link change all require review independently',()=>{
  const r=review(f=>{
    f.current.tracker.records[0].status='Declined';
    f.current.tracker.records[0].departureAtUtc='2026-11-22T18:00:00.000Z';
    f.current.tracker.records[0].eventId=null;
  });
  assert.equal(r.counts.outboundInvitationStatusChanged,1);
  assert.equal(r.counts.outboundInvitationDateChanged,1);
  assert.equal(r.counts.outboundInvitationEventLinkChanged,1);
  assert.equal(r.staffDecisionsCommitted,0);
});
test('A second new outbound invitation does not create another Center Event claim',()=>{
  const r=review(f=>{
    f.current.tracker.records.push({
      ...f.current.tracker.records[0],
      invitationId:'invite2',status:'Sent',
      sourceDigest:hash('second recipient')
    });
  });
  assert.equal(r.counts.outboundInvitationAdded,1);
  assert.equal(r.counts.newEventClaims,0);
  assert.ok(has(r,'new-outbound-invitation-needs-review'));
});
test('Broken candidate pagination blocks source completeness even if all events still appear',()=>{
  const r=review(f=>{
    f.currentPagination.scans=f.currentPagination.scans.filter(
      x=>x.stream!=='archived-public');
  });
  assert.equal(r.laterPagination.sourceClaimScanInternallyComplete,false);
  assert.ok(has(r,'new-source-pagination-or-inventory-incomplete'));
  assert.equal(r.freeSlotsCertified,false);
});
test('Declared source and pagination channel lists must agree, otherwise reviewing is mandatory',()=>{
  const r=review(f=>{
    f.currentPagination.channels.pop();
    f.currentPagination.scans=f.currentPagination.scans.filter(
      x=>x.channelId===f.currentPagination.channels[0].channelId);
  });
  assert.equal(r.laterPagination.channelsAbsentFromPagination,1);
  assert.equal(r.laterPagination.sourceClaimScanInternallyComplete,false);
});
test('A paginated channel with contradictory source coverage produces a separate warning',()=>{
  const r=review(f=>{
    f.currentPagination.channels[1].firstCoveredMonth='2026-09';
  });
  assert.equal(r.laterPagination.channelsWithContradictoryMonthCoverage,1);
  assert.equal(r.laterPagination.sourceClaimScanInternallyComplete,false);
});
test('Source count claims that do not match records must never be silently trusted',()=>{
  const r=review(f=>{
    f.current.channelInventory[0].claimedThreadCount=2;
  });
  assert.equal(r.laterPagination.sourceClaimScanInternallyComplete,true);
  assert.ok(has(r,'source-channel-inventory-counters-contradict-records'));
  assert.equal(r.original24MonthSourceHistoryIndependentlyComplete,false);
});
test('Snapshot timestamp rollback is rejected even if all records remain identical',()=>{
  const f=fixture();f.current.nowMs=f.previous.nowMs-1;
  f.currentPagination.nowMs=f.current.nowMs;
  assert.throws(()=>handoff(f));
});
test('Source scope, forum and historical 24-month bounds cannot silently change',()=>{
  for(const change of [
    f=>{f.current.guildId='990000000000000099';},
    f=>{f.current.currentChannelId='990000000000000099';},
    f=>{f.current.firstMonth='2025-01';},
    f=>{f.current.finalMonth='2026-10';}
  ]){
    const f=fixture();change(f);assert.throws(()=>handoff(f));
  }
});
test('Caller key or invalid snapshot payload never produces plausible success',()=>{
  const f=fixture();f.reviewSecret='small';assert.throws(()=>handoff(f));
  const x=fixture();x.current.tracker.records[0].userToken='PRIVATE';
  assert.throws(()=>handoff(x));
});
test('Preceding and later observation counts stay separate from actual signed historical holds',()=>{
  const r=review();
  assert.equal(r.provisionalOldDateReviewMonths.length,1);
  assert.equal(r.provisionalOldDateReviewMonths[0].month,'2026-11');
  assert.equal(r.provisionalOldDateReviewMonths[0].originalSignedHistoricalHoldProof,false);
  assert.equal(r.independentSignedOwnerHighwaterVerified,false);
  assert.equal(r.physicalRecordsDeleted,0);
});
test('No raw guild/channel/thread/Event/invitation ID, message digest or key escapes summary',()=>{
  const r=review(),output=JSON.stringify(r);
  for(const raw of ['evt100','inv1','990000000000000000',
    '990000000000000001','990000000000000002',
    '990000000000000003','synthetic private source-handoff',
    hash('outbound')])assert.equal(output.includes(raw),false);
  assert.ok(r.reviewItems.every(x=>
    /^source-handoff:[a-f0-9]{40}$/.test(x.reviewKey)));
  assert.equal(r.externalWritesPerformed,0);
});
test('Repeated reviews are deterministic, immutable with respect to input and never migrate data',()=>{
  const f=fixture(),before=structuredClone(f);
  assert.deepEqual(handoff(f),handoff(f));
  assert.deepEqual(f,before);
  assert.equal(handoff(f).snapshotOrEventsCommitted,0);
});
