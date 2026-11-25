'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {evaluate}=require('../event-capacity-core');
const {projectKingsConvoySystemBridge}
  =require('../event-capacity-convoy-system-calendar-bridge');
const {projectKingsInvitationCalendarOffline:link,
  renderKingsInvitationCalendarOfflinePreview:render}
  =require('../event-capacity-invitation-lifecycle-bridge');
const NOW='2027-05-20T12:00:00.000Z';
const G='990000000000000000',C='990000000000000001',
  L='990000000000000002',T='990000000000000003',
  TL='990000000000000004';
const hash=x=>createHash('sha256').update(x).digest('hex');
const DEPART='2027-05-27T18:00:00.000Z';
const CREATED='2027-05-10T11:00:00.000Z';
function channel(id,kind){
  return {channelId:id,kind,firstCoveredMonth:'2025-06',
    lastCoveredMonth:'2027-05',claimedThreadCount:1,
    claimedArchivedCount:0,claimedDeletedCount:0,
    currentThreadsRead:true,archivedThreadsRead:true,
    deletedThreadsReviewed:true,editHistoryReviewed:true};
}
function convoy(id,thread,kind){
  return {channelId:id,threadId:thread,eventId:'event-A',
    sourceKind:kind,status:'Scheduled',category:'Partner Convoy',
    departureAtUtc:DEPART,modifiedAtUtc:'2027-05-11T14:00:00.000Z',
    sourceDigest:hash('convoy-'+thread),
    revisionDigests:[hash('revision-'+thread)]};
}
function invite(id='A',patch={}){
  return {invitationId:id,eventId:'event-A',departureAtUtc:DEPART,
    createdAtUtc:CREATED,replyDueAtUtc:'2027-05-18T10:00:00.000Z',
    sourceDigest:hash('invite-'+id),...patch};
}
function step(id,status,time){
  return {invitationId:id,status,atUtc:time,sourceDigest:hash(id+status+time)};
}
function fixture(){
  const bridgeInput={
    sourceIntake:{guildId:G,currentChannelId:C,
      firstMonth:'2025-06',finalMonth:'2027-05',
      nowMs:Date.parse(NOW),
      reviewSecret:'synthetic HMAC key for offline Kings Event source audit',
      channelInventory:[channel(C,'current'),channel(L,'legacy')],
      convoyRecords:[convoy(C,T,'current'),convoy(L,TL,'legacy')],
      tracker:null},
    capacity:evaluate([{
      eventId:'event-A',eventType:'Partner Convoy',
      eventTypeVerified:true,status:'Scheduled',statusVerified:true,
      departureAtUtc:'2027-05-27T18:00:00Z',departureVerified:true,
      meetingAtUtc:'2027-05-27T17:00:00Z',
      plannedEndAtUtc:'2027-05-27T20:00:00Z'
    }],{dataFresh:true}),
    year:'2027',selectedMonth:'2027-05',
    historicalHoldsReports:[],historicalEvidenceReport:null
  };
  const invitationClaims={asOfUtc:NOW,invitations:[invite()],
    changes:[step('A','Sent','2027-05-11T12:00:00.000Z')]};
  return {bridgeInput,invitationClaims};
}
const run=mutate=>{const f=fixture();mutate?.(f);return link(f);};
function currentDay(c){
  const day=c.crossSystem.calendar.days.find(d=>d.utcDate==='2027-05-27');
  assert.ok(day);
  return day;
}
test('one unanswered overdue invite joins existing source review but not capacity',()=>{
  const r=run();
  assert.equal(r.invitationReview.counts.total,1);
  assert.equal(r.invitationReview.counts.pendingReplies,1);
  assert.equal(r.invitationReview.counts.overdueReplyReview,1);
  assert.equal(r.crossSystem.sourceReview.outboundTrackerClaimedInvitations,1);
  assert.equal(r.crossSystem.sourceReview.trackerClaimedLinkedEvents,1);
  assert.equal(currentDay(r).snapshotCombined,1);
  assert.equal(r.invitationsAddedToCapacity,0);
  assert.equal(r.safeToActivate,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Accepted outbound invitation never becomes accepted Kings booking',()=>{
  const r=run(f=>f.invitationClaims.changes.push(
    step('A','Accepted','2027-05-19T12:00:00.000Z')));
  assert.equal(r.invitationReview.counts.accepted,1);
  assert.equal(r.invitationReview.counts.pendingReplies,0);
  assert.equal(currentDay(r).snapshotCombined,1);
  assert.equal(r.eventBookingsCreated,0);
  assert.equal(r.staffApprovalsCommitted,0);
  assert.equal(r.crossSystem.staffDecisionsCommitted,0);
  assert.equal(r.crossSystem.outboundInvitationAcceptedNeverAutomaticallyCountsForCapacity,true);
});
test('Duplicate invitations for one Event remain two review claims and one calendar snapshot',()=>{
  const r=run(f=>{
    f.invitationClaims.invitations.push(invite('B'));
    f.invitationClaims.changes.push(
      step('B','Sent','2027-05-11T12:00:00.000Z'));
  });
  assert.equal(r.invitationReview.counts.duplicateEventLinkClaims,2);
  assert.equal(r.crossSystem.sourceReview.outboundTrackerClaimedInvitations,2);
  assert.equal(currentDay(r).snapshotCombined,1);
  assert.equal(r.staffApprovalsCommitted,0);
});
test('Unmatched Event references stay review-needed without adding capacity',()=>{
  const r=run(f=>{
    f.invitationClaims.invitations[0].eventId='missing-other-event';
  });
  assert.equal(r.crossSystem.sourceReview.trackerClaimedLinkedEvents,0);
  assert.equal(currentDay(r).snapshotCombined,1);
  assert.ok(r.crossSystem.sourceReview.unresolvedHumanReviewItems>0);
});
test('Missing Event link is a manual-review claim, not implicit match by departure date',()=>{
  const r=run(f=>{f.invitationClaims.invitations[0].eventId=null;});
  assert.equal(r.invitationReview.counts.unlinkedEventClaims,1);
  assert.equal(r.crossSystem.sourceReview.trackerClaimedLinkedEvents,0);
  assert.equal(currentDay(r).snapshotCombined,1);
});
test('No invitation rows still does not certify source completeness',()=>{
  const r=run(f=>{
    f.invitationClaims.invitations=[];
    f.invitationClaims.changes=[];
  });
  assert.equal(r.invitationReview.counts.total,0);
  assert.equal(r.crossSystem.sourceReview.outboundTrackerClaimedInvitations,0);
  assert.equal(r.trackerSourceSuppliedButUnauthenticated,true);
  assert.equal(r.crossSystem.eventInvitationTrackerActuallyConnectedHere,false);
});
test('An existing tracker object cannot be overwritten or counted twice',()=>{
  assert.throws(()=>run(f=>{
    f.bridgeInput.sourceIntake.tracker={
      configured:true,connected:true,claimsComplete:true,records:[]};
  }));
  assert.throws(()=>run(f=>{
    f.bridgeInput.sourceIntake.tracker={
      configured:false,connected:false,claimsComplete:false,records:[]};
  }));
});
test('Source time mismatch cannot be used to bypass overdue checks',()=>{
  assert.throws(()=>run(f=>{f.invitationClaims.asOfUtc='2027-05-19T12:00:00.000Z';}));
  assert.throws(()=>run(f=>{f.bridgeInput.sourceIntake.nowMs+=1000;}));
});
test('Unsupported status transition cannot become an Accepted import',()=>{
  assert.throws(()=>run(f=>{
    f.invitationClaims.changes=[
      step('A','Accepted','2027-05-11T12:00:00.000Z')];
  }));
});
test('Duplicate invitation IDs are not collapsed or silently deduplicated',()=>{
  assert.throws(()=>run(f=>f.invitationClaims.invitations.push(invite('A'))));
});
test('An invite outside the 24-month source window cannot be silently omitted',()=>{
  assert.throws(()=>run(f=>{
    f.invitationClaims.invitations[0].departureAtUtc='2027-06-01T18:00:00.000Z';
    f.invitationClaims.invitations[0].replyDueAtUtc='2027-05-22T10:00:00.000Z';
  }));
});
test('Private result and ephemeral preview contain no raw invitation or Discord IDs',()=>{
  const r=run();
  const output=JSON.stringify(r),preview=render(r);
  assert.equal(preview.type,4);
  assert.equal(preview.data.flags,64);
  assert.deepEqual(preview.data.allowed_mentions,{parse:[]});
  assert.match(preview.data.content,/overdue follow-ups 1/);
  assert.match(preview.data.content,/No invitation approval, reminder, booking or capacity change/);
  for(const raw of [G,C,L,T,TL,'event-A','"invitationId":"A"',
    hash('invite-A'),CREATED,DEPART])
    assert.equal(output.includes(raw),false);
  for(const raw of [G,C,L,T,TL,'event-A',hash('invite-A'),DEPART])
    assert.equal(JSON.stringify(preview).includes(raw),false);
  assert.equal(r.remindersSent,0);
});
test('Tampered activation and tracker-connection claims cannot be rendered',()=>{
  const r=run();
  assert.throws(()=>render({...r,safeToActivate:true}));
  assert.throws(()=>render({...r,staffApprovalsCommitted:1}));
  assert.throws(()=>render({...r,crossSystem:{
    ...r.crossSystem,eventInvitationTrackerActuallyConnectedHere:true
  }}));
});
test('The old source input is never mutated by this offline bridge',()=>{
  const f=fixture();
  const orig=JSON.stringify(f.bridgeInput);
  const r=link(f);
  assert.equal(JSON.stringify(f.bridgeInput),orig);
  assert.equal(f.bridgeInput.sourceIntake.tracker,null);
  assert.equal(r.usingOnlyExistingSourceIntakeTrackerContract,true);
  const before=projectKingsConvoySystemBridge(f.bridgeInput);
  assert.equal(before.calendar.days.find(d=>d.utcDate==='2027-05-27').snapshotCombined,
    currentDay(r).snapshotCombined);
});
test('No external API, GitHub or production workflow wiring is introduced',()=>{
  const file=readFileSync(path.resolve(__dirname,
    '../event-capacity-invitation-lifecycle-bridge.js'),'utf8');
  assert.doesNotMatch(file,/require\(['"](?:node:https|node:http|discord\.js|@octokit)['"]\)/);
  assert.doesNotMatch(file,/fetch\s*\(|process\.env|client\.post\(|discord\.post\(/);
});

test('Future invitations outside the historical window are tracked for human review, never dropped or counted',()=>{
  const r=run(f=>{
    f.invitationClaims.invitations[0].departureAtUtc='2027-06-27T18:00:00.000Z';
    f.invitationClaims.changes.push(step('A','Accepted','2027-05-19T12:00:00.000Z'));
  });
  assert.equal(r.invitationReview.counts.total,1);
  assert.equal(r.invitationReview.counts.accepted,1);
  assert.equal(r.futureInvitationClaimsOutsideHistoricalWindow,1);
  assert.equal(r.futureInvitationsRequireVerifiedCenterReview,true);
  assert.equal(r.crossSystem.sourceReview.outboundTrackerClaimedInvitations,0);
  assert.equal(currentDay(r).snapshotCombined,1);
  assert.equal(r.invitationsAddedToCapacity,0);
  assert.match(render(r).data.content,/future source claims pending manual Center link 1/);
  assert.equal(r.safeToActivate,false);
});
test('Beyond twelve future UTC months is rejected rather than claiming Event Calendar coverage',()=>{
  assert.throws(()=>run(f=>{
    f.invitationClaims.invitations[0].departureAtUtc='2028-06-27T18:00:00.000Z';
  }));
});
