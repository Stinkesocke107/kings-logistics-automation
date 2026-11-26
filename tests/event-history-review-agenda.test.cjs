'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {buildReviewAgenda,trustedReviewAgenda,renderReviewAgenda,CODES,MAX_ITEMS}
  =require('../event-history-review-agenda');
const NOW=Date.parse('2027-03-20T12:00:00Z');
function fixture(){
  const now=new Date(NOW);
  const history=Array.from({length:24},(_,i)=>({
    utcMonth:new Date(Date.UTC(now.getUTCFullYear(),
      now.getUTCMonth()-23+i,1)).toISOString().slice(0,7),
    centerClaims:0,legacyClaims:0,centerOutcomeUnresolved:0
  }));
  const future=Array.from({length:12},()=>({legacyDatedKeptSeparate:0}));
  history[23].centerClaims=2;
  history[23].centerOutcomeUnresolved=1;
  history[22].legacyClaims=1;
  future[0].legacyDatedKeptSeparate=2;
  future[1].legacyDatedKeptSeparate=1;
  return {history,future,undatedCenter:3,undatedLegacy:4,nowMs:NOW};
}
test('monthly agenda prioritizes future Legacy holds, unresolved past outcomes and missing dates',()=>{
  const agenda=buildReviewAgenda(fixture());
  assert.equal(agenda.length,6);
  assert.deepEqual(agenda.map(x=>x.code),[
    'FUTURE_LEGACY_HOLD','PAST_CENTER_OUTCOME','UNDATED_LEGACY',
    'UNDATED_CENTER','LEGACY_ORIGINAL_EVIDENCE','HISTORICAL_MONTH_NO_CLAIMS'
  ]);
  assert.equal(agenda[0].utcMonth,'2027-03');
  assert.equal(agenda[0].count,2);
  assert.equal(agenda[1].utcMonth,'2027-03');
  assert.equal(agenda[2].utcMonth,null);
  assert.equal(agenda[3].utcMonth,null);
  assert.equal(agenda[4].utcMonth,'2027-02');
  assert.equal(agenda[5].count,null);
  assert.equal(agenda[5].utcMonth,'2027-01');
  assert.equal(trustedReviewAgenda(agenda),true);
  const rendered=renderReviewAgenda(agenda);
  assert.match(rendered,/2027-03 · Future frozen Legacy records to verify/);
  assert.match(rendered,/Undated · Frozen Legacy records missing an original UTC date/);
  assert.match(rendered,/no claims; not proof of no Events/);
  assert.ok(rendered.length<=1024);
  assert.doesNotMatch(rendered,/booking approved|available slots confirmed/i);
  assert.ok(Object.isFrozen(agenda));
});
test('trusted agenda excludes arbitrary private names, Event IDs, URLs and malformed data',()=>{
  const good=buildReviewAgenda(fixture());
  const first=good[0];
  for(const invalid of [
    [{...first,eventName:'CONFIDENTIAL VTC'}],
    [{...first,utcMonth:'2027-99'}],
    [{...first,utcMonth:'2027-03-20'}],
    [{...first,code:'FREE_TO_BOOK'}],
    [{...first,count:0}],
    [{...first,count:'2'}],
    [first,first],
    Array.from({length:MAX_ITEMS+1},()=>first),
    [{code:'UNDATED_CENTER',utcMonth:'2027-03',count:1}],
    [{code:'HISTORICAL_MONTH_NO_CLAIMS',utcMonth:'2027-03',count:0}]
  ]){
    assert.equal(trustedReviewAgenda(invalid),false);
    assert.match(renderReviewAgenda(invalid),/Unavailable/);
    assert.doesNotMatch(renderReviewAgenda(invalid),/CONFIDENTIAL VTC/);
  }
  assert.equal(trustedReviewAgenda(null),false);
  assert.match(renderReviewAgenda(undefined),/Unavailable/);
  assert.deepEqual(Object.keys(CODES).length,6);
});
test('clean source still does not certify historical completeness or original Staff decisions',()=>{
  const f=fixture();
  f.history.forEach(x=>{x.centerClaims=0;x.legacyClaims=0;x.centerOutcomeUnresolved=0;});
  f.future.forEach(x=>{x.legacyDatedKeptSeparate=0;});
  f.undatedCenter=0;f.undatedLegacy=0;
  const rows=buildReviewAgenda(f);
  assert.equal(rows.length,MAX_ITEMS);
  assert.ok(rows.every(row=>row.code==='HISTORICAL_MONTH_NO_CLAIMS'));
  assert.equal(rows[0].code,'HISTORICAL_MONTH_NO_CLAIMS');
  assert.equal(rows[0].utcMonth,'2027-03');
  assert.equal(rows[0].count,null);
  assert.match(renderReviewAgenda(rows),/not proof of no Events/);
  assert.match(renderReviewAgenda([]),/does NOT certify 24-month historical completeness/);
});
test('review agenda uses only source-safe read-only logic and is not a new booking system',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','event-history-review-agenda.js'),'utf8');
  assert.doesNotMatch(src,/fetch\(|method:\s*['"](?:POST|PATCH|DELETE)|writeFileSync|discord\(/);
  assert.doesNotMatch(src,/approveBooking|reserveSlot|StaffAssignment/);
});

test('month-level history review fails closed on missing, shifted or contradictory source rows',()=>{
  const cases=[
    f=>{f.history[0].utcMonth='2024-01';},
    f=>{f.history[0].utcMonth=f.history[1].utcMonth;},
    f=>{f.history[1].utcMonth=undefined;},
    f=>{f.history[1].centerClaims=undefined;},
    f=>{f.history[1].legacyClaims=-1;},
    f=>{f.history[23].centerOutcomeUnresolved=3;},
    f=>{f.history[23]=null;},
    f=>{f.future[0].legacyDatedKeptSeparate=undefined;},
    f=>{f.future[1].legacyDatedKeptSeparate=-1;},
    f=>{f.future[2]=null;},
    f=>{f.undatedCenter=100001;}
  ];
  for(const modify of cases){
    const input=fixture();
    modify(input);
    assert.throws(()=>buildReviewAgenda(input),/source unverified/);
  }
});
