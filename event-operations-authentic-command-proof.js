'use strict';
// #18: opt-in GET-only replay proof for one newly persisted genuine Event Staff
// command batch. This verifies source consistency, NOT Event approval/slots.
// Keep all sensitive Git/Discord evidence out of public Actions logs.
const fs=require('node:fs');
const path=require('node:path');
const {decryptEventState}=require('./event-leadership-state');
const {ingest,roleIdsFromSecret}=require('./event-operations-discord-review-source');
const {renderReviewSummary}=require('./event-operations-manual-review-state');
const {run:verifyStoredDashboard}=require('./event-review-dashboard-readonly-proof');

const STATE=path.join(__dirname,'data/event-leadership-report-state.json');
const MAX_PROOF_DELAY_MS=6*60*60*1000;
function refuse(){throw Error('Kings Event genuine Staff command proof unverified');}
function canonical(x){return JSON.stringify(x);}
function readEncrypted(read,file,secret){
  let container;
  try{container=JSON.parse(read(file,'utf8'));}catch{refuse();}
  if(container?.encrypted!==true||container?.algorithm!=='aes-256-gcm')
    refuse();
  try{return {container,state:decryptEventState(container,secret)};}
  catch{refuse();}
}
function mustAdvance(prior,next){
  const before=prior?.discordReviewCursor;
  const after=next?.discordReviewCursor;
  if(!(before==='0'||typeof before==='string'&&/^\d{17,22}$/.test(before))||
    !(typeof after==='string'&&/^\d{17,22}$/.test(after))||
    BigInt(after)<=BigInt(before))refuse();
}
async function verify({
  env=process.env,nowMs=Date.now(),read=fs.readFileSync,
  transport=fetch,replay=ingest,readback=verifyStoredDashboard,
  summary=renderReviewSummary
}={}){
  // This is an explicit manual GitHub Actions check, never a live command
  // processor or scheduled write-capable job.
  if(env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
    env.INPUT_REPORT!=='command-proof'||
    !Number.isSafeInteger(nowMs)||nowMs<=0||
    typeof env.RUNNER_TEMP!=='string'||!path.isAbsolute(env.RUNNER_TEMP)||
    typeof read!=='function'||typeof transport!=='function'||
    typeof replay!=='function'||typeof readback!=='function'||
    typeof summary!=='function')refuse();
  const secret=String(env.DRIVER_STATE_KEY||'');
  if(Buffer.byteLength(secret,'utf8')<32||
    typeof env.DISCORD_BOT_TOKEN!=='string'||!env.DISCORD_BOT_TOKEN)
    refuse();
  const channelId=String(env.KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID||'');
  if(!/^\d{17,22}$/.test(channelId))refuse();
  const staffRoleIds=roleIdsFromSecret(
    env.KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS);
  const before=readEncrypted(read,path.join(env.RUNNER_TEMP,
    'kings-event-command-before.json'),secret);
  const after=readEncrypted(read,path.join(env.RUNNER_TEMP,
    'kings-event-command-after.json'),secret);
  const current=readEncrypted(read,STATE,secret);
  // The stored snapshot must still be the current encrypted main state.
  // No source/report refresh, intermediate journal or unrelated update
  // may be mistaken for the exact command that is under review.
  if(canonical(after.container)!==canonical(current.container)||
     canonical(before.state)===canonical(after.state))refuse();
  mustAdvance(before.state,after.state);
  const timestamp=after.state.updatedAt;
  if(typeof timestamp!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(timestamp))
    refuse();
  const commandMs=Date.parse(timestamp);
  if(!Number.isSafeInteger(commandMs)||commandMs<=0||
    commandMs>nowMs||nowMs-commandMs>MAX_PROOF_DELAY_MS)refuse();
  const originalReviews=canonical(before.state.operationReviews||[]);
  const currentReviews=canonical(after.state.operationReviews||[]);
  if(originalReviews===currentReviews||
    summary(before.state,commandMs)===summary(after.state,commandMs))
    refuse();
  // Re-run the ACTUAL source/role-checked Discord command parser against
  // the exact previous encrypted snapshot at the recorded journal time.
  // Any extra/new/missing command, revoked role, stale token, malformed
  // source, changed cursor, or different audit fails closed.
  const reproduced=await replay({
    state:before.state,secret,token:env.DISCORD_BOT_TOKEN,
    channelId,staffRoleIds,transport,nowMs:commandMs
  });
  if(reproduced?.mode!=='SOURCE_REVIEWS_RECORDED'||
    reproduced.changed!==true||
    reproduced.readOnlyDiscord!==true||
    canonical(reproduced.state)!==canonical(after.state))refuse();
  // Finally GET the current owner-bot-authored protected Event dashboard.
  // Require fresh Event+Invitation sources; "Unavailable" is not a pass.
  const delivered=await readback({
    env:{DRIVER_STATE_KEY:secret,DISCORD_BOT_TOKEN:env.DISCORD_BOT_TOKEN,
      KINGS_EVENT_READBACK_REQUIRE_FRESH_SOURCE:'true'},
    read,transport,nowMs
  });
  if(delivered?.status!=='VERIFIED'||delivered.readOnlyDiscord!==true||
    delivered.discordWrites!==0||delivered.bookingsCreated!==0)
    refuse();
  return Object.freeze({
    status:'EVENT_STAFF_COMMAND_TO_STORED_DASHBOARD_VERIFIED',
    readOnly:true,discordWrites:0,bookingsCreated:0,
    fullHistoricalEvidenceVerified:false,staffEventApprovalsVerified:false,
    finalOwnerAcceptance:false
  });
}
async function main(){
  try{
    const result=await verify();
    console.log('Kings Event Operations: '+result.status+
      ' (current source/role replay and stored readback only; no Event approval).');
    return result;
  }catch{
    console.error('Kings Event Operations: COMMAND_PROOF_UNVERIFIED');
    process.exitCode=1;
    return Object.freeze({status:'COMMAND_PROOF_UNVERIFIED',
      readOnly:true,discordWrites:0,bookingsCreated:0});
  }
}
if(require.main===module)main();
module.exports={verify,main,MAX_PROOF_DELAY_MS};
