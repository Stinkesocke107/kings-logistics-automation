'use strict';
// #18: independent GET-only proof that the CURRENT AES-protected Event review
// progress is actually visible in the existing, owner-bot Event dashboard.
// Never process commands, publish, alter roles, or log private source data.
const fs=require('node:fs');
const path=require('node:path');
const {decryptEventState}=require('./event-leadership-state');
const {renderReviewSummary}=require('./event-operations-manual-review-state');
const {renderInvitationDashboardSource,trustedInvitationObservation}=require('./event-invitation-tracker-source');
const {trustedEventObservation}=require('./event-leadership-observation');
const ROOT=__dirname;
const EVENT=path.join(ROOT,'data/event-leadership-report-state.json');
const DASH=path.join(ROOT,'data/leadership-dashboard-state.json');
const CHANNEL='1551675735633297418';
const API='https://discord.com/api/v10';
const ID=/^\d{17,22}$/;
const TITLE='📅 Kings Event Leadership Dashboard';
const FIELD='📝 Event Operations — Manual Staff Progress';
const INVITATION_FIELD='✉️ Invitation Tracker — Source Review';
function fail(){throw Error('Kings private Event dashboard delivery unverified');}
async function run({env=process.env,read=fs.readFileSync,
  transport=fetch,nowMs=Date.now()}={}){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0||
     typeof env.DISCORD_BOT_TOKEN!=='string'||!env.DISCORD_BOT_TOKEN||
     typeof env.DRIVER_STATE_KEY!=='string'||
     Buffer.byteLength(env.DRIVER_STATE_KEY,'utf8')<32||
     typeof transport!=='function')fail();
  const encoded=JSON.parse(read(EVENT,'utf8'));
  if(encoded?.encrypted!==true||encoded?.algorithm!=='aes-256-gcm')fail();
  const privateState=decryptEventState(encoded,env.DRIVER_STATE_KEY);
  // Ordinary scheduled delivery verification can correctly prove that an
  // "Unavailable" embed matches its source. That alone is not source
  // acceptance. Only the manually requested integrated proof requires both
  // genuine source observations to be fresh and the Forum tags reconciled.
  if(env.KINGS_EVENT_READBACK_REQUIRE_FRESH_SOURCE==='true'){
    const event=trustedEventObservation(privateState.eventSourceObservation,nowMs);
    const invites=trustedInvitationObservation(
      privateState.invitationSourceObservation,nowMs);
    if(!event||!invites||invites.tagSchemaVerified!==true)fail();
  }
  const messageState=JSON.parse(read(DASH,'utf8'));
  const messageId=messageState?.messageIds?.event;
  if(!ID.test(messageId))fail();
  const get=async route=>{
    let response;
    try{
      response=await transport(API+route,{
        method:'GET',redirect:'error',
        headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN},
        signal:AbortSignal.timeout(15000)
      });
      if(!response?.ok)fail();
      const body=await response.text();
      if(typeof body!=='string'||body.length>120000)fail();
      return JSON.parse(body);
    }catch{fail()}
  };
  const [bot,message]=await Promise.all([
    get('/users/@me'),
    get('/channels/'+CHANNEL+'/messages/'+messageId)
  ]);
  if(!ID.test(String(bot?.id||''))||bot.bot!==true||
     String(message?.id)!==messageId||
     String(message?.channel_id)!==CHANNEL||
     String(message?.author?.id||'')!==bot.id||
     !Array.isArray(message?.embeds)||message.embeds.length!==1||
     message.embeds[0]?.title!==TITLE||
     !Array.isArray(message.embeds[0]?.fields))fail();
  const actual=message.embeds[0].fields.filter(x=>x?.name===FIELD);
  if(actual.length!==1||typeof actual[0].value!=='string'||
     actual[0].value!==renderReviewSummary(privateState,nowMs))
    fail();
  // The same stored bot-authored message must also reflect the freshest
  // read-only #15 invitation observation in this encrypted source. A stale
  // invitation field cannot be hidden by an otherwise matching Staff field.
  const invitation=message.embeds[0].fields.filter(
    x=>x?.name===INVITATION_FIELD);
  if(invitation.length!==1||typeof invitation[0].value!=='string'||
     invitation[0].value!==renderInvitationDashboardSource(
       privateState.invitationSourceObservation,nowMs))
    fail();
  return Object.freeze({status:'VERIFIED',readOnlyDiscord:true,
    encryptedSource:true,staffCommandsExecuted:0,discordWrites:0,
    originalStaffApprovalsVerified:false,bookingsCreated:0});
}
async function main(){
  try{
    const result=await run();
    console.log('Kings Event Staff review-to-dashboard: '+result.status+
      ' (existing protected state and stored bot message; no new Staff action claimed).');
  }catch{
    console.error('Kings Event Staff review-to-dashboard: UNVERIFIED');
    process.exitCode=1;
  }
}
if(require.main===module)main();
module.exports={run,main,FIELD,INVITATION_FIELD,TITLE,CHANNEL};
