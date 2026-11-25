'use strict';
// DRAFT/OFFLINE/PRIVATE: inspect the existing Kings one-time frozen legacy
// calendar JSON input, not Discord itself. An archived Kings parking SLOT is
// NOT a formal accepted invitation under Event Capacity rules.
const ERROR='Kings Event Capacity frozen legacy calendar evidence invalid.';
const EXPECTED=['October 2026','November 2026','December 2026',
  'January 2027','February 2027','March 2027'];
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function count(x){if(!Number.isSafeInteger(x)||x<0||x>10000)fail();return x;}
function inspectKingsFrozenLegacyCalendar(data){
  try{
    if(!plain(data)||data.version!==1||
      data.mode!=='one-time-frozen-legacy-import'||data.readOnly!==true||
      !Array.isArray(data.convoys)||data.convoys.length>10000||
      !Array.isArray(data.monthChannels)||data.monthChannels.length!==6||
      !plain(data.summary)||!plain(data.monthStats)||
      !Array.isArray(data.failures)||!Array.isArray(data.duplicateEventIds))fail();
    const counts=new Map(EXPECTED.map(x=>[x,0]));
    const knownIds=new Set(),knownEvents=new Set();
    let missingOriginal=0,preserved=0,slotEvidence=0,claimedScheduled=0;
    for(const item of data.convoys){
      if(!plain(item)||!counts.has(item.sourceMonth)||
        typeof item.legacyId!=='string'||item.legacyId.length<1||
        item.legacyId.length>128||knownIds.has(item.legacyId)||
        item.readOnly!==true||
        typeof item.sourceUnavailable!=='boolean'||
        typeof item.preservedFromPreviousImport!=='boolean'||
        typeof item.confirmedKingsSlot!=='boolean')fail();
      knownIds.add(item.legacyId);
      counts.set(item.sourceMonth,counts.get(item.sourceMonth)+1);
      if(item.sourceUnavailable)missingOriginal++;
      if(item.preservedFromPreviousImport)preserved++;
      if(item.confirmedKingsSlot)slotEvidence++;
      if(item.status==='Scheduled')claimedScheduled++;
      if(item.eventId!==null&&item.eventId!==undefined&&
        String(item.eventId).trim()){
        const key=String(item.eventId).trim();
        if(knownEvents.has(key))fail();
        knownEvents.add(key);
      }
    }
    const channelMonths=new Set();
    for(const ch of data.monthChannels){
      if(!plain(ch)||typeof ch.label!=='string'||
        !EXPECTED.includes(ch.label)||channelMonths.has(ch.label))fail();
      channelMonths.add(ch.label);
    }
    let total=0,retainedMonthRecords=0;
    const rows=EXPECTED.map(month=>{
      const r=data.monthStats[month],expected=counts.get(month);
      if(!plain(r)||count(r.imported)!==expected||
        count(r.threads)+count(r.preservedMissingSource)!==expected)fail();
      total+=expected;retainedMonthRecords+=r.preservedMissingSource;
      return Object.freeze({monthLabel:month,importedRecords:expected,
        originalDiscordMessagesDirectlyAuthenticated:false,
        formalEventCapacityAcceptancesCertified:0});
    });
    if(total!==data.convoys.length||
      count(data.summary.importedFutureLegacyConvoys)!==total||
      count(data.summary.confirmedSlot)!==slotEvidence||
      count(data.summary.preservedMissingSource)!==missingOriginal||
      retainedMonthRecords!==missingOriginal||
      count(data.summary.importFailures)!==data.failures.length||
      count(data.summary.duplicateEventIdsWithinLegacy)!==
        data.duplicateEventIds.length)fail();
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      frozenExistingLegacyImportInspected:true,
      existingSourceMonthChannels:6,
      existingFrozenLegacyEntries:total,
      existingKingsSlotEvidenceClaims:slotEvidence,
      preservedWithOriginalSourceMissing:missingOriginal,
      retainedFromEarlierImport:preserved,
      claimedScheduledLegacyEntries:claimedScheduled,
      rows,
      archivedOriginalDiscordChannelCoverageVerified:false,
      originalEditsAndDeletedThreadsFullyRecovered:false,
      separateCurrentConvoyCenterSourceReconciled:false,
      sourceMessagesFetchedFromDiscordInThisReview:0,
      slotsConvertedIntoAcceptedEventCapacityBookings:0,
      totalFormallyConfirmedCapacityAcceptanceFromThisFile:0,
      historicalImportedFileIsNotFull24MonthHistory:true,
      privateSourceDataWrittenToPublicRepository:false,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={inspectKingsFrozenLegacyCalendar};
