'use strict';
// MANUAL OPT-IN on reviewed main only. Existing GitHub Actions uses the existing
// Kings Discord bot token, and ONLY Discord REST v10 GET routes. Never prints
// private message text, event IDs, user IDs, channel IDs, or access credentials.
const {inspectKingsEventInvitationSourceHandoff}
  =require('../event-capacity-invitation-source-handoff');
const GUILD='1114967437788577792';
const SNOW=/^[1-9]\d{16,21}$/;
const ERROR='KINGS_INVITATION_SOURCE_UNVERIFIED';
function fail(){throw Error(ERROR);}
function idCsv(raw){
  if(typeof raw!=='string'||raw.length>1024)fail();
  const ids=raw.split(',').map(s=>s.trim());
  if(ids.length<1||ids.length>20||ids.some(x=>!SNOW.test(x))||
    new Set(ids).size!==ids.length)fail();
  return ids;
}
function configFromEnvironment(env){
  if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
    env.GITHUB_REF!=='refs/heads/main'||
    env.KINGS_INVITATION_READONLY_PROBE!=='true'||
    env.KINGS_INVITATION_CONVOY_MODE!=='dry-run')fail();
  if(typeof env.DISCORD_BOT_TOKEN!=='string'||
    env.DISCORD_BOT_TOKEN.length<30||
    env.DISCORD_BOT_TOKEN.length>512||
    !SNOW.test(env.KINGS_EVENT_INVITATION_SOURCE_CHANNEL_ID||''))fail();
  return {
    guildId:GUILD,channelId:env.KINGS_EVENT_INVITATION_SOURCE_CHANNEL_ID,
    staffRoleIds:idCsv(env.KINGS_EVENT_INVITATION_STAFF_ROLE_IDS),
    authorizedAdminRoleIds:idCsv(env.KINGS_EVENT_INVITATION_ADMIN_ROLE_IDS)
  };
}
// One allowlisted endpoint family; never accept an arbitrary URL, host, verb,
// redirect, query parameter, path segment, or alternative guild/channel.
function createDiscordReadClient({fetchImpl,token,config}){
  if(typeof fetchImpl!=='function'||typeof token!=='string'||
    !config||config.guildId!==GUILD||!SNOW.test(config.channelId))fail();
  const role='/guilds/'+GUILD+'/roles',member='/guilds/'+GUILD+'/members/';
  const channel='/channels/'+config.channelId;
  const active='/guilds/'+GUILD+'/threads/active';
  const archived=channel+'/threads/archived/public?limit=100';
  const threads=new Set();
  return Object.freeze({get:async path=>{
    const msg=/^\/channels\/([1-9]\d{16,21})\/messages\?limit=100(?:&before=[1-9]\d{16,21})?$/.exec(path);
    const archiveAllowed=path===archived||
      (path.startsWith(archived+'&before=')&&
        /^20\d{2}-[0-9A-Za-z%._-]{12,80}$/.test(path.slice((archived+'&before=').length)));
    const allowed=path==='/users/@me'||path===role||path===channel||
      path===active||archiveAllowed||
      (path.startsWith(member)&&SNOW.test(path.slice(member.length)))||
      (msg!==null&&(msg[1]===config.channelId||threads.has(msg[1])));
    if(!allowed||path.length>220)fail();
    let response;
    try{
      response=await fetchImpl('https://discord.com/api/v10'+path,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
        headers:{Authorization:'Bot '+token,
          'User-Agent':'Kings Event Invitation Source Readonly/1.0',
          Accept:'application/json'}
      });
    }catch{fail();}
    if(!response||response.status!==200||
      Number(response.headers?.get?.('content-length')||0)>2000000)fail();
    let text;
    try{text=await response.text();}catch{fail();}
    if(typeof text!=='string'||text.length===0||text.length>2000000)fail();
    let data;
    try{data=JSON.parse(text);}catch{fail();}
    // Only thread IDs observed in the authenticated allowed forum source
    // may subsequently be read. Never allow arbitrary other channel IDs.
    if(path===active||archiveAllowed){
      if(!data||!Array.isArray(data.threads)||
        data.threads.length>20000)fail();
      for(const t of data.threads){
        if(t?.parent_id===config.channelId){
          if(!SNOW.test(t.id)||threads.size>=40)fail();
          threads.add(t.id);
        }else if(path!==active)fail();
      }
    }
    return {status:200,data};
  }});
}
async function main(){
  try{
    const cfg=configFromEnvironment(process.env);
    const client=createDiscordReadClient({
      fetchImpl:fetch,token:process.env.DISCORD_BOT_TOKEN,config:cfg
    });
    // Source-only by design. There is no approved, synchronized private
    // Convoy Center/24-month history payload in this public-source job.
    const report=await inspectKingsEventInvitationSourceHandoff({
      client,config:cfg,asOfUtc:new Date().toISOString()
    });
    if(report.mode!=='SOURCE_EVIDENCE_REVIEW'||
      report.safeToActivate!==false||
      report.freeSlotsCertified!==false||
      report.originalOrganizerRepliesIndependentlyAuthenticated!==false||
      report.original24MonthSourceHistoryAuthenticated!==false||
      report.eventBookingsCreated!==0||
      report.staffApprovalsCommitted!==0)fail();
    // Strict fixed output: never serialize privateClaimsDoNotLog or report.
    process.stdout.write(
      'KINGS_INVITATION_GET_ONLY_SOURCE_OBSERVED; '+
      'STAFF_STATUS_CLAIMS_UNVERIFIED; CENTER_LINKS_NOT_CERTIFIED; '+
      'ORGANIZER_REPLIES_NOT_CERTIFIED; HISTORY_NOT_CERTIFIED; '+
      'NO_BOOKING_OR_PRODUCTION_ACTIVATION\n'
    );
  }catch{
    process.stderr.write(ERROR+'\n');
    process.exitCode=1;
  }
}
if(require.main===module)main();
module.exports={configFromEnvironment,createDiscordReadClient};
