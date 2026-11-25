'use strict';
// MANUAL OPT-IN on reviewed main only. Existing GitHub Actions uses the existing
// Kings Discord bot token, and ONLY Discord REST v10 GET routes. Never prints
// private message text, event IDs, user IDs, channel IDs, or access credentials.
const {scanKingsInvitationDiscordSource}
  =require('../event-invitation-discord-readonly-source');
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
  return Object.freeze({get:async path=>{
    const allowed=path==='/users/@me'||path===role||path===channel||
      (path.startsWith(member)&&SNOW.test(path.slice(member.length)))||
      (path.startsWith(channel+'/messages?limit=100')&&
        (path===channel+'/messages?limit=100'||
          /^&before=[1-9]\d{16,21}$/.test(path.slice((channel+'/messages?limit=100').length))));
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
    return {status:200,data};
  }});
}
async function main(){
  try{
    const cfg=configFromEnvironment(process.env);
    const client=createDiscordReadClient({
      fetchImpl:fetch,token:process.env.DISCORD_BOT_TOKEN,config:cfg
    });
    const report=await scanKingsInvitationDiscordSource({
      client,config:cfg,asOfUtc:new Date().toISOString()
    });
    if(report.safeToActivate!==false||
      report.freeSlotsCertified!==false||
      report.originalOrganizerResponsesIndependentlyVerified!==false||
      report.eventBookingsCreated!==0||
      report.staffApprovalsCommitted!==0)fail();
    // Strict fixed output: never serialize privateClaimsDoNotLog or report.
    process.stdout.write(
      'KINGS_INVITATION_GET_ONLY_SOURCE_OBSERVED; '+
      'STAFF_STATUS_CLAIMS_UNVERIFIED; ORGANIZER_REPLIES_NOT_CERTIFIED; '+
      'NO_BOOKING_OR_PRODUCTION_ACTIVATION\n'
    );
  }catch{
    process.stderr.write(ERROR+'\n');
    process.exitCode=1;
  }
}
if(require.main===module)main();
module.exports={configFromEnvironment,createDiscordReadClient};
