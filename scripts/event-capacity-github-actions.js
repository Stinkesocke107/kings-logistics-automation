'use strict';
// GitHub-hosted, short-lived Event Capacity worker (no server).
// The workflow explicitly gates it; never print secrets, source or staff data.
const {createPrivateGitHubReader}=require('../event-capacity-github-source');
const {verifySourceFreshness,createDiscordRest,publishGithubOnlyStatus}
  =require('../event-capacity-github-only');
const {pollPrivateStaffCommands}=require('../event-capacity-github-staff-commands');
const {inspectStaffEvidence,publicSafeAggregate}
  =require('../event-capacity-github-decision-evidence');
const {monthlyFromReports}
  =require('../event-capacity-live-calendar-summary');
const {inspectKingsPrivateEventCapacityChannel}
  =require('../event-capacity-private-channel-preflight');
const {inspectKingsEventSourcePreflight}
  =require('../event-capacity-source-preflight');
async function main(env=process.env){
  if(env.GITHUB_REF!=='refs/heads/main'||
    !['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))
    throw Error('Kings Event Capacity action is not enabled for this trusted main workflow.');
  const mode=env.KINGS_EVENT_CAPACITY_MODE||
    (env.GITHUB_EVENT_NAME==='schedule'?'sync':'preview');
  if(!['preview','preflight','source-preflight'].includes(mode)&&
    env.KINGS_EVENT_CAPACITY_ENABLED!=='true')
    throw Error('Kings Event Capacity Discord writes were not enabled.');
  if(!['preview','preflight','source-preflight','sync','bootstrap']
    .includes(mode)||
    ['bootstrap','preflight','source-preflight'].includes(mode)&&
      env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
    ['preflight','source-preflight'].includes(mode)&&
      env.CONVOY_DRY_RUN!=='true')
    throw Error('Kings Event Capacity action mode not authorized.');
  const config={
    guildId:env.KINGS_EVENT_CAPACITY_GUILD_ID,
    channelId:env.KINGS_EVENT_CAPACITY_CHANNEL_ID,
    messageId:env.KINGS_EVENT_CAPACITY_MESSAGE_ID||null,
    roles:{
      'Event Coordination':env.KINGS_EVENT_COORDINATION_ROLE_ID,
      'Event Leadership':env.KINGS_EVENT_LEADERSHIP_ROLE_ID,
      CEO:env.KINGS_EVENT_CEO_ROLE_ID
    }
  };
  // Manual source-only check reads the latest SUCCESSFUL SCHEDULED
  // Convoy ZIP, validates its inventory and projects the same 12-month
  // calendar as live sync. It never needs a Discord token/channel/role.
  if(mode==='source-preflight'){
    const reader=createPrivateGitHubReader({token:env.GITHUB_TOKEN});
    const result=await inspectKingsEventSourcePreflight({reader});
    console.log('Kings Event Capacity GitHub source preflight:',result.status);
    if(result.status!=='SOURCE_CALENDAR_PREVIEW_READY')
      throw Error('Kings Event Capacity source calendar not verified.');
    return {state:result.status,readOnly:true,discordWrites:0};
  }
  // CEO-invoked preparation check: Discord GET requests only, requires
  // an actual bot credential but deliberately bypasses the WRITE enable flag.
  // No arbitrary account/channel/Staff details or token ever reach job logs.
  if(mode==='preflight'){
    const client=createDiscordRest({token:env.DISCORD_BOT_TOKEN});
    const result=await inspectKingsPrivateEventCapacityChannel({client,config});
    console.log('Kings Event Capacity read-only Discord preflight:',result.state);
    if(!['READY_FOR_MANUAL_BOOTSTRAP','READY_FOR_READ_ONLY_SYNC']
      .includes(result.state))
      throw Error('Kings Event Capacity private Discord configuration not ready.');
    return {state:result.state,readOnly:true,discordWrites:0};
  }
  // Preview without Discord writes; bootstrap is one-off manual and
  // intentionally carries no private Convoy source into the new message.
  if(mode==='preview'||mode==='bootstrap'){
    const client=mode==='bootstrap'?
      createDiscordRest({token:env.DISCORD_BOT_TOKEN}):null;
    const result=await publishGithubOnlyStatus({
      client,config,mode,sourceAvailable:false,
      manualDispatch:env.GITHUB_EVENT_NAME==='workflow_dispatch'
    });
    // No sensitive channel/message IDs or private dashboard content in logs.
    return {state:result.state};
  }
  const reader=createPrivateGitHubReader({token:env.GITHUB_TOKEN});
  const client=createDiscordRest({token:env.DISCORD_BOT_TOKEN});
  const inspect=env.KINGS_EVENT_CAPACITY_EVIDENCE_ENABLED==='true'
    ?async ({report,overview,nowMs})=>publicSafeAggregate(
      await inspectStaffEvidence({
        client,config,report,overview,nowMs
      })
    ):null;
  const freshness=await verifySourceFreshness(reader,Date.now(),inspect,
    monthlyFromReports);
  const result=await publishGithubOnlyStatus({
    client,config,mode:'sync',sourceAvailable:freshness.sourceAvailable,
    evidenceStatus:freshness.evidenceStatus||null,
    evidenceAggregate:freshness.evidenceAggregate||null,
    calendarSnapshot:freshness.calendarSnapshot||null
  });
  // Separate CEO-gated, delayed read-only text replies. This does not
  // enable Discord slash commands, approvals, state writes or staff tasks.
  // Discord private message history is a bounded dedupe aid, not durable
  // proof of exactly-once delivery across deleted replies / busy channels.
  let handled=0;
  if(env.KINGS_EVENT_CAPACITY_COMMANDS_ENABLED==='true'){
    const commands=await pollPrivateStaffCommands({
      client,config,sourceAvailable:freshness.sourceAvailable
    });
    handled=commands.replied;
  }
  return {state:result.state,sourceAvailable:freshness.sourceAvailable,
    classificationsVerified:false,verifiedFreeSlots:false,
    calendarPreviewStatus:freshness.calendarStatus||'Unavailable',
    staffReadReplies:handled};
}
if(require.main===module){
  main().then(result=>{
    // Fixed benign metadata only; never print Discord IDs, contents or keys.
    console.log('Kings Event Capacity GitHub-only run:',result.state);
    if(result.sourceAvailable===false)
      console.log('Capacity remains unverified; no free slots are confirmed.');
  }).catch(()=>{
    console.error('Kings Event Capacity GitHub-only run failed safely; no event approvals changed.');
    process.exitCode=1;
  });
}
module.exports={main};
