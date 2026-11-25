'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {inspectKingsOutboundCenterLinks}=require('../event-capacity-outbound-center-link-audit');
const h=s=>crypto.createHash('sha256').update(s).digest('hex');
function fixture(){
  const C='990000000000000001';
  return {
    guildId:'990000000000000000',currentChannelId:C,
    firstMonth:'2024-12',finalMonth:'2026-11',
    nowMs:Date.parse('2026-11-25T15:00:00.000Z'),
    reviewSecret:'synthetic offline HMAC key for unit testing only',
    channelInventory:[{channelId:C,kind:'current',
      firstCoveredMonth:'2024-12',lastCoveredMonth:'2026-11',
      claimedThreadCount:1,claimedArchivedCount:0,claimedDeletedCount:0,
      currentThreadsRead:true,archivedThreadsRead:true,
      deletedThreadsReviewed:true,editHistoryReviewed:true}],
    convoyRecords:[{channelId:C,threadId:'990000000000000002',
      eventId:'evt100',sourceKind:'current',status:'Scheduled',
      category:'Partner Convoy',departureAtUtc:'2026-11-20T18:00:00.000Z',
      modifiedAtUtc:'2026-11-19T12:00:00.000Z',
      sourceDigest:h('source'),revisionDigests:[h('revision')]}],
    tracker:{configured:true,connected:true,claimsComplete:true,
      records:[{invitationId:'inv1',eventId:'evt100',status:'Accepted',
        departureAtUtc:'2026-11-20T18:00:00.000Z',
        sourceDigest:h('outbound')}]}
  };
}
test('Matched outbound claim is not a formal Kings approval',()=>{
  const r=inspectKingsOutboundCenterLinks(fixture());
  assert.equal(r.counts.linkedToCurrentCenter,1);
  assert.equal(r.counts.outboundAcceptanceClaimsNotUsedForCapacity,1);
  assert.equal(r.eventCapacityBookingsAdded,0);
  assert.equal(r.safeToActivate,false);
});
test('Cancelled Convoy Center event with outbound Accepted needs urgent review',()=>{
  const f=fixture();f.convoyRecords[0].status='Cancelled';
  const r=inspectKingsOutboundCenterLinks(f);
  assert.equal(r.counts.outboundAcceptedWhileCenterCancelledOrUnknown,1);
  assert.equal(r.staffDecisionsCommitted,0);
});
test('Wrong departure time is flagged, not silently reconciled',()=>{
  const f=fixture();f.tracker.records[0].departureAtUtc='2026-11-21T18:00:00.000Z';
  const r=inspectKingsOutboundCenterLinks(f);
  assert.equal(r.counts.departureDiffersFromAllSources,1);
  assert.equal(r.freeSlotsCertified,false);
});
