'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {review,invite,has,C,L,h}=require('./fixtures/outbound-center-scenario.cjs');
test('Matching both channels links one outgoing invitation without approval authority',()=>{
  const r=review();
  assert.equal(r.counts.linkedByCanonicalEventId,1);
  assert.equal(r.counts.linkedToCurrentCenter,1);
  assert.equal(r.counts.outboundAcceptanceClaimsNotUsedForCapacity,1);
  assert.equal(r.eventCapacityBookingsAdded,0);
  assert.equal(r.safeToActivate,false);
});
test('Unknown eventId and missing canonical eventId are not matched by date',()=>{
  const a=review(x=>{x.tracker.records[0].eventId='missing';});
  assert.equal(a.counts.missingCenterEventLink,1);
  assert.ok(has(a,'outbound-invitation-has-no-matching-center-event'));
  const b=review(x=>{x.tracker.records[0].eventId=null;});
  assert.equal(b.counts.noCanonicalEventLink,1);
  assert.ok(has(b,'outbound-invitation-needs-explicit-event-link'));
});
test('Wrong date from ALL Center and old sources triggers urgent review',()=>{
  const r=review(x=>{
    x.tracker.records[0].departureAtUtc='2026-11-22T18:00:00.000Z';
  });
  assert.equal(r.counts.departureDiffersFromAllSources,1);
  assert.ok(has(r,'outbound-invitation-date-differs-from-center'));
  assert.ok(r.urgentReviewItems>0);
});
test('Outdated outbound departure matching legacy date only flags a likely stale invite',()=>{
  const r=review(x=>{
    x.convoyRecords[1].departureAtUtc='2026-11-18T18:00:00.000Z';
    x.tracker.records[0].departureAtUtc='2026-11-18T18:00:00.000Z';
  });
  assert.equal(r.counts.departureMatchesOldSourceOnly,1);
  assert.ok(has(r,'outbound-invitation-may-use-pre-reschedule-date'));
  assert.equal(r.pastRescheduleDatesNeverAutoReleased,true);
});
test('Accepted outbound and cancelled/unknown Center require urgent review',()=>{
  for(const status of ['Cancelled','Unknown']){
    const r=review(x=>{x.convoyRecords[0].status=status;});
    assert.equal(r.counts.outboundAcceptedWhileCenterCancelledOrUnknown,1,status);
    assert.ok(has(r,'outbound-accepted-center-cancelled-or-unknown'));
  }
});
test('Submitted and approval-pending Center cannot validate outgoing Accepted',()=>{
  for(const status of ['Submitted','Needs Information','Ready for Approval']){
    const r=review(x=>{x.convoyRecords[0].status=status;});
    assert.equal(r.counts.outboundAcceptedWhileCenterNotApproved,1,status);
    assert.ok(has(r,'outbound-accepted-center-not-yet-approved'));
  }
});
test('Declined or Withdrawn invitation never automatically cancels a scheduled Center event',()=>{
  for(const status of ['Declined','Withdrawn']){
    const r=review(x=>{x.tracker.records[0].status=status;});
    assert.equal(r.counts.outboundLifecycleNeedsReview,1,status);
    assert.ok(has(r,'outbound-invitation-declined-center-event-still-listed'));
    assert.equal(r.staffDecisionsCommitted,0);
  }
});
test('Two separate outbound invitations may be legitimate, do not merge their recipient outcomes',()=>{
  const r=review(x=>{x.tracker.records.push(invite({
    invitationId:'inv2',status:'Sent',sourceDigest:h('other invite')
  }));});
  assert.equal(r.counts.outboundInvitationClaims,2);
  assert.equal(r.counts.multipleOutboundInvitationGroups,1);
  assert.equal(r.multipleOutboundInvitationsNotAssumedDuplicateEvents,true);
  assert.ok(has(r,'multiple-outbound-invitations-verify-recipients'));
});
test('Legacy-only match never counts as current Center approval',()=>{
  const r=review(x=>{x.convoyRecords[0].eventId='different';});
  assert.equal(r.counts.linkedToLegacyOnly,1);
  assert.equal(r.counts.linkedToCurrentCenter,0);
  assert.ok(has(r,'outbound-invitation-matches-legacy-only'));
});
test('Absent Tracker must remain source-unverified',()=>{
  const r=review(x=>{x.tracker=null;});
  assert.ok(has(r,'outbound-tracker-not-supplied'));
  assert.ok(has(r,'outbound-tracker-provider-attestation-required'));
  assert.equal(r.outboundTrackerProviderReadHere,false);
});
test('Connected Tracker is a claim, never a provider authentication',()=>{
  const r=review();
  assert.ok(has(r,'outbound-tracker-provider-attestation-required'));
  assert.equal(r.actualEffectiveStaffPermissionsProven,false);
});
test('Secret fields and duplicate IDs are rejected with no leaked secret',()=>{
  assert.throws(()=>review(x=>{x.tracker.records.push(invite());}));
  assert.throws(()=>review(x=>{x.tracker.records[0].token='SECRET';}));
});
test('Report redacts Event/channel IDs and digest material',()=>{
  const r=review(x=>{x.tracker.records[0].eventId='missing';});
  const out=JSON.stringify(r);
  for(const s of ['evt100','missing','inv1',C,L,
    '990000000000000003',h('outbound'),'PRIVATE KEY'])
    assert.equal(out.includes(s),false);
  assert.ok(r.reviewItems.every(i=>/^capacity-outbound:[a-f0-9]{40}$/.test(i.reviewKey)));
});
