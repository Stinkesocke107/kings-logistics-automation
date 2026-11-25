'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {G,C,L,h,page,fixture,review}
  =require('./fixtures/event-capacity-discord-pagination-fixture.cjs');
const {auditKingsDiscordHistoryPagination:check}
  =require('../event-capacity-discord-history-pagination-audit');
const has=(r,reason)=>r.issueItems.some(x=>x.reason===reason);
test('Complete claimed Discord pages are not provider-authenticated or free-slot approvals',()=>{
  const r=review();
  assert.equal(r.monthsRequired,24);
  assert.equal(r.monthRows.length,24);
  assert.equal(r.suppliedCurrentForumClaims,1);
  assert.equal(r.suppliedLegacyChannelClaims,1);
  assert.equal(r.suppliedScanClaims,3);
  assert.equal(r.suppliedPageClaims,4);
  assert.equal(r.suppliedMessageCountClaims,4);
  assert.equal(r.claimedCompletedStreams,3);
  assert.equal(r.untrustedPaginationClaimsInternallyComplete,true);
  assert.equal(r.providerPaginationAuthenticityVerified,false);
  assert.equal(r.original24MonthHistoryCompletelyAuthenticated,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Month grid distinguishes a known older source month from other source claims',()=>{
  const r=review();
  assert.equal(r.monthRows[0].month,'2024-12');
  assert.equal(r.monthRows.at(-1).month,'2026-11');
  assert.equal(r.monthRows.find(x=>x.month==='2026-10').claimedChannelSources,2);
  assert.equal(r.monthRows.find(x=>x.month==='2026-09').claimedChannelSources,1);
  assert.ok(r.monthRows.every(x=>x.availableSlotsCertified===false));
});
test('Missing archived-public forum stream creates a gap despite complete active history',()=>{
  const r=review(x=>{x.scans=x.scans.filter(x=>x.stream!=='archived-public');});
  assert.equal(r.streamsMissingScanClaims,1);
  assert.equal(r.untrustedPaginationClaimsInternallyComplete,false);
  assert.ok(has(r,'required-source-stream-not-scanned'));
  assert.equal(r.freeSlotsCertified,false);
});
test('Broken page cursor continuity flags incomplete source without losing old month coverage',()=>{
  const r=review(x=>{
    x.scans[1].pages[1].requestCursor='2026-11-23T15:00:00.000Z';
  });
  assert.equal(r.brokenCursorChains,1);
  assert.ok(has(r,'pagination-cursor-chain-broken'));
  assert.equal(r.monthRows.find(x=>x.month==='2026-10').claimedChannelSources,2);
});
test('Unfinished pagination has more pages even if the last fetched page parsed',()=>{
  const r=review(x=>{x.scans[1].pages=[page(0,null,'2026-11-24T15:00:00.000Z',true)];});
  assert.equal(r.unfinishedPageStreams,1);
  assert.equal(r.claimedCompletedStreams,2);
  assert.ok(has(r,'source-pagination-not-finished'));
});
test('Claiming more pages without a next cursor is broken and unfinished',()=>{
  const r=review(x=>{
    x.scans[1].pages=[page(0,null,null,true)];
  });
  assert.equal(r.brokenCursorChains,1);
  assert.equal(r.unfinishedPageStreams,1);
});
test('Ending a scan with a fabricated next cursor fails structural completeness',()=>{
  const r=review(x=>{
    x.scans[1].pages=[page(0,null,'2026-11-24T15:00:00.000Z',false)];
  });
  assert.equal(r.brokenCursorChains,1);
  assert.equal(r.untrustedPaginationClaimsInternallyComplete,false);
});
test('Duplicate page cursor is detected even if indexes are sequential',()=>{
  const r=review(x=>{
    x.scans[1].pages=[
      page(0,null,'2026-11-24T15:00:00.000Z',true),
      page(1,'2026-11-24T15:00:00.000Z',
        '2026-11-24T15:00:00.000Z',true),
      page(2,'2026-11-24T15:00:00.000Z',null,false)
    ];
  });
  assert.equal(r.brokenCursorChains,1);
  assert.ok(has(r,'pagination-cursor-chain-broken'));
});
test('Out of order page indexes are not accepted as a complete scan',()=>{
  const r=review(x=>{x.scans[1].pages[1].index=9;});
  assert.equal(r.brokenCursorChains,1);
});
test('Forbidden source page is a provider-permission gap, not a complete archive',()=>{
  const r=review(x=>{
    x.scans[1].pages=[page(0,null,null,false,{
      status:'forbidden',itemCount:0
    })];
  });
  assert.equal(r.failedPageRequests,1);
  assert.ok(has(r,'source-page-access-or-provider-error'));
  assert.equal(r.claimedCompletedStreams,2);
  assert.equal(r.providerPaginationAuthenticityVerified,false);
});
test('Rate limited and missing source pages remain independent failure evidence',()=>{
  for(const status of ['rate-limited','not-found','error']){
    const r=review(x=>{
      x.scans[1].pages=[page(0,null,null,false,{status,itemCount:0})];
    });
    assert.equal(r.failedPageRequests,1,status);
    assert.equal(r.untrustedPaginationClaimsInternallyComplete,false);
  }
});
test('Cannot claim 24-month coverage when some calendar months have no channel claim',()=>{
  const r=review(x=>{
    x.channels[0].firstCoveredMonth='2026-11';
  });
  assert.equal(r.monthRows[0].claimedChannelSources,0);
  assert.ok(has(r,'month-has-no-claimed-original-source'));
  assert.equal(r.discoveredAllActualLegacyChannels,false);
});
test('Empty source stream pages are unknown, never a verified empty source',()=>{
  const r=review(x=>{x.scans[0].pages=[];});
  assert.equal(r.unfinishedPageStreams,1);
  assert.equal(r.claimedCompletedStreams,2);
  assert.equal(r.original24MonthHistoryCompletelyAuthenticated,false);
});
test('Duplicate channel identifiers and duplicate scan streams reject input',()=>{
  const a=fixture();a.channels.push({...a.channels[0]});
  assert.throws(()=>check(a));
  const b=fixture();b.scans.push(structuredClone(b.scans[0]));
  assert.throws(()=>check(b));
});
test('Unknown channel or incompatible forum/text stream refuse source claims',()=>{
  const a=fixture();a.scans[0].channelId='990000000000000099';
  assert.throws(()=>check(a));
  const b=fixture();b.scans[2].stream='archived-public';
  assert.throws(()=>check(b));
});
test('A missing current forum and an invented second current forum are refused',()=>{
  const a=fixture();a.channels[0].channelKind='legacy-forum';
  assert.throws(()=>check(a));
  const b=fixture();b.channels[1].channelKind='current-forum';
  assert.throws(()=>check(b));
});
test('A short or future 24-month window is rejected',()=>{
  const a=fixture();a.finalMonth='2026-10';
  assert.throws(()=>check(a));
  const b=fixture();b.finalMonth='2026-12';
  assert.throws(()=>check(b));
  const c=fixture();c.firstMonth='2025-01';
  assert.throws(()=>check(c));
});
test('Future-dated receipt timestamp and invalid calendar date are rejected',()=>{
  const a=fixture();a.scans[1].pages[0].fetchedAtUtc='2027-01-01T00:00:00.000Z';
  assert.throws(()=>check(a));
  const b=fixture();b.scans[1].pages[0].fetchedAtUtc='2026-02-30T00:00:00.000Z';
  assert.throws(()=>check(b));
});
test('Failed page cannot claim to have items or a successful continuation',()=>{
  const a=fixture();a.scans[1].pages[0].status='forbidden';
  assert.throws(()=>check(a));
  const b=fixture();b.scans[1].pages[0]=page(0,null,'next',true,{
    status:'rate-limited',itemCount:0
  });
  assert.throws(()=>check(b));
});
test('Secrets and raw Discord message data are rejected as undeclared receipt fields',()=>{
  const a=fixture();a.scans[0].pages[0].botToken='SECRET';
  assert.throws(()=>check(a));
  const b=fixture();b.channels[0].rawMessages=['private'];
  assert.throws(()=>check(b));
  const c=fixture();c.scans[0].rawThreadIds=['secret'];
  assert.throws(()=>check(c));
});
test('No channel ID, cursor, original digest or review key material leaves the audit',()=>{
  const r=review(),output=JSON.stringify(r);
  for(const v of [G,C,L,'2026-11-24T15:00:00.000Z',h('page0'),'synthetic private source review key'])
    assert.equal(output.includes(v),false);
  assert.ok(r.issueItems.every(x=>/^discord-history:[a-f0-9]{32}$/.test(x.issueKey)));
  assert.equal(r.currentDiscordReaderExecutedHere,false);
});
test('HMAC review key rotation affects issue IDs but not the source coverage counts',()=>{
  const a=fixture(),b=structuredClone(a);
  b.reviewSecret='a different synthetic owner HMAC secret for test review';
  a.scans.pop();b.scans.pop();
  const x=check(a),y=check(b);
  assert.deepEqual(x.monthRows,y.monthRows);
  assert.equal(x.streamsMissingScanClaims,y.streamsMissingScanClaims);
  assert.notDeepEqual(x.issueItems.map(i=>i.issueKey),y.issueItems.map(i=>i.issueKey));
});
test('The same input can be reviewed twice without modifying any original source metadata',()=>{
  const x=fixture(),before=structuredClone(x);
  assert.deepEqual(check(x),check(x));
  assert.deepEqual(x,before);
});
