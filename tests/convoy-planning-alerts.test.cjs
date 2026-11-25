const {test}=require('node:test');
const assert=require('node:assert/strict');
const {keyOf,pending}=require('../convoy-planning-alerts');
test('threshold alerts deduplicate despite changing convoy totals',()=>{
 const one={code:'external-month-threshold',period:'2026-11',threshold:15,count:15};
 const two={...one,count:16};
 assert.equal(keyOf(one),keyOf(two));
 assert.equal(pending([two],{sent:[keyOf(one)]}).length,0);
});
test('separate monthly thresholds remain independently alertable',()=>{
 const a={code:'external-month-threshold',period:'2026-11',threshold:15,count:20};
 const b={...a,threshold:18};
 assert.notEqual(keyOf(a),keyOf(b));
});
test('duplicate departure pair is order-independent',()=>{
 const a={code:'departure-under-two-hours',first:'event:7',second:'event:9',period:'2026-11-01',minutesApart:60};
 assert.equal(keyOf(a),keyOf({...a,first:'event:9',second:'event:7',minutesApart:65}));
});

test('partner monthly warning thresholds are deduplicated independently from External',()=>{
  const partner={code:'partner-month-threshold',period:'2027-03',threshold:15,count:17};
  const partnerRaised={...partner,count:19};
  const external={...partner,code:'external-month-threshold'};
  assert.equal(keyOf(partner),keyOf(partnerRaised));
  assert.notEqual(keyOf(partner),keyOf(external));
  assert.notEqual(keyOf(partner),keyOf({...partner,threshold:18}));
  assert.equal(pending([partnerRaised],{sent:[keyOf(partner)]}).length,0);
});

test('global 3/day warning applies across all types without auto-denying a confirmed convoy',()=>{
  const {describe}=require('../convoy-planning-alerts');
  const message=describe({code:'total-day-over-limit',period:'2027-03-20',count:4,limit:3});
  assert.match(message,/4\/3/);
  assert.match(message,/Staff review required/);
  assert.match(message,/no automatic refusal or reschedule/);
  assert.doesNotMatch(message,/External Convoys exceed daily limit|Partner Convoys exceed daily limit/);
});

test('under-two-hours departure separation remains only a review warning',()=>{
  const {describe}=require('../convoy-planning-alerts');
  const message=describe({
    code:'departure-under-two-hours',period:'2027-03-20',
    first:'event:1',second:'event:2',minutesApart:75
  });
  assert.match(message,/WARNING ONLY/);
  assert.match(message,/not automatic refusal/);
  assert.equal(keyOf({code:'total-day-over-limit',period:'2027-03-20',count:4}),
    keyOf({code:'total-day-over-limit',period:'2027-03-20',count:5}));
});

test('daily Event source triage groups unresolved categories and dates without exposing Event details',()=>{
  const {sourceTriageNotices,describe}=require('../convoy-planning-alerts');
  const privateMarker='DO_NOT_PUBLISH_PRIVATE_EVENT_NAME';
  const source={
    version:2,mode:'advisory-only',sourceClaimsOnly:true,
    freeSlotsCertified:false,
    unknownTypes:[{threadId:'777777777777777777',name:privateMarker},
      {eventId:'123456',name:privateMarker}],
    missingDepartures:[{threadId:'888888888888888888',name:privateMarker}]
  };
  const notices=sourceTriageNotices(source,'2026-11-25T21:00:00Z');
  assert.equal(notices.length,1);
  const n=notices[0];
  assert.equal(n.code,'event-source-triage');
  assert.equal(n.period,'2026-11-25');
  assert.equal(n.unknownTypes,2);
  assert.equal(n.missingDepartures,1);
  assert.equal(keyOf(n),keyOf({...n,unknownTypes:5,missingDepartures:4}),
    'Only one private source review alert per UTC day');
  assert.notEqual(keyOf(n),keyOf({...n,period:'2026-11-26'}));
  const message=describe(n);
  assert.match(message,/2.*unclassified Event type/);
  assert.match(message,/1.*missing verified UTC departure/);
  assert.match(message,/Staff source review/);
  assert.match(message,/not an Event approval, capacity release or booking/);
  for(const marker of [privateMarker,'777777777777777777','888888888888888888','123456']){
    assert.ok(!JSON.stringify(n).includes(marker));
    assert.ok(!message.includes(marker));
  }
  assert.equal(pending([n],{sent:[keyOf(n)]}).length,0);
});

test('Event source triage is silent for clean data and rejects obsolete/unverified summaries',()=>{
  const {sourceTriageNotices}=require('../convoy-planning-alerts');
  const clean={version:2,mode:'advisory-only',
    sourceClaimsOnly:true,freeSlotsCertified:false,
    unknownTypes:[],missingDepartures:[]};
  assert.equal(sourceTriageNotices(clean,'2026-11-25T21:00:00Z').length,0);
  for(const bad of [
    {...clean,version:1,unknownTypes:[{}]},
    {...clean,freeSlotsCertified:true,unknownTypes:[{}]},
    {...clean,mode:'booking',unknownTypes:[{}]},
    {...clean,sourceClaimsOnly:false,unknownTypes:[{}]},
    {...clean,unknownTypes:null},
    {...clean,missingDepartures:null}
  ]){
    assert.equal(sourceTriageNotices(bad,'2026-11-25T21:00:00Z').length,0);
  }
  assert.equal(sourceTriageNotices({...clean,unknownTypes:[{}]},'bad date').length,0);
});

test('Event triage reuses durable Staff alert deduplication and never publishes private source in dry-run logs',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'..','convoy-planning-alerts.js'),'utf8');
  assert.match(source,/pending\(\[\.\.\.activeWarnings,\.\.\.sourceTriageNotices\(report\)\],existing\)/);
  assert.match(source,/private event details withheld/);
  assert.match(source,/CONVOY_DRY_RUN/);
  assert.match(source,/Convoy Alert Key/);
});
