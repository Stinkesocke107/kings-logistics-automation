'use strict';
// NOT LIVE: prototype for authenticated, read-only Discord dashboard query.
// The real host must ACK or defer Discord interactions within its deadlines;
// this module does not register commands, send responses or hold credentials.
const {readSignedInteraction,authorizeSignedInteraction}=require('./event-capacity-discord-auth');
const {validateLedger,privateDecisions}=require('./event-capacity-decision-ledger');
const {evaluateConvoyReports}=require('./event-capacity-adapter');
const {projectDashboard,ephemeralResponse}=require('./event-capacity-dashboard');
const ERROR='Kings Event Capacity private dashboard request not authorized or ready.';
function fail(){throw new Error(ERROR);}
function isCommand(input){
  return input&&input.type===2&&input.data&&typeof input.data==='object'&&
    input.data.name==='event-capacity'&&
    !input.data.options?.length;
}
async function handlePrivateCapacityRead({signed,authorization,loadTrustedSnapshot,nowMs=Date.now()}={}){
  if(!signed||!authorization||typeof loadTrustedSnapshot!=='function'||
     !Number.isFinite(nowMs))fail();
  // Verify the exact command *before* using bot token or loading private data.
  const request=readSignedInteraction({...signed,nowMs});
  if(!isCommand(request))fail();
  const auth=await authorizeSignedInteraction({...signed,...authorization,nowMs});
  if(auth.interactionId!==String(request.id)||
     auth.guildId!==String(request.guild_id)||
     auth.channelId!==String(request.channel_id))fail();
  const guildId=String(authorization.guildId),forumId=String(authorization.forumId||'');
  if(!/^\d{17,22}$/.test(forumId)||auth.guildId!==guildId)fail();
  // loadTrustedSnapshot is a privileged, internal server service, never a
  // user-provided callback. It MUST attest origin/integrity and return a
  // decrypted, scoped ledger from the private transactional store.
  let snapshot;
  try{
    snapshot=await loadTrustedSnapshot({guildId,forumId});
  }catch{fail();}
  if(!snapshot||typeof snapshot!=='object'||
     !snapshot.report||!snapshot.overview||!snapshot.ledger)fail();
  try{validateLedger(snapshot.ledger,{guildId,forumId});}catch{fail();}
  let result;
  try{
    result=evaluateConvoyReports(snapshot.report,snapshot.overview,{
      nowMs,trustedSource:snapshot.integrityVerified===true,
      expectedGuildId:guildId,expectedForumId:forumId,
      classifications:privateDecisions(snapshot.ledger)
    });
  }catch{fail();}
  // Never return raw source data, staff names, event ID or approval references.
  return ephemeralResponse(projectDashboard(result.capacity,{nowMs}));
}
module.exports={handlePrivateCapacityRead};
