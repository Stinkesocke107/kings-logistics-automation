'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditKingsDiscordHistoryPagination:audit}
  =require('../event-capacity-discord-history-pagination-audit');
const {makeKingsDiscordReadOnlyRequest:request,
  getKingsDiscordRequiredStreams:streams}
  =require('../event-capacity-discord-rest-readonly-contract');
const {fixture,page,G,C,L}
  =require('./fixtures/event-capacity-discord-pagination-fixture.cjs');
const P='990000000000000010';
const T1='2026-11-23T15:00:00.000Z',T2='2026-11-22T15:00:00.000Z';
const I1='990000000000000003',I2='990000000000000002';
const run=fn=>{const f=fixture();fn?.(f);return audit(f);};
function threadParent(f){
  f.channels.push({channelId:P,channelKind:'legacy-thread-parent',
    firstCoveredMonth:'2026-09',lastCoveredMonth:'2026-09'});
  return f;
}
test('The REST planner and history audit share canonical allowed streams',()=>{
  for(const sourceKind of ['current-forum','legacy-forum',
    'legacy-thread-parent','legacy-text']){
    for(const stream of streams(sourceKind)){
      const req=request({guildId:G,channelId:C,sourceKind,stream});
      assert.equal(req.method,'GET');
      assert.equal(req.safeToActivate,false);
    }
  }
});
test('Current forum only requires active plus archived-public, not private archived threads',()=>{
  assert.deepEqual(streams('current-forum'),['active','archived-public']);
  const r=run();
  assert.equal(r.streamsMissingScanClaims,0);
  assert.equal(r.untrustedPaginationClaimsInternallyComplete,true);
  assert.equal(r.providerPaginationAuthenticityVerified,false);
});
test('Legacy forum only requires active plus public archive, not a private stream',()=>{
  assert.deepEqual(streams('legacy-forum'),['active','archived-public']);
  assert.throws(()=>request({guildId:G,channelId:L,
    sourceKind:'legacy-forum',stream:'archived-private'}));
  const r=run(f=>{
    f.channels.push({channelId:P,channelKind:'legacy-forum',
      firstCoveredMonth:'2026-09',lastCoveredMonth:'2026-09'});
    f.scans.push({channelId:P,stream:'active',pages:[page(0)]});
    f.scans.push({channelId:P,stream:'archived-public',pages:[page(0)]});
  });
  assert.equal(r.suppliedLegacyChannelClaims,2);
  assert.equal(r.streamsMissingScanClaims,0);
});
test('A text/thread parent may require a private archive stream, distinct from a forum',()=>{
  assert.deepEqual(streams('legacy-thread-parent'),
    ['active','archived-public','archived-private']);
  const r=run(f=>{
    threadParent(f);
    f.scans.push({channelId:P,stream:'active',pages:[page(0)]});
    f.scans.push({channelId:P,stream:'archived-public',pages:[page(0)]});
  });
  assert.equal(r.streamsMissingScanClaims,1);
  assert.ok(r.issueItems.some(i=>i.reason==='required-source-stream-not-scanned'));
  assert.equal(r.original24MonthHistoryCompletelyAuthenticated,false);
});
test('Complete synthetic private-thread parent inventory still does not authenticate the source',()=>{
  const r=run(f=>{
    threadParent(f);
    for(const stream of streams('legacy-thread-parent'))
      f.scans.push({channelId:P,stream,pages:[page(0)]});
  });
  assert.equal(r.streamsMissingScanClaims,0);
  assert.equal(r.claimedCompletedStreams,6);
  assert.equal(r.providerPaginationAuthenticityVerified,false);
  assert.equal(r.freeSlotsCertified,false);
});
test('Forum receiving an unsupported archived-private receipt rejects rather than accepting a fake scan',()=>{
  const f=fixture();
  f.scans.push({channelId:C,stream:'archived-private',pages:[page(0)]});
  assert.throws(()=>audit(f));
});
test('Unknown Discord kind never yields an empty required-stream list',()=>{
  assert.throws(()=>streams('unknown-forum'));
  const f=fixture();f.channels[0].channelKind='custom-permissions';
  assert.throws(()=>audit(f));
});
test('Active guild thread inventory is exactly one unpaged response',()=>{
  const f=fixture();f.scans[0].pages=[page(0),page(1)];
  assert.throws(()=>audit(f));
});
test('Active stream must not use a private before cursor or hasMore',()=>{
  const f=fixture();f.scans[0].pages[0].hasMore=true;
  assert.throws(()=>audit(f));
  const x=fixture();x.scans[0].pages[0].nextCursor=T1;
  assert.throws(()=>audit(x));
  const y=fixture();y.scans[0].pages[0].requestCursor=T1;
  assert.throws(()=>audit(y));
});
test('Archived forum streams accept progressive ISO UTC before timestamps',()=>{
  const r=run(f=>{
    f.scans[1].pages=[
      page(0,null,T1,true),
      page(1,T1,T2,true),
      page(2,T2,null,false)
    ];
  });
  assert.equal(r.brokenCursorChains,0);
  assert.equal(r.unfinishedPageStreams,0);
  assert.equal(r.suppliedPageClaims,5);
});
test('Legacy text uses Discord snowflake IDs as before cursor, not timestamps',()=>{
  const r=run(f=>{
    f.scans[2].pages=[
      page(0,null,I1,true),
      page(1,I1,I2,true),
      page(2,I2,null,false)
    ];
  });
  assert.equal(r.brokenCursorChains,0);
  assert.equal(r.unfinishedPageStreams,0);
  assert.equal(r.streamsMissingScanClaims,0);
});
test('Archived cursor cannot be arbitrary token, snowflake or invalid date',()=>{
  for(const bad of ['cursor1',I1,'2026-02-30T12:00:00.000Z',
    '2026-11-25T12:00:00+00:00','2026-11-25']){
    const f=fixture();f.scans[1].pages[0].nextCursor=bad;
    assert.throws(()=>audit(f),bad);
  }
});
test('Text-message continuation refuses an ISO timestamp and attacker path',()=>{
  for(const bad of [T1,'../admin','cursor1','abc']){
    const f=fixture();f.scans[2].pages[0].hasMore=true;
    f.scans[2].pages[0].nextCursor=bad;
    assert.throws(()=>audit(f),bad);
  }
});
test('Chronological archive cursor must strictly decrease across pages',()=>{
  const r=run(f=>{
    f.scans[1].pages=[
      page(0,null,T1,true),
      page(1,T1,'2026-11-24T15:00:00.000Z',true),
      page(2,'2026-11-24T15:00:00.000Z',null,false)
    ];
  });
  assert.equal(r.brokenCursorChains,1);
  assert.equal(r.untrustedPaginationClaimsInternallyComplete,false);
});
test('Text-channel snowflake cursor must strictly decrease across pages',()=>{
  const r=run(f=>{
    f.scans[2].pages=[
      page(0,null,I2,true),
      page(1,I2,I1,true),
      page(2,I1,null,false)
    ];
  });
  assert.equal(r.brokenCursorChains,1);
  assert.equal(r.untrustedPaginationClaimsInternallyComplete,false);
});
test('Repeating cursor across pages is a broken chain even if the receipt has a final page',()=>{
  const r=run(f=>{
    f.scans[1].pages=[
      page(0,null,T1,true),page(1,T1,T1,true),page(2,T1,null,false)
    ];
  });
  assert.equal(r.brokenCursorChains,1);
  assert.equal(r.freeSlotsCertified,false);
});
test('A text source lacking required message stream is incomplete, not zero Events',()=>{
  const r=run(f=>{f.scans=f.scans.filter(x=>x.channelId!==L);});
  assert.equal(r.streamsMissingScanClaims,1);
  assert.equal(r.monthRows.find(x=>x.month==='2026-10').claimedRequiredStreamsIncomplete,1);
  assert.equal(r.deletedMessagesActuallyRecovered,false);
});
test('A private-thread archive page that fails with 403 does not make month free',()=>{
  const r=run(f=>{
    threadParent(f);
    f.scans.push({channelId:P,stream:'active',pages:[page(0)]});
    f.scans.push({channelId:P,stream:'archived-public',pages:[page(0)]});
    f.scans.push({channelId:P,stream:'archived-private',
      pages:[page(0,null,null,false,{status:'forbidden',itemCount:0})]});
  });
  assert.equal(r.failedPageRequests,1);
  assert.ok(r.monthRows.find(x=>x.month==='2026-09')
    .claimedRequiredStreamsIncomplete>0);
  assert.equal(r.freeSlotsCertified,false);
});
test('A synthetically complete forum is never an attested 24-month Discord original inventory',()=>{
  const r=run();
  assert.equal(r.discoveredAllActualLegacyChannels,false);
  assert.equal(r.providerPaginationAuthenticityVerified,false);
  assert.equal(r.original24MonthHistoryCompletelyAuthenticated,false);
  assert.equal(r.safeToActivate,false);
});
test('Private issue report never leaks channel IDs, archive cursors or text source IDs',()=>{
  const r=run(f=>{
    f.scans[1].pages[1].requestCursor='2026-11-23T10:00:00.000Z';
  });
  const out=JSON.stringify(r);
  for(const secret of [G,C,L,T1,T2,'2026-11-23T10:00:00.000Z'])
    assert.equal(out.includes(secret),false);
  assert.ok(r.issueCount>0);
});
