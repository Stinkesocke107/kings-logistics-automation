'use strict';
// DRAFT/OFFLINE ONLY. Injected synthetic transport does NOT connect to
// Discord. The returned source receipt includes private channel/cursor IDs
// and must remain in private in-memory testing ONLY; never publish it.
// To perform real reads later, implement separate CEO-approved authenticated
// privacy-scoped collector and evidence store, not a direct production import.
const {createHash}=require('node:crypto');
const {makeKingsDiscordReadOnlyRequest,reduceKingsDiscordReadOnlyPage}
  =require('./event-capacity-discord-rest-readonly-contract');
const ERROR='Kings Event Capacity offline Discord source replay refused.';
const STATUS=new Set(['ok','forbidden','not-found','rate-limited','error']);
function fail(){throw new Error(ERROR);}
function validTimestamp(s){
  if(typeof s!=='string'||!/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)||
    !Number.isFinite(Date.parse(s))||new Date(s).toISOString()!==s)fail();
  return s;
}
function errorPage(fetchedAtUtc){
  return Object.freeze({status:'error',itemCount:0,hasMore:false,
    nextCursor:null,responseDigest:createHash('sha256')
      .update('kings-discord-synthetic-transport-error-v1').digest('hex'),
    fetchedAtUtc,providerResponseAuthenticated:false,
    sourceRecordContentsRetained:false,rateLimitRetried:false,
    requestWasGetOnly:true});
}
async function replayKingsDiscordSyntheticSource({
  guildId,channelId,sourceKind,stream,
  transport,nowUtc,maxPages=5,limit=100,mode
}={}){
  try{
    if(mode!=='INJECTED_SYNTHETIC_ONLY'||
      typeof transport!=='function'||
      !Number.isSafeInteger(maxPages)||maxPages<1||maxPages>50||
      !Number.isSafeInteger(limit)||limit<1||limit>100)fail();
    const at=validTimestamp(nowUtc);
    const pages=[];
    let before=null,unfinished=false;
    let total=0;
    for(let i=0;i<maxPages;i++){
      const plan=makeKingsDiscordReadOnlyRequest({
        guildId,channelId,sourceKind,stream,before,limit
      });
      let result;
      try{
        // The injected callback sees a canonical GET-only route. It is an
        // IN-MEMORY test fixture, not a stored or network-connected token.
        const supplied=await transport(Object.freeze({
          method:plan.method,origin:plan.origin,path:plan.path
        }));
        result=reduceKingsDiscordReadOnlyPage({
          request:plan,response:supplied,fetchedAtUtc:at
        });
      }catch{
        result=errorPage(at);
      }
      if(!STATUS.has(result.status))fail();
      total+=result.itemCount;
      if(total>50000)fail();
      pages.push(Object.freeze({
        index:i,requestCursor:before,nextCursor:result.nextCursor,
        hasMore:result.hasMore,status:result.status,
        itemCount:result.itemCount,responseDigest:result.responseDigest,
        fetchedAtUtc:result.fetchedAtUtc
      }));
      if(result.status!=='ok')break;
      if(!result.hasMore)break;
      if(i===maxPages-1){unfinished=true;break;}
      before=result.nextCursor;
      if(before===null)fail();
    }
    if(pages.length===0)fail();
    const last=pages.at(-1);
    if(last.hasMore||last.status!=='ok')unfinished=true;
    const counts=Object.freeze({
      pagesAttempted:pages.length,itemsObserved:total,
      failedPages:pages.filter(p=>p.status!=='ok').length,
      outstandingPagesOrProviderErrors:unfinished
    });
    return Object.freeze({
      mode:'INJECTED_SYNTHETIC_ONLY',
      visibility:'PRIVATE_ONLY',readOnly:true,
      // Strictly private ephemeral in-memory receipt for composing the
      // existing offline history-audit; NEVER expose in UI/logs.
      privateReceiptDoNotLog:Object.freeze({channelId,stream,pages}),
      counts,
      sourceProviderAccessAuthenticated:false,
      providerResponseAuthenticated:false,
      actualDiscordNetworkRequestsMadeByModule:0,
      sourceMessagesOrContentRetained:false,
      replayResultNotActualCompletenessProof:true,
      canApproveRealBookings:false,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={replayKingsDiscordSyntheticSource};
