'use strict';
// NOT LIVE: prototype for authenticated, read-only Discord dashboard query.
// The real host must ACK or defer Discord interactions within its deadlines;
// this module does not register commands, send responses or hold credentials.
const {readSignedInteraction,authorizeSignedInteraction}=require('./event-capacity-discord-auth');
const {validateLedger,privateDecisions}=require('./event-capacity-decision-ledger');
const {adaptConvoyReports}=require('./event-capacity-adapter');
const {evaluate}=require('./event-capacity-core');
const {detailProjection,sanitizeDiscord,dateValid}=require('./event-capacity-day-view');
const {projectDashboard,ephemeralResponse}=require('./event-capacity-dashboard');
const ERROR='Kings Event Capacity private dashboard request not authorized or ready.';
function fail(){throw new Error(ERROR);}
function parseCommand(input){
  if(!input||input.type!==2||!input.data||
     typeof input.data!=='object'||Array.isArray(input.data)||
     input.data.name!=='event-capacity')return null;
  const options=input.data.options;
  if(options===undefined||(Array.isArray(options)&&options.length===0))
    return {kind:'calendar'};
  if(!Array.isArray(options)||options.length!==1)return null;
  const sub=options[0];
  if(!sub||sub.type!==1||sub.name!=='day'||!Array.isArray(sub.options)||
     sub.options.length<1||sub.options.length>2)return null;
  const date=sub.options.filter(x=>x&&x.name==='date'&&x.type===3);
  const page=sub.options.filter(x=>x&&x.name==='page'&&x.type===4);
  if(date.length!==1||page.length>1||date.length+page.length!==sub.options.length||
     !dateValid(date[0].value)||page.length&&
       (!Number.isSafeInteger(page[0].value)||page[0].value<1||page[0].value>1000))return null;
  return {kind:'day',date:date[0].value,page:page.length?page[0].value:1};
}
async function handlePrivateCapacityRead({signed,authorization,loadTrustedSnapshot,nowMs=Date.now()}={}){
  if(!signed||!authorization||typeof loadTrustedSnapshot!=='function'||
     !Number.isFinite(nowMs))fail();
  // Verify the exact command *before* using bot token or loading private data.
  const request=readSignedInteraction({...signed,nowMs});
  const query=parseCommand(request);
  if(!query)fail();
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
  try{
    const input=adaptConvoyReports(snapshot.report,snapshot.overview,{
      nowMs,trustedSource:snapshot.integrityVerified===true,
      expectedGuildId:guildId,expectedForumId:forumId,
      classifications:privateDecisions(snapshot.ledger)
    });
    const capacity=evaluate(input.events,{dataFresh:input.dataFresh});
    // Only synthesized, limited private output leaves this service. Never
    // return raw source objects, free-text organizer data or ledger evidence.
    if(query.kind==='day'){
      return sanitizeDiscord(detailProjection(input,capacity,query.date,{
        guildId,page:query.page
      }));
    }
    return ephemeralResponse(projectDashboard(capacity,{nowMs}));
  }catch{fail();}
}
module.exports={handlePrivateCapacityRead};
