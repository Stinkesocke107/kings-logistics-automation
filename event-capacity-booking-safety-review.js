'use strict';
// DRAFT, PRIVATE, PURE, READ-ONLY. Booking and Slot Management evidence
// preflight from an already projected staff calendar. Caller-supplied
// snapshots are NOT proof of original Discord completeness, Staff approval,
// parking/slot availability or a real reservation. Never write or approve.
const {LIMITS}=require('./event-capacity-core');
const ERROR='Kings Event Booking safety review refused.';
const CATEGORIES=Object.freeze(['Kings Convoy','Partner Convoy','External Convoy']);
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||
    Object.getPrototypeOf(x)===null);}
function count(x){if(!Number.isSafeInteger(x)||x<0||x>50000)fail();return x;}
function time(x){
  if(typeof x!=='string'||
    !/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/.test(x))fail();
  const t=Date.parse(x);
  if(!Number.isFinite(t)||new Date(t).toISOString()!==x)fail();
  return t;
}
function verifiedProjection(calendar,date){
  const month=date.slice(0,7),year=date.slice(0,4);
  if(!plain(calendar)||calendar.visibility!=='PRIVATE_ONLY'||
    calendar.readOnly!==true||calendar.safeToActivate!==false||
    calendar.freeSlotsCertified!==false||
    calendar.actualAvailableSlotsDisplayed!==false||
    calendar.sourceAuthenticityIndependentlyProven!==false||
    calendar.complete24MonthHistoryCertified!==false||
    calendar.year!==year||calendar.selectedMonth!==month||
    !plain(calendar.policy)||
    calendar.policy.combinedDaily!==LIMITS.combinedDaily||
    calendar.policy.partnerMonthly!==LIMITS.partnerMonthly||
    calendar.policy.externalMonthly!==LIMITS.externalMonthly||
    calendar.policy.kingsConvoysQuotaExempt!==true||
    !Array.isArray(calendar.months)||calendar.months.length!==12||
    !Array.isArray(calendar.days))fail();
  for(let i=0;i<12;i++){
    const m=calendar.months[i],
      expected=year+'-'+String(i+1).padStart(2,'0');
    if(!plain(m)||m.month!==expected||!plain(m.currentSnapshot)||
      !plain(m.signedHistoricalProvisional)||
      m.remainingPartnerSlots!==null||m.remainingExternalSlots!==null||
      m.freeSlotsCertified!==false)fail();
    count(m.currentSnapshot.partner);count(m.currentSnapshot.external);
    count(m.currentSnapshot.kings);
  }
  const selected=calendar.months[Number(month.slice(5))-1],
    end=new Date(Date.UTC(Number(year),Number(month.slice(5)),0)).getUTCDate();
  if(calendar.days.length!==end)fail();
  let partner=0,external=0,kings=0;
  for(let i=0;i<end;i++){
    const d=calendar.days[i],expected=month+'-'+
      String(i+1).padStart(2,'0');
    if(!plain(d)||d.utcDate!==expected||
      d.remainingSlots!==null||d.canApprove!==false||
      d.freeSlotsCertified!==false||
      d.knownCurrentAndHistoricalCountsNotAdditive!==true)fail();
    const p=count(d.snapshotPartner),e=count(d.snapshotExternal),
      k=count(d.snapshotKings);
    if(count(d.snapshotCombined)!==p+e)fail();
    const h=d.historicalCombinedProvisional;
    if(h!==null&&count(h)!==count(d.historicalPartnerProvisional)+
      count(d.historicalExternalProvisional))fail();
    partner+=p;external+=e;kings+=k;
  }
  if(partner!==selected.currentSnapshot.partner||
    external!==selected.currentSnapshot.external||
    kings!==selected.currentSnapshot.kings)fail();
  return {day:calendar.days[Number(date.slice(8))-1],month:selected};
}
function projectKingsEventBookingSafetyReview({calendar,request}={}){
  try{
    if(!plain(request)||
      Object.keys(request).sort().join(',')!==
      ['category','departureAtUtc','meetingAtUtc','plannedEndAtUtc'].sort().join(',')||
      !CATEGORIES.includes(request.category))fail();
    const departure=time(request.departureAtUtc);
    const meeting=request.meetingAtUtc===null?null:time(request.meetingAtUtc);
    const end=request.plannedEndAtUtc===null?null:time(request.plannedEndAtUtc);
    if(meeting!==null&&meeting>=departure||
      end!==null&&end<=departure)fail();
    const date=request.departureAtUtc.slice(0,10),
      month=date.slice(0,7),projection=verifiedProjection(calendar,date),
      d=projection.day,m=projection.month,
      quotaExempt=request.category==='Kings Convoy',
      categoryMonth=request.category==='Partner Convoy'?'partner':'external',
      monthlyLimit=request.category==='Partner Convoy'?
        LIMITS.partnerMonthly:LIMITS.externalMonthly;
    const dailyLimitObserved=!quotaExempt&&
      d.snapshotCombined>=LIMITS.combinedDaily;
    const monthlyLimitObserved=!quotaExempt&&
      m.currentSnapshot[categoryMonth]>=monthlyLimit;
    const historicalDailyHoldAtLimit=!quotaExempt&&
      d.historicalCombinedProvisional!==null&&
      d.historicalCombinedProvisional>=LIMITS.combinedDaily;
    const historicalMonthlyHoldAtLimit=!quotaExempt&&
      (m.signedHistoricalProvisional[categoryMonth]??-1)>=monthlyLimit;
    const reasons=['ORIGINAL_SOURCE_AND_STAFF_REVIEW_REQUIRED',
      'EVENT_IDENTITY_NOT_VERIFIED','PARKING_SLOT_NOT_VERIFIED',
      'DEPARTURE_SPACING_AND_FULL_OVERLAP_NOT_CHECKED'];
    if(meeting===null)reasons.push('MEETING_TIME_MISSING');
    if(end===null)reasons.push('PLANNED_END_MISSING');
    if(dailyLimitObserved)reasons.push('OBSERVED_DAILY_LIMIT_REACHED');
    if(monthlyLimitObserved)reasons.push('OBSERVED_MONTHLY_LIMIT_REACHED');
    if(historicalDailyHoldAtLimit)
      reasons.push('PROVISIONAL_HISTORICAL_DAILY_HOLD_AT_LIMIT');
    if(historicalMonthlyHoldAtLimit)
      reasons.push('PROVISIONAL_HISTORICAL_MONTHLY_HOLD_AT_LIMIT');
    if(d.historicalCombinedProvisional===null)
      reasons.push('DAILY_HISTORICAL_HOLDS_MISSING');
    if(m.evidenceGapsReported===null)
      reasons.push('MONTHLY_ORIGINAL_EVIDENCE_NOT_SUPPLIED');
    else if(count(m.evidenceGapsReported)>0)
      reasons.push('MONTHLY_ORIGINAL_EVIDENCE_GAPS');
    return Object.freeze({
      visibility:'PRIVATE_ONLY',readOnly:true,reviewStatus:'STAFF_REVIEW_REQUIRED',
      utcDate:date,utcMonth:month,category:request.category,
      observedSnapshot:Object.freeze({
        dailyPartner:count(d.snapshotPartner),
        dailyExternal:count(d.snapshotExternal),
        monthlyPartner:count(m.currentSnapshot.partner),
        monthlyExternal:count(m.currentSnapshot.external)
      }),
      quotaExempt,observedDailyLimitReached:dailyLimitObserved,
      observedMonthlyLimitReached:monthlyLimitObserved,
      provisionalHistoricalDailyHoldAtLimit:historicalDailyHoldAtLimit,
      provisionalHistoricalMonthlyHoldAtLimit:historicalMonthlyHoldAtLimit,
      meetingProvided:meeting!==null,plannedEndProvided:end!==null,
      reviewReasons:Object.freeze(reasons),
      originalDiscordHistoryAuthenticated:false,
      officialEventIdentityVerified:false,
      departureSpacingVerified:false,fullEventOverlapVerified:false,
      parkingSlotEvidenceVerified:false,staffApprovalVerified:false,
      outboundInvitationAcceptanceNotKingsApproval:true,
      bookingWritten:false,slotReserved:false,discordMessagesSent:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsEventBookingSafetyPreview(r){
  try{
    if(!plain(r)||r.visibility!=='PRIVATE_ONLY'||r.readOnly!==true||
      r.reviewStatus!=='STAFF_REVIEW_REQUIRED'||
      r.safeToActivate!==false||r.freeSlotsCertified!==false||
      r.bookingWritten!==false||r.slotReserved!==false||
      r.discordMessagesSent!==0||
      r.officialEventIdentityVerified!==false||
      r.parkingSlotEvidenceVerified!==false||
      r.staffApprovalVerified!==false||
      !CATEGORIES.includes(r.category)||
      typeof r.utcDate!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(r.utcDate)||
      r.utcMonth!==r.utcDate.slice(0,7)||!plain(r.observedSnapshot)||
      !Array.isArray(r.reviewReasons)||
      r.reviewReasons.length<4||r.reviewReasons.length>20)fail();
    const s=r.observedSnapshot;
    for(const k of ['dailyPartner','dailyExternal','monthlyPartner','monthlyExternal'])
      count(s[k]);
    // A private preview is still untrusted input: never display a forged
    // "no quota warning" claim inconsistent with its own snapshot counts.
    const isKings=r.category==='Kings Convoy',
      expectedDaily=!isKings&&s.dailyPartner+s.dailyExternal>=LIMITS.combinedDaily,
      expectedMonthly=!isKings&&(
        r.category==='Partner Convoy'?s.monthlyPartner:s.monthlyExternal
      )>=(r.category==='Partner Convoy'?
        LIMITS.partnerMonthly:LIMITS.externalMonthly);
    if(r.quotaExempt!==isKings||
      r.observedDailyLimitReached!==expectedDaily||
      r.observedMonthlyLimitReached!==expectedMonthly)fail();
    const allowed=new Set([
      'ORIGINAL_SOURCE_AND_STAFF_REVIEW_REQUIRED',
      'EVENT_IDENTITY_NOT_VERIFIED','PARKING_SLOT_NOT_VERIFIED',
      'DEPARTURE_SPACING_AND_FULL_OVERLAP_NOT_CHECKED',
      'MEETING_TIME_MISSING','PLANNED_END_MISSING',
      'OBSERVED_DAILY_LIMIT_REACHED','OBSERVED_MONTHLY_LIMIT_REACHED',
      'PROVISIONAL_HISTORICAL_DAILY_HOLD_AT_LIMIT',
      'PROVISIONAL_HISTORICAL_MONTHLY_HOLD_AT_LIMIT',
      'DAILY_HISTORICAL_HOLDS_MISSING',
      'MONTHLY_ORIGINAL_EVIDENCE_NOT_SUPPLIED',
      'MONTHLY_ORIGINAL_EVIDENCE_GAPS'
    ]);
    const alerts=r.reviewReasons;
    if(alerts.some(x=>typeof x!=='string'||!allowed.has(x))||
      new Set(alerts).size!==alerts.length||
      !['ORIGINAL_SOURCE_AND_STAFF_REVIEW_REQUIRED',
        'EVENT_IDENTITY_NOT_VERIFIED','PARKING_SLOT_NOT_VERIFIED',
        'DEPARTURE_SPACING_AND_FULL_OVERLAP_NOT_CHECKED'
      ].every(x=>alerts.includes(x))||
      alerts.includes('OBSERVED_DAILY_LIMIT_REACHED')!==expectedDaily||
      alerts.includes('OBSERVED_MONTHLY_LIMIT_REACHED')!==expectedMonthly||
      alerts.includes('MEETING_TIME_MISSING')!==(r.meetingProvided===false)||
      alerts.includes('PLANNED_END_MISSING')!==(r.plannedEndProvided===false)||
      alerts.includes('PROVISIONAL_HISTORICAL_DAILY_HOLD_AT_LIMIT')!==
        r.provisionalHistoricalDailyHoldAtLimit||
      alerts.includes('PROVISIONAL_HISTORICAL_MONTHLY_HOLD_AT_LIMIT')!==
        r.provisionalHistoricalMonthlyHoldAtLimit)fail();
    const content='**Kings Booking & Slot Review — PRIVATE OFFLINE PREVIEW**\n'+
      r.category+' | '+r.utcDate+' (UTC)\n'+
      'Observed day: P'+s.dailyPartner+' E'+s.dailyExternal+
      ' | Month: P'+s.monthlyPartner+' E'+s.monthlyExternal+'\n'+
      'Observed quota review: day '+(r.observedDailyLimitReached?'YES':'not flagged')+
      ' | month '+(r.observedMonthlyLimitReached?'YES':'not flagged')+'\n'+
      'Evidence checks: '+alerts.length+' review reasons\n'+
      '**No slots certified, reserved or approved. Human review required.**';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{
      flags:64,allowed_mentions:{parse:[]},content,embeds:[]}});
  }catch{fail();}
}
module.exports={projectKingsEventBookingSafetyReview,
  renderKingsEventBookingSafetyPreview};
