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
