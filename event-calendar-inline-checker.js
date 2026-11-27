'use strict';
// Kings Logistics: same-run Convoy Center -> Calendar candidate integration.
// Read-only, aggregate-only and fail-closed: does not publish Event details,
// approve anything, certify free slots, or create/edit Discord messages.
const fs=require('node:fs');
const path=require('node:path');
const {monthsFrom}=require('./event-capacity-pilot-source');
const OUTPUT=path.join(__dirname,'output');
const FILES=Object.freeze({
  report:'convoy-check-results.json',
  overview:'convoy-overview.json'
});
const MAX_JSON_BYTES=12*1024*1024;
const STATUS=Object.freeze({
  READY:'SOURCE_CALENDAR_READONLY_READY',
  UNVERIFIED:'CALENDAR_UNVERIFIED'
});
function loadReport(which){
  const name=FILES[which];
  if(!name)throw Error('Unsupported Event Calendar source');
  const file=path.join(OUTPUT,name);
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size===0||stat.size>MAX_JSON_BYTES)
    throw Error('Event Calendar input outside bounded source contract');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!data||typeof data!=='object'||Array.isArray(data))
    throw Error('Event Calendar source has invalid shape');
  return data;
}
function inspectInline({read=loadReport,nowMs=Date.now()}={}){
  try {
    if(typeof read!=='function'||!Number.isSafeInteger(nowMs)||nowMs<=0)
      throw Error('Invalid Event Calendar verification context');
    // The Checker stage is explicitly READ_ONLY and the finalizer adds its
    // independent completion time. This is not a Staff acceptance proof.
    const report=read('report');
    const overview=read('overview');
    if(report?.mode!=='READ_ONLY' || !report.finalization?.finalizedAt ||
       !Array.isArray(report?.threads)||!Array.isArray(overview?.registeredConvoys))
      throw Error('Incomplete finalization');
    const calendar=monthsFrom({report,overview},nowMs);
    if(calendar?.months?.length!==12 || calendar?.freeSlotsCertified!==false ||
       calendar?.ready!==false || calendar?.dailyTotalLimit!==3 ||
       calendar?.monthlyLimitValueConfirmed!==true ||
       calendar.months.some((month,i)=>
         month.utcMonth!==new Date(Date.UTC(
           new Date(nowMs).getUTCFullYear(),
           new Date(nowMs).getUTCMonth()+i,1)).toISOString().slice(0,7)||
         month.partnerMonthlyLimit!==30||month.externalMonthlyLimit!==30||
         month.kingsMonthlyLimit!==null||month.monthlyRemainingVerified!==null))
      throw Error('Unverified Event Capacity rules');
    return Object.freeze({
      status:STATUS.READY,readOnly:true,privateDetailsPublished:false,
      approvedEvents:0,bookingsCreated:0,freeSlotsCertified:false
    });
  } catch {
    return Object.freeze({
      status:STATUS.UNVERIFIED,readOnly:true,privateDetailsPublished:false,
      approvedEvents:0,bookingsCreated:0,freeSlotsCertified:false
    });
  }
}
function main(){
  const result=inspectInline();
  // PUBLIC Actions logs and step summaries must never reveal Event metadata.
  console.log('Kings Event Calendar same-run source: '+result.status);
  console.log('Private Event claims remain in memory; approvals, bookings and available slots unverified.');
  if(process.env.GITHUB_STEP_SUMMARY){
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### Kings Event Calendar — read-only Convoy Center integration\n'+
      'Source consistency: **'+result.status+'**. No private Event records, Staff decisions or free-slot certification published.\n');
  }
  if(result.status!==STATUS.READY){
    console.warn('::warning::Kings Event Calendar source not verified; no capacity claim produced.');
    process.exitCode=1;
  }
  return result;
}
if(require.main===module)main();
module.exports={FILES,STATUS,loadReport,inspectInline,main};
