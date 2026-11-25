'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {reviewKingsEventInvitationsOffline:run}=require('../event-invitation-tracker-offline');
const dig=s=>createHash('sha256').update(s).digest('hex');
const NOW='2026-11-25T21:00:00.000Z';
const CREATED='2026-11-20T10:00:00.000Z';
function invite(id,patch={}){
  return {invitationId:id,eventId:'event-'+id,departureAtUtc:'2026-12-05T18:00:00.000Z',
    createdAtUtc:CREATED,replyDueAtUtc:'2026-11-24T18:00:00.000Z',sourceDigest:dig(id+' seed'),...patch};
}
function step(id,status,at,seed){return {invitationId:id,status,atUtc:at,sourceDigest:dig(seed||id+status+at)};}
function review(invitations=[],changes=[]){return run({asOfUtc:NOW,invitations,changes});}
const SENT=step('A','Sent','2026-11-21T12:00:00.000Z');
test('empty offline source claims never certify a booking or real connection',()=>{
  const r=review();
  assert.equal(r.counts.total,0);
  assert.equal(r.readOnly,true);
  assert.equal(r.trackerConnectedHere,false);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.safeToActivate,false);
});
test('sent, unanswered, overdue invitation is human-review only, never auto-reminded',()=>{
  const r=review([invite('A')],[SENT]);
  assert.equal(r.counts.sent,1);
  assert.equal(r.counts.pendingReplies,1);
  assert.equal(r.counts.overdueReplyReview,1);
  assert.equal(r.remindersSent,0);
  assert.deepEqual(r.reviewItems.map(x=>x.reason),['REPLY_DUE_HUMAN_FOLLOWUP']);
});
test('accepted invite does NOT give staff approval, book slot or claim capacity',()=>{
  const r=review([invite('A')],[SENT,step('A','Accepted','2026-11-22T13:00:00.000Z')]);
  assert.equal(r.counts.accepted,1);
  assert.equal(r.counts.overdueReplyReview,0);
  assert.equal(r.staffApprovalsCommitted,0);
  assert.equal(r.eventBookingsCreated,0);
  assert.equal(r.capacityReservationsChanged,0);
});
test('declined and withdrawn are terminal, with no pending reminder',()=>{
  const inv=[invite('A'),invite('B')];
  const changes=[SENT,step('A','Declined','2026-11-23T10:00:00.000Z'),
    step('B','Withdrawn','2026-11-21T15:00:00.000Z')];
  const r=review(inv,changes);
  assert.equal(r.counts.declined,1);
  assert.equal(r.counts.withdrawn,1);
  assert.equal(r.counts.pendingReplies,0);
});
test('unlinked event and duplicate event link stay separate manual review items',()=>{
  const r=review([invite('A',{eventId:'shared'}),invite('B',{eventId:'shared'}),
    invite('C',{eventId:null})]);
  assert.equal(r.counts.duplicateEventLinkClaims,2);
  assert.equal(r.counts.unlinkedEventClaims,1);
  assert.equal(r.reviewItemCount,3);
});
test('missing Sent transition cannot turn an invite into accepted proof',()=>{
  assert.throws(()=>review([invite('A')],[step('A','Accepted','2026-11-22T10:00:00.000Z')]));
});
test('status cannot be changed after acceptance, withdrawal or decline',()=>{
  for(const terminal of ['Accepted','Declined','Withdrawn','Unknown']){
    const steps=[SENT,step('A',terminal,'2026-11-22T12:00:00.000Z'),
      step('A','Sent','2026-11-23T12:00:00.000Z')];
    assert.throws(()=>review([invite('A')],steps));
  }
});
test('unknown response and past departure remain unresolved without pretending to recover history',()=>{
  const r=review([invite('A',{departureAtUtc:'2026-11-23T18:00:00.000Z',
    replyDueAtUtc:'2026-11-22T18:00:00.000Z'})],
    [SENT,step('A','Unknown','2026-11-22T12:00:00.000Z')]);
  assert.equal(r.counts.unknown,1);
  assert.equal(r.counts.departedUnresolved,1);
  assert.deepEqual(r.reviewItems.map(x=>x.reason),
    ['DEPARTURE_PASSED_UNRESOLVED','RESPONSE_UNVERIFIED']);
});
test('duplicate invitation ids and unrecognized records are refused',()=>{
  assert.throws(()=>review([invite('A'),invite('A')]));
  assert.throws(()=>review([invite('A',{personName:'private'})]));
  assert.throws(()=>review([invite('A')],[{...SENT,authorId:'private'}]));
});
test('invalid UTC time, impossible date, future source updates, repeated digest fail closed',()=>{
  assert.throws(()=>review([invite('A',{createdAtUtc:'2026-11-31T10:00:00.000Z'})]));
  assert.throws(()=>review([invite('A',{replyDueAtUtc:'2026-12-06T00:00:00.000Z'})]));
  assert.throws(()=>review([invite('A')],[step('A','Sent','2026-12-01T10:00:00.000Z')]));
  assert.throws(()=>review([invite('A')],[SENT,{...step('A','Accepted','2026-11-23T12:00:00.000Z'),sourceDigest:SENT.sourceDigest}]));
  assert.throws(()=>review([invite('A')],[SENT,step('A','Accepted','2026-11-21T12:00:00.000Z')]));
});
test('unknown invitation references or duplicate state transitions are refused',()=>{
  assert.throws(()=>review([invite('A')],[step('missing','Sent','2026-11-21T10:00:00.000Z')]));
  assert.throws(()=>review([invite('A')],[SENT,step('A','Sent','2026-11-22T10:00:00.000Z')]));
});
test('reply due in the future does not create an overdue reminder proposal',()=>{
  const r=review([invite('A',{replyDueAtUtc:'2026-12-02T18:00:00.000Z'})],[SENT]);
  assert.equal(r.counts.pendingReplies,1);
  assert.equal(r.counts.overdueReplyReview,0);
  assert.equal(r.reviewItemCount,0);
});
test('private raw identifiers, event refs, hashes and dates are never serialized into output',()=>{
  const r=review([invite('SECRETINVITE',{eventId:'SECRET_EVENT'})]);
  const output=JSON.stringify(r);
  for(const raw of ['SECRETINVITE','SECRET_EVENT',dig('SECRETINVITE seed'),NOW,CREATED,'2026-12-05'])
    assert.equal(output.includes(raw),false);
  assert.equal(Object.isFrozen(r.counts),true);
  assert.equal(Object.isFrozen(r.reviewItems),true);
});
test('module is not wired into any production GitHub Actions or Discord publisher',()=>{
  const root=path.resolve(__dirname,'..');
  const src=fs.readFileSync(path.join(root,'event-invitation-tracker-offline.js'),'utf8');
  assert.doesNotMatch(src,/require\(['"](?:discord\.js|@octokit|node:https|node:http)['"]\)/);
  assert.doesNotMatch(src,/fetch\s*\(|process\.env|POST\s|PATCH\s/);
});
