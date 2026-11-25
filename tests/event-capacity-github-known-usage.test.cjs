'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {knownUsageFromVerifiedInputs}=require('../event-capacity-github-known-usage');
const {createEmptyLedger,applyDecision}=require('../event-capacity-decision-ledger');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const RUN='45502949674',ART='70000000001',NOW=Date.parse('2027-03-20T12:00:00Z');
const types={partner:'Partner Convoy',external:'External Convoy',kings:'Kings Convoy'};
function event(id,type,departure,status='Scheduled',extra={}){
  return {
    eventId:String(id),threadId:String(700000000000000000n+BigInt(id)),
    name:'Synthetic event',status,
    staffStatus:{status,authorId:'synthetic-staff',
      matchedRoleIds:['synthetic-staff-role'],roleSource:'guild-member-lookup'},
    validation:{parsed:{eventType:types[type],departureAtUtc:departure}},
    ...extra
  };
}
function bundle(events=[],legacy=[]){
  return {
    report:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:54:00Z',
      finalization:{finalizedAt:'2027-03-20T11:56:00Z'},
      summary:{totalThreads:events.length,actualConvoys:events.length},threads:events},
    overview:{guildId:SCOPE.guildId,forumId:SCOPE.forumId,
      generatedAt:'2027-03-20T11:57:00Z',
      overall:{realConvoySubmissions:events.length,convoyReadErrors:0,
        legacyImportedConvoys:legacy.length,legacyDuplicatesSuppressed:0},
      registeredConvoys:[
        ...events.filter(x=>x.eventId||x.status==='Completed').map(x=>({
          source:'convoy-center',eventId:x.eventId,threadId:x.threadId,
          status:x.status,departureAtUtc:x.validation?.parsed?.departureAtUtc||null
        })),...legacy
      ]
    }
  };
}
function ledgerFor(events){
  let ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  const actor={id:'111111111111111111',source:'trusted-server-gateway',
    verifiedRoles:['Event Coordination']};
  for(const e of events){
    if(!e.eventId||['Submitted','Cancelled','Ready for Approval','Pending'].includes(e.status))continue;
    const ref='event:'+e.eventId,departure=e.validation?.parsed?.departureAtUtc;
    const commands=[
      ['classification',e.validation.parsed.eventType],['departure',departure],
      ['meeting','2027-03-20T11:00:00Z'],['end','2027-03-25T18:00:00Z']
    ];
    for(const [action,value] of commands){
      if(!value)continue;
      ledger=applyDecision(ledger,{
        ref,action,value,expectedRevision:ledger.revision,
        evidenceRef:'synthetic-privately-audited-confirmation'
      },actor,'2027-03-20T11:40:00Z');
    }
  }
  return ledger;
}
function sourceOf(b){
  return {sourceKind:'authenticated-kings-convoy-checker',
    runId:RUN,attempt:1,artifactId:'70000000001',headSha:'1'.repeat(40),
    archiveDigest:'b'.repeat(64),...b};
}
function view(events,options={}){
  const b=bundle(events,options.legacy||[]);
  const ledger=options.ledger||ledgerFor(events);
  return knownUsageFromVerifiedInputs({
    source:sourceOf(b),ledger,scope:SCOPE,nowMs:NOW,
    selectedMonth:options.selectedMonth
  });
}
test('Partner and External combined daily limit 2; Kings unlimited',()=>{
  const e=[
    event(1,'partner','2027-03-20T16:00:00Z'),
    event(2,'external','2027-03-20T17:00:00Z'),
    event(3,'kings','2027-03-20T18:00:00Z'),
    event(4,'kings','2027-03-20T19:00:00Z')
  ];
  const r=view(e),day=r.days.find(x=>x.day==='2027-03-20');
  assert.equal(r.visibility,'PRIVATE_ONLY');
  assert.equal(r.mode,'KnownAcceptedMinimum');
  assert.equal(day.knownCombinedAccepted,2);
  assert.equal(day.knownKingsAccepted,2);
  assert.equal(day.limitReachedByKnownEvents,true);
  assert.equal(r.monthUsage.knownPartnerAccepted,1);
  assert.equal(r.monthUsage.knownExternalAccepted,1);
  assert.equal(r.monthUsage.knownKingsAccepted,2);
  assert.equal(day.remainingVerified,null);
  assert.equal(day.partnerFreeVerified,false);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.attendanceInferred,false);
  const data=JSON.stringify(r);
  assert.equal(data.includes('synthetic-staff'),false);
  assert.equal(data.includes('event:1'),false);
});
test('Third accepted external convoy produces over-limit warning, not a new free slot',()=>{
  const e=[
    event(1,'partner','2027-03-20T16:00:00Z'),
    event(2,'external','2027-03-20T17:00:00Z'),
    event(3,'external','2027-03-20T18:00:00Z')
  ];
  const r=view(e),day=r.days.find(x=>x.day==='2027-03-20');
  assert.equal(day.knownCombinedAccepted,3);
  assert.equal(day.knownOverLimit,true);
  assert.equal(day.dailyLimit,2);
  assert.equal(r.counts.overLimitWarnings,1);
  assert.equal(r.capacityVerified,false);
});
test('Separate 20 Partner and 20 External per UTC month',()=>{
  const e=[];
  for(let i=0;i<21;i++)e.push(event(i+1,'partner',
    '2027-03-'+String(1+i).padStart(2,'0')+'T16:00:00Z'));
  for(let i=0;i<20;i++)e.push(event(i+101,'external',
    '2027-03-'+String(1+i).padStart(2,'0')+'T17:00:00Z'));
  const r=view(e);
  assert.equal(r.monthUsage.knownPartnerAccepted,21);
  assert.equal(r.monthUsage.knownExternalAccepted,20);
  assert.equal(r.monthUsage.partnerMonthlyLimitReached,true);
  assert.equal(r.monthUsage.externalMonthlyLimitReached,true);
  assert.equal(r.monthUsage.partnerRemainingVerified,null);
  assert.equal(r.freeSlotsCertified,false);
});
test('UTC departure rather than local calendar decides March allocation',()=>{
  const r=view([event(1,'partner','2027-04-01T00:15:00+02:00')]);
  assert.equal(r.monthUsage.knownPartnerAccepted,1);
  assert.equal(r.days.find(x=>x.day==='2027-03-31').knownPartnerAccepted,1);
});
test('Completed keeps historical allocation; pending and Cancelled do not consume quota',()=>{
  const r=view([
    event(1,'partner','2027-03-20T16:00:00Z','Completed'),
    event(2,'external','2027-03-20T17:00:00Z','Submitted'),
    event(3,'partner','2027-03-20T18:00:00Z','Ready for Approval'),
    event(4,'external','2027-03-20T19:00:00Z','Cancelled')
  ]);
  assert.equal(r.monthUsage.knownPartnerAccepted,1);
  assert.equal(r.monthUsage.knownExternalAccepted,0);
  assert.equal(r.counts.pending,2);
  assert.equal(r.attendanceInferred,false);
});
test('Unverified accepted item cannot be misrepresented as a free place',()=>{
  const e=[event(1,'partner','2027-03-20T16:00:00Z')];
  const r=view(e,{ledger:createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z')});
  assert.equal(r.monthUsage.knownPartnerAccepted,0);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.counts.unresolvedCapacityIssues>0,true);
});
test('Missing planned end still counts known quota but prevents certainty',()=>{
  const e=[event(1,'partner','2027-03-20T16:00:00Z')];
  let ledger=ledgerFor(e);
  ledger=applyDecision(ledger,{
    ref:'event:1',action:'revoke-end',expectedRevision:ledger.revision,
    evidenceRef:'synthetic-revoke'
  },{id:'111111111111111111',source:'trusted-server-gateway',
    verifiedRoles:['Event Coordination']},'2027-03-20T11:42:00Z');
  const r=view(e,{ledger});
  assert.equal(r.monthUsage.knownPartnerAccepted,1);
  assert.equal(r.capacityVerified,false);
  assert.equal(r.counts.unresolvedCapacityIssues>0,true);
});
test('Unreconciled legacy Event never yields a verified remaining number',()=>{
  const legacy=[{source:'legacy-calendar',eventId:'old',
    threadId:'799999999999999999',status:'Scheduled',
    eventType:'Legacy Calendar',departureAtUtc:'2027-03-20T16:00:00Z'}];
  const r=view([],{legacy});
  assert.equal(r.counts.legacyUnreconciled,1);
  assert.equal(r.days.find(x=>x.day==='2027-03-20').remainingVerified,null);
  assert.equal(r.historicalReconciliationVerified,false);
});
test('Empty source and ledger cannot certify free slots before historical reconciliation',()=>{
  const r=view([]);
  assert.equal(r.sourceInventoryComplete,true);
  assert.equal(r.counts.knownAccepted,0);
  assert.equal(r.availabilityStatus,'Needs Verification');
  assert.equal(r.days.every(x=>x.remainingVerified===null&&
    !x.freeSlotsCertified),true);
});
test('Wrong scope, inventory conflict, stale and manipulated metadata are denied',()=>{
  const e=[event(1,'partner','2027-03-20T16:00:00Z')],b=bundle(e);
  const ledger=ledgerFor(e);
  for(const source of [
    sourceOf({...b,report:{...b.report,guildId:'222222222222222222'}}),
    sourceOf({...b,overview:{...b.overview,registeredConvoys:[]}}),
    sourceOf({...b,report:{...b.report,
      finalization:{finalizedAt:'2027-03-20T10:00:00Z'}}}),
    sourceOf({...b,report:{...b.report,
      generatedAt:'2027-03-20T10:00:00Z',
      finalization:{finalizedAt:'2027-03-20T10:01:00Z'}}}),
    {...sourceOf(b),archiveDigest:'invalid'},
    {...sourceOf(b),headSha:'../not-sha'}
  ])assert.throws(()=>knownUsageFromVerifiedInputs({
    source,ledger,scope:SCOPE,nowMs:NOW
  }));
  assert.throws(()=>knownUsageFromVerifiedInputs({
    source:sourceOf(b),ledger,scope:{
      guildId:'222222222222222222',forumId:SCOPE.forumId
    },nowMs:NOW
  }));
});
test('UTC day list supports leap-year February and rejects invalid month',()=>{
  const r=view([],{selectedMonth:'2028-02'});
  assert.equal(r.days.length,29);
  assert.equal(r.days[28].day,'2028-02-29');
  assert.throws(()=>view([],{selectedMonth:'2027-13'}));
});

test('Approved Event Management exception is counted but does not raise the daily limit',()=>{
  const e=[
    event(1,'partner','2027-03-20T16:00:00Z'),
    event(2,'external','2027-03-20T17:00:00Z'),
    event(3,'partner','2027-03-20T18:00:00Z')
  ];
  let ledger=ledgerFor(e);
  ledger=applyDecision(ledger,{
    ref:'event:3',action:'exception',value:true,
    expectedRevision:ledger.revision,
    evidenceRef:'synthetic-exception-management-approval'
  },{id:'222222222222222222',source:'trusted-server-gateway',
    verifiedRoles:['Event Management']},'2027-03-20T11:45:00Z');
  const result=view(e,{ledger}),day=result.days.find(x=>x.day==='2027-03-20');
  assert.equal(day.knownCombinedAccepted,3);
  assert.equal(day.dailyLimit,2);
  assert.equal(day.approvedExceptions,1);
  assert.equal(result.monthUsage.approvedExceptions,1);
  assert.equal(day.remainingVerified,null);
  assert.equal(result.freeSlotsCertified,false);
});
test('Rescheduled event counts new UTC day only after privately approved move',()=>{
  const former=event(1,'partner','2027-03-20T16:00:00Z','Scheduled');
  let ledger=ledgerFor([former]);
  const moved=event(1,'partner','2027-03-21T16:00:00Z','Rescheduled');
  const unresolved=view([moved],{ledger});
  assert.equal(unresolved.monthUsage.knownPartnerAccepted,0);
  assert.equal(unresolved.freeSlotsCertified,false);
  ledger=applyDecision(ledger,{
    ref:'event:1',action:'reschedule',value:'2027-03-21T16:00:00Z',
    expectedRevision:ledger.revision,
    evidenceRef:'synthetic-separate-confirmed-reschedule'
  },{id:'111111111111111111',source:'trusted-server-gateway',
    verifiedRoles:['Event Coordination']},'2027-03-20T11:45:00Z');
  const current=view([moved],{ledger});
  assert.equal(current.days.find(x=>x.day==='2027-03-20')
    .knownPartnerAccepted,0);
  assert.equal(current.days.find(x=>x.day==='2027-03-21')
    .knownPartnerAccepted,1);
  assert.equal(current.freeSlotsCertified,false);
});

test('Conflicting Staff category vs Convoy Center is possible occupancy, not proven accepted minimum',()=>{
  const e=[event(1,'partner','2027-03-20T16:00:00Z')];
  let ledger=createEmptyLedger(SCOPE,'2027-03-20T11:30:00Z');
  const actor={id:'111111111111111111',
    source:'trusted-server-gateway',verifiedRoles:['Event Coordination']};
  for(const [action,value] of [
    ['classification','External Convoy'],
    ['departure','2027-03-20T16:00:00Z'],
    ['meeting','2027-03-20T15:00:00Z'],
    ['end','2027-03-20T19:00:00Z']
  ])ledger=applyDecision(ledger,{
    ref:'event:1',action,value,
    expectedRevision:ledger.revision,evidenceRef:'synthetic-conflicting-type'
  },actor,'2027-03-20T11:40:00Z');
  const r=view(e,{ledger}),day=r.days.find(x=>x.day==='2027-03-20');
  assert.equal(day.knownCombinedAccepted,0);
  assert.equal(r.monthUsage.knownExternalAccepted,0);
  assert.equal(r.counts.disputedSourceRecords,1);
  assert.equal(r.counts.possibleAcceptedIncludingDisputes,1);
  assert.equal(r.counts.totalUnresolvedIssues>0,true);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(day.remainingVerified,null);
});
