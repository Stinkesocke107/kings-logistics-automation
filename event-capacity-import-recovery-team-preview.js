'use strict';
// PRIVATE OFFLINE Event Team dashboard: read-only simulated import recovery
// status paired with the same, strictly quarantined candidate source as the
// existing 24-month Event Team import preview. No Discord command registered.
const {runKingsAtomicImportRehearsal}
  =require('./event-capacity-atomic-import-rehearsal');
const {projectKingsImportStaffPreview}
  =require('./event-capacity-staged-import-team-preview');
const ERROR='Kings Event Team recovery preview invalid.';
function fail(){throw new Error(ERROR);}
function number(v){if(!Number.isSafeInteger(v)||v<0||v>25000)fail();return v;}
function projectKingsImportRecoveryTeamPreview({
  handoffInput,calendarInput,checkpoint=null,fault=null
}={}){
  try{
    if(!handoffInput||!calendarInput||
      calendarInput.eventTeamInput?.sourceIntake!==handoffInput.current||
      calendarInput.paginationInput!==handoffInput.currentPagination)fail();
    const recovery=runKingsAtomicImportRehearsal({
      sourceInput:handoffInput,checkpoint,fault
    });
    const staff=projectKingsImportStaffPreview({handoffInput,calendarInput});
    if(staff.replaySeal!==recovery.replaySeal||
      staff.safeToActivate!==false||
      staff.freeSlotsCertified!==false||
      recovery.safeToActivate!==false||
      recovery.freeSlotsCertified!==false||
      recovery.externalCallsOrWritesPerformed!==0||
      staff.realEventRecordsImported!==0||
      recovery.quarantineRecords!==staff.counts.proposedUntrustedRecords)
      fail();
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      state:recovery.state,
      offlinePhase:recovery.checkpoint?.phase??'NOT_CHECKPOINTED',
      offlinePhaseIndex:recovery.checkpoint?.phaseIndex??-1,
      offlineDrillCompleted:recovery.offlineReviewDrillCompleted,
      quarantineRecords:number(staff.counts.proposedUntrustedRecords),
      eventClaims:number(staff.counts.claimedEventIdentities),
      trackerInvitationClaims:number(staff.counts.outgoingInvitationIdentities),
      changedNeedsHumanReview:number(staff.counts.changedNeedsHumanReview),
      notObservedNeedsHumanReview:number(
        staff.counts.noLongerObservedNeedsReview),
      urgentReviewItems:number(staff.counts.urgentReviewItems),
      replaySeal:recovery.replaySeal,
      // Only return a LOCAL HMAC proof. Not a durable checkpoint and not an
      // authorized write token. The original source and key remain external.
      privateOfflineCheckpoint:recovery.checkpoint,
      allEventSourcesRemainQuarantined:true,
      noLiveSourceProvenanceAttested:true,
      actualBackupRestoreCompleted:false,
      signedOwnerHighwaterIndependentlyVerified:false,
      runtimeStaffPermissionsVerified:false,
      actualEventImportsOrDeletions:0,
      previousCalendarReservationsReleased:0,
      automaticEventDecisionsMade:0,
      externalWritesOrDiscordMessagesSent:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsImportRecoveryTeamPreview(view){
  try{
    if(!view||view.visibility!=='PRIVATE_ONLY'||view.readOnly!==true||
      view.freeSlotsCertified!==false||view.safeToActivate!==false||
      view.actualEventImportsOrDeletions!==0||
      view.previousCalendarReservationsReleased!==0||
      view.automaticEventDecisionsMade!==0||
      view.externalWritesOrDiscordMessagesSent!==0||
      view.runtimeStaffPermissionsVerified!==false||
      view.actualBackupRestoreCompleted!==false||
      !['SOURCE_SNAPSHOT_LOCKED','QUARANTINE_MANIFEST_REVIEWED',
        'RECOVERY_CONSISTENCY_INSPECTED','OFFLINE_DRILL_COMPLETE',
        'NOT_CHECKPOINTED'].includes(view.offlinePhase)||
      typeof view.state!=='string'||
      !/^(?:OFFLINE_|ALREADY_FINISHED_OFFLINE_ONLY|INTERRUPTED_)/.test(view.state))
      fail();
    const fields=['quarantineRecords','eventClaims','trackerInvitationClaims',
      'changedNeedsHumanReview','notObservedNeedsHumanReview',
      'urgentReviewItems'];
    for(const field of fields)number(view[field]);
    // Never echo checkpoint/seal/cursors/source identities to the UI.
    const msg='**Kings Event Team — Import Recovery Drill (OFFLINE)**\n'+
      'Phase: '+view.offlinePhase+'\n'+
      'Event claims: '+view.eventClaims+
      ' | Invitations: '+view.trackerInvitationClaims+
      ' | All quarantined: '+view.quarantineRecords+'\n'+
      'Changed review: '+view.changedNeedsHumanReview+
      ' | Not observed: '+view.notObservedNeedsHumanReview+
      ' | Urgent reviews: '+view.urgentReviewItems+'\n'+
      '**No live import. No old bookings released. No free slots certified.**';
    if(msg.length>2000)fail();
    return Object.freeze({type:4,data:{
      flags:64,allowed_mentions:{parse:[]},content:msg,embeds:[]
    }});
  }catch{fail();}
}
module.exports={projectKingsImportRecoveryTeamPreview,
  renderKingsImportRecoveryTeamPreview};
