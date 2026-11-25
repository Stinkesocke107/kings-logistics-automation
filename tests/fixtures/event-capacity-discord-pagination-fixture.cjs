'use strict';
const {createHash}=require('node:crypto');
const {auditKingsDiscordHistoryPagination}
  =require('../../event-capacity-discord-history-pagination-audit');
const G='990000000000000000',C='990000000000000001',
  L='990000000000000002';
const h=x=>createHash('sha256').update(x).digest('hex');
const nowMs=Date.parse('2026-11-25T16:00:00.000Z');
function page(index,requestCursor=null,nextCursor=null,hasMore=false,patch={}){
  return {index,requestCursor,nextCursor,hasMore,status:'ok',itemCount:1,
    responseDigest:h('page'+index+(requestCursor??'')),
    fetchedAtUtc:'2026-11-25T15:00:00.000Z',...patch};
}
function fixture(){
  return {guildId:G,firstMonth:'2024-12',finalMonth:'2026-11',
    reviewSecret:'synthetic private source review key for offline tests',
    nowMs,channels:[
      {channelId:C,channelKind:'current-forum',
        firstCoveredMonth:'2024-12',lastCoveredMonth:'2026-11'},
      {channelId:L,channelKind:'legacy-text',
        firstCoveredMonth:'2026-10',lastCoveredMonth:'2026-10'}
    ],scans:[
      {channelId:C,stream:'active',
        pages:[page(0,null,'cursor1',true),
          page(1,'cursor1',null,false)]},
      {channelId:C,stream:'archived-public',pages:[page(0)]},
      {channelId:C,stream:'archived-private',pages:[page(0)]},
      {channelId:L,stream:'messages',pages:[page(0)]}
    ]};
}
function review(change){const x=fixture();change?.(x);return auditKingsDiscordHistoryPagination(x);}
module.exports={G,C,L,h,page,fixture,review};
