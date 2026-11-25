'use strict';
// Pure Kings private capacity calendar projection; no Discord network/writes.
// Only route responses through an authenticated private ephemeral handler.
const {LIMITS,dayAvailability}=require('./event-capacity-core');
const {POLICY,dailyLimitForUtcDate}=require('./event-capacity-policy');
const {projectOptionalTracker}=require('./event-capacity-optional-tracker');
const ERROR='Kings Event Capacity dashboard data invalid.';
function fail(){throw new Error(ERROR);}
function monthAt(base,offset){
  if(!/^(?:19|20|21)\d\d-(?:0[1-9]|1[0-2])$/.test(base)||
     !Number.isInteger(offset)||offset<0||offset>24)fail();
  return new Date(Date.UTC(Number(base.slice(0,4)),Number(base.slice(5,7))-1+offset,1))
    .toISOString().slice(0,7);
}
function monthDays(key){
  return new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7)),0)).getUTCDate();
}
function n(v){return Number.isSafeInteger(v)&&v>=0?v:0;}
function projectMonth(capacity,month){
  const source=capacity.months?.[month]||{};
  const monthly={
    partner:n(source.partner),external:n(source.external),kings:n(source.kings),
    partnerLimit:POLICY.partnerMonthlyMax,
    externalLimit:POLICY.externalMonthlyMax,kingsLimit:null,
    partnerOverLimit:n(source.partner)>POLICY.partnerMonthlyMax,
    externalOverLimit:n(source.external)>POLICY.externalMonthlyMax,
    partnerRemaining:null,externalRemaining:null
  };
  const summary={Available:0,Limited:0,Full:0,Review:0,Unverified:0};
  const quotaWarnings=new Set((capacity.warnings||[])
    .filter(x=>x.code==='combined-day-over-limit').map(x=>x.day));
  const days=[];
  for(let d=1;d<=monthDays(month);d++){
    const day=month+'-'+String(d).padStart(2,'0');
    const snapshot=dayAvailability(capacity,day);
    // A fresh current snapshot alone never proves historic coverage or an
    // available bookable slot. Highlight over-limit source claims as review.
    const status=quotaWarnings.has(day)||
      snapshot.daily.combined>LIMITS.combinedDaily?
      'Review':'Unverified';
    summary[status]++;
    days.push({
      date:day,status,
      combinedUsed:n(snapshot.daily.combined),
      remaining:null,reportedPlanningRoom:snapshot.planningRemaining,
      partner:n(snapshot.daily.partner),external:n(snapshot.daily.external),
      kings:n(snapshot.daily.kings),
      approvedExceptions:n(snapshot.daily.approvedExceptions),
      partnerAvailableVerified:snapshot.partnerAvailableVerified,
      externalAvailableVerified:snapshot.externalAvailableVerified,
      quotaConflict:status==='Review'
    });
  }
  return {month,monthly,summary,days};
}
function projectDashboard(capacity,{nowMs=Date.now(),startMonth=null,monthCount=3,trackerSource=null}={}){
  if(!capacity||typeof capacity!=='object'||Array.isArray(capacity)||
     capacity.limits?.policyId!==LIMITS.policyId||
     capacity.limits?.combinedDaily!==POLICY.dailyTotalMax||
     capacity.limits?.partnerMonthly!==POLICY.partnerMonthlyMax||
     capacity.limits?.externalMonthly!==POLICY.externalMonthlyMax||
     capacity.limits?.kingsMonthly!==null||
     capacity.limits?.weeklyMax!==null||
     capacity.limits?.kingsQuotaExempt!==false||
     typeof capacity.globalUncertainty!=='boolean'||
     !capacity.days||!capacity.months||
     !Array.isArray(capacity.uncertainDates)||!Array.isArray(capacity.uncertainMonths)||
     !Array.isArray(capacity.issues))fail();
  if(!Number.isInteger(monthCount)||monthCount<1||monthCount>3)fail();
  if(!Number.isFinite(nowMs))fail();
  const current=startMonth||new Date(nowMs).toISOString().slice(0,7);
  const months=Array.from({length:monthCount},(_,i)=>projectMonth(capacity,monthAt(current,i)));
  return {
    version:1,visibility:'PRIVATE_ONLY',mode:'READ_ONLY',
    sourceStatus:capacity.globalUncertainty?'Data Outdated / Unverified':'Checked',
    issueCount:capacity.issues.length,
    policy:{id:POLICY.policyId,dailyTotal:POLICY.dailyTotalMax,
      partnerMonthly:POLICY.partnerMonthlyMax,
      externalMonthly:POLICY.externalMonthlyMax,
      kingsMonthly:null,weeklyMax:null,
      kingsIncludedDaily:true,
      priorityOrder:POLICY.priorityOrder,
      capacityCertified:false},
    months,tracker:projectOptionalTracker(trackerSource,{nowMs}),
    attendanceInferred:false
  };
}
function embed(month){
  const rows=month.days.map(item=>{
    const marker=({Review:'!',Unverified:'?',Full:'?',Limited:'?',Available:'?'})[item.status];
    return item.date.slice(-2)+' '+marker+' '+item.combinedUsed+'/'+
      dailyLimitForUtcDate(item.date)+
      ' (P'+item.partner+' E'+item.external+' K'+item.kings+')'+
      (item.approvedExceptions?' EX'+item.approvedExceptions:'')+
      (item.quotaConflict?' !Q':'');
  });
  return {
    title:'Kings Event Capacity | '+month.month+' UTC',
    description:rows.join('\n'),
    color:1584639,
    fields:[
      {name:'UTC monthly source counts',value:'Partner '+month.monthly.partner+
        '/20'+(month.monthly.partnerOverLimit?' !':'')+
        ' · External '+month.monthly.external+
        '/20'+(month.monthly.externalOverLimit?' !':'')+
        ' · Kings '+month.monthly.kings+' (no monthly max)',inline:false},
      {name:'Days',value:'Review '+month.summary.Review+
        ' · Unverified '+month.summary.Unverified,inline:false}
    ],
    footer:{text:'Private source claims | ! staff review | ? availability unverified | no free slots approved'}
  };
}
function ephemeralResponse(view){
  if(!view||view.visibility!=='PRIVATE_ONLY'||!Array.isArray(view.months)||
     view.months.length<1||view.months.length>3)fail();
  const tracker=view.tracker?.mode==='WITH_MAP'&&
    ['TruckersMP','HaulMP'].includes(view.tracker.provider)?
    'Live-map feed: available ('+view.tracker.provider+'); optional to Event Capacity.':
    'Live-map feed: unavailable; Event Capacity works without a live map.';
  return {
    type:4,
    data:{
      flags:64,
      allowed_mentions:{parse:[]},
      content:'**Kings Event Capacity** · '+view.sourceStatus+
        (view.issueCount?' · '+view.issueCount+' internal issue(s)':'')+
        '\nPolicy: 3 total/day; Partner 20/month; External 20/month; Kings unlimited/month; no week limit.'+
        '\nPriority for NEW unconfirmed requests: Kings > Partner > External (human review only).'+
        '\nALL availability remains unverified; these are planning claims, not bookings. No event is modified.'+
        '\n'+tracker,
      embeds:view.months.map(embed)
    }
  };
}
module.exports={projectDashboard,projectMonth,ephemeralResponse,monthAt};
