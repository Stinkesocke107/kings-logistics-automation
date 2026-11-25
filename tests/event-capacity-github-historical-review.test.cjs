'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planHistoricalReview}
  =require('../event-capacity-github-historical-review');
const {createEmptyLedger,applyDecision}
  =require('../event-capacity-decision-ledger');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const SECRET='synthetic-private-history-review-key-for-dedupe-01234';
const NOW=Date.parse('2027-03-20T12:00:00Z');
const START='2027-03-20T16:00:00Z',MOVE='2027-03-21T16:00:00Z';
const MEET='2027-03-20T15:00:00Z',END='2027-03-20T19:00:00Z';
const ACTOR={id:'111111111111111111',source:'trusted-server-gateway',
  verifiedRoles:['Event Coordination']};
function event(id=10,status='Scheduled',departure=START,extra={}){
  return {eventId:String(id),threadId:String(700000000000000000n+BigInt(id)),
    status,name:'Synthetic historical source',staffStatus:{
      status,authorId:'test-staff',matchedRoleIds:['test-coordination-role'],
      roleSource:'guild-member-lookup'
    },validation:{parsed:{eventType:'Partner Convoy',
      departureAtUtc:departure}},...extra};
}
function source(items=[],legacy=[]){
  return {
    sourceKind:'authenticated-kings-convoy-checker',
    runId:'45502949674',attempt:1,artifactId:'70000000001',
    headSha:'1'.repeat(40),archiveDigest:'2'.repeat(64),
    report:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:items.length,actualConvoys:items.length},
      threads:items},
    overview:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{realConvoySubmissions:items.length,convoyReadErrors:0,
        legacyImportedConvoys:legacy.length,legacyDuplicatesSuppressed:0},
      registeredConvoys:[
        ...items.map(x=>({
          source:'convoy-center',eventId:x.eventId,threadId:x.threadId,
          status:x.status,departureAtUtc:x.validation?.parsed?.departureAtUtc
        })),
        ...legacy]
    }
  };
}
function ledgerFor(items=[],{rescheduled=false,extra=false}={}){
  let l=createEmptyLedger(SCOPE,'2027-03-20T11:25:00Z');
  const apply=(ref,action,value,at='2027-03-20T11:40:00Z')=>{
    l=applyDecision(l,{ref,action,value,expectedRevision:l.revision,
      evidenceRef:'synthetic-archived-staff-approval'},ACTOR,at);
  };
  for(const e of items){
    const ref='event:'+e.eventId;
    apply(ref,'classification','Partner Convoy');
    apply(ref,'departure',rescheduled?START:
      e.validation.parsed.departureAtUtc);
    apply(ref,'meeting',MEET);
    apply(ref,'end',END);
    if(rescheduled){
      apply(ref,'reschedule',e.validation.parsed.departureAtUtc);
      apply(ref,'meeting','2027-03-21T15:00:00Z');
      apply(ref,'end','2027-03-21T19:00:00Z');
    }
  }
  if(extra)apply('event:77777','classification','Kings Convoy');
  return l;
}
function plan(items=[],options={}){
  const ledger=options.ledger||ledgerFor(items,{
    rescheduled:options.rescheduled,extra:options.extra
  });
  return planHistoricalReview({source:source(items,options.legacy||[]),
    ledger,scope:SCOPE,taskSecret:SECRET,nowMs:NOW,
    page:options.page||1,existingTaskKeys:options.linked||[]});
}
const reasons=p=>p.items.map(x=>x.reason);
test('Reviewed accepted event is NOT historic completeness certification',()=>{
  const p=plan([event()]);
  assert.equal(p.version,1);
  assert.equal(p.visibility,'PRIVATE_ONLY');
  assert.equal(p.readOnly,true);
  assert.equal(p.counts.total,0);
  assert.equal(p.counts.centerReviewed,1);
  assert.equal(p.historicCoverageCertified,false);
  assert.equal(p.freeSlotsCertified,false);
  assert.equal(p.acceptanceChanged,false);
  assert.equal(p.staffTaskCreated,false);
  assert.equal(p.sourceAuthenticatedByGateway,false);
});
test('Missing accepted-event ledger proof creates stable, scoped, private review keys',()=>{
  const e=[event()];
  const l=createEmptyLedger(SCOPE,'2027-03-20T11:25:00Z');
  const a=plan(e,{ledger:l}),b=plan(e,{ledger:l});
  assert.equal(a.counts.total,4);
  assert.deepEqual(a.items.map(x=>x.taskKey),b.items.map(x=>x.taskKey));
  assert.ok(reasons(a).includes('classification-evidence-required'));
  assert.ok(reasons(a).includes('departure-evidence-required'));
  assert.ok(reasons(a).includes('meeting-evidence-required'));
  assert.ok(reasons(a).includes('planned-end-evidence-required'));
  assert.equal(JSON.stringify(a).includes('Synthetic historical source'),false);
  assert.equal(JSON.stringify(a).includes('test-staff'),false);
  assert.equal(a.items.every(x=>x.status==='Needs Human Review'&&
    x.decisionApplied===false&&!x.autoResolved),true);
  assert.equal(a.items.every(x=>!x.taskKey.includes('event:10')),true);
  const linked=plan(e,{ledger:l,linked:a.items.map(x=>x.taskKey)});
  assert.equal(linked.counts.total,a.counts.total);
  assert.equal(linked.counts.new,0);
  assert.equal(linked.counts.linked,4);
  assert.equal(linked.items.every(x=>x.alreadyLinked),true);
});
test('Legacy calendar record needs explicit historic evidence even with no active Center events',()=>{
  const legacy=[{source:'legacy-calendar',eventId:'old-22',
    threadId:'799999999999999999',status:'Scheduled',
    departureAtUtc:START}];
  const p=plan([],{legacy});
  assert.equal(p.counts.legacy,1);
  assert.ok(reasons(p).includes('legacy-record-unreconciled'));
  assert.equal(p.historicCoverageCertified,false);
  assert.equal(p.freeSlotsCertified,false);
});
test('Duplicate Legacy ID is a review conflict, not silently deduplicated as verified',()=>{
  const legacy=[
    {source:'legacy-calendar',eventId:'old-22',
      threadId:'799999999999999999',departureAtUtc:START},
    {source:'legacy-calendar',eventId:'old-22',
      threadId:'799999999999999998',departureAtUtc:START}
  ];
  const p=plan([],{legacy});
  assert.equal(p.counts.legacy,2);
  assert.ok(reasons(p).includes('legacy-duplicate-identity'));
  assert.equal(p.counts.total,2);
});
test('Old accepted record marked Cancelled is NEVER automatically freed',()=>{
  const e=event(10,'Cancelled');
  const p=plan([e],{ledger:ledgerFor([event()])});
  assert.ok(reasons(p).includes('cancellation-release-evidence-required'));
  assert.equal(p.cancellationsChanged,false);
  assert.equal(p.freeSlotsCertified,false);
});
test('Unapproved reschedule is flagged; signed reschedule with matching new day removes that issue only',()=>{
  const e=event(10,'Rescheduled',MOVE);
  const unresolved=plan([e],{ledger:ledgerFor([event()])});
  assert.ok(reasons(unresolved).includes('reschedule-history-required'));
  const approved=plan([e],{rescheduled:true});
  assert.equal(reasons(approved).includes('reschedule-history-required'),false);
  assert.equal(approved.historicCoverageCertified,false);
});
test('Completed retains historical status proof requirement when Staff provenance is absent',()=>{
  const e=event(10,'Completed',START,{staffStatus:null});
  const p=plan([e]);
  assert.ok(reasons(p).includes('historical-status-evidence-required'));
});
test('Ledger-only accepted event remains a review item, never auto-deleted',()=>{
  const p=plan([],{
    ledger:ledgerFor([event(77)])
  });
  assert.ok(reasons(p).includes('ledger-only-record-review'));
  assert.equal(p.counts.ledgerEntries,1);
  assert.equal(p.staffTaskCreated,false);
});
test('Mismatched Staff category and Convoy Center category are Urgent conflict',()=>{
  const e=[event()];
  let l=createEmptyLedger(SCOPE,'2027-03-20T11:25:00Z');
  l=applyDecision(l,{ref:'event:10',action:'classification',
    value:'External Convoy',expectedRevision:0,
    evidenceRef:'synthetic-disputed-classification'},ACTOR,'2027-03-20T11:40:00Z');
  const p=plan(e,{ledger:l});
  assert.equal(p.counts.urgent,1);
  assert.ok(reasons(p).includes('classification-conflict'));
  assert.equal(p.items[0].priority,'Urgent');
});
test('Expired or inconsistent source and wrong scope fail closed',()=>{
  const e=[event()],s=source(e),ledger=ledgerFor(e);
  for(const bad of [
    {...s,archiveDigest:'not-sha'},
    {...s,report:{...s.report,guildId:'222222222222222222'}},
    {...s,report:{...s.report,
      finalization:{finalizedAt:'2027-03-20T10:00:00Z'}}},
    {...s,overview:{...s.overview,registeredConvoys:[]}}
  ])assert.throws(()=>planHistoricalReview({
    source:bad,ledger,scope:SCOPE,taskSecret:SECRET,nowMs:NOW
  }));
  assert.throws(()=>planHistoricalReview({source:s,ledger,
    scope:{...SCOPE,forumId:'222222222222222222'},
    taskSecret:SECRET,nowMs:NOW}));
});
test('Pagination is private and does not discard total review count',()=>{
  const e=[];
  for(let i=0;i<16;i++)e.push(event(100+i));
  const p=plan(e,{ledger:createEmptyLedger(
    SCOPE,'2027-03-20T11:25:00Z')});
  assert.equal(p.counts.total,64);
  assert.equal(p.items.length,25);
  assert.equal(p.pages,3);
  const last=plan(e,{ledger:createEmptyLedger(
    SCOPE,'2027-03-20T11:25:00Z'),page:3});
  assert.equal(last.items.length,14);
  assert.equal(last.counts.total,64);
});
test('No event ID or thread ID does not cause unrelated anonymous source records to merge',()=>{
  const first=event(10),second=event(11);
  delete first.eventId;delete first.threadId;
  delete second.eventId;delete second.threadId;
  const base=source([first,second]);
  // The source inventory requires stable thread IDs and rejects incomplete
  // non-test submissions: deny rather than hide events in an empty plan.
  assert.throws(()=>planHistoricalReview({source:base,
    ledger:createEmptyLedger(SCOPE,'2027-03-20T11:25:00Z'),
    scope:SCOPE,taskSecret:SECRET,nowMs:NOW}));
});
