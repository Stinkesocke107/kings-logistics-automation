'use strict';
const crypto=require('node:crypto');
const {inspectKingsOutboundCenterLinks:inspect}
  =require('../../event-capacity-outbound-center-link-audit');
const C='990000000000000001',L='990000000000000002';
const h=s=>crypto.createHash('sha256').update(s).digest('hex');
const ch=(channelId,kind)=>({channelId,kind,
  firstCoveredMonth:'2024-12',lastCoveredMonth:'2026-11',
  claimedThreadCount:1,claimedArchivedCount:0,claimedDeletedCount:0,
  currentThreadsRead:true,archivedThreadsRead:true,
  deletedThreadsReviewed:true,editHistoryReviewed:true});
const row=(channelId,threadId,sourceKind)=>({
  channelId,threadId,sourceKind,eventId:'evt100',
  status:'Scheduled',category:'Partner Convoy',
  departureAtUtc:'2026-11-20T18:00:00.000Z',
  modifiedAtUtc:'2026-11-19T12:00:00.000Z',
  sourceDigest:h('source'+threadId),revisionDigests:[h('edit'+threadId)]});
const invite=patch=>({invitationId:'inv1',eventId:'evt100',
  status:'Accepted',departureAtUtc:'2026-11-20T18:00:00.000Z',
  sourceDigest:h('outbound'),...patch});
function fixture(){
  return {guildId:'990000000000000000',currentChannelId:C,
    firstMonth:'2024-12',finalMonth:'2026-11',
    nowMs:Date.parse('2026-11-25T15:00:00.000Z'),
    reviewSecret:'synthetic offline HMAC used for testing only',
    channelInventory:[ch(C,'current'),ch(L,'legacy')],
    convoyRecords:[
      row(C,'990000000000000003','current'),
      row(L,'990000000000000004','legacy')],
    tracker:{configured:true,connected:true,claimsComplete:true,
      records:[invite()]}}
}
function review(change){const x=fixture();change?.(x);return inspect(x);}
const has=(r,reason)=>r.reviewItems.some(x=>x.reason===reason);
module.exports={review,fixture,invite,ch,row,has,C,L,h};
