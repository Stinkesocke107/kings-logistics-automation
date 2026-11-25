'use strict';
// Explicitly manual shadow diagnostic. Reads local private reports only.
// No Discord API calls, network access, filesystem writes or raw event output.
const fs=require('node:fs');
const path=require('node:path');
const {evaluateConvoyReports}=require('./event-capacity-adapter');
const {unsealLedger,privateDecisions}=require('./event-capacity-decision-ledger');

function outsideWorkingTree(filename,cwd=process.cwd()){
  const file=fs.realpathSync(filename);
  const root=fs.realpathSync(cwd);
  const relative=path.relative(root,file);
  if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))){
    throw new Error('Private classifications must be mounted outside the public repository');
  }
  return file;
}
function loadPrivateDecisions(env=process.env){
  const location=env.KINGS_EVENT_CAPACITY_PRIVATE_DECISIONS_PATH;
  if(!location)return {};
  if(!path.isAbsolute(location))throw new Error('Private decisions require an absolute external path');
  const content=JSON.parse(fs.readFileSync(outsideWorkingTree(location),'utf8'));
  // Private state MUST be authenticated/encrypted. Reject legacy plain JSON:
  // keys and staff approvals never belong in a public Git repository.
  const state=unsealLedger(content,env.KINGS_EVENT_CAPACITY_STATE_KEY,{
    guildId:env.DISCORD_GUILD_ID,forumId:env.DISCORD_CONVOY_FORUM_ID
  });
  return privateDecisions(state);
}
function summarize(result){
  const adapter=result.adapter||{};
  const capacity=result.capacity||{};
  const byReason={};
  for(const item of [...(adapter.issues||[]),...(capacity.issues||[])]){
    const code=String(item.code||'unknown');
    byReason[code]=(byReason[code]||0)+1;
  }
  const warningCodes={};
  for(const item of capacity.warnings||[]){
    const code=String(item.code||'unknown');
    warningCodes[code]=(warningCodes[code]||0)+1;
  }
  // Aggregate counts only: never print Event IDs, staff IDs, dates, event
  // titles, confidential publication links, classified roles or raw evidence.
  return {
    mode:'SHADOW_READ_ONLY',
    sourceVerifiedFresh:adapter.dataFresh===true,
    sourceRecords:adapter.counts||null,
    acceptedCount:capacity.counted||0,
    pendingCount:Array.isArray(capacity.pending)?capacity.pending.length:0,
    globalUncertainty:capacity.globalUncertainty!==false,
    uncertainUtcDayCount:Array.isArray(capacity.uncertainDates)?capacity.uncertainDates.length:0,
    issueTypes:byReason,
    warningTypes:warningCodes,
    liveDeployment:false
  };
}
function run(env=process.env){
  const reader=filename=>JSON.parse(fs.readFileSync(path.join('output',filename),'utf8'));
  const report=reader('convoy-check-results.json');
  const overview=reader('convoy-overview.json');
  const result=evaluateConvoyReports(report,overview,{
    trustedSource:env.KINGS_EVENT_CAPACITY_SOURCE_VERIFIED==='true',
    expectedGuildId:env.DISCORD_GUILD_ID||'',
    expectedForumId:env.DISCORD_CONVOY_FORUM_ID||'',
    classifications:loadPrivateDecisions(env)
  });
  return summarize(result);
}
if(require.main===module){
  try{
    console.log(JSON.stringify(run(),null,2));
  }catch(error){
    // Do not echo potentially sensitive content from a failed JSON parsing
    // operation or a private source path.
    console.error('Kings Event Capacity shadow diagnostic failed. Check source files and configuration privately.');
    process.exitCode=1;
  }
}
module.exports={run,summarize,outsideWorkingTree,loadPrivateDecisions};
