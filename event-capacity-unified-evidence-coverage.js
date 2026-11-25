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
    const pageChannels=new Map(paginationInput.channels.map(c=>[c.channelId,c]));
    const incompatibleCoverage=src.channelInventory.filter(c=>{
      const p=pageChannels.get(c.channelId);
      return p&&(c.firstCoveredMonth!==p.firstCoveredMonth||
        c.lastCoveredMonth!==p.lastCoveredMonth||
        (c.kind==='current')!==(p.channelKind==='current-forum'));
    }).length;
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
      conflictingDeclaredChannelCoverage:incompatibleCoverage,
      historyMonthsWithoutSourceClaims:count(
        history.counters.monthsWithoutChannelClaims,24),
      historyMonthsWithIncompleteScanClaims:count(
        history.counters.monthsWithIncompleteScanClaims,24),
      historyMonthsWithoutStaffChecklists:count(
        history.counters.monthsWithoutHumanChecklist,24),
      historyMonthsWithOpenStaffChecklists:count(
        history.counters.monthsWithOpenHumanChecklist,24),
      historyMonthsWithClaimedCompleteChecksButMissingSource:count(
        history.counters.monthsWithClaimedAllChecksButMissingSource,24)
    });
    const sourceInventoryClaimsAgree=missingFromPage===0&&missingFromIntake===0&&
      incompatibleCoverage===0;
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
        history.counters.monthsWithoutHumanChecklist>0?
            'HISTORICAL STAFF CHECKLISTS MISSING — HUMAN REVIEW':
        history.counters.monthsWithOpenHumanChecklist>0?
            'HISTORICAL STAFF CHECKLISTS INCOMPLETE — HUMAN REVIEW':
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
      view.original24MonthDiscordHistoryIndependentlyVerified!==false||
      view.eventBookingCapacityCertified!==false||
      view.claimChecksAreNotActualProviderAuthentication!==true||
      !view.counters)fail();
    const c=view.counters;
    for(const key of ['centerClaimedEvents','legacyClaimedEvents',
      'outboundInvitationClaims','historyMonthsWithoutSourceClaims',
      'historyMonthsWithIncompleteScanClaims',
      'historyMonthsWithoutStaffChecklists','historyMonthsWithOpenStaffChecklists'])
      count(c[key]);
    const start=view.firstHistoryMonth,finish=view.lastHistoryMonth;
    if(typeof start!=='string'||typeof finish!=='string'||
      !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(start)||
      !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(finish))fail();
    const startTime=Date.parse(start+'-01T00:00:00.000Z'),
      finalTime=new Date(startTime);
    finalTime.setUTCMonth(finalTime.getUTCMonth()+23);
    if(finalTime.toISOString().slice(0,7)!==finish)fail();
    let missingSources=0,incomplete=0,missingStaff=0,detail='';
    for(const [i,row] of view.historyMonths.entries()){
      const expected=new Date(startTime);
      expected.setUTCMonth(expected.getUTCMonth()+i);
      if(!row||row.month!==expected.toISOString().slice(0,7)||
        row.monthHistoricalCoverageCertified!==false||
        row.originalDiscordMessagesAuthenticated!==false||
        row.usableFreeSlots!==null||
        typeof row.humanChecklistSubmitted!=='boolean'||
        (row.humanOpenReviewItems!==null&&
          (!Number.isSafeInteger(row.humanOpenReviewItems)||
          row.humanOpenReviewItems<0||row.humanOpenReviewItems>10000)))fail();
      const n=count(row.channelSourcesClaimed);
      const gaps=count(row.sourceStreamsMissingOrIncomplete);
      if(n===0)missingSources++;
      if(gaps>0)incomplete++;
      if(!row.humanChecklistSubmitted)missingStaff++;
      const expectedState=n===0?'NO CLAIMED DISCORD SOURCE':
        gaps>0?'CLAIMED DISCORD SCAN INCOMPLETE':
        !row.humanChecklistSubmitted?'HUMAN SOURCE CHECKLIST NOT SUBMITTED':null;
      if(expectedState!==null&&row.reviewState!==expectedState)fail();
      if(!row.humanChecklistSubmitted&&row.humanOpenReviewItems!==null)fail();
      detail+=row.month+' | claimed sources '+n+
        ' | unverified streams '+gaps+
        ' | checklist '+(row.humanChecklistSubmitted?'claimed':'missing')+'\n';
    }
    if(missingSources!==c.historyMonthsWithoutSourceClaims||
      incomplete!==c.historyMonthsWithIncompleteScanClaims||
      missingStaff!==c.historyMonthsWithoutStaffChecklists||
      c.historyMonthsWithOpenStaffChecklists>24)fail();
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
            c.historyMonthsWithIncompleteScanClaims+
          ' | Staff checklists missing '+c.historyMonthsWithoutStaffChecklists+'\n'+
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
