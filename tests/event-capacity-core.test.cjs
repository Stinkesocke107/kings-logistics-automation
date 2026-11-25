'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,dayAvailability,timestamp,LIMITS}=require('../event-capacity-core');

const from=(id,type,departure,status='Scheduled',other={})=>({
  eventId:String(id),eventType:type,eventTypeVerified:true,status,statusVerified:true,
  departureAtUtc:departure,departureVerified:true,
  meetingAtUtc:'2027-03-20T15:00:00Z',
  plannedEndAtUtc:'2027-03-20T20:00:00Z',
  ...other
});
test('Weekend daily global limit 3 counts Kings but never certifies free slots',()=>{
  const r=evaluate([
    from(1,'Partner Convoy','2027-03-20T16:00:00Z'),
    from(2,'External Convoy','2027-03-20T17:00:00Z'),
    from(3,'Kings Convoy','2027-03-20T18:00:00Z'),
    from(4,'Kings Convoy','2027-03-20T19:00:00Z')
  ]);
  assert.deepEqual([r.days['2027-03-20'].combined,r.days['2027-03-20'].kings],[4,2]);
  assert.equal(r.days['2027-03-20'].remaining,null);
  assert.equal(r.days['2027-03-20'].planningRemaining,0);
  assert.equal(LIMITS.combinedDaily,3);
  assert.equal(LIMITS.partnerMonthly,20);
  assert.equal(LIMITS.externalMonthly,20);
  assert.equal(LIMITS.kingsMonthly,null);
  assert.equal(LIMITS.kingsQuotaExempt,false);
  assert.ok(r.warnings.some(x=>x.code==='combined-day-over-limit'));
});
test('Four partner/external convoys on Thursday trigger the 3/day planning review',()=>{
  const r=evaluate([
    from(1,'External Convoy','2027-03-25T16:00:00Z'),
    from(2,'Partner Convoy','2027-03-25T17:00:00Z'),
    from(3,'External Convoy','2027-03-25T18:00:00Z'),
    from(4,'Partner Convoy','2027-03-25T19:00:00Z')
  ]);
  assert.equal(r.days['2027-03-25'].combined,4);
  assert.equal(r.warnings.find(x=>x.code==='combined-day-over-limit').limit,3);
  assert.equal(r.days['2027-03-25'].remaining,null);
});
test('Independent 20/month thresholds flag over-limit Partner but not External',()=>{
  const items=[];
  for(let i=0;i<21;i++)items.push(from(100+i,'Partner Convoy','2027-03-20T16:00:00Z'));
  for(let i=0;i<20;i++)items.push(from(200+i,'External Convoy','2027-03-21T16:00:00Z'));
  const r=evaluate(items);
  assert.equal(r.months['2027-03'].partner,21);
  assert.equal(r.months['2027-03'].external,20);
  assert.equal(r.months['2027-03'].partnerRemaining,null);
  assert.equal(r.months['2027-03'].externalRemaining,null);
  assert.equal(r.warnings.some(x=>x.code==='partner-month-over-limit'),true);
  assert.equal(r.warnings.some(x=>x.code==='external-month-over-limit'),false);
});
test('UTC departure rather than meeting or metadata eventDate determines allocation',()=>{
  const r=evaluate([from(1,'Partner Convoy','2027-04-01T00:15:00+02:00','Scheduled',{
    meetingAtUtc:'2027-03-31T21:00:00Z',plannedEndAtUtc:'2027-04-01T01:00:00Z',
    possibleUtcDate:'2027-04-01'
  })]);
  assert.equal(r.days['2027-03-31'].combined,1);
  assert.equal(r.months['2027-03'].partner,1);
  assert.equal(r.days['2027-04-01'],undefined);
});
test('Pending statuses do not count; completed retains original quota, not attendance evidence',()=>{
  const r=evaluate([
    from(1,'Partner Convoy','2027-03-20T16:00:00Z','Completed'),
    from(2,'Partner Convoy','2027-03-20T17:00:00Z','Submitted'),
    from(3,'External Convoy','2027-03-20T18:00:00Z','Ready for Approval'),
    from(4,'Partner Convoy','2027-03-20T19:00:00Z','Cancelled')
  ]);
  assert.equal(r.counted,1);
  assert.equal(r.pending.length,2);
  assert.equal(r.attendanceInferred,false);
});
test('Rescheduling counts only at the new verified accepted date',()=>{
  const candidate=from(1,'Partner Convoy','2027-03-21T16:00:00Z','Rescheduled',{
    meetingAtUtc:'2027-03-21T15:00:00Z',plannedEndAtUtc:'2027-03-21T18:00:00Z'
  });
  const pending=evaluate([candidate]);
  assert.equal(pending.counted,0);
  assert.equal(dayAvailability(pending,'2027-03-21').verified,false);
  const approved=evaluate([{...candidate,rescheduleApproved:true}]);
  assert.equal(approved.days['2027-03-21'].partner,1);
  assert.equal(approved.days['2027-03-20'],undefined);
});
test('Identical duplicate Event IDs count once; contradictory duplicates block verified free',()=>{
  const a=from(1,'Partner Convoy','2027-03-20T16:00:00Z');
  const identical=evaluate([a,{...a,threadId:'secondary'}]);
  assert.equal(identical.counted,1);
  const conflicting=evaluate([a,{...a,eventType:'External Convoy'}]);
  assert.equal(conflicting.counted,0);
  assert.ok(conflicting.issues.some(x=>x.code==='conflicting-duplicate'));
  assert.equal(dayAvailability(conflicting,'2027-03-20').verified,false);
});
test('Missing official type, UTC departure, source verification or end fails closed',()=>{
  const items=[
    from(1,'Partner Convoy',null,'Scheduled',{possibleUtcDate:'2027-03-20'}),
    from(2,'Partner Convoy','2027-03-20T17:00:00Z','Scheduled',{eventTypeVerified:false}),
    from(3,'Partner Convoy','2027-03-20T18:00:00Z','Scheduled',{plannedEndAtUtc:null})
  ];
  const r=evaluate(items);
  assert.equal(r.counted,1);
  assert.equal(dayAvailability(r,'2027-03-20').verified,false);
  assert.ok(r.issues.some(x=>x.code==='unverified-departure'));
  assert.ok(r.issues.some(x=>x.code==='end-time-unknown'));
});
test('Stale source never produces verified availability',()=>{
  const r=evaluate([],{dataFresh:false});
  assert.equal(dayAvailability(r,'2027-03-20').freeVerified,false);
  assert.equal(dayAvailability(r,'2027-03-20').verified,false);
});
test('2h departure gap is advisory and crosses UTC midnight',()=>{
  const r=evaluate([
    from(1,'Kings Convoy','2027-03-20T23:30:00Z','Scheduled',{
      meetingAtUtc:'2027-03-20T23:00:00Z',plannedEndAtUtc:'2027-03-21T01:00:00Z'
    }),
    from(2,'External Convoy','2027-03-21T00:30:00Z','Scheduled',{
      meetingAtUtc:'2027-03-21T00:00:00Z',plannedEndAtUtc:'2027-03-21T02:00:00Z'
    })
  ]);
  const w=r.warnings.find(x=>x.code==='departure-under-two-hours');
  assert.equal(w.minutesApart,60);
  assert.equal(r.warnings.find(x=>x.code==='meeting-end-overlap').priorityConflict,true);
  assert.equal(r.days['2027-03-21'].external,1);
});
test('Exception claim is recorded but does not change the weekday cap',()=>{
  const records=[
    from(1,'Partner Convoy','2027-03-25T16:00:00Z'),
    from(2,'External Convoy','2027-03-25T17:00:00Z'),
    from(3,'Partner Convoy','2027-03-25T18:00:00Z','Scheduled',
      {exceptionApprovedBy:'Event Management'}),
    from(4,'External Convoy','2027-03-25T19:00:00Z')
  ];
  const r=evaluate(records);
  assert.equal(r.days['2027-03-25'].combined,4);
  assert.equal(r.days['2027-03-25'].approvedExceptions,1);
  assert.equal(r.days['2027-03-25'].remaining,null);
  assert.equal(r.warnings.find(x=>x.code==='combined-day-over-limit').approvedExceptions,1);
});
test('Strict timezone parsing never guesses and rejects overflow dates',()=>{
  assert.equal(timestamp('2027-03-20T16:00:00Z'),Date.parse('2027-03-20T16:00:00Z'));
  assert.equal(timestamp('2027-03-20T17:00:00+01:00'),Date.parse('2027-03-20T16:00:00Z'));
  assert.equal(timestamp('2027-03-20T16:00:00'),null);
  assert.equal(timestamp('2027-02-31T16:00:00Z'),null);
  assert.equal(timestamp('2027-03-20T16:00:00+14:30'),null);
});
test('The evaluator has no side effects on event inputs',()=>{
  const a=from(1,'Partner Convoy','2027-03-20T16:00:00Z');
  const original=JSON.stringify(a);
  evaluate([a]);
  assert.equal(JSON.stringify(a),original);
});

test('Fresh current snapshot may show planning counts but cannot certify free slots',()=>{
  const base=[from(1,'Partner Convoy','2027-03-20T16:00:00Z')];
  const unknown=evaluate(base);
  assert.equal(dayAvailability(unknown,'2027-03-20').verified,false);
  const fresh=evaluate(base,{dataFresh:true});
  assert.equal(dayAvailability(fresh,'2027-03-20').verified,true);
  assert.equal(dayAvailability(fresh,'2027-03-20').partnerAvailableVerified,false);
  assert.equal(dayAvailability(fresh,'2027-03-20').externalAvailableVerified,false);
  assert.equal(dayAvailability(fresh,'2027-03-20').remaining,null);
  assert.equal(dayAvailability(fresh,'2027-03-20').planningRemaining,2);
  const records=[];
  for(let i=0;i<20;i++)records.push(from(100+i,'Partner Convoy','2027-03-21T16:00:00Z','Scheduled',{
    meetingAtUtc:'2027-03-21T15:00:00Z',plannedEndAtUtc:'2027-03-21T20:00:00Z'
  }));
  const full=evaluate(records,{dataFresh:true});
  const day=dayAvailability(full,'2027-03-22');
  assert.equal(day.partnerAvailableVerified,false);
  assert.equal(day.externalAvailableVerified,false);
  assert.equal(day.freeVerified,false);
  assert.equal(day.planningRemaining,3);
});

test('Kings Convoys cannot exceed total 3/day even though monthly Kings is unlimited',()=>{
  const rows=Array.from({length:4},(_,i)=>from(i+1,'Kings Convoy',
    '2027-03-28T'+String(8+i*3).padStart(2,'0')+':00:00Z'));
  const r=evaluate(rows);
  assert.equal(r.days['2027-03-28'].combined,4);
  assert.equal(r.months['2027-03'].kings,4);
  assert.equal(r.warnings.some(w=>w.code==='combined-day-over-limit'),true);
  assert.equal(r.warnings.some(w=>w.code==='kings-month-over-limit'),false);
  assert.equal(dayAvailability(r,'2027-03-28').freeVerified,false);
});
test('Exactly 20 monthly Partner + 20 External source claims are at, not over, both caps',()=>{
  const rows=[];
  for(let i=0;i<20;i++){
    rows.push(from(100+i,'Partner Convoy',
      '2027-03-'+String(i+1).padStart(2,'0')+'T09:00:00Z'));
    rows.push(from(200+i,'External Convoy',
      '2027-03-'+String(i+1).padStart(2,'0')+'T13:00:00Z'));
  }
  const r=evaluate(rows);
  assert.equal(r.months['2027-03'].partnerLimitReached,true);
  assert.equal(r.months['2027-03'].externalLimitReached,true);
  assert.equal(r.months['2027-03'].partnerOverLimit,false);
  assert.equal(r.months['2027-03'].externalOverLimit,false);
  assert.equal(r.warnings.some(w=>w.code==='partner-month-over-limit'),false);
  assert.equal(r.warnings.some(w=>w.code==='external-month-over-limit'),false);
});
