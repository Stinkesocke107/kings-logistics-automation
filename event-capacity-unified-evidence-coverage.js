'use strict';
// DRAFT PRIVATE REPORT COMPOSITION. The caller's Discord metadata, monthly
// checkboxes, and outgoing invitations are untrusted. We can test internal
// consistency, not authenticate all Discord channels or source messages.
const {projectKingsUnifiedEventTeamReview}
  =require('./event-capacity-unified-team-review');
const {auditKingsHistoricalDiscoveryWorkboard}
  =require('./event-capacity-historical-discovery-workboard');
const ERROR='Kings Event Capacity unified evidence coverage refused.';
function fail(){throw new Error(ERROR);}
function count(x,max=10000){
  if(!Number.isSafeInteger(x)||x<0||x>max)fail();
  return x;
}
function projectKingsUnifiedEvidenceCoverage({
  eventTeamInput,paginationInput,monthlyClaims=[]
}={}){
  try{
    if(!eventTeamInput||typeof eventTeamInput!=='object'||
      !eventTeamInput.sourceIntake||
      !paginationInput||typeof paginationInput!=='object')fail();
    const src=eventTeamInput.sourceIntake;
    if(src.guildId!==paginationInput.guildId||
      src.firstMonth!==paginationInput.firstMonth||
      src.finalMonth!==paginationInput.finalMonth||
      src.nowMs!==paginationInput.nowMs)fail();
    const team=projectKingsUnifiedEventTeamReview(eventTeamInput);
    const history=auditKingsHistoricalDiscoveryWorkboard({
      paginationInput,monthlyClaims
    });
    if(team.safeToActivate!==false||team.freeSlotsCertified!==false||
      history.safeToActivate!==false||history.freeSlotsCertified!==false||
      history.months.length!==24)fail();
    const inventoryIds=new Set(src.channelInventory.map(c=>c.channelId));
    const paginationIds=new Set(paginationInput.channels.map(c=>c.channelId));
    if(!inventoryIds.has(src.currentChannelId)||
      !paginationIds.has(src.currentChannelId))fail();
    const missingFromPage=[...inventoryIds].filter(x=>!paginationIds.has(x)).length;
    const missingFromIntake=[...paginationIds].filter(x=>!inventoryIds.has(x)).length;
    const counters=Object.freeze({
      centerClaimedEvents:count(team.sourceCounts.currentCenterClaims),
      legacyClaimedEvents:count(team.sourceCounts.olderChannelClaims),
      frozenLegacyRecords:team.sourceCounts.frozenLegacyClaims,
      outboundInvitationClaims:count(team.sourceCounts.outboundInvitations),
      outgoingInvitationsWithoutEventLink:count(team.sourceCounts.missingLinks),
      outgoingOldOrWrongDates:count(team.sourceCounts.staleOrWrongDeparture),
      archivedCountDiscrepancies:count(team.sourceCounts.archiveCountContradictions),
      deletedCountDiscrepancies:count(team.sourceCounts.deletionCountContradictions),
      missingPaginationInventoriesForCenterSources:missingFromPage,
      paginationChannelsNotInCenterInventory:missingFromIntake,
      historyMonthsWithoutSourceClaims:count(
        history.counters.monthsWithoutChannelClaims,24),
      historyMonthsWithIncompleteScanClaims:count(
        history.counters.monthsWithIncompleteScanClaims,24),
      historyMonthsWithoutStaffChecklists:count(
        history.counters.monthsWithoutHumanChecklist,24),
      historyMonthsWithClaimedCompleteChecksButMissingSource:count(
        history.counters.monthsWithClaimedAllChecksButMissingSource,24)
    });
    const sourceInventoryClaimsAgree=missingFromPage===0&&missingFromIntake===0;
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,version:1,
      eventTeamYear:team.year,firstHistoryMonth:history.firstMonth,
      lastHistoryMonth:history.finalMonth,
      historyMonths:history.months,
      historyPageReceiptChecks:history.sourceReceiptChecks,
      counters,
      status:!sourceInventoryClaimsAgree?
        'SOURCE INVENTORIES DISAGREE — HUMAN REVIEW':
        history.counters.monthsWithoutChannelClaims>0?
          'MONTHS WITH UNKNOWN ORIGINAL SOURCE — HUMAN REVIEW':
          history.counters.monthsWithIncompleteScanClaims>0?
            'ARCHIVE PAGINATION INCOMPLETE — HUMAN REVIEW':
            'SOURCE CLAIMS INTERNALLY CONSISTENT — DISCORD NOT AUTHENTICATED',
      sourceInventoryClaimsAgree,
      allSourceClaimsRemainUntrusted:true,
      claimChecksAreNotActualProviderAuthentication:true,
      frozenLegacyImportIsSeparateFrom24MonthOriginals:true,
      currentAndHistoricalEventCountsNotAdditive:true,
      eventBookingCapacityCertified:false,
      original24MonthDiscordHistoryIndependentlyVerified:false,
      humanApprovalCommitted:0,
      actualDiscordReadsOrWritesHere:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsUnifiedEvidenceCoveragePreview(view){
  try{
    if(!view||view.visibility!=='PRIVATE_ONLY'||view.readOnly!==true||
      view.safeToActivate!==false||view.freeSlotsCertified!==false||
      view.actualDiscordReadsOrWritesHere!==0||
      view.humanApprovalCommitted!==0||
      !Array.isArray(view.historyMonths)||view.historyMonths.length!==24||
      !view.counters)fail();
    const c=view.counters;
    for(const key of ['centerClaimedEvents','legacyClaimedEvents',
      'outboundInvitationClaims','historyMonthsWithoutSourceClaims',
      'historyMonthsWithIncompleteScanClaims'])
      count(c[key]);
    let detail='';
    for(const row of view.historyMonths){
      if(!row||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(row.month)||
        row.monthHistoricalCoverageCertified!==false||
        row.originalDiscordMessagesAuthenticated!==false||
        row.usableFreeSlots!==null)fail();
      const n=count(row.channelSourcesClaimed);
      const gaps=count(row.sourceStreamsMissingOrIncomplete);
      detail+=row.month+' | claimed sources '+n+
        ' | unverified streams '+gaps+
        ' | checklist '+(row.humanChecklistSubmitted?'claimed':'missing')+'\n';
    }
    if(detail.length>4096)fail();
    return Object.freeze({
      type:4,data:{
        flags:64,allowed_mentions:{parse:[]},
        content:'**Kings Event Team — Historical Source Review (OFFLINE)**\n'+
          'Center claims '+c.centerClaimedEvents+
          ' | Legacy claims '+c.legacyClaimedEvents+
          ' | Outbound invitations '+c.outboundInvitationClaims+'\n'+
          'Unknown months '+c.historyMonthsWithoutSourceClaims+
          ' | Incomplete scanned months '+
            c.historyMonthsWithIncompleteScanClaims+'\n'+
          '**Never use this preview to approve or release slots. No Discord data read.**',
        embeds:[{
          title:'Kings | 24 UTC months of historical source claims',
          description:detail,color:0x182DFF,
          footer:{text:'PRIVATE · source claim only · original Discord history unverified'}
        }]
      }
    });
  }catch{fail();}
}
module.exports={projectKingsUnifiedEvidenceCoverage,
  renderKingsUnifiedEvidenceCoveragePreview};
