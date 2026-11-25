'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectKingsOutboundCenterLinks}
  =require('../event-capacity-outbound-center-link-audit');
const {fixture,invite,h}=require('./fixtures/outbound-center-scenario.cjs');
test('Repeated reviews over the exact same source snapshot produce identical redacted review reports',()=>{
  const f=fixture();
  const first=inspectKingsOutboundCenterLinks(f);
  const second=inspectKingsOutboundCenterLinks(f);
  assert.deepEqual(first,second);
  assert.equal(first.safeToActivate,false);
});
test('Running source crosscheck never mutates current, archived or outbound input records',()=>{
  const f=fixture(),before=structuredClone(f);
  inspectKingsOutboundCenterLinks(f);
  assert.deepEqual(f,before);
});
test('Changing the private HMAC review key rotates review identifiers but preserves aggregate facts',()=>{
  const x=fixture(),y=structuredClone(x);
  y.reviewSecret='a different synthetic private HMAC key for review';
  const a=inspectKingsOutboundCenterLinks(x),
    b=inspectKingsOutboundCenterLinks(y);
  assert.deepEqual(a.counts,b.counts);
  assert.notDeepEqual(a.reviewItems.map(i=>i.reviewKey),
    b.reviewItems.map(i=>i.reviewKey));
  assert.equal(a.eventCapacityBookingsAdded,0);
});
test('Multiple incoming sources and outgoing invitations are never merged into one approved event count',()=>{
  const f=fixture();
  f.tracker.records.push(invite({
    invitationId:'inv2',status:'Sent',sourceDigest:h('separate recipient')
  }));
  const a=inspectKingsOutboundCenterLinks(f);
  assert.equal(a.counts.linkedByCanonicalEventId,2);
  assert.equal(a.counts.multipleOutboundInvitationGroups,1);
  assert.equal(a.eventCapacityBookingsAdded,0);
  assert.equal(a.staffDecisionsCommitted,0);
});
test('Input source row order does not change aggregate acceptance constraints',()=>{
  const f=fixture(),copy=structuredClone(f);
  copy.convoyRecords.reverse();
  const a=inspectKingsOutboundCenterLinks(f),
    b=inspectKingsOutboundCenterLinks(copy);
  assert.deepEqual(a.counts,b.counts);
  assert.equal(a.freeSlotsCertified,false);
  assert.equal(b.freeSlotsCertified,false);
});
test('No report leaks actual outgoing invitation record IDs regardless of synthetic source order',()=>{
  const f=fixture();f.tracker.records[0].invitationId='uniqueoutbound777';
  const output=JSON.stringify(inspectKingsOutboundCenterLinks(f));
  assert.equal(output.includes('uniqueoutbound777'),false);
  assert.equal(output.includes('evt100'),false);
  assert.equal(output.includes('PRIVATE KEY'),false);
});
