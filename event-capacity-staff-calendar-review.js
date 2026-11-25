'use strict';
// DRAFT / PURE / PRIVATE ONLY: staff-facing 12-month review built on the
// existing Kings capacity calendar and signed historical HOLD reports.
// IMPORTANT: current snapshot and historical holds can describe the SAME
// events. They must NEVER be added into an authoritative occupancy total.
// Never advertise remaining/available slots from an incomplete source.
const {LIMITS}=require('./event-capacity-core');
const {POLICY,dailyLimitForUtcDate}=require('./event-capacity-policy');
// HISTORICAL FLAGS are frozen evidence under old 2/day and 20/month rules.
// They are NOT current Kings booking limits.
const LEGACY_SIGNED_HOLD_LIMITS=Object.freeze({
  combinedDaily:2,partnerMonthly:20,externalMonthly:20
});
const {projectMonth}=require('./event-capacity-dashboard');
const ERROR='Kings Event Capacity private staff calendar review invalid.';
const YEAR=/^20\d{2}$/;
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const DAY=/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const MAX=50000;
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||
    Object.getPrototypeOf(x)===null);}
function count(x){if(!Number.isSafeInteger(x)||x<0||x>MAX)fail();return x;}
function isoDay(x){
  if(typeof x!=='string'||!DAY.test(x))fail();
  const t=Date.parse(x+'T00:00:00.000Z');
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==x)fail();
  return x;
}
function checkSnapshot(c){
  if(!plain(c)||!plain(c.limits)||
    c.limits.policyId!==POLICY.policyId||
    c.limits.weekdayCombined!==POLICY.weekdayCombinedMax||
    c.limits.weekendCombined!==POLICY.weekendCombinedMax||
    c.limits.partnerDaily!==POLICY.partnerDailyMax||
    c.limits.externalDaily!==POLICY.externalDailyMax||
    c.limits.partnerMonthly!==null||
    c.limits.externalMonthly!==null||
    typeof c.globalUncertainty!=='boolean'||!plain(c.days)||
    !plain(c.months)||!Array.isArray(c.issues)||
    !Array.isArray(c.warnings)||
    !Array.isArray(c.uncertainDates)||!Array.isArray(c.uncertainMonths))fail();
  const byMonth=new Map();
  for(const [date,x] of Object.entries(c.days)){
    isoDay(date);
    if(!plain(x))fail();
    const partner=count(x.partner),external=count(x.external),
      kings=count(x.kings);
    if(count(x.combined)!==partner+external)fail();
    const month=date.slice(0,7);
    const totals=byMonth.get(month)??{partner:0,external:0,kings:0};
    totals.partner+=partner;totals.external+=external;totals.kings+=kings;
    byMonth.set(month,totals);
  }
  for(const [month,x] of Object.entries(c.months)){
    if(!MONTH.test(month)||!plain(x))fail();
    const totals=byMonth.get(month)??{partner:0,external:0,kings:0};
    if(count(x.partner)!==totals.partner||
      count(x.external)!==totals.external||
      count(x.kings)!==totals.kings)fail();
  }
  for(const [month,totals] of byMonth){
    if((totals.partner||totals.external||totals.kings)&&
      !Object.hasOwn(c.months,month))fail();
  }
}
function checkHolds(h){
  if(!plain(h)||!MONTH.test(h.month)||
    h.visibility!=='PRIVATE_ONLY'||h.readOnly!==true||
    h.signedHistoricalJournalVerified!==true||
    h.safeToActivate!==false||h.freeSlotsCertified!==false||
    h.original24MonthSourceInventoryComplete!==false||
    h.latestOwnerHighwaterIndependentlyVerified!==false||
    h.cancellationsNeverAutoRelease!==true||
    h.previousDatesNeverAutoReleaseAfterReschedule!==true||
    !plain(h.provisionalCounts)||!Array.isArray(h.days)||
    h.days.length>31)fail();
  if(!Number.isSafeInteger(h.signedHistoricalRevision)||
    h.signedHistoricalRevision<0||h.signedHistoricalRevision>24000)fail();
  const p=h.provisionalCounts;
  count(p.partnerUniqueHistoricalEventsInMonth);
  count(p.externalUniqueHistoricalEventsInMonth);
  count(p.activeProvisionalDateRows);
  count(p.totalProvisionalDailyHolds);
  count(p.daysExceedingDailyLimit);
  if(p.activeProvisionalDateRows!==h.days.length||
    typeof h.monthOverStandardPartnerLimit!=='boolean'||
    typeof h.monthOverStandardExternalLimit!=='boolean'||
    h.monthOverStandardPartnerLimit!==
      (p.partnerUniqueHistoricalEventsInMonth>LEGACY_SIGNED_HOLD_LIMITS.partnerMonthly)||
    h.monthOverStandardExternalLimit!==
      (p.externalUniqueHistoricalEventsInMonth>LEGACY_SIGNED_HOLD_LIMITS.externalMonthly))fail();
  const seen=new Set();let sum=0,exceeded=0;
  for(const d of h.days){
    if(!plain(d)||isoDay(d.utcDate).slice(0,7)!==h.month||
      seen.has(d.utcDate)||d.availableSlotsCertified!==false||
      d.unresolvedHistoricalReleaseReviewRequired!==true)fail();
    seen.add(d.utcDate);
    const a=count(d.partnerProvisionalHolds),b=count(d.externalProvisionalHolds);
    if(count(d.combinedProvisionalHolds)!==a+b||
      d.exceedsStandardDailyLimit!==(a+b>LEGACY_SIGNED_HOLD_LIMITS.combinedDaily))fail();
    sum+=a+b;if(a+b>LEGACY_SIGNED_HOLD_LIMITS.combinedDaily)exceeded++;
  }
  if(sum!==p.totalProvisionalDailyHolds||
    exceeded!==p.daysExceedingDailyLimit)fail();
  return h;
}
function checkEvidence(e){
  if(e===null)return null;
  if(!plain(e)||e.visibility!=='PRIVATE_ONLY'||e.readOnly!==true||
    e.reviewWindowMonths!==24||e.safeToActivate!==false||
    e.freeSlotsCertified!==false||
    e.originalSourceRecordsIndependentlyAuthenticated!==false||
    e.historicalCoverageCertified!==false||!Array.isArray(e.months)||
    e.months.length!==24||!MONTH.test(e.firstMonth)||
    !MONTH.test(e.finalMonth))fail();
  // The 24 supplied rows must cover the declared consecutive UTC months
  // exactly once. Merely supplying 24 arbitrary rows must never make a
  // missing month look like a reviewed month in the staff calendar.
  const start=new Date(e.firstMonth+'-01T00:00:00.000Z'),
    end=new Date(start.getTime());
  end.setUTCMonth(end.getUTCMonth()+23);
  if(end.toISOString().slice(0,7)!==e.finalMonth)fail();
  const table=new Map();
  for(let i=0;i<24;i++){
    const expected=new Date(start.getTime());
    expected.setUTCMonth(expected.getUTCMonth()+i);
    const row=e.months[i],month=expected.toISOString().slice(0,7);
    if(!plain(row)||!MONTH.test(row.month)||row.month!==month||
      row.monthlyHistoryComplete!==false||
      row.originalSourceInventoryAuthenticated!==false||
      row.freeSlotsCertified!==false)fail();
    count(row.gaps);table.set(month,row.gaps);
  }
  return table;
}
function projectKingsStaffCalendarReview({
  capacity,year,selectedMonth=null,
  historicalHoldsReports=[],historicalEvidenceReport=null
}={}){
  try{
    checkSnapshot(capacity);
    if(typeof year!=='string'||!YEAR.test(year)||
      (selectedMonth!==null&&
        (!MONTH.test(selectedMonth)||!selectedMonth.startsWith(year+'-')))||
      !Array.isArray(historicalHoldsReports)||
      historicalHoldsReports.length>12)fail();
    const holds=new Map();
    let referenceSignedRevision=null;
    for(const report of historicalHoldsReports){
      const h=checkHolds(report);
      if(!h.month.startsWith(year+'-')||holds.has(h.month))fail();
      if(referenceSignedRevision===null)
        referenceSignedRevision=h.signedHistoricalRevision;
      else if(h.signedHistoricalRevision!==referenceSignedRevision)fail();
      holds.set(h.month,h);
    }
    const evidence=checkEvidence(historicalEvidenceReport);
    const months=[],detailRows=[];
    let monthsWithoutSignedHoldReport=0,monthsOutsideEvidenceReview=0;
    for(let i=1;i<=12;i++){
      const month=year+'-'+String(i).padStart(2,'0'),
        projected=projectMonth(capacity,month),historical=holds.get(month);
      const rawMonth=capacity.months[month]||{};
      const sp=count(rawMonth.partner??0),se=count(rawMonth.external??0);
      const hp=historical?.provisionalCounts.partnerUniqueHistoricalEventsInMonth??null;
      const he=historical?.provisionalCounts.externalUniqueHistoricalEventsInMonth??null;
      const gaps=evidence?.get(month)??null;
      if(!historical)monthsWithoutSignedHoldReport++;
      if(gaps===null)monthsOutsideEvidenceReview++;
      // No replacement monthly quota was adopted. Preserve legacy source
      // counts for review, without claiming a current monthly threshold.
      // Possible old-date holds are not necessarily the same event as a
      // current snapshot booking. Treat differing counts as review hints,
      // never as a mathematically authoritative delta.
      const historicalAboveSnapshot=historical!==undefined&&
        ((hp??0)>sp||(he??0)>se);
      const historicalAboveLimit=historical?
        (historical.monthOverStandardPartnerLimit||
          historical.monthOverStandardExternalLimit):false;
      const monthStatus=historicalAboveLimit?
        'Legacy Monthly Hold Threshold — Historical Review':
        historical===undefined?'Historical Holds Missing — Review':
        gaps===null?'Original Evidence Coverage Missing — Review':
        gaps>0?'Original Evidence Gaps — Human Review':
        'No Gap In Supplied Evidence — Independent Review Required';
      months.push(Object.freeze({
        month,monthStatus,
        currentSnapshot:Object.freeze({partner:sp,external:se,
          kings:count(rawMonth.kings??0)}),
        signedHistoricalProvisional:Object.freeze({
          partner:hp,external:he,
          dailyHoldRows:historical?.provisionalCounts.activeProvisionalDateRows??null
        }),
        evidenceGapsReported:gaps,
        historicalHoldCountExceedsCurrentSnapshot:historicalAboveSnapshot,
        monthlyPartnerLimit:null,
        monthlyExternalLimit:null,
        snapshotAndHistoricalCountsMayOverlap:true,
        sourceCompletenessAuthenticated:false,
        remainingPartnerSlots:null,remainingExternalSlots:null,
        freeSlotsCertified:false
      }));
      if(selectedMonth!==month)continue;
      const byDay=new Map((historical?.days??[]).map(d=>[d.utcDate,d]));
      for(const d of projected.days){
        const h=byDay.get(d.date);
        const current=count(d.combinedUsed),historic=h?
          count(h.combinedProvisionalHolds):null;
        const status=d.quotaConflict?
          'Daily Quota Conflict — Human Review':
          h?.exceedsStandardDailyLimit===true?
          'Legacy Daily Hold Threshold — Historical Review':
          h!==undefined&&historic>0?'Historical Hold — Human Review':
          current>0?'Current Snapshot Claim — History Unverified':
          'No Verified Booking Evidence — Not Available For Approval';
        detailRows.push(Object.freeze({
          utcDate:d.date,status,
          snapshotPartner:count(d.partner),
          snapshotExternal:count(d.external),
          snapshotKings:count(d.kings),
          snapshotCombined:current,
          historicalPartnerProvisional:h?count(h.partnerProvisionalHolds):null,
          historicalExternalProvisional:h?count(h.externalProvisionalHolds):null,
          historicalCombinedProvisional:historic,
          historicalHoldsExceedCurrentSnapshot:h!==undefined&&historic>current,
          requiresIndependentSourceAndHumanReview:true,
          knownCurrentAndHistoricalCountsNotAdditive:true,
          remainingSlots:null,canApprove:false,freeSlotsCertified:false
        }));
      }
    }
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      year,selectedMonth,
      policy:Object.freeze({
        id:POLICY.policyId,
        weekdayCombined:POLICY.weekdayCombinedMax,
        weekendCombined:POLICY.weekendCombinedMax,
        partnerDaily:POLICY.partnerDailyMax,
        externalDaily:POLICY.externalDailyMax,
        partnerMonthly:null,externalMonthly:null,
        kingsConvoysQuotaExempt:true,
        actualBookingCapacityCertified:false
      }),
      sourceSnapshotReportedFresh:capacity.globalUncertainty===false,
      signedHoldReportsShareOneJournalRevision:
        referenceSignedRevision!==null?true:null,
      historicalHoldJournalRevision:referenceSignedRevision,
      sourceAuthenticityIndependentlyProven:false,
      complete24MonthHistoryCertified:false,
      signedHistoricalClaimsAreNotCompleteEventHistory:true,
      currentAndHistoricalCountsNeverAddedTogether:true,
      monthsWithoutSignedHoldReport,
      monthsOutside24MonthEvidenceReview:monthsOutsideEvidenceReview,
      months:Object.freeze(months),
      days:Object.freeze(detailRows),
      actualAvailableSlotsDisplayed:false,
      humanDecisionCommitted:false,
      productionWorkflowsModified:false,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsStaffCalendarEphemeral(view){
  try{
    if(!plain(view)||view.visibility!=='PRIVATE_ONLY'||
      view.readOnly!==true||view.safeToActivate!==false||
      view.freeSlotsCertified!==false||
      view.actualAvailableSlotsDisplayed!==false||
      !YEAR.test(view.year)||!Array.isArray(view.months)||
      view.months.length!==12||!Array.isArray(view.days)||
      (view.selectedMonth!==null&&
        (!MONTH.test(view.selectedMonth)||
          view.days.length<28||view.days.length>31)))fail();
    const years=view.months.map(m=>{
      if(!plain(m)||!MONTH.test(m.month)||!plain(m.currentSnapshot)||
        !plain(m.signedHistoricalProvisional)||
        m.freeSlotsCertified!==false||m.remainingPartnerSlots!==null||
        m.remainingExternalSlots!==null)fail();
      const p=count(m.currentSnapshot.partner),e=count(m.currentSnapshot.external);
      const hp=m.signedHistoricalProvisional.partner,
        he=m.signedHistoricalProvisional.external;
      if(hp!==null)count(hp);
      if(he!==null)count(he);
      return m.month+'  Current P'+p+' E'+e+' | Signed hold P'+
        (hp===null?'?':hp)+' E'+(he===null?'?':he)+
        (m.evidenceGapsReported===null?' | evidence ?':
          ' | evidence gaps '+count(m.evidenceGapsReported));
    }).join('\n');
    if(years.length>4096)fail();
    const embeds=[{
      title:'Kings Event Capacity | '+view.year+' UTC',
      description:years,
      color:0x182DFF,
      footer:{text:'PRIVATE / REVIEW ONLY · P=Partner · E=External · ?=missing evidence'}
    }];
    if(view.selectedMonth!==null){
      const rows=view.days.map(d=>{
        if(!plain(d)||isoDay(d.utcDate).slice(0,7)!==view.selectedMonth||
          d.remainingSlots!==null||d.canApprove!==false||
          d.freeSlotsCertified!==false)fail();
        const current=count(d.snapshotCombined),h=d.historicalCombinedProvisional;
        if(h!==null)count(h);
        const flag=d.status==='Daily Quota Conflict — Human Review'?'!':
          d.status==='Legacy Daily Hold Threshold — Historical Review'?'L':
          d.status==='Historical Hold — Human Review'?'H':
          d.status==='Current Snapshot Claim — History Unverified'?'C':'?';
        return d.utcDate.slice(-2)+' '+flag+
          ' Current '+current+'/'+dailyLimitForUtcDate(d.utcDate)+
          ' | Signed hold '+(h===null?'?':h);
      }).join('\n');
      if(rows.length>4096)fail();
      embeds.push({
        title:'Kings Event Capacity | '+view.selectedMonth+' UTC',
        description:rows,color:0x182DFF,
        footer:{text:'! quota review · H signed historical hold · C current snapshot · ? unknown'}
      });
    }
    return Object.freeze({
      type:4,data:{
        flags:64,allowed_mentions:{parse:[]},
        content:'**Kings Event Team Calendar — Review Only**\n'+
          'Current snapshot and historical holds are separate, potentially overlapping evidence.\n'+
          '**No available slots are certified. No automatic acceptance or release.**',
        embeds
      }
    });
  }catch{fail();}
}
module.exports={projectKingsStaffCalendarReview,renderKingsStaffCalendarEphemeral};
