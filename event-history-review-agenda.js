'use strict';
// Private Kings #14/#16 manual evidence review months. Source-claim summaries
// only; no per-event dates, identities, bookings or Staff decisions.
const CODES=Object.freeze({
  FUTURE_LEGACY_HOLD:'Future frozen Legacy records to verify',
  PAST_CENTER_OUTCOME:'Past Convoy Center outcomes unclear',
  UNDATED_LEGACY:'Frozen Legacy records missing an original UTC date',
  UNDATED_CENTER:'Convoy Center source records missing a UTC date',
  LEGACY_ORIGINAL_EVIDENCE:'Frozen Legacy original Staff evidence missing',
  HISTORICAL_MONTH_NO_CLAIMS:'Month without any historical source claims'
});
const MAX_ITEMS=6;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
function monthAt(nowMs,offset){
  const now=new Date(nowMs);
  return new Date(Date.UTC(now.getUTCFullYear(),
    now.getUTCMonth()+offset,1)).toISOString().slice(0,7);
}
function trustedReviewAgenda(value){
  if(!Array.isArray(value)||value.length>MAX_ITEMS)return false;
  const seen=new Set();
  for(const row of value){
    if(!row||Array.isArray(row)||typeof row!=='object'||
      Object.keys(row).sort().join(',')!=='code,count,utcMonth'||
      !Object.hasOwn(CODES,row.code))return false;
    const undated=row.code==='UNDATED_LEGACY'||row.code==='UNDATED_CENTER';
    const empty=row.code==='HISTORICAL_MONTH_NO_CLAIMS';
    if((undated&&row.utcMonth!==null)||
      (!undated&&(typeof row.utcMonth!=='string'||!MONTH.test(row.utcMonth)))||
      (empty?row.count!==null:!Number.isSafeInteger(row.count)||
        row.count<1||row.count>100000))return false;
    const key=row.code+':'+String(row.utcMonth);
    if(seen.has(key))return false;
    seen.add(key);
  }
  return true;
}
function buildReviewAgenda({history,future,undatedCenter=0,
  undatedLegacy=0,nowMs=Date.now()}={}){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0||
    !Array.isArray(history)||history.length!==24||
    !Array.isArray(future)||future.length!==12||
    !Number.isSafeInteger(undatedCenter)||undatedCenter<0||
    !Number.isSafeInteger(undatedLegacy)||undatedLegacy<0)
    throw Error('Kings historical review agenda source unverified');
  // Reject incomplete, stale, reordered or contradictory monthly claims.
  // A missing field must NEVER silently become an empty Staff review list.
  const validCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
  for(let i=0;i<history.length;i++){
    const row=history[i];
    if(!row||Array.isArray(row)||typeof row!=='object'||
      row.utcMonth!==monthAt(nowMs,i-23)||
      !validCount(row.centerClaims)||!validCount(row.legacyClaims)||
      !validCount(row.centerOutcomeUnresolved)||
      row.centerOutcomeUnresolved>row.centerClaims)
      throw Error('Kings historical review agenda source unverified');
  }
  for(const row of future){
    if(!row||Array.isArray(row)||typeof row!=='object'||
      !validCount(row.legacyDatedKeptSeparate))
      throw Error('Kings historical review agenda source unverified');
  }
  if(!validCount(undatedCenter)||!validCount(undatedLegacy))
    throw Error('Kings historical review agenda source unverified');
  const groups=[];
  const append=(code,month,count)=>{
    if(!Object.hasOwn(CODES,code))throw Error('Kings review code unverified');
    return Object.freeze({code,utcMonth:month,count});
  };
  // Earliest future potential commitments first; preserve each UTC month.
  groups.push(future.flatMap((row,index)=>
    Number.isSafeInteger(row?.legacyDatedKeptSeparate)&&
    row.legacyDatedKeptSeparate>0
      ?[append('FUTURE_LEGACY_HOLD',monthAt(nowMs,index),
        row.legacyDatedKeptSeparate)]:[]));
  const newestFirst=[...history].reverse();
  groups.push(newestFirst.flatMap(row=>
    Number.isSafeInteger(row?.centerOutcomeUnresolved)&&
    row.centerOutcomeUnresolved>0
      ?[append('PAST_CENTER_OUTCOME',row.utcMonth,row.centerOutcomeUnresolved)]:[]));
  groups.push(undatedLegacy?[append('UNDATED_LEGACY',null,undatedLegacy)]:[]);
  groups.push(undatedCenter?[append('UNDATED_CENTER',null,undatedCenter)]:[]);
  groups.push(newestFirst.flatMap(row=>
    Number.isSafeInteger(row?.legacyClaims)&&row.legacyClaims>0
      ?[append('LEGACY_ORIGINAL_EVIDENCE',row.utcMonth,row.legacyClaims)]:[]));
  groups.push(newestFirst.flatMap(row=>
    row?.centerClaims===0&&row?.legacyClaims===0
      ?[append('HISTORICAL_MONTH_NO_CLAIMS',row.utcMonth,null)]:[]));
  // Spread the first review slot across types, so 6 future holds cannot
  // hide all missing past outcomes; fill remaining slots deterministically.
  const output=[];
  for(const group of groups)if(group.length&&output.length<MAX_ITEMS)
    output.push(group.shift());
  for(const group of groups)for(const row of group){
    if(output.length>=MAX_ITEMS)break;
    output.push(row);
  }
  if(!trustedReviewAgenda(output))
    throw Error('Kings historical agenda integrity unverified');
  return Object.freeze(output);
}
function renderReviewAgenda(value){
  if(!trustedReviewAgenda(value))
    return 'Unavailable — month-level historical evidence source is stale, missing or unverified.';
  if(value.length===0)
    return 'No targeted month-level source flags. This does NOT certify 24-month historical completeness or original Staff approvals.';
  const lines=[
    'Suggested manual order for Event Coordination Lead; check original records.',
    ...value.map(row=>
      (row.utcMonth||'Undated')+' · '+CODES[row.code]+
      (row.count===null?' (no claims; not proof of no Events)':' ('+row.count+' source claims)')),
    'Advisory only; no approvals, released holds, free slots or automatic Event edits.'
  ];
  const message=lines.join('\n');
  if(message.length>1024)throw Error('Kings historical agenda field too long');
  return message;
}
module.exports={CODES,MAX_ITEMS,trustedReviewAgenda,buildReviewAgenda,renderReviewAgenda};
