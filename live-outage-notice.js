'use strict';
// Kings Live Systems: show honest availability when an attempted live refresh
// fails. Read-only on stored measurements and history; Discord message edits only.
require('./kings-branding').installDiscordBranding();
const fs=require('fs');
const path=require('node:path');
const { fetchOfficialSnapshot,fetchOfficialMembership }=require('./truckersmp-official-live');
const {recordFallbackDelivery}=require('./live-systems-delivery');

const ROOT=__dirname;
const KINGS_BLUE=0x182DFF;
const MESSAGE_ID=/^\d{17,20}$/;
const SETTINGS=[
  {label:'Live Tracker',file:'live-tracker-snapshot.json',idKey:'discordMessageId',env:'DISCORD_WEBHOOK_URL',
   title:'👑 Kings Live Tracker — Live Data Unavailable'},
  {label:'Advanced Statistics',file:'statistics.json',idKey:'messageId',env:'STATS_DISCORD_WEBHOOK_URL',
   title:'👑 Kings Statistics — Live Data Unavailable'},
  {label:'Central Overview',file:'central-overview.json',idKey:'messageId',env:'CENTRAL_OVERVIEW_WEBHOOK_URL',
   title:'👑 Kings Central Overview — Live Data Unavailable'}
];
function readSafeState(file){
  try{
    const name=path.join(ROOT,'data',file);
    const obj=JSON.parse(fs.readFileSync(name,'utf8'));
    return obj && typeof obj==='object'&&!Array.isArray(obj)?obj:null;
  }catch{return null;}
}
function lastVerified(state,config){
  const value=config.label==='Advanced Statistics'?
    state?.sourceSnapshotAt:config.label==='Central Overview'?
    readSafeState('live-tracker-snapshot.json')?.updatedAt:state?.updatedAt;
  const ms=Date.parse(value||'');
  if(!Number.isFinite(ms)||ms<=0||ms>Date.now()+300000)return 'No confirmed recent sample';
  return '<t:'+Math.floor(ms/1000)+':F> (<t:'+Math.floor(ms/1000)+':R>)';
}
// Membership is independently verified against the authoritative VTC roster.
// It is not an online-player measurement and may be shown during map outages
// only while its source timestamp is still fresh.
function freshMemberCount(now = Date.now()) {
  const state=readSafeState('driver-management-summary.json');
  const number=state?.currentDrivers;
  const at=Date.parse(state?.updatedAt||'');
  if(!Number.isInteger(number)||number<0||number>10000||
      !Number.isFinite(at)||at>now+300000||now-at>90*60*1000) return null;
  return {members:number,verifiedAt:Math.floor(at/1000)};
}
// Independent, last-verified aggregate history remains useful even when
// live player positions are unavailable. Never re-label old peaks as current.
function historicalPeakField(){
  const state=readSafeState('statistics.json');
  const peaks=state?.allTime;
  if(!peaks) return null;
  const all=peaks.peakOnline,ets=peaks.peakETS2,ats=peaks.peakATS;
  if(![all,ets,ats].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100000) ||
     all<Math.max(ets,ats) || !Array.isArray(state.history) || state.history.length===0){
    return null;
  }
  const ms=Date.parse(state.sourceSnapshotAt||'');
  if(!Number.isFinite(ms)||ms<=0||ms>Date.now()+300000) return null;
  const at=Math.floor(ms/1000);
  return {
    name:'Historical tracked online peak (not current activity)',
    value:'**'+all+' Kings Members** · ETS2 peak: **'+ets+'** · ATS peak: **'+ats+
      '**\nLast confirmed player-data sample: <t:'+at+':R>',
    inline:false
  };
}
// Published changelog archive is independent of live map availability.
// Read identifiers only: never inject arbitrary changelog entry content.
function archivedChangelogField(){
  const history=readSafeState('changelog-history.json');
  const items=Array.isArray(history?.changelogs)?history.changelogs:[];
  const rows=items.filter(item=>{
    const at=Date.parse(item?.publishedAt||'');
    return /^S[0-9]{2}-KL[0-9]{2,3}$/.test(String(item?.id||'')) &&
      Number.isFinite(at)&&at>0&&at<=Date.now()+300000;
  }).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  if(rows.length===0) return null;
  const latest=rows[0];
  return {name:'Latest archived Kings Changelog (independent of live map)',
    value:'**'+latest.id+'** · Published <t:'+Math.floor(Date.parse(latest.publishedAt)/1000)+':D>',
    inline:false};
}

function outageEmbed(config,state,official=null){
  const fields=[
    {name:'Last confirmed player-data sample',value:lastVerified(state,config),inline:false},
    {name:'Current online count',value:'**Unavailable — not zero**',inline:false}
  ];
  const membership=official?null:freshMemberCount();
  if(membership){
    fields.push({
      name:'Confirmed TruckersMP VTC membership (not live online)',
      value:'**'+membership.members+' members** — verified <t:'+membership.verifiedAt+':R>',
      inline:false
    });
  }
  if (official){
    const ts=Math.floor(Date.parse(official.observedAt)/1000);
    fields.push({name:'Kings VTC membership (official TruckersMP)',
      value:'**'+official.vtcMemberCount+' registered VTC members** — verified <t:'+ts+':R>',inline:false});
    // When only VTC membership is verified, omit unverified global online totals.
    if (Number.isSafeInteger(official.totalAllPlayers) &&
        Number.isSafeInteger(official.activeServers) &&
        Number.isSafeInteger(official.ets2AllPlayers) &&
        Number.isSafeInteger(official.atsAllPlayers)) {
    fields.push({name:'ALL TruckersMP players online (not Kings Drivers)',
      value:'**'+official.totalAllPlayers+' players** across '+official.activeServers+' online servers (ETS2: **'+official.ets2AllPlayers+'** · ATS: **'+official.atsAllPlayers+'**) — <t:'+ts+':R>',inline:false});
    }
  }
  if(config.label==='Advanced Statistics' || config.label==='Central Overview'){
    const historical=historicalPeakField();
    if(historical)fields.push(historical);
  }
  if(config.label==='Central Overview'){
    const changelog=archivedChangelogField();
    if(changelog)fields.push(changelog);
  }
  return {
    title:config.title,
    description:'⚠️ **Current TruckersMP player status is temporarily unavailable.**\n\n' +
      'The latest live refresh could not be verified. No one is being marked online or offline from missing information.\n\n' +
      'Previously confirmed statistics and historical records remain preserved.',
    color:KINGS_BLUE,
    fields,
    footer:{text:'Kings Systems | Live source unavailable; refresh will resume automatically after a successful verified run.'}
  };
}
function webhookBase(value){
  if(!value)return null;
  let url;
  try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||!['discord.com','discordapp.com'].includes(url.hostname))return null;
  if(!/^\/api(?:\/v\d+)?\/webhooks\/\d{17,20}\/[A-Za-z0-9._-]+\/?$/.test(url.pathname))return null;
  return url.origin+url.pathname.replace(/\/$/,'');
}
async function updateExisting(config,official=null){
  const state=readSafeState(config.file);
  const id=String(state?.[config.idKey]||'');
  const url=webhookBase(process.env[config.env]);
  if(!MESSAGE_ID.test(id)||!url){
    console.warn(config.label+': existing message ID or webhook not available; no new message created.');
    return {label:config.label,changed:false,reason:'no-target'};
  }
  const endpoint=url+'/messages/'+id;
  const get=await fetch(endpoint,{method:'GET',signal:AbortSignal.timeout(12000)});
  if(get.status===404){
    console.warn(config.label+': saved message was not found; not creating a new one.');
    return {label:config.label,changed:false,reason:'not-found'};
  }
  if(!get.ok)throw new Error(config.label+': failed to inspect existing Discord message (HTTP '+get.status+').');
  const existing=await get.json();
  const desired=outageEmbed(config,state,official);
  const current=existing?.embeds?.[0];
  // An already-visible outage title alone is not enough: membership may
  // have been freshly verified, or a previously verified count may be stale.
  // Only edit when the actually displayed fields need an honest update.
  const alreadyShown=current?.title===desired.title &&
    current?.description===desired.description &&
    JSON.stringify((current.fields||[]).map(x=>[x.name,x.value]))===
    JSON.stringify(desired.fields.map(x=>[x.name,x.value]));
  if(alreadyShown){
    console.log(config.label+': outage notice already shown with current verified fields; avoiding duplicate edits.');
    return {label:config.label,changed:false,reason:'already-shown'};
  }
  const response=await fetch(endpoint,{
    method:'PATCH',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(12000),
    body:JSON.stringify({
      content:'',embeds:[desired],
      allowed_mentions:{parse:[]}
    })
  });
  if(!response.ok)throw new Error(config.label+': failed to update existing Discord message (HTTP '+response.status+').');
  console.log(config.label+': outage notice updated existing Discord message.');
  return {label:config.label,changed:true};
}
async function main(){
  let problems=0;
  let official=null;
  if (process.env.TRUCKERSMP_OFFICIAL_FEED_ENABLED==='true') {
    try {
      official=await fetchOfficialSnapshot();
      console.log('Verified public TruckersMP VTC and global server totals are available.');
    } catch (error) {
      // Do not conceal player-map outage, mark the official secondary feed
      // healthy or print identifying player records in logs.
      console.warn('Official TruckersMP secondary overview unavailable ('+String(error?.name||'Error')+').');
      try {
        official=await fetchOfficialMembership();
        console.log('Official Kings VTC membership verified; global server totals unavailable.');
      } catch (membershipError) {
        console.warn('Official Kings VTC membership unavailable ('+
          String(membershipError?.name||'Error')+').');
      }
    }
  }
  const displayResults=[];
  for(const config of SETTINGS){
    try{
      const result=await updateExisting(config,official);
      if(result.reason==='no-target' || result.reason==='not-found'){
        // All three existing Live Systems messages are required. A missing
        // one may still show misleading stale Kings online measurements.
        problems++;
        displayResults.push({label:config.label,ok:false});
        console.error(config.label+': fallback cannot update its existing Discord message.');
      } else {
        // A verified already-shown notice is a successful no-op.
        displayResults.push({label:config.label,ok:true});
      }
    }
    catch(error){
      problems++;
      displayResults.push({label:config.label,ok:false});
      // Never print webhook secrets, Discord message bodies or player IDs.
      console.error(config.label+': status edit failed ('+String(error?.name||'Error')+').');
    }
  }
  // Persist aggregate delivery evidence even on partial failure. This
  // prevents monitoring from calling an old successful run the current state.
  recordFallbackDelivery({official,displayResults,problems,
    hasRecentRoster:freshMemberCount()!==null});
  if(problems)process.exitCode=1;
}
main().catch(error=>{console.error('Kings outage status could not finish.');process.exitCode=1;});
