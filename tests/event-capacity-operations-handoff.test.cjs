'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {evaluate}=require('../event-capacity-core');
const {projectKingsStaffCalendarReview}
  =require('../event-capacity-staff-calendar-review');
const {projectKingsEventOperationsHandoff:review,
  renderKingsEventOperationsHandoffPreview:render}
  =require('../event-capacity-operations-handoff');
const DAY='2027-04-20',BASE='2027-04-20T';
function request(changes={}){
  return {category:'Partner Convoy',meetingAtUtc:BASE+'17:00:00.000Z',
    departureAtUtc:BASE+'18:00:00.000Z',
    plannedEndAtUtc:BASE+'20:00:00.000Z',...changes};
}
function event(changes={}){
  return {eventId:'private-synthetic-123',eventType:'Partner Convoy',
    status:'Scheduled',statusVerified:true,eventTypeVerified:true,
    departureVerified:true,dataConflict:false,
    departureAtUtc:BASE+'18:00:00Z',meetingAtUtc:BASE+'17:00:00Z',
    plannedEndAtUtc:BASE+'20:00:00Z',...changes};
}
function calendar(records=[]){
  return projectKingsStaffCalendarReview({
    capacity:evaluate(records,{dataFresh:true}),
    year:'2027',selectedMonth:'2027-04',
    historicalHoldsReports:[],historicalEvidenceReport:null
  });
}
function run(changes={}){
  return review({calendar:calendar(),request:request(),event:event(),...changes});
}
test('Accepted candidate connects Booking and Event Operations checklist only as proposals',()=>{
  const r=run();
  assert.equal(r.candidateIdentityAndScheduleMatch,true);
  assert.deepEqual(r.handoffBlockers,[]);
  assert.equal(r.eventClaimStatus,'Scheduled');
  assert.ok(r.preparationRequiredCount>=3);
  assert.ok(r.preparationOptionalCount>0);
  assert.ok(r.preparationProposalCodes.some(c=>c.code==='slot'&&c.required));
  assert.ok(r.preparationProposalCodes.some(c=>c.code==='approval'&&c.required));
  assert.equal(r.bookingReviewReasonCount>=4,true);
  assert.equal(r.preparationReady,false);
  assert.equal(r.checklistTasksCreated,0);
  assert.equal(r.bookingWritten,false);
  assert.equal(r.slotReserved,false);
  assert.equal(r.staffDecisionsCommitted,0);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.safeToActivate,false);
});
test('Canonical second precision event and millisecond request refer to same UTC instant',()=>{
  const r=run();
  assert.equal(r.candidateIdentityAndScheduleMatch,true);
});
test('Unverified source/status or source conflict blocks even checklist proposals',()=>{
  for(const changes of [
    {statusVerified:false},{eventTypeVerified:false},
    {departureVerified:false},{dataConflict:true}
  ]){
    const r=run({event:event(changes)});
    assert.equal(r.preparationProposalCodes.length,0);
    assert.ok(r.handoffBlockers.length>0);
    assert.equal(r.preparationReady,false);
  }
});
test('Cancellation, completed and unaccepted requests do not become active tasks',()=>{
  for(const status of ['Cancelled','Completed','Pending','Submitted',
    'Needs Information','Ready for Approval','Unknown']){
    const r=run({event:event({status})});
    assert.equal(r.candidateIdentityAndScheduleMatch,false);
    assert.ok(r.handoffBlockers.includes('EVENT_NOT_CURRENTLY_ACCEPTED'));
    assert.deepEqual(r.preparationProposalCodes,[]);
  }
});
test('Reschedule must be an explicitly verified caller claim, never proof of final approval',()=>{
  const blocked=run({event:event({status:'Rescheduled',rescheduleApproved:false})});
  assert.ok(blocked.handoffBlockers.includes('RESCHEDULE_NOT_APPROVED'));
  assert.equal(blocked.preparationProposalCodes.length,0);
  const provisional=run({event:event({status:'Rescheduled',rescheduleApproved:true})});
  assert.equal(provisional.candidateIdentityAndScheduleMatch,true);
  assert.equal(provisional.staffDecisionsCommitted,0);
  assert.equal(provisional.freeSlotsCertified,false);
  assert.equal(provisional.originalEventProviderAuthenticated,false);
});
test('Divergent category, departure, meeting, or end time blocks proposed work',()=>{
  const cases=[
    [{eventType:'External Convoy'},'CATEGORY_MISMATCH'],
    [{departureAtUtc:BASE+'19:00:00Z'},'DEPARTURE_MISMATCH'],
    [{meetingAtUtc:BASE+'16:00:00Z'},'MEETING_MISMATCH'],
    [{plannedEndAtUtc:BASE+'21:00:00Z'},'END_MISMATCH']
  ];
  for(const [patch,reason] of cases){
    const r=run({event:event(patch)});
    assert.ok(r.handoffBlockers.includes(reason));
    assert.equal(r.preparationProposalCodes.length,0);
  }
});
test('Missing meeting/end times match only if both sources are missing',()=>{
  const r=run({request:request({meetingAtUtc:null,plannedEndAtUtc:null}),
    event:event({meetingAtUtc:null,plannedEndAtUtc:null})});
  assert.equal(r.candidateIdentityAndScheduleMatch,true);
  assert.equal(r.preparationReady,false);
  assert.equal(r.bookingReviewReasonCount>=6,true);
});
test('Three already reported Convoys reach universal day cap without counting candidate',()=>{
  const e=event();
  const items=[
    {eventId:'other-a',eventType:'Partner Convoy',eventTypeVerified:true,
      status:'Scheduled',statusVerified:true,departureVerified:true,
      departureAtUtc:BASE+'18:00:00Z'},
    {eventId:'other-b',eventType:'Partner Convoy',eventTypeVerified:true,
      status:'Scheduled',statusVerified:true,departureVerified:true,
      departureAtUtc:BASE+'19:00:00Z'},
    {eventId:'other-c',eventType:'Kings Convoy',eventTypeVerified:true,
      status:'Scheduled',statusVerified:true,departureVerified:true,
      departureAtUtc:BASE+'21:00:00Z'}
  ];
  const r=run({event:e,calendar:calendar(items)});
  assert.equal(r.bookingObservedDailyLimitReached,true);
  assert.equal(r.bookingWritten,false);
  assert.equal(r.slotReserved,false);
});
test('Kings quota exemption does not bypass preparation reviews or create slots',()=>{
  const r=run({request:request({category:'Kings Convoy'}),
    event:event({eventType:'Kings Convoy'})});
  assert.equal(r.candidateIdentityAndScheduleMatch,true);
  assert.equal(r.bookingObservedDailyLimitReached,false);
  assert.ok(r.preparationProposalCodes.some(c=>c.code==='convoy-control'));
  assert.equal(r.staffDecisionsCommitted,0);
  assert.equal(r.slotReserved,false);
});
test('Invalid event identity and noncanonical UTC event source are refused',()=>{
  for(const changes of [
    {eventId:'<@everyone>',threadId:null},
    {eventId:null,threadId:null},
    {departureAtUtc:'2027-02-30T18:00:00Z'},
    {meetingAtUtc:'2027-04-20T17:00:00+02:00'},
    {plannedEndAtUtc:'2027-04-20T25:00:00Z'},
    {status:'Bogus'}
  ])assert.throws(()=>run({event:event(changes)}));
});
test('Renderer shows redacted counts and rejects forged booked/approved statuses',()=>{
  const r=run(),message=render(r),raw=JSON.stringify(message);
  assert.equal(message.type,4);
  assert.equal(message.data.flags,64);
  assert.deepEqual(message.data.allowed_mentions,{parse:[]});
  assert.ok(raw.includes('No booking, checklist task, approval or free slot created'));
  for(const secret of ['private-synthetic-123','DISCORD_BOT_TOKEN',
    '@everyone','PRIVATE KEY'])
    assert.equal(raw.includes(secret),false);
  for(const patch of [
    {freeSlotsCertified:true},{slotReserved:true},{bookingWritten:true},
    {checklistTasksCreated:1},{staffDecisionsCommitted:1},
    {discordMessagesSent:1},{verifiedStaffRolesChecked:true},
    {preparationReady:true},{candidateIdentityAndScheduleMatch:false},
    {preparationRequiredCount:0}
  ])assert.throws(()=>render({...r,...patch}));
});
test('New handoff stays isolated from production and contains no network calls',()=>{
  const root=path.join(__dirname,'..'),
    code=fs.readFileSync(path.join(root,'event-capacity-operations-handoff.js'),'utf8'),
    live=fs.readFileSync(path.join(root,'convoy-checker.js'),'utf8'),
    workflow=fs.readFileSync(path.join(root,'.github/workflows/convoy-checker.yml'),'utf8');
  for(const source of [live,workflow])
    assert.equal(source.includes('event-capacity-operations-handoff'),false);
  assert.doesNotMatch(code,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/discord/);
  assert.match(code,/checklistTasksCreated:0,bookingWritten:false,slotReserved:false/);
  assert.match(code,/freeSlotsCertified:false,safeToActivate:false/);
});

test('Operations handoff carries Kings-first priority without moving confirmed bookings',()=>{
  for(const [category,rank] of [
    ['Kings Convoy',1],['Partner Convoy',2],['External Convoy',3]
  ]){
    const r=run({request:request({category}),event:event({eventType:category})});
    assert.equal(r.candidatePriorityRank,rank);
    assert.equal(r.newUnconfirmedRequestPriorityOnly,true);
    assert.equal(r.confirmedEventsNeverAutoPreempted,true);
    assert.equal(r.bookingWritten,false);
    assert.equal(r.slotReserved,false);
    assert.equal(r.staffDecisionsCommitted,0);
    assert.equal(r.freeSlotsCertified,false);
  }
});
test('Operations renderer refuses forged priority or a suggested automatic displacement',()=>{
  const r=run();
  assert.throws(()=>render({...r,candidatePriorityRank:1}));
  assert.throws(()=>render({...r,confirmedEventsNeverAutoPreempted:false}));
  assert.equal(render(r).type,4);
});
