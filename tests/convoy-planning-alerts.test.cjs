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
