'use strict';
// Pure Kings private capacity calendar projection; no Discord network/writes.
// Only route responses through an authenticated private ephemeral handler.
const {LIMITS,dayAvailability}=require('./event-capacity-core');
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
    partnerRemaining:Math.max(0,LIMITS.partnerMonthly-n(source.partner)),
    externalRemaining:Math.max(0,LIMITS.externalMonthly-n(source.external))
  };
  const summary={Available:0,Limited:0,Full:0,Unverified:0};
  const quotaWarnings=new Set((capacity.warnings||[])
    .filter(x=>x.code==='combined-day-over-limit').map(x=>x.day));
  const days=[];
  for(let d=1;d<=monthDays(month);d++){
    const day=month+'-'+String(d).padStart(2,'0');
    const snapshot=dayAvailability(capacity,day);
    let status;
    if(!snapshot.verified)status='Unverified';
    else if(snapshot.remaining===0||
      (!snapshot.partnerAvailableVerified&&!snapshot.externalAvailableVerified))status='Full';
    else if(snapshot.remaining===1||!snapshot.partnerAvailableVerified||
      !snapshot.externalAvailableVerified)status='Limited';
    else status='Available';
    summary[status]++;
    days.push({
      date:day,status,
      combinedUsed:n(snapshot.daily.combined),
      remaining:snapshot.verified?snapshot.remaining:null,
      partner:n(snapshot.daily.partner),external:n(snapshot.daily.external),
      kings:n(snapshot.daily.kings),
      approvedExceptions:n(snapshot.daily.approvedExceptions),
      partnerAvailableVerified:snapshot.partnerAvailableVerified,
      externalAvailableVerified:snapshot.externalAvailableVerified,
      quotaConflict:quotaWarnings.has(day)
    });
  }
  return {month,monthly,summary,days};
}
function projectDashboard(capacity,{nowMs=Date.now(),startMonth=null,monthCount=3,trackerSource=null}={}){
  if(!capacity||typeof capacity!=='object'||Array.isArray(capacity)||
     capacity.limits?.combinedDaily!==LIMITS.combinedDaily||
     capacity.limits?.partnerMonthly!==LIMITS.partnerMonthly||
     capacity.limits?.externalMonthly!==LIMITS.externalMonthly||
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
    policy:{combinedDaily:2,partnerMonthly:20,externalMonthly:20,kingsUnlimited:true},
    months,tracker:projectOptionalTracker(trackerSource,{nowMs}),
    attendanceInferred:false
  };
}
function embed(month){
  const rows=month.days.map(item=>{
    const marker=({Unverified:'?',Full:'X',Limited:'~',Available:'+'})[item.status];
    return item.date.slice(-2)+' '+marker+' '+item.combinedUsed+'/'+LIMITS.combinedDaily+
      ' (P'+item.partner+' E'+item.external+' K'+item.kings+')'+
      (item.approvedExceptions?' EX'+item.approvedExceptions:'')+
      (item.quotaConflict?' !Q':'');
  });
  return {
    title:'Kings Event Capacity | '+month.month+' UTC',
    description:rows.join('\n'),
    color:1584639,
    fields:[
      {name:'UTC monthly counts',value:'Partner '+month.monthly.partner+'/'+LIMITS.partnerMonthly+
        ' · External '+month.monthly.external+'/'+LIMITS.externalMonthly+
        ' · Kings '+month.monthly.kings+' (unlimited)',inline:false},
      {name:'Days',value:'Available '+month.summary.Available+' · Limited '+month.summary.Limited+
        ' · Full '+month.summary.Full+' · Unverified '+month.summary.Unverified,inline:false}
    ],
    footer:{text:'Private preview | + available | ~ limited | X full | ? unverified | EX approved exception | !Q quota conflict'}
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
        '\nCounts are scheduling data, not proof of participation. No event is modified.'+
        '\n'+tracker,
      embeds:view.months.map(embed)
    }
  };
}
module.exports={projectDashboard,projectMonth,ephemeralResponse,monthAt};
