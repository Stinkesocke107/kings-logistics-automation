'use strict';
// PRIVATE, READ-ONLY, DRAFT. Reuse the existing Discord reader, source-claims
// Calendar bridge, legacy pagination audit and Convoy Center. NO new authority.
// The injected transport can be synthetic: its existence is NOT provider proof.
const {scanKingsInvitationDiscordSource}
  =require('./event-invitation-discord-readonly-source');
const {projectKingsInvitationCalendarOffline}
  =require('./event-capacity-invitation-lifecycle-bridge');
const {projectKingsConvoySystemBridge}
  =require('./event-capacity-convoy-system-calendar-bridge');
const ERROR='Kings Events source-evidence handoff refused.';
const LIMIT=10000;
function fail(){throw Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&
  !Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function num(x){if(!Number.isSafeInteger(x)||x<0||x>LIMIT)fail();return x;}
function historySummary(h,bridgeInput){
  if(h===null)return Object.freeze({
    supplied:false,monthsRequired:24,claimedPaginationGaps:null,
    claimCompletenessChecked:false,sourceHistoryVerified:false
  });
  if(!plain(h)||h.version!==1||h.visibility!=='PRIVATE_ONLY'||
    h.readOnly!==true||h.safeToActivate!==false||
    h.freeSlotsCertified!==false||
    h.original24MonthHistoryCompletelyAuthenticated!==false||
    h.providerPaginationAuthenticityVerified!==false||
    h.deletedMessagesActuallyRecovered!==false||
    h.monthsRequired!==24||!Array.isArray(h.monthRows)||
    h.monthRows.length!==24||h.staffApprovalsCommitted!==0||
    h.bookingCountChanged!==0)fail();
  if(bridgeInput&&
    (bridgeInput.sourceIntake.firstMonth!==h.firstMonth||
     bridgeInput.sourceIntake.finalMonth!==h.finalMonth))fail();
  const missing=num(h.streamsMissingScanClaims),
    broken=num(h.brokenCursorChains),
    errors=num(h.failedPageRequests),
    incomplete=num(h.unfinishedPageStreams);
  return Object.freeze({
    supplied:true,monthsRequired:24,
    claimedPaginationGaps:missing+broken+errors+incomplete,
    claimCompletenessChecked:true,
    untrustedClaimsInternallyConsistent:
      h.untrustedPaginationClaimsInternallyComplete===true,
    sourceHistoryVerified:false
  });
}
async function inspectKingsEventInvitationSourceHandoff({
  client,config,asOfUtc,bridgeInput=null,historicalAudit=null
}={}){
  try{
    if(!plain(config)||typeof asOfUtc!=='string'||
      (bridgeInput!==null&&!plain(bridgeInput)))fail();
    if(bridgeInput!==null){
      if(!plain(bridgeInput.sourceIntake)||
        bridgeInput.sourceIntake.guildId!==config.guildId||
        bridgeInput.sourceIntake.tracker!==null&&
          bridgeInput.sourceIntake.tracker!==undefined||
        bridgeInput.sourceIntake.nowMs!==Date.parse(asOfUtc))fail();
    }
    const history=historySummary(historicalAudit,bridgeInput);
    // Only this existing scan touches injected Discord GET transport.
    const source=await scanKingsInvitationDiscordSource({
      client,config,asOfUtc
    });
    if(source.visibility!=='PRIVATE_ONLY'||source.readOnly!==true||
      source.safeToActivate!==false||source.freeSlotsCertified!==false||
      source.staffApprovalsCommitted!==0||
      source.eventBookingsCreated!==0||
      source.originalOrganizerResponsesIndependentlyVerified!==false)fail();
    const forum=source.sourceKind==='EXISTING_OUTBOUND_INVITE_FORUM_REVIEW';
    const text=source.privateClaimsDoNotLog!==undefined;
    if(forum===text)fail();
    let calendarProjected=false,forumClaims=0,structuredClaims=0,
      oldSourceLinkedClaims=0,futureUnlinked=0,calendarDays=0,
      backlog=0,unlinked=0;
    if(forum){
      if(source.structuredInvitationLifecycleImported!==0||
        source.organizerRepliesIndependentlyVerified!==false)fail();
      forumClaims=num(source.staffInvitationEntryClaims);
      backlog=num(source.threadsWithoutSingleEventLink)+
        num(source.threadsWithAmbiguousEventLinks);
      if(bridgeInput!==null){
        // The existing Convoy Center may be reviewed independently, but a
        // human-readable VTC entry is NEVER mapped to a canonical Event ID.
        const center=projectKingsConvoySystemBridge(bridgeInput);
        if(center.safeToActivate!==false||
          center.freeSlotsCertified!==false||
          center.staffDecisionsCommitted!==0)fail();
        calendarDays=num(center.calendar.days.length);
        calendarProjected=true;
      }
    }else{
      if(!plain(source.privateClaimsDoNotLog)||
        source.review?.readOnly!==true||
        source.review.safeToActivate!==false)fail();
      structuredClaims=num(source.review.counts.total);
      backlog=num(source.review.reviewItemCount);
      unlinked=num(source.review.counts.unlinkedEventClaims);
      if(bridgeInput!==null){
        const joined=projectKingsInvitationCalendarOffline({
          bridgeInput,invitationClaims:source.privateClaimsDoNotLog
        });
        if(joined.safeToActivate!==false||
          joined.eventBookingsCreated!==0||
          joined.invitationsAddedToCapacity!==0||
          joined.staffApprovalsCommitted!==0||
          joined.crossSystem.eventInvitationTrackerActuallyConnectedHere!==false)
          fail();
        oldSourceLinkedClaims=num(
          joined.crossSystem.sourceReview.trackerClaimedLinkedEvents);
        futureUnlinked=num(joined.futureInvitationClaimsOutsideHistoricalWindow);
        calendarDays=num(joined.crossSystem.calendar.days.length);
        calendarProjected=true;
      }
    }
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',mode:'SOURCE_EVIDENCE_REVIEW',
      readOnly:true,
      sourceMode:forum?'EXISTING_FORUM_MANUAL_REVIEW':
        'STRUCTURED_TEXT_CLAIMS_REVIEW',
      sourceRecordsExamined:forum?forumClaims:structuredClaims,
      claimedForumEntries:forumClaims,
      claimedStructuredInvitations:structuredClaims,
      unresolvedSourceReviewItems:backlog,
      unlinkedStructuredEventClaims:unlinked,
      sourceClaimedExactEventIdMatches:oldSourceLinkedClaims,
      futureInvitationClaimsPendingReview:futureUnlinked,
      independentConvoyCenterCalendarProjected:calendarProjected,
      projectedCalendarDays:calendarDays,
      history,
      originalDiscordDataReturnedOrLogged:false,
      directForumFreeTextConvertedIntoBookings:0,
      originalOrganizerRepliesIndependentlyAuthenticated:false,
      historicalStaffRoleAssignmentAuthenticated:false,
      independentAllChannelInventoryVerified:false,
      original24MonthSourceHistoryAuthenticated:false,
      realDiscordConnectionIndependentlyProvenByThisModule:false,
      sourcePreviewIsNotAnOriginalProviderAttestation:true,
      manualEventCoordinationReviewRequired:true,
      staffApprovalsCommitted:0,eventBookingsCreated:0,
      capacityReservationsChanged:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={inspectKingsEventInvitationSourceHandoff};
