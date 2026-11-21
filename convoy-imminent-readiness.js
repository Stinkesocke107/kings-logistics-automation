'use strict';
// Kings Event reminder-readiness audit (read-only and advisory-only).
// Uses the current in-memory/report state AFTER official TruckersMP sync and
// Event Finalizer. Does not read Discord messages, publish reminders,
// change status, assign roles, or log people/slot images/thread details.
const fs=require('node:fs');
const path=require('node:path');
const REPORT=path.join(__dirname,'output','convoy-check-results.json');
const FUTURE_WINDOW_SECONDS=24*60*60;
const EVENT_ID=/^\d{3,10}$/;

function validOfficialMeeting(item){
 const sync=item?.truckersmpSync;
 const tmp=item?.truckersmp;
 if(sync?.ok!==true||sync?.authoritative!==true||!tmp?.authoritative||
    tmp?.publicCancelled===true)return null;
 const at=Date.parse(tmp.meetupAtUtc||'');
 if(!Number.isFinite(at)||at<=0)return null;
 return Math.floor(at/1000);
}
function approvedUpcoming(report,nowUnix=Math.floor(Date.now()/1000)){
 if(!Array.isArray(report?.threads)||!Number.isSafeInteger(nowUnix)||nowUnix<0)
  throw Error('convoy-readiness-source-invalid');
 const results=[];
 for(const item of report.threads){
  if(!item||item.ignored||item.error||item.testThread||
     item.duplicateEventId===true||item.staffStatus?.status!=='Scheduled'||
     !EVENT_ID.test(String(item.eventId||'')))continue;
  if(item.status==='Cancelled'||item.status==='Completed')continue;
  const meetingUnix=validOfficialMeeting(item);
  if(!meetingUnix)continue;
  const secondsUntil=meetingUnix-nowUnix;
  if(secondsUntil<=0||secondsUntil>FUTURE_WINDOW_SECONDS)continue;
  const blocked=[];
  if(item.archived)blocked.push('archived-thread');
  if(item.locked)blocked.push('locked-thread');
  if(item.status!=='Scheduled')blocked.push('final-status-not-scheduled');
  if(item.validation?.complete!==true)blocked.push('required-fields-not-finalized');
  if(item.eventTimeValid!==true||!Number.isSafeInteger(item.eventUnix))
   blocked.push('meeting-time-not-finalized');
  else if(Math.abs(item.eventUnix-meetingUnix)>60)
   blocked.push('meeting-time-differs-from-official-source');
  if(item.validation?.checks?.kingsSlotConfirmed!==true)
   blocked.push('kings-slot-not-confirmed');
  if(item.validation?.checks?.imageProof!==true||
     !item.kingsSlotImage&&!item.validation?.parsed?.kingsSlotImage)
   blocked.push('slot-image-not-verified');
  results.push({
   eventId:String(item.eventId),meetingAtUtc:new Date(meetingUnix*1000).toISOString(),
   minutesUntil:Math.ceil(secondsUntil/60),
   window:secondsUntil<=3600?'ONE_HOUR':'ONE_DAY',
   status:blocked.length?'BLOCKED':'ELIGIBLE_NOT_DELIVERY_PROOF',
   blockers:blocked
  });
 }
 return results.sort((a,b)=>a.minutesUntil-b.minutesUntil||a.eventId.localeCompare(b.eventId));
}
function summary(results){
 return {
  upcomingApproved:results.length,
  oneHour:results.filter(r=>r.window==='ONE_HOUR').length,
  blocked:results.filter(r=>r.status==='BLOCKED').length,
  blockedOneHour:results.filter(r=>r.status==='BLOCKED'&&r.window==='ONE_HOUR').length
 };
}
function main(){
 const report=JSON.parse(fs.readFileSync(REPORT,'utf8'));
 const results=approvedUpcoming(report);
 const totals=summary(results);
 console.log('[Kings Convoy Readiness] Authoritatively timed and human-scheduled upcoming events: '+totals.upcomingApproved+
  '; in one-hour window: '+totals.oneHour+'; blocked: '+totals.blocked+
  '; blocked in one-hour window: '+totals.blockedOneHour+'.');
 for(const result of results){
  if(result.status!=='BLOCKED')continue;
  // Only public TMP event ID and API time; never reveal internal names,
  // personnel, slot images, Discord thread/channel IDs, or raw messages.
  console.log('::warning::Kings Convoy Reminder readiness blocked for public TMP event '+
   result.eventId+' (meeting '+result.meetingAtUtc+'): '+result.blockers.join(', ')+
   '. This is not a claim that a prior reminder was/was not delivered.');
 }
 console.log('Readiness is NOT delivery proof. No Discord writes or private/personnel-data output.');
 if(process.env.GITHUB_STEP_SUMMARY){
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '\n### Kings Event Reminder Readiness (read-only)\n'+
   '- Human-scheduled, officially timed events in next 24h: **'+totals.upcomingApproved+'**\n'+
   '- Potentially blocked: **'+totals.blocked+'**; within one hour: **'+totals.blockedOneHour+'**\n'+
   '- No Discord messages sent; eligibility is not delivery proof.\n');
 }
}
if(require.main===module)try{main();}catch{
 console.error('Kings Convoy Reminder readiness could not be verified; no Discord write attempted.');
 process.exitCode=1;
}
module.exports={validOfficialMeeting,approvedUpcoming,summary};
