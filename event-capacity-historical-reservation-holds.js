'use strict';
// DRAFT/OFFLINE: conservative historical reservation holds from a VERIFIED
// owner-signed lifecycle journal. Every accepted/approved rescheduled date
// remains a provisional hold until separate authorized human reconciliation.
// A cancel or complete action NEVER automatically releases a previous date.
// Do not confuse this report with current occupancy or free-slot certification.
const {verifyHistoricalJournal}
  =require('./event-capacity-historical-lifecycle-journal');
const {LIMITS}=require('./event-capacity-core');
const ERROR='Kings Event Capacity signed historical reservation review invalid.';
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
function fail(){throw new Error(ERROR);}
function reviewSignedHistoricalReservationHolds({
  journal,scope,ownerPublicKey,month,nowMs=Date.now()
}={}){
  try{
    if(typeof month!=='string'||!MONTH.test(month)||
      !Number.isSafeInteger(nowMs)||nowMs<0||
      nowMs>8640000000000000)fail();
    const proof=verifyHistoricalJournal(journal,{scope,ownerPublicKey});
    if(proof.verified!==true||proof.historicalCoverageCertified!==false)fail();
    const dates=new Map(),byMonth={partner:new Set(),external:new Set()};
    const allAccepted=new Set();
    for(const {payload} of journal.history){
      if(!['accept','reschedule'].includes(payload.action))continue;
      // Historical signed transitions are the only basis for this report.
      // Kings-organized convoys remain exempt from external/partner quotas.
      const category=payload.category==='Partner Convoy'?'partner':
        payload.category==='External Convoy'?'external':null;
      if(!category)continue;
      allAccepted.add(payload.ref);
      const date=payload.departureAtUtc.slice(0,10);
      if(date.slice(0,7)!==month)continue;
      const reservation=dates.get(date)??{partner:new Set(),external:new Set()};
      reservation[category].add(payload.ref);
      dates.set(date,reservation);
      byMonth[category].add(payload.ref);
    }
    const days=[...dates].sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([day,values])=>{
        const partner=values.partner.size,external=values.external.size;
        const combined=partner+external;
        return Object.freeze({
          utcDate:day,partnerProvisionalHolds:partner,
          externalProvisionalHolds:external,
          combinedProvisionalHolds:combined,
          exceedsStandardDailyLimit:combined>LIMITS.combinedDaily,
          unresolvedHistoricalReleaseReviewRequired:true,
          availableSlotsCertified:false
        });
      });
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,
      auditType:'Owner-Signed Historical Provisional Reservation Holds',
      month,signedHistoricalJournalVerified:true,
      signedHistoricalRevision:journal.revision,
      provisionalCounts:Object.freeze({
        partnerUniqueHistoricalEventsInMonth:byMonth.partner.size,
        externalUniqueHistoricalEventsInMonth:byMonth.external.size,
        activeProvisionalDateRows:days.length,
        totalProvisionalDailyHolds:days.reduce((n,d)=>n+d.combinedProvisionalHolds,0),
        daysExceedingDailyLimit:days.filter(d=>d.exceedsStandardDailyLimit).length
      }),
      monthOverStandardPartnerLimit:byMonth.partner.size>LIMITS.partnerMonthly,
      monthOverStandardExternalLimit:byMonth.external.size>LIMITS.externalMonthly,
      days,
      cancellationsNeverAutoRelease:true,
      completionsNeverProveAttendance:true,
      previousDatesNeverAutoReleaseAfterReschedule:true,
      occupancyMayIncludeReviewedHistoricalHolds:true,
      // Even a fully signed journal does not establish original-source
      // completeness, latest independently kept owner highwater, effective
      // Staff permissions or availability of any new slot.
      original24MonthSourceInventoryComplete:false,
      latestOwnerHighwaterIndependentlyVerified:false,
      sourceEvidenceAuthenticatedBeyondSignedJournal:false,
      staffAllocationReleasePermissionsVerified:false,
      historicalReconciliationAuthorizesNoAutomaticActions:true,
      staffDecisionsCommitted:false,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={reviewSignedHistoricalReservationHolds};
