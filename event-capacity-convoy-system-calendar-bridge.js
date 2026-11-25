'use strict';
// PRIVATE / DRAFT / READ-ONLY. Combine the existing Convoy Center calendar,
// untrusted legacy-channel inventory and future outgoing Invitation Tracker
// review. Sources may overlap. Never derive or authorize free capacity.
const {reconcileKingsMultiSourceConvoys}
  =require('./event-capacity-convoy-multi-source-intake');
const {projectKingsStaffCalendarReview,renderKingsStaffCalendarEphemeral}
  =require('./event-capacity-staff-calendar-review');
const ERROR='Kings Event Capacity private system bridge refused.';
function fail(){throw new Error(ERROR);}
function projectKingsConvoySystemBridge({
  sourceIntake,capacity,year,selectedMonth=null,
  historicalHoldsReports=[],historicalEvidenceReport=null
}={}){
  try{
    if(!sourceIntake||typeof sourceIntake!=='object')fail();
    const month=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
    if(!month.test(sourceIntake.firstMonth)||!month.test(sourceIntake.finalMonth))fail();
    const last=new Date(sourceIntake.firstMonth+'-01T00:00:00.000Z');
    last.setUTCMonth(last.getUTCMonth()+23);
    if(last.toISOString().slice(0,7)!==sourceIntake.finalMonth)fail();
    const source=reconcileKingsMultiSourceConvoys(sourceIntake);
    const calendar=projectKingsStaffCalendarReview({
      capacity,year,selectedMonth,historicalHoldsReports,
      historicalEvidenceReport
    });
    if(source.visibility!=='PRIVATE_ONLY'||source.safeToActivate!==false||
      source.freeSlotsCertified!==false||
      calendar.visibility!=='PRIVATE_ONLY'||calendar.safeToActivate!==false||
      calendar.freeSlotsCertified!==false)fail();
    const c=source.sourceCounts;
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      sourceReview:Object.freeze({
        convoyCenterClaimedThreads:c.currentChannelRecords,
        olderChannelClaimedThreads:c.legacyChannelRecords,
        outboundTrackerClaimedInvitations:c.outgoingTrackerRecordClaims,
        trackerClaimedLinkedEvents:c.trackerMatchedEventClaims,
        crossChannelOverlaps:c.centerAndLegacyOverlapClaims,
        conflictingCrossChannelClaims:c.conflictingClaimGroups,
        unresolvedHumanReviewItems:source.unresolvedReviewItemCount,
        urgentHumanReviewItems:source.urgentReviewItemCount,
        listedLegacyChannels:source.suppliedLegacyChannelCount,
        originalDiscordMessagesFetchedHere:0,
        realAcceptanceApprovalsPerformed:0
      }),
      calendar,
      sourceAndHistoricalCountsCanOverlap:true,
      outboundInvitationAcceptedNeverAutomaticallyCountsForCapacity:true,
      original24MonthSourceHistoryFullyVerified:false,
      currentDiscordChannelsAuthenticatedHere:false,
      previousDiscordChannelsAuthenticatedHere:false,
      eventInvitationTrackerActuallyConnectedHere:false,
      anySourceReadOrImportedInThisFunction:false,
      staffDecisionsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsConvoySystemBridgePreview(bridge){
  try{
    if(!bridge||bridge.visibility!=='PRIVATE_ONLY'||bridge.readOnly!==true||
      bridge.safeToActivate!==false||bridge.freeSlotsCertified!==false||
      bridge.currentDiscordChannelsAuthenticatedHere!==false||
      bridge.previousDiscordChannelsAuthenticatedHere!==false||
      bridge.eventInvitationTrackerActuallyConnectedHere!==false||
      bridge.staffDecisionsCommitted!==0||
      !bridge.sourceReview)fail();
    const data=renderKingsStaffCalendarEphemeral(bridge.calendar).data;
    const s=bridge.sourceReview;
    const numbers=['convoyCenterClaimedThreads','olderChannelClaimedThreads',
      'outboundTrackerClaimedInvitations','unresolvedHumanReviewItems',
      'urgentHumanReviewItems'].map(k=>s[k]);
    if(numbers.some(n=>!Number.isSafeInteger(n)||n<0||n>100000))fail();
    const content='**Kings Cross-System Event Review — PREVIEW ONLY**\n'+
      'Convoy Center: '+numbers[0]+' | Older Channels: '+numbers[1]+
      ' | Invitation Tracker: '+numbers[2]+'\n'+
      'Unresolved source checks: '+numbers[3]+' | Urgent: '+numbers[4]+'\n'+
      '**Original Discord channel messages not read here. No free slots certified.**';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{
      flags:64,allowed_mentions:{parse:[]},content,embeds:data.embeds
    }});
  }catch{fail();}
}
module.exports={projectKingsConvoySystemBridge,
  renderKingsConvoySystemBridgePreview};
