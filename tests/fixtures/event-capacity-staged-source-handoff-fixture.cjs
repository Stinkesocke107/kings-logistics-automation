'use strict';
const {createHash}=require('node:crypto');
const {fixture:source}=require('./outbound-center-scenario.cjs');
const {fixture:pages}=require('./event-capacity-discord-pagination-fixture.cjs');
const {rehearseKingsStagedSourceHandoff}
  =require('../../event-capacity-staged-source-handoff-review');
const hash=s=>createHash('sha256').update(s).digest('hex');
const OLD=Date.parse('2026-11-25T15:00:00.000Z');
const NEW=Date.parse('2026-11-25T16:00:00.000Z');
function fixture(){
  const previous=source(),current=structuredClone(previous);
  previous.nowMs=OLD;current.nowMs=NEW;
  for(const src of [previous,current]){
    src.channelInventory[1].firstCoveredMonth='2026-10';
    src.channelInventory[1].lastCoveredMonth='2026-10';
  }
  const previousPagination=pages(),currentPagination=pages();
  previousPagination.nowMs=OLD;
  currentPagination.nowMs=NEW;
  return {previous,current,previousPagination,currentPagination,
    reviewSecret:'synthetic private source-handoff issue signing key only'};
}
function review(change){
  const f=fixture();change?.(f);return rehearseKingsStagedSourceHandoff(f);
}
const has=(r,reason)=>r.reviewItems.some(x=>x.reason===reason);
function adjustTotals(f){
  const records=f.current.convoyRecords;
  for(const c of f.current.channelInventory){
    const rows=records.filter(r=>r.channelId===c.channelId);
    c.claimedThreadCount=rows.length;
    c.claimedArchivedCount=rows.filter(r=>r.sourceKind==='archived').length;
    c.claimedDeletedCount=rows.filter(r=>r.sourceKind==='deleted').length;
  }
}
module.exports={fixture,review,has,adjustTotals,hash,OLD,NEW};
