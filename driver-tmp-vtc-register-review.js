'use strict';
const { selectChannel,assertPrivateLeadershipChannel,currentDrivers } =
  require('./driver-welcome-register-review');
const { syncTextMessage } = require('./leadership-message-sync');
const {VTC_ID,parseRoster,readPublicProfile,matchProfiles,reportPages} =
  require('./kings-vtc-register-contract');
const {loadVerifiedLegacyMappings}=require('./driver-legacy-verified-mappings');

const GUILD='1114967437788577792';
const TMP_API='https://api.truckersmp.com/v2';
const DISCORD_API='https://discord.com/api/v10';
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function getJson(url, headers={}, transport=fetch, attempts=2) {
  let error=null;
  for(let i=0;i<attempts;i++) {
    try {
      const response=await transport(url,{
        method:'GET',
        headers:{Accept:'application/json',...headers},
        signal:AbortSignal.timeout(12000),redirect:'error'
      });
      if(!response?.ok) {
        if([429,500,502,503,504].includes(response.status) && i+1<attempts) {
          await delay(900+(i*750));continue;
        }
        throw Error('Public service request unavailable (HTTP '+response?.status+').');
      }
      return await response.json();
    }catch(e){
      error=e;
      if(i+1<attempts)await delay(650);
    }
  }
  throw error||Error('API request unavailable.');
}
async function fetchPublicProfiles(roster, transport=fetch) {
  // A bounded four-request worker pool avoids launching 110 requests at once.
  // Player/Discord mappings and profile IDs NEVER enter public GitHub logs.
  const index=new Map(),failed=new Set();
  let cursor=0;
  async function worker(){
    while(cursor<roster.length) {
      const item=roster[cursor++];
      try{
        const body=await getJson(TMP_API+'/player/'+item.tmpId,
          {'User-Agent':'Kings Logistics Driver Identity Review/1.0'},transport);
        const observed=readPublicProfile(body,item.tmpId);
        if(observed.valid)index.set(item.tmpId,observed);
        else failed.add(item.tmpId);
      }catch{
        failed.add(item.tmpId);
      }
    }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);
  return {index,failedCount:failed.size};
}
async function review({token,transport=fetch}) {
  if(!token)throw Error('DISCORD_BOT_TOKEN is missing.');
  const botHeaders={
    Authorization:'Bot '+token,
    'User-Agent':'Kings Logistics Private VTC Date Review/1.0'
  };
  const getDiscord=path=>getJson(DISCORD_API+path,botHeaders,transport);
  const [rosterData,channels,roles]=await Promise.all([
    getJson(TMP_API+'/vtc/'+VTC_ID+'/members',
      {'User-Agent':'Kings Logistics Driver Identity Review/1.0'},transport),
    getDiscord('/guilds/'+GUILD+'/channels'),
    getDiscord('/guilds/'+GUILD+'/roles')
  ]);
  const roster=parseRoster(rosterData);
  const leadership=selectChannel(channels,'driver-leadership');
  assertPrivateLeadershipChannel(leadership,roles,GUILD);

  const members=[];
  let after='';
  for(let page=0;page<20;page++){
    const qs=new URLSearchParams({limit:'1000'});
    if(after)qs.set('after',after);
    const batch=await getDiscord('/guilds/'+GUILD+'/members?'+qs);
    if(!Array.isArray(batch))throw Error('Incomplete Kings Discord member roster.');
    members.push(...batch);
    if(batch.length<1000)break;
    after=String(batch.at(-1)?.user?.id||'');
    if(!/^\d{17,20}$/.test(after)||page===19)throw Error('Incomplete Kings Discord member pagination.');
  }
  const drivers=currentDrivers(roles,members);
  const profiles=await fetchPublicProfiles(roster,transport);
  // Reuse ONLY older Kings mappings whose provenance is a previously
  // verified exact TruckersMP /player discordSnowflake. No old name
  // heuristics or unverifiable public profile guesses enter the result.
  const stored=loadVerifiedLegacyMappings();
  const matched=matchProfiles(roster,profiles.index,drivers,stored);
  const pages=reportPages(matched,GUILD);
  return {
    channelId:String(leadership.id),pages,
    counts:{vtc:roster.length,drivers:drivers.length,verified:matched.matched.length,
      unmatched:matched.outstanding.length,conflicts:matched.duplicateCount,
      profileFailures:profiles.failedCount, historical:matched.matched.filter(x=>x.source==='historical-verified').length}
  };
}
async function main(){
  const mode=String(process.env.KINGS_TMP_VTC_REVIEW_MODE||'preview').trim();
  if(!['preview','publish'].includes(mode))throw Error('Invalid VTC review mode.');
  const token=process.env.DISCORD_BOT_TOKEN;
  const result=await review({token});
  // Print counts only, never Discord identities, profiles, joining dates or
  // complete message content in publicly visible GitHub Actions logs.
  console.log('Kings TMP VTC review: '+result.counts.vtc+' roster members, '+
    result.counts.drivers+' Discord Drivers/Trials, '+
    result.counts.verified+' exact public Discord-profile matches, '+
    result.counts.unmatched+' requiring confirmation, '+
    result.counts.historical+' recovered from previously verified encrypted links, '+
    result.counts.profileFailures+' inaccessible/invalid profiles, '+
    result.counts.conflicts+' ambiguous links.');
  if(mode!=='publish'){
    console.log('PREVIEW: no Discord writes, no register entries and no Loyalty role changes.');
    return;
  }
  for(const page of result.pages){
    const sync=await syncTextMessage({
      token,channelId:result.channelId,marker:page.marker,
      content:page.content,
      userAgent:'Kings TMP VTC Register Review/1.0'
    });
    if(sync.action==='suppressed')throw Error('Leadership report publication disabled.');
  }
  console.log('Published VTC review candidates to private Driver Leadership; no register or role writes.');
}
if(require.main===module){
  main().catch(err=>{
    console.error('Kings TMP VTC import review failed: '+err.message);
    process.exit(1);
  });
}
module.exports={getJson,fetchPublicProfiles,review};
