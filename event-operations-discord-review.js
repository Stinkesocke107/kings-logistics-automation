'use strict';
// Gated scheduled/private Discord operator — no Discord POST, PATCH, DELETE.
// Only the AES-GCM Event Leadership state and encrypted replay cursor change.
const fs=require('node:fs'),path=require('node:path');
const {decryptEventState,encryptEventState}=require('./event-leadership-state');
const {roleIdsFromSecret,ingest,preflight,SAFE_PREFLIGHT_CODES}=require('./event-operations-discord-review-source');
const STATE=path.join(__dirname,'data/event-leadership-report-state.json');
async function run({env=process.env,read=fs.readFileSync,
  write=fs.writeFileSync,transport=fetch,nowMs=Date.now()}={}){
  const mode=env.KINGS_EVENT_DISCORD_REVIEW_ENABLED;
  if(mode!=='ENABLED'&&mode!=='VERIFY_ONLY')
    return Object.freeze({status:'DISABLED',changed:false,readOnlyDiscord:true});
  if(env.GITHUB_REF!=='refs/heads/main'||
    !['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))
    throw Error('Kings Discord review source not authorized');
  const channelId=String(env.KINGS_EVENT_REVIEW_DISCORD_CHANNEL_ID||'');
  const roleIds=roleIdsFromSecret(env.KINGS_EVENT_REVIEW_DISCORD_ROLE_IDS);
  // Owner-only VERIFY_ONLY never loads private Event state, processes
  // commands or advances the encrypted journal cursor. A one-time manual
  // workflow input can request a bounded, read-only message-content proof.
  if(mode==='VERIFY_ONLY')
    return preflight({
      token:String(env.DISCORD_BOT_TOKEN||''),channelId,
      staffRoleIds:roleIds,transport,
      probeMessageAccess:env.GITHUB_EVENT_NAME==='workflow_dispatch'&&
        env.KINGS_EVENT_REVIEW_MESSAGE_ACCESS_PROBE==='YES'
    });
  const secret=String(env.DRIVER_STATE_KEY||'');
  if(secret.length<32)throw Error('Kings review private state unavailable');
  const encoded=JSON.parse(read(STATE,'utf8'));
  if(encoded?.encrypted!==true)
    throw Error('Kings Discord review must use existing encrypted Event state');
  const state=decryptEventState(encoded,secret);
  const checked=await ingest({
    state,secret,
    token:String(env.DISCORD_BOT_TOKEN||''),
    channelId,staffRoleIds:roleIds,transport,nowMs
  });
  if(!checked.changed)
    return Object.freeze({status:'NO_NEW_MESSAGES',changed:false,
      readOnlyDiscord:true});
  const protectedState=encryptEventState(checked.state,secret);
  write(STATE,JSON.stringify(protectedState,null,2)+'\n','utf8');
  return Object.freeze({status:checked.mode,changed:true,readOnlyDiscord:true,
    staffDecisionsVerified:false,bookingsCreated:0,discordWrites:0});
}
async function main(){
  try{
    const result=await run();
    console.log('Kings Event Operations Discord: '+result.status);
    return result;
  }catch(error){
    // Public logs may include a fixed, identifier-free failure category
    // ONLY in read-only VERIFY_ONLY mode. Never print the raw exception,
    // Discord URL/body, IDs, token or Event-state data.
    const category=process.env.KINGS_EVENT_DISCORD_REVIEW_ENABLED==='VERIFY_ONLY'&&
      SAFE_PREFLIGHT_CODES.has(error?.preflightCode)?
      ' ['+error.preflightCode+']':'';
    console.error('Kings Event Operations Discord: SOURCE_UNAVAILABLE'+category);
    process.exitCode=1;
    return Object.freeze({status:'SOURCE_UNAVAILABLE',
      changed:false,readOnlyDiscord:true,discordWrites:0});
  }
}
if(require.main===module)main();
module.exports={run,main};
