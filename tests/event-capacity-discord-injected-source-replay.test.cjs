'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {replayKingsDiscordSyntheticSource:replay}
  =require('../event-capacity-discord-injected-source-replay');
const C='990000000000000001',G='990000000000000000';
const T='990000000000000003',U='990000000000000002';
const at='2026-11-25T16:30:00.000Z';
function old(id,stamp){
  return {id,parent_id:C,thread_metadata:{archive_timestamp:stamp},
    name:'SENSITIVE EVENT NAME NEVER IN THE RESULT'};
}
function options(transport,patch={}){
  return {guildId:G,channelId:C,
    sourceKind:'current-forum',stream:'archived-public',
    nowUtc:at,maxPages:5,limit:100,
    mode:'INJECTED_SYNTHETIC_ONLY',transport,...patch};
}
test('Two synthetic public archive GET requests advance by validated UTC timestamp only',async()=>{
  const seen=[];
  const responses=[
    {status:200,data:{threads:[old(T,'2026-11-25T15:00:00.000Z')],has_more:true}},
    {status:200,data:{threads:[old(U,'2026-11-24T15:00:00.000Z')],has_more:false}}
  ];
  const result=await replay(options(async request=>{
    seen.push(request);
    return responses[seen.length-1];
  }));
  assert.equal(seen.length,2);
  assert.ok(seen.every(x=>x.method==='GET'));
  assert.ok(seen[0].path.includes('/threads/archived/public?limit=100'));
  assert.ok(seen[1].path.includes('&before=2026-11-25T15%3A00%3A00.000Z'));
  assert.equal(result.counts.pagesAttempted,2);
  assert.equal(result.counts.itemsObserved,2);
  assert.equal(result.counts.outstandingPagesOrProviderErrors,false);
  assert.equal(result.privateReceiptDoNotLog.pages[1].requestCursor,
    '2026-11-25T15:00:00.000Z');
  assert.equal(result.actualDiscordNetworkRequestsMadeByModule,0);
});
test('Only GET, API origin and private path reaches the injected callback',async()=>{
  let invoked=0;
  const r=await replay(options(async request=>{
    invoked++;
    assert.deepEqual(Object.keys(request).sort(),['method','origin','path']);
    assert.equal(request.method,'GET');
    assert.equal(request.origin,'https://discord.com/api/v10');
    assert.equal(request.path.includes('delete'),false);
    return {status:200,data:{threads:[],has_more:false}};
  }));
  assert.equal(invoked,1);
  assert.equal(r.safeToActivate,false);
});
test('Page budget exhausted while has_more remains true must report incomplete',async()=>{
  let calls=0;
  const r=await replay(options(async()=>{
    calls++;return {status:200,data:{
      threads:[old(T,'2026-11-25T15:00:00.000Z')],has_more:true
    }};
  },{maxPages:1}));
  assert.equal(calls,1);
  assert.equal(r.counts.outstandingPagesOrProviderErrors,true);
  assert.equal(r.privateReceiptDoNotLog.pages[0].hasMore,true);
});
test('Forbidden source produces sanitized failure and no successful progress claim',async()=>{
  const r=await replay(options(async()=>({
    status:403,data:{detail:'SENSITIVE PRIVATE ERROR'}
  })));
  assert.equal(r.counts.failedPages,1);
  assert.equal(r.privateReceiptDoNotLog.pages[0].status,'forbidden');
  assert.equal(JSON.stringify(r).includes('SENSITIVE PRIVATE ERROR'),false);
  assert.equal(r.counts.outstandingPagesOrProviderErrors,true);
});
test('Discord 429 is never retried automatically or reported as a complete scan',async()=>{
  let n=0;const r=await replay(options(async()=>{
    n++;return {status:429,data:{retry_after:30,token:'PRIVATE'}};
  }));
  assert.equal(n,1);
  assert.equal(r.privateReceiptDoNotLog.pages[0].status,'rate-limited');
  assert.equal(r.counts.outstandingPagesOrProviderErrors,true);
  assert.equal(r.freeSlotsCertified,false);
});
test('Mock callback throws with sensitive provider detail and only error receipt remains',async()=>{
  const r=await replay(options(async()=>{
    throw new Error('PRIVATE_TOKEN');
  }));
  assert.equal(r.privateReceiptDoNotLog.pages[0].status,'error');
  assert.equal(JSON.stringify(r).includes('PRIVATE_TOKEN'),false);
});
test('Malformed archive payload fails this one synthetic scan safely',async()=>{
  const r=await replay(options(async()=>({
    status:200,data:{threads:[{id:T,parent_id:'WRONG'}],has_more:true}
  })));
  assert.equal(r.counts.failedPages,1);
  assert.equal(r.counts.outstandingPagesOrProviderErrors,true);
  assert.equal(r.providerResponseAuthenticated,false);
});
test('Active guild list consumes only one GET and filters unrelated forum parents',async()=>{
  let count=0;
  const r=await replay(options(async()=>{
    count++;return {status:200,data:{threads:[
      {id:T,parent_id:C,content:'PRIVATE'},
      {id:U,parent_id:'990000000000000099',content:'SECRET'}
    ]}};
  },{stream:'active'}));
  assert.equal(count,1);
  assert.equal(r.counts.itemsObserved,1);
  assert.equal(r.privateReceiptDoNotLog.pages[0].hasMore,false);
  assert.equal(JSON.stringify(r).includes('SECRET'),false);
});
test('Legacy text page advances with a snowflake before cursor and stops on short response',async()=>{
  const seen=[];
  const r=await replay(options(async req=>{
    seen.push(req.path);
    if(seen.length===1){
      return {status:200,data:[{id:T,content:'PRIVATE'}, {id:U}]};
    }
    return {status:200,data:[]};
  },{sourceKind:'legacy-text',stream:'messages',limit:2}));
  assert.equal(seen.length,2);
  assert.ok(seen[1].includes('&before='+U));
  assert.equal(r.counts.itemsObserved,2);
  assert.equal(r.counts.outstandingPagesOrProviderErrors,false);
  assert.equal(JSON.stringify(r).includes('PRIVATE'),true); // only PRIVATE_ONLY metadata
  assert.equal(JSON.stringify(r).includes('PRIVATE MESSAGE'),false);
});
test('Missing transport or opt-in synthetic mode can never activate a source read',async()=>{
  await assert.rejects(()=>replay(options(undefined)));
  await assert.rejects(()=>replay(options(async()=>({status:200,data:[]}),
    {mode:'LIVE_DISCORD'})));
});
test('Dangerous source stream and unlimited page requests are rejected before callback',async()=>{
  for(const patch of [
    {stream:'messages',sourceKind:'current-forum'},
    {maxPages:0},{maxPages:100},{limit:101},
    {channelId:'../../../admin'},{sourceKind:'administrator'}
  ])await assert.rejects(()=>replay(options(async()=>({status:200,data:[]}),patch)));
});
test('Source response is not modified, no raw message content or author names retained',async()=>{
  const data={threads:[old(T,'2026-11-25T15:00:00.000Z')],has_more:false};
  const before=structuredClone(data);
  const r=await replay(options(async()=>({status:200,data})));
  assert.deepEqual(data,before);
  assert.equal(JSON.stringify(r).includes('SENSITIVE EVENT NAME'),false);
  assert.equal(r.sourceMessagesOrContentRetained,false);
});
test('Injected synthetic scans do not promote any provider result to certified source history',async()=>{
  const r=await replay(options(async()=>({
    status:200,data:{threads:[],has_more:false}
  })));
  assert.equal(r.sourceProviderAccessAuthenticated,false);
  assert.equal(r.replayResultNotActualCompletenessProof,true);
  assert.equal(r.canApproveRealBookings,false);
  assert.equal(r.safeToActivate,false);
});
test('Can pass replay receipts to the existing 24-month offline pagination audit',async()=>{
  const {auditKingsDiscordHistoryPagination}
    =require('../event-capacity-discord-history-pagination-audit');
  const one=await replay(options(async()=>({
    status:200,data:{threads:[],has_more:false}
  })));
  const result=auditKingsDiscordHistoryPagination({
    guildId:G,firstMonth:'2024-12',finalMonth:'2026-11',
    nowMs:Date.parse(at),
    reviewSecret:'synthetic private HMAC review for 24-month audit',
    channels:[{channelId:C,channelKind:'current-forum',
      firstCoveredMonth:'2024-12',lastCoveredMonth:'2026-11'}],
    scans:[one.privateReceiptDoNotLog]
  });
  assert.equal(result.suppliedScanClaims,1);
  assert.equal(result.streamsMissingScanClaims,2);
  assert.equal(result.providerPaginationAuthenticityVerified,false);
  assert.equal(result.freeSlotsCertified,false);
});
