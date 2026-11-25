'use strict';
// DRAFT, PRIVATE, READ-ONLY. Current Center, older source and outbound
// tracker are independent untrusted claims; never approve real events here.
const {projectKingsConvoySystemBridge}
  =require('./event-capacity-convoy-system-calendar-bridge');
const {inspectKingsOutboundCenterLinks}
  =require('./event-capacity-outbound-center-link-audit');
const ERROR='Kings Event Capacity unified review refused.';
function fail(){throw new Error(ERROR);}
function count(x){if(!Number.isSafeInteger(x)||x<0||x>10000)fail();return x;}
function projectKingsUnifiedEventTeamReview(input){
  try{
    if(!input||typeof input!=='object'||Array.isArray(input)||
      !input.sourceIntake)fail();
    const bridge=projectKingsConvoySystemBridge(input),
      outbound=inspectKingsOutboundCenterLinks(input.sourceIntake);
    if(bridge.safeToActivate!==false||bridge.freeSlotsCertified!==false||
      outbound.safeToActivate!==false||outbound.freeSlotsCertified!==false)
      fail();
    const b=bridge.sourceReview,c=outbound.counts;
    const states=['Draft','Sent','Accepted','Declined','Withdrawn','Unknown'];
    const status=outbound.outboundStatusClaims;
    if(!status||states.some(k=>!Object.hasOwn(status,k)))fail();
    const statusTotal=states.reduce((n,k)=>n+count(status[k]),0);
    if(statusTotal!==count(c.outboundInvitationClaims))fail();
    const calendar=bridge.calendar;
    if(calendar.visibility!=='PRIVATE_ONLY'||calendar.safeToActivate!==false||
      calendar.freeSlotsCertified!==false||calendar.months.length!==12)fail();
    const calendarQuotaConflicts=calendar.months.filter(m=>
      m.monthStatus==='Monthly Quota Conflict — Human Review').length;
    if(count(b.outboundTrackerClaimedInvitations)!==
      count(c.outboundInvitationClaims)||
      count(b.trackerClaimedLinkedEvents)!==
      count(c.linkedByCanonicalEventId))fail();
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      year:bridge.calendar.year,selectedMonth:bridge.calendar.selectedMonth,
      sourceCounts:Object.freeze({
        calendarMonths:count(calendar.months.length),
        calendarMonthsWithoutSignedHolds:count(calendar.monthsWithoutSignedHoldReport),
        calendarMonthsOutsideOriginalEvidence:count(calendar.monthsOutside24MonthEvidenceReview),
        calendarMonthsWithQuotaConflicts:count(calendarQuotaConflicts),
        currentCenterClaims:count(b.convoyCenterClaimedThreads),
        olderChannelClaims:count(b.olderChannelClaimedThreads),
        frozenLegacyClaims:b.frozenLegacyClaimedConvoys===null?null:
          count(b.frozenLegacyClaimedConvoys),
        outboundInvitations:count(c.outboundInvitationClaims),
        outboundByStatus:Object.freeze(Object.fromEntries(
          states.map(k=>[k,count(status[k])]))),
        explicitlyLinkedInvitations:count(c.linkedByCanonicalEventId),
        missingLinks:count(c.noCanonicalEventLink)+count(c.missingCenterEventLink),
        staleOrWrongDeparture:count(c.departureMatchesOldSourceOnly)+
          count(c.departureDiffersFromAllSources),
        outboundAcceptedVsCenterConflict:
          count(c.outboundAcceptedWhileCenterNotApproved)+
          count(c.outboundAcceptedWhileCenterCancelledOrUnknown),
        multiInvitationEventGroups:count(c.multipleOutboundInvitationGroups),
        archiveCountContradictions:count(b.archivedChannelCountMismatches),
        deletionCountContradictions:count(b.deletedChannelCountMismatches),
        centerReviewItems:count(b.unresolvedHumanReviewItems),
        separateOutboundReviewItems:count(outbound.unresolvedReviewItems),
        separateOutboundUrgentItems:count(outbound.urgentReviewItems)
      }),
      sourceIssueCountsAreNonadditive:true,
      currentAndHistoricalCountsNeverAdded:true,
      outboundAcceptedIsNotKingsApproval:true,
      originalSourceProviderAuthenticated:false,
      outboundTrackerActuallyRead:false,
      realDiscordPermissionsVerified:false,
      actual24MonthCompletenessCertified:false,
      realEventsApproved:0,discordMessagesSent:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsUnifiedEventTeamReviewPreview(r){
  try{
    if(!r||r.visibility!=='PRIVATE_ONLY'||r.readOnly!==true||
      r.safeToActivate!==false||r.freeSlotsCertified!==false||
      r.realEventsApproved!==0||r.discordMessagesSent!==0||
      r.outboundTrackerActuallyRead!==false||!r.sourceCounts||
      !/^20\d{2}$/.test(r.year))fail();
    const c=r.sourceCounts;
    for(const name of ['outboundInvitations','explicitlyLinkedInvitations',
      'missingLinks','staleOrWrongDeparture',
      'outboundAcceptedVsCenterConflict',
      'archiveCountContradictions','deletionCountContradictions'])
      count(c[name]);
    const status=c.outboundByStatus,
      statuses=['Draft','Sent','Accepted','Declined','Withdrawn','Unknown'];
    if(!status||statuses.some(k=>!Object.hasOwn(status,k)))fail();
    if(statuses.reduce((sum,k)=>sum+count(status[k]),0)!==
      c.outboundInvitations)fail();
    if(c.calendarMonths!==12||
      ['calendarMonthsWithoutSignedHolds','calendarMonthsOutsideOriginalEvidence',
        'calendarMonthsWithQuotaConflicts'].some(k=>count(c[k])>12))fail();
    return Object.freeze({type:4,data:{
      flags:64,allowed_mentions:{parse:[]},
      content:'**Kings Event-Team — Offline Evidence Review**\n'+
        'Invitations '+c.outboundInvitations+
        ' | Linked '+c.explicitlyLinkedInvitations+
        ' | Missing '+c.missingLinks+'\n'+
        'Draft '+status.Draft+' | Sent '+status.Sent+
        ' | Accepted '+status.Accepted+' | Unknown '+status.Unknown+'\n'+
        'Old/wrong dates '+c.staleOrWrongDeparture+
        ' | Status reviews '+c.outboundAcceptedVsCenterConflict+'\n'+
        'Calendar 12 months | Holds missing '+c.calendarMonthsWithoutSignedHolds+
        ' | Original evidence not supplied '+c.calendarMonthsOutsideOriginalEvidence+'\n'+
        'Archive/deleted contradictions '+
          c.archiveCountContradictions+'/'+c.deletionCountContradictions+
        '\n**No live Discord access. No certified free slots.**',
      embeds:[]}});}
  catch{fail();}
}
module.exports={projectKingsUnifiedEventTeamReview,
  renderKingsUnifiedEventTeamReviewPreview};
