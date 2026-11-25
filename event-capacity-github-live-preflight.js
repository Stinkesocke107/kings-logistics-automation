'use strict';
// Read-only live GitHub metadata smoke test for PR #143 only.
// Never fetch artifacts or Discord API, never inspect private Event content,
// never write, and never log tokens, run IDs, Event or Staff identities.
const {createPrivateGitHubReader}=require('./event-capacity-github-source');
const {assertRun}=require('./event-capacity-private-import');
const REPO='Stinkesocke107/kings-logistics-automation';
const SAFE={
  visibility:'PUBLIC_SAFE_METADATA_ONLY',
  mode:'PR_READ_ONLY_PREFLIGHT',
  discordContacted:false,
  convoyCenterContacted:false,
  artifactsDownloaded:false,
  repositoryWritten:false,
  privateLedgerOpened:false,
  decisionCommitted:false,
  historicalCoverageCertified:false,
  freeSlotsCertified:false
};
function verifyContext(env){
  return env&&env.GITHUB_REPOSITORY===REPO&&
    env.GITHUB_EVENT_NAME==='pull_request'&&
    env.GITHUB_BASE_REF==='main'&&
    env.GITHUB_HEAD_REF==='feature/event-capacity-foundation-2026-11'&&
    env.KINGS_EVENT_CAPACITY_PREFLIGHT_ONLY==='true'&&
    env.GITHUB_REF?.startsWith('refs/pull/143/')&&
    typeof env.GITHUB_TOKEN==='string'&&
    env.GITHUB_TOKEN.length>=16&&
    typeof env.DISCORD_BOT_TOKEN!=='string'&&
    typeof env.KINGS_EVENT_CAPACITY_PRIVATE_DATA_TOKEN!=='string'&&
    typeof env.KINGS_EVENT_CAPACITY_PRIVATE_WITNESS_TOKEN!=='string';
}
async function probeReadOnlyGithub({env=process.env,transport=fetch,
  nowMs=Date.now()}={}){
  // The GITHUB_TOKEN is the built-in READ-ONLY pull_request token, not an
  // externally provisioned secret. No token provided to branch code if the
  // expected PR context cannot be verified.
  if(!verifyContext(env))
    return Object.freeze({...SAFE,state:'CONTEXT_REJECTED',
      githubMetadataVerified:false,scheduledSourceVerified:false});
  try{
    const reader=createPrivateGitHubReader({
      token:env.GITHUB_TOKEN,transport
    });
    const latest=await reader.getLatestScheduledRun({
      repository:REPO,nowMs
    });
    const full=await reader.getRun({repository:REPO,runId:latest.runId});
    const verified=assertRun(full,{
      nowMs,requestedRunId:latest.runId
    });
    if(full.event!=='schedule'||verified.attempt!==latest.attempt)
      throw Error('Unexpected run provenance');
    return Object.freeze({...SAFE,state:'SCHEDULED_METADATA_VERIFIED',
      githubMetadataVerified:true,scheduledSourceVerified:true});
  }catch{
    return Object.freeze({...SAFE,state:'SCHEDULED_METADATA_UNVERIFIED',
      githubMetadataVerified:false,scheduledSourceVerified:false});
  }
}
async function main(env=process.env){
  const result=await probeReadOnlyGithub({env});
  // Absolutely fixed allowlisted output; no sensitive source details.
  console.log('Kings Capacity read-only PR preflight:',result.state);
  console.log('Github-only diagnostic; Discord=NOT_CONTACTED; ARTIFACTS=NOT_DOWNLOADED; EVENT_WRITES=DISABLED; FREE_SLOTS=UNVERIFIED');
  if(result.state==='CONTEXT_REJECTED'){
    process.exitCode=1;
  }else if(result.state!=='SCHEDULED_METADATA_VERIFIED'){
    console.log('::warning::Scheduled Convoy Checker metadata not verified; no Event Capacity availability claims permitted.');
  }
  return result;
}
if(require.main===module){
  main().catch(()=>{
    console.error('Kings Capacity read-only preflight failed safely.');
    process.exitCode=1;
  });
}
module.exports={probeReadOnlyGithub,verifyContext,main};
