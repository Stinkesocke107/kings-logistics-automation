'use strict';
// DRAFT/OFFLINE: conservative historical reservation holds from a VERIFIED
// owner-signed lifecycle journal. Every accepted/approved rescheduled date
// remains a provisional hold until separate authorized human reconciliation.
// A cancel or complete action NEVER automatically releases a previous date.
// Do not confuse this report with current occupancy or free-slot certification.
const {verifyHistoricalJournal}
  =require('./event-capacity-historical-lifecycle-journal');
// Historical field names are retained for signature compatibility. These
// flags describe the OLD 2/day, 20/month audit, NOT a 2026-11 booking policy.
const LEGACY_SIGNED_HOLD_LIMITS=Object.freeze({
  combinedDaily:2,partnerMonthly:20,externalMonthly:20
});
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
    for(const {payload} of journal.history){
      if(Date.parse(payload.reviewedAt)>nowMs+60000)fail();
      if(!['accept','reschedule'].includes(payload.action))continue;
      // Historical signed transitions are the only basis for this report.
      // Kings-organized convoys remain exempt from external/partner quotas.
      const category=payload.category==='Partner Convoy'?'partner':
        payload.category==='External Convoy'?'external':null;
      if(!category)continue;
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
          exceedsStandardDailyLimit:combined>LEGACY_SIGNED_HOLD_LIMITS.combinedDaily,
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
      monthOverStandardPartnerLimit:byMonth.partner.size>LEGACY_SIGNED_HOLD_LIMITS.partnerMonthly,
      monthOverStandardExternalLimit:byMonth.external.size>LEGACY_SIGNED_HOLD_LIMITS.externalMonthly,
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
