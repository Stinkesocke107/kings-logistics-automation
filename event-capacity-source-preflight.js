'use strict';
// Kings Events 12+13+16 — actual source-to-calendar PRERELEASE preflight.
// Outbound GitHub GET-only source reader is injected by the existing job.
// Explicitly NEVER publish Discord, reserve Events, grant roles, or write.
// All detailed source claims remain in memory, never printed, exported or
// included in operational status or Github Actions summaries.
const {verifySourceFreshness}=require('./event-capacity-github-only');
const {monthlyFromReports}=require('./event-capacity-live-calendar-summary');
const ERROR='Kings Event Capacity source-preflight could not confirm readiness.';
const STATES=new Set(['SOURCE_UNVERIFIED','CALENDAR_UNVERIFIED',
  'SOURCE_CALENDAR_PREVIEW_READY']);
function verdict(state){
  if(!STATES.has(state))throw Error(ERROR);
  return Object.freeze({
    version:1,visibility:'PRIVATE_ONLY',mode:'SOURCE_PREFLIGHT',
    status:state,readOnly:true,sourceArtifactChecked:state!=='SOURCE_UNVERIFIED',
    calendarProjectionChecked:state==='SOURCE_CALENDAR_PREVIEW_READY',
    discordAccessed:false,discordWrites:0,githubWrites:0,
    eventDataLogged:false,calendarContentLogged:false,
    historicDiscordCoverageVerified:false,
    staffApprovalsVerified:false,
    bookingsCreated:0,freeSlotsCertified:false,
    automaticActivationAuthorized:false
  });
}
async function inspectKingsEventSourcePreflight({reader,nowMs=Date.now()}={}){
  try{
    // This uses the very same scheduled-run, archive, scope, inventory,
    // and freshness boundary as the first protected live Calendar sync.
    // In particular, latest GitHub run SUCCESS does NOT alone mean its
    // Convoy ZIP or Event inventory can be trusted.
    const result=await verifySourceFreshness(reader,nowMs,null,monthlyFromReports);
    if(result?.sourceAvailable!==true||result.verifiedFreeSlots!==false||
      result.classificationsVerified!==false)
      return verdict('SOURCE_UNVERIFIED');
    if(result.calendarStatus!=='Source Claims Preview'||
      !result.calendarSnapshot||
      result.calendarSnapshot.visibility!=='PRIVATE_ONLY'||
      result.calendarSnapshot.safeToActivate!==false||
      result.calendarSnapshot.freeSlotsCertified!==false||
      result.calendarSnapshot.bookingsChanged!==0||
      result.calendarSnapshot.liveDiscordCallsMade!==0||
      result.calendarSnapshot.months?.length!==12)
      return verdict('CALENDAR_UNVERIFIED');
    return verdict('SOURCE_CALENDAR_PREVIEW_READY');
  }catch{
    return verdict('SOURCE_UNVERIFIED');
  }
}
module.exports={inspectKingsEventSourcePreflight};
