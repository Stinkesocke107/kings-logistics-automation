'use strict';
// NOT LIVE: prototype for authenticated, read-only Discord dashboard query.
// The real host must ACK or defer Discord interactions within its deadlines;
// this module does not register commands, send responses or hold credentials.
const {readSignedInteraction,authorizeSignedInteraction}=require('./event-capacity-discord-auth');
const {validateLedger,privateDecisions}=require('./event-capacity-decision-ledger');
const {verifyPrivateSnapshot}=require('./event-capacity-snapshot-attestation');
const {adaptConvoyReports}=require('./event-capacity-adapter');
const {evaluate}=require('./event-capacity-core');
const {detailProjection,sanitizeDiscord,dateValid}=require('./event-capacity-day-view');
const {projectDashboard,ephemeralResponse}=require('./event-capacity-dashboard');
const {project:searchProjection,discordResponse:searchResponse,validateFilters}=require('./event-capacity-search');
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
  if(sub&&sub.type===1&&sub.name==='search'){
    const values=sub.options===undefined?[]:sub.options;
    if(!Array.isArray(values)||values.length>10)return null;
    const mapping={date_from:'dateFrom',date_to:'dateTo',type:'type',
      status:'status',quality:'quality',conflict:'conflict',
      exception:'exception',event_id:'eventId',sort:'sort'};
    const filters={},seen=new Set();
    let page=1;
    for(const option of values){
      if(!option||typeof option.name!=='string'||seen.has(option.name))return null;
      seen.add(option.name);
      if(option.name==='page'){
        if(option.type!==4||!Number.isSafeInteger(option.value)||
          option.value<1||option.value>1000)return null;
        page=option.value;
      }else{
        const key=mapping[option.name];
        if(!key||option.type!==3||typeof option.value!=='string')return null;
        filters[key]=option.value;
      }
    }
    try{validateFilters(filters);}catch{return null;}
    return {kind:'search',filters,page};
  }
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
  let sourceProof;
  try{
    validateLedger(snapshot.ledger,{guildId,forumId});
    sourceProof=verifyPrivateSnapshot(snapshot,{
      scope:{guildId,forumId},secret:authorization.snapshotSecret,nowMs
    });
  }catch{fail();}
  try{
    const input=adaptConvoyReports(snapshot.report,snapshot.overview,{
      nowMs,trustedSource:sourceProof.verified===true&&snapshot.integrityVerified===true,
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
    if(query.kind==='search'){
      return searchResponse(searchProjection(input,capacity,{
        guildId,filters:query.filters,page:query.page,nowMs
      }));
    }
    return ephemeralResponse(projectDashboard(capacity,{nowMs}));
  }catch{fail();}
}
module.exports={handlePrivateCapacityRead};
