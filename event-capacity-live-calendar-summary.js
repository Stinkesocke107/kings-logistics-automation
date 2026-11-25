'use strict';
// FIRST PRACTICAL EVENT CALENDAR: a pure, private, read-only projection of
// the already-generated Kings Convoy Checker report & overview.
// It is called only AFTER upstream authenticated scheduled GitHub artifact
// checks. It never reads Discord, writes storage, or certifies free slots.
// The existing capacity engine still requires actual trusted Staff decisions.
const {adaptConvoyReports}=require('./event-capacity-adapter');
const {timestamp}=require('./event-capacity-core');
const {POLICY,reviewDailyCount}=require('./event-capacity-policy');
const ERROR='Kings private Convoy Calendar source cannot be projected.';
const GUILD='1114967437788577792';
const FORUM='1550619824005062697';
const CLASS=Object.freeze({
  'Kings Convoy':'kings','Partner Convoy':'partner',
  'External Convoy':'external'
});
const ACTIVE=new Set(['Scheduled','Completed','Rescheduled']);
const PENDING=new Set(['Submitted','Needs Information','Ready for Approval',
  'Pending','Tentative']);
const DAY=/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
function fail(){throw new Error(ERROR);}
function monthNext(ym,n){
  const d=new Date(ym+'-01T00:00:00.000Z');
  d.setUTCMonth(d.getUTCMonth()+n);
  return d.toISOString().slice(0,7);
}
function blank(month){
  return {month,sourceClaimedEvents:0,claimedScheduled:0,
    claimedPending:0,claimedCancelled:0,requiresVerification:0,
    kings:0,partner:0,external:0,unclassified:0,
    partnerMonthlyOverLimit:false,externalMonthlyOverLimit:false,
    reviewFlagDays:0,priorityConflictDays:0,days:[]};
}
function id(item){
  const x=item.eventId??item.threadId;
  const value=typeof x==='string'||Number.isSafeInteger(x)?String(x):null;
  if(!value||value.length>96||!/^[A-Za-z0-9_-]+$/.test(value))return null;
  return (item.eventId!==null&&item.eventId!==undefined?'event:':'thread:')+value;
}
function monthlyFromReports({report,overview,nowMs=Date.now()}={}){
  try{
    if(!Number.isSafeInteger(nowMs)||nowMs<0||
      !report||!overview||report.guildId!==GUILD||
      overview.guildId!==GUILD||report.forumId!==FORUM||
      overview.forumId!==FORUM)fail();
    const adapted=adaptConvoyReports(report,overview,{
      trustedSource:true,expectedGuildId:GUILD,expectedForumId:FORUM,
      nowMs,maxAgeMs:30*60*1000
    });
    if(adapted.dataFresh!==true||
      !Number.isSafeInteger(adapted.counts?.center)||
      !Number.isSafeInteger(adapted.counts?.legacy)||
      adapted.counts.center+adapted.counts.legacy!==adapted.events.length||
      adapted.events.length>30000)fail();
    const start=new Date(nowMs).toISOString().slice(0,7),
      rows=Array.from({length:12},(_,i)=>blank(monthNext(start,i))),
      byMonth=new Map(rows.map(row=>[row.month,row])),
      dayMap=new Map(),seen=new Map();
    let undated=0,oldOutside=0,duplicates=0,conflicts=0;
    // Use only Convoy Center records for source claims. Frozen legacy events
    // are separate unverified sources, never summed into occupancy.
    for(const item of adapted.events.slice(0,adapted.counts.center)){
      const key=id(item);
      if(!key){undated++;continue;}
      const old=seen.get(key);
      if(old){
        if(JSON.stringify(old)!==JSON.stringify(item))conflicts++;
        else duplicates++;
        // Duplicate canonical identities must never be presented twice,
        // even if their declared source fields look identical.
        seen.set(key,{...old,identityConflict:true});
        continue;
      }
      seen.set(key,item);
    }
    for(const item of seen.values()){
      if(item.identityConflict)continue;
      const millis=timestamp(item.departureAtUtc);
      const day=millis===null?null:new Date(millis).toISOString().slice(0,10);
      const row=day?byMonth.get(day.slice(0,7)):null;
      if(!day){undated++;continue;}
      if(!row){oldOutside++;continue;}
      row.sourceClaimedEvents++;
      const group=CLASS[item.eventType]||'unclassified';
      let status='requiresVerification';
      if(ACTIVE.has(item.status))status='claimedScheduled';
      else if(PENDING.has(item.status))status='claimedPending';
      else if(item.status==='Cancelled')status='claimedCancelled';
      row[status]++;
      if(status==='claimedScheduled')row[group]++;
      const d=dayMap.get(day)||{
        date:day,claimedScheduled:0,claimedPending:0,
        claimedCancelled:0,requiresVerification:0,
        kings:0,partner:0,external:0,unclassified:0,
        potentialSpacingConflict:false,reviewFlag:false,
        dailyLimitExceeded:false,priorityConflict:false,
        departures:[]
      };
      d[status]++;
      if(status==='claimedScheduled'){
        d[group]++;
        // Sorted later; time proximity is only a planning warning,
        // never a booking rejection or approved slot calculation.
        d.departures.push(millis);
      }
      dayMap.set(day,d);
    }
    // Legacy records are separate and may overlap current Center identity.
    const legacyMonths=new Map();
    let legacyUndated=0,legacyOutside=0,legacyInside=0;
    for(const item of adapted.events.slice(adapted.counts.center)){
      const millis=timestamp(item.departureAtUtc);
      if(millis===null){legacyUndated++;continue;}
      const ym=new Date(millis).toISOString().slice(0,7);
      if(!byMonth.has(ym)){legacyOutside++;continue;}
      legacyInside++;
      legacyMonths.set(ym,(legacyMonths.get(ym)||0)+1);
    }
    if(legacyUndated+legacyOutside+legacyInside!==adapted.counts.legacy)fail();
    for(const [day,d] of dayMap){
      const rule=reviewDailyCount({day,partner:d.partner,external:d.external,
        kings:d.kings});
      d.departures.sort((a,b)=>a-b);
      for(let i=1;i<d.departures.length;i++){
        if(d.departures[i]-d.departures[i-1]<POLICY.minimumDepartureGapMinutes*60000)
          d.potentialSpacingConflict=true;
      }
      d.dailyLimitExceeded=rule.planningOverLimit;
      d.priorityConflict=rule.planningOverLimit&&
        [d.kings,d.partner,d.external].filter(n=>n>0).length>1;
      d.reviewFlag=rule.planningOverLimit||
        d.potentialSpacingConflict||d.unclassified>0||
        d.requiresVerification>0||
        d.claimedPending>0||d.claimedCancelled>0;
      delete d.departures;
      const row=byMonth.get(day.slice(0,7));
      if(d.reviewFlag)row.reviewFlagDays++;
      if(d.priorityConflict)row.priorityConflictDays++;
      row.days.push(d);
    }
    let totalCenter=0;
    for(const row of rows){
      row.days.sort((a,b)=>a.date.localeCompare(b.date));
      row.legacyClaimsKeptSeparate=legacyMonths.get(row.month)||0;
      row.partnerMonthlyOverLimit=row.partner>POLICY.partnerMonthlyMax;
      row.externalMonthlyOverLimit=row.external>POLICY.externalMonthlyMax;
      totalCenter+=row.sourceClaimedEvents;
    }
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      firstMonth:start,lastMonth:rows.at(-1).month,
      policy:Object.freeze({dailyTotalMax:POLICY.dailyTotalMax,
        partnerMonthlyMax:POLICY.partnerMonthlyMax,
        externalMonthlyMax:POLICY.externalMonthlyMax,
        kingsMonthlyMax:null,weeklyMax:null,
        priorityOrder:POLICY.priorityOrder}),
      months:Object.freeze(rows),
      centerClaimsInVisibleMonths:totalCenter,
      centerClaimsWithoutUsableUtcDate:undated,
      centerClaimsOutsideWindow:oldOutside,
      duplicateCenterClaimsSuppressed:duplicates,
      identityConflictsRequiringReview:conflicts,
      sourceAdapterIssues:adapted.issues.length,
      legacyClaimsTotal:adapted.counts.legacy,
      legacyClaimsWithoutUsableUtcDate:legacyUndated,
      legacyClaimsOutsideWindow:legacyOutside,
      legacyClaimsInVisibleMonths:legacyInside,
      currentAndLegacyClaimsNotAdditive:true,
      reportedScheduledIsNotStaffVerifiedAcceptance:true,
      completedIsNotAttendance:true,
      oldRescheduleDatesNotReleased:true,
      declaredDepartureIsNotVerifiedBooking:true,
      repoDataReadByThisModule:false,
      liveDiscordCallsMade:0,bookingsChanged:0,
      realAvailableSlotsCertified:false,freeSlotsCertified:false,
      safeToActivate:false
    });
  }catch{fail();}
}
function calendarLines(r){
  try{
    if(!r||r.visibility!=='PRIVATE_ONLY'||r.readOnly!==true||
      r.safeToActivate!==false||r.freeSlotsCertified!==false||
      r.realAvailableSlotsCertified!==false||
      r.reportedScheduledIsNotStaffVerifiedAcceptance!==true||
      r.currentAndLegacyClaimsNotAdditive!==true||
      r.repoDataReadByThisModule!==false||
      r.liveDiscordCallsMade!==0||r.bookingsChanged!==0||
      r.policy?.dailyTotalMax!==3||
      r.policy?.partnerMonthlyMax!==20||
      r.policy?.externalMonthlyMax!==20||
      r.policy?.kingsMonthlyMax!==null||
      r.policy?.weeklyMax!==null||
      !Array.isArray(r.months)||r.months.length!==12)fail();
    if(!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(r.firstMonth))fail();
    const lines=['**Convoy Center — reported planning entries (UTC, NOT approved capacity)**',
      'Policy: max 3 total/day (K+P+E); Partner 20/month; External 20/month; Kings no monthly maximum; no weekly cap.',
      'New unconfirmed requests: Kings first, Partner second, External third; no automatic displacement.'];
    let center=0;
    for(const [i,m] of r.months.entries()){
      const expectedMonth=monthNext(r.firstMonth,i);
      if(!m||m.month!==expectedMonth||!Array.isArray(m.days))fail();
      for(const k of ['sourceClaimedEvents','claimedScheduled','claimedPending',
        'claimedCancelled','requiresVerification','kings','partner',
        'external','unclassified','reviewFlagDays','priorityConflictDays',
        'legacyClaimsKeptSeparate'])
        if(!Number.isSafeInteger(m[k])||m[k]<0||m[k]>30000)fail();
      if(m.sourceClaimedEvents!==m.claimedScheduled+m.claimedPending+
        m.claimedCancelled+m.requiresVerification||
        m.claimedScheduled!==m.kings+m.partner+m.external+m.unclassified||
        m.partnerMonthlyOverLimit!==(m.partner>POLICY.partnerMonthlyMax)||
        m.externalMonthlyOverLimit!==(m.external>POLICY.externalMonthlyMax)||
        m.priorityConflictDays>m.reviewFlagDays)fail();
      center+=m.sourceClaimedEvents;
      if(i<3)lines.push(m.month+' | source planned '+m.claimedScheduled+
        ' (P'+m.partner+'/20'+(m.partnerMonthlyOverLimit?' !':'')+
        ' E'+m.external+'/20'+(m.externalMonthlyOverLimit?' !':'')+
        ' K'+m.kings+'/unlimited ?'+m.unclassified+
        ') | pending '+m.claimedPending+
        ' | cancelled '+m.claimedCancelled+
        ' | review days '+m.reviewFlagDays+
        ' | priority conflicts '+m.priorityConflictDays);
    }
    for(const k of ['centerClaimsInVisibleMonths','centerClaimsWithoutUsableUtcDate',
      'duplicateCenterClaimsSuppressed','identityConflictsRequiringReview',
      'sourceAdapterIssues','legacyClaimsTotal',
      'legacyClaimsWithoutUsableUtcDate','legacyClaimsOutsideWindow',
      'legacyClaimsInVisibleMonths'])
      if(!Number.isSafeInteger(r[k])||r[k]<0||r[k]>30000)fail();
    const shownLegacy=r.months.reduce((sum,m)=>sum+m.legacyClaimsKeptSeparate,0);
    if(center!==r.centerClaimsInVisibleMonths||
      r.legacyClaimsTotal!==r.legacyClaimsWithoutUsableUtcDate+
        r.legacyClaimsOutsideWindow+r.legacyClaimsInVisibleMonths||
      r.legacyClaimsInVisibleMonths!==shownLegacy||
      r.lastMonth!==monthNext(r.firstMonth,11))fail();
    const days=r.months[0].days;
    if(days.length>31)fail();
    for(const day of days){
      if(!day||!DAY.test(day.date)||
        day.date.slice(0,7)!==r.firstMonth||
        !Number.isSafeInteger(day.claimedScheduled)||
        !Number.isSafeInteger(day.claimedPending)||
        typeof day.reviewFlag!=='boolean')fail();
    }
    const recent=days.filter(d=>d.claimedScheduled||d.claimedPending);
    if(recent.length){
      lines.push('Current month days (source claims; first 6): '+
        recent.slice(0,6).map(d=>d.date.slice(-2)+'='+d.claimedScheduled+
          ' planned/'+d.claimedPending+' pending'+(d.reviewFlag?' !':''))
          .join(' | ')+(recent.length>6?' | +'+(recent.length-6)+' more':''));
    }
    lines.push('Current Center undated '+r.centerClaimsWithoutUsableUtcDate+
      ' | identity conflicts '+r.identityConflictsRequiringReview+'.');
    lines.push('Legacy history separately: '+r.legacyClaimsTotal+
      ' claims, '+r.legacyClaimsWithoutUsableUtcDate+
      ' without UTC departure; '+r.legacyClaimsInVisibleMonths+
      ' dated in view. No legacy claims treated as free slots.');
    return lines.join('\n');
  }catch{fail();}
}
module.exports={monthlyFromReports,calendarLines};
