'use strict';
// GitHub-hosted, short-lived Event Capacity worker (no server).
// The workflow explicitly gates it; never print secrets, source or staff data.
const {createPrivateGitHubReader}=require('../event-capacity-github-source');
const {verifySourceFreshness,createDiscordRest,publishGithubOnlyStatus}
  =require('../event-capacity-github-only');
async function main(env=process.env){
  if(env.GITHUB_REF!=='refs/heads/main'||
    !['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))
    throw Error('Kings Event Capacity action is not enabled for this trusted main workflow.');
  const mode=env.KINGS_EVENT_CAPACITY_MODE||
    (env.GITHUB_EVENT_NAME==='schedule'?'sync':'preview');
  if(mode!=='preview'&&env.KINGS_EVENT_CAPACITY_ENABLED!=='true')
    throw Error('Kings Event Capacity Discord writes were not enabled.');
  if(!['preview','sync','bootstrap'].includes(mode)||
    mode==='bootstrap'&&env.GITHUB_EVENT_NAME!=='workflow_dispatch')
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
  const freshness=await verifySourceFreshness(reader);
  const client=createDiscordRest({token:env.DISCORD_BOT_TOKEN});
  const result=await publishGithubOnlyStatus({
    client,config,mode:'sync',sourceAvailable:freshness.sourceAvailable
  });
  return {state:result.state,sourceAvailable:freshness.sourceAvailable,
    classificationsVerified:false,verifiedFreeSlots:false};
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
