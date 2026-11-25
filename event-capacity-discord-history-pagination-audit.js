'use strict';
// PRIVATE/OFFLINE/DRAFT: inspection of caller-supplied Discord scan metadata.
// No Discord read happens here. Passing source-claim pagination checks does
// NOT authenticate the provider, discover undisclosed channels, or recover
// edited/deleted messages. Never auto-release or approve Event Capacity.
const {createHmac}=require('node:crypto');
const {getKingsDiscordRequiredStreams}=require('./event-capacity-discord-rest-readonly-contract');
const ERROR='Kings Event Capacity Discord history scan audit invalid.';
const ID=/^[1-9]\d{16,21}$/;
const YM=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const TS=/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const SHA=/^[a-f0-9]{64}$/;
const TYPES=Object.freeze([
  'current-forum','legacy-forum','legacy-thread-parent','legacy-text'
]);
function cursor(value,stream){
  if(typeof value!=='string')fail();
  if(stream==='messages')return ID.test(value);
  if(stream==='active')return false; // Discord guild active threads are unpaged
  return TS.test(value)&&Number.isFinite(Date.parse(value))&&
    new Date(value).toISOString()===value;
}
function fail(){throw new Error(ERROR);}
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function exact(x,keys){
  if(!object(x)||Object.keys(x).sort().join('\0')!==keys.slice().sort().join('\0'))fail();
}
function date(x){
  if(typeof x!=='string'||!TS.test(x)||!Number.isFinite(Date.parse(x))||
    new Date(x).toISOString()!==x)fail();
  return Date.parse(x);
}
function ym(x){if(typeof x!=='string'||!YM.test(x))fail();return x;}
function plusMonth(m,n){
  const d=new Date(m+'-01T00:00:00.000Z');
  d.setUTCMonth(d.getUTCMonth()+n);
  return d.toISOString().slice(0,7);
}
function safe(n,max=20000){
  if(!Number.isSafeInteger(n)||n<0||n>max)fail();
  return n;
}
function digest(secret,guild,reason,ref){
  return 'discord-history:'+createHmac('sha256',secret)
    .update(['kings-source-pagination-v1',guild,reason,ref].join('\0'))
    .digest('hex').slice(0,32);
}
function auditKingsDiscordHistoryPagination({
  guildId,firstMonth,finalMonth,channels=[],scans=[],
  reviewSecret,nowMs
}={}){
  try{
    if(typeof guildId!=='string'||!ID.test(guildId)||
      !Number.isSafeInteger(nowMs)||nowMs<0||
      typeof reviewSecret!=='string'||
      Buffer.byteLength(reviewSecret,'utf8')<32||
      Buffer.byteLength(reviewSecret,'utf8')>4096||
      !Array.isArray(channels)||channels.length>100||
      !Array.isArray(scans)||scans.length>500)fail();
    const start=ym(firstMonth),end=ym(finalMonth);
    if(plusMonth(start,23)!==end||end>new Date(nowMs).toISOString().slice(0,7))fail();
    const months=Array.from({length:24},(_,i)=>plusMonth(start,i));
    const channelMap=new Map(),scanMap=new Map(),issues=new Map();
    function issue(reason,ref,priority='Review'){
      const key=digest(reviewSecret,guildId,reason,ref);
      if(!issues.has(key))issues.set(key,Object.freeze({
        issueKey:key,reason,priority,staffReviewRequired:true,
        sourceProviderAuthenticated:false,automaticResolutionAllowed:false
      }));
    }
    let currentForums=0;
    for(const ch of channels){
      exact(ch,['channelId','channelKind','firstCoveredMonth','lastCoveredMonth']);
      if(typeof ch.channelId!=='string'||!ID.test(ch.channelId)||
        channelMap.has(ch.channelId)||!TYPES.includes(ch.channelKind))fail();
      const first=ym(ch.firstCoveredMonth),last=ym(ch.lastCoveredMonth);
      if(first>last||first<start||last>end)fail();
      if(ch.channelKind==='current-forum')currentForums++;
      channelMap.set(ch.channelId,{kind:ch.channelKind,first,last});
    }
    if(currentForums!==1)fail();
    let claimedPages=0,claimedMessages=0,brokenChains=0,failedPageRequests=0,
      unfinishedStreams=0,missingStreams=0,completeClaimedStreams=0;
    for(const receipt of scans){
      exact(receipt,['channelId','stream','pages']);
      if(typeof receipt.channelId!=='string'||!channelMap.has(receipt.channelId)||
        typeof receipt.stream!=='string'||
        !getKingsDiscordRequiredStreams(channelMap.get(receipt.channelId).kind).includes(receipt.stream)||
        !Array.isArray(receipt.pages)||receipt.pages.length>500)fail();
      const k=receipt.channelId+':'+receipt.stream;
      if(scanMap.has(k))fail();
      let broken=false,failed=false,unfinished=false;
      let expected=null,complete=false;
      const cursors=new Set();
      if(receipt.stream==='active'&&receipt.pages.length>1)fail();
      for(const [i,page] of receipt.pages.entries()){
        exact(page,['index','requestCursor','nextCursor','hasMore',
          'status','itemCount','responseDigest','fetchedAtUtc']);
        if(!['ok','forbidden','not-found','rate-limited','error'].includes(page.status)||
          typeof page.hasMore!=='boolean'||typeof page.responseDigest!=='string'||
          !SHA.test(page.responseDigest)||typeof page.index!=='number')fail();
        const at=date(page.fetchedAtUtc);
        if(at>nowMs+60000)fail();
        const count=safe(page.itemCount,1000);
        if(page.requestCursor!==null&&!cursor(page.requestCursor,receipt.stream))fail();
        if(page.nextCursor!==null&&!cursor(page.nextCursor,receipt.stream))fail();
        if(receipt.stream==='active'&&
          (page.requestCursor!==null||page.nextCursor!==null||page.hasMore))fail();
        if(page.requestCursor!==null&&page.nextCursor!==null){
          // A valid cursor must progress strictly backwards through source
          // history, not repeat or jump forward and hide missing old pages.
          const next=receipt.stream==='messages'?
            BigInt(page.nextCursor)<BigInt(page.requestCursor):
            Date.parse(page.nextCursor)<Date.parse(page.requestCursor);
          if(!next)broken=true;
        }
        if(i!==page.index||page.requestCursor!==expected||
          (page.requestCursor!==null&&cursors.has(page.requestCursor)))broken=true;
        if(page.requestCursor!==null)cursors.add(page.requestCursor);
        if(page.status!=='ok'){
          failed=true;failedPageRequests++;
          if(count!==0||page.hasMore!==false||page.nextCursor!==null)fail();
        }else{
          claimedMessages+=count;
          if(claimedMessages>500000)fail();
          if(page.hasMore&&page.nextCursor===null)broken=true;
          if(!page.hasMore&&page.nextCursor!==null)broken=true;
        }
        if(!page.hasMore&&i!==receipt.pages.length-1)broken=true;
        if(page.hasMore&&page.nextCursor===page.requestCursor)broken=true;
        expected=page.nextCursor;
        claimedPages++;
      }
      if(receipt.pages.length===0)unfinished=true;
      else if(receipt.pages.at(-1).hasMore)unfinished=true;
      else if(receipt.pages.at(-1).status!=='ok')unfinished=true;
      complete=!broken&&!failed&&!unfinished;
      if(broken){brokenChains++;issue('pagination-cursor-chain-broken',k,'Urgent');}
      if(failed){issue('source-page-access-or-provider-error',k,'Urgent');}
      if(unfinished){unfinishedStreams++;issue('source-pagination-not-finished',k);}
      if(complete)completeClaimedStreams++;
      scanMap.set(k,{complete});
    }
    const incompleteByChannel=new Map();
    for(const [id,ch] of channelMap){
      let incomplete=0;
      for(const stream of getKingsDiscordRequiredStreams(ch.kind)){
        const state=scanMap.get(id+':'+stream);
        if(!state){
          missingStreams++;incomplete++;
          issue('required-source-stream-not-scanned',id+':'+stream);
        }else if(!state.complete)incomplete++;
      }
      incompleteByChannel.set(id,incomplete);
    }
    const rows=months.map(m=>{
      let n=0,broken=0;
      for(const [id,ch] of channelMap){
        if(ch.first<=m&&m<=ch.last){
          n++;broken+=incompleteByChannel.get(id);
        }
      }
      if(n===0)issue('month-has-no-claimed-original-source',m,'Urgent');
      return Object.freeze({
        month:m,claimedChannelSources:n,
        claimedRequiredStreamsIncomplete:broken,
        originalDiscordSourceIndependentlyAuthenticated:false,
        claimedSourceScanNeverCertifiesMonthComplete:true,
        availableSlotsCertified:false
      });
    });
    const items=[...issues.values()].sort((a,b)=>
      a.reason.localeCompare(b.reason)||a.issueKey.localeCompare(b.issueKey));
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      firstMonth:start,finalMonth:end,monthsRequired:24,
      suppliedCurrentForumClaims:currentForums,
      suppliedLegacyChannelClaims:channelMap.size-currentForums,
      suppliedScanClaims:scans.length,
      suppliedPageClaims:claimedPages,
      suppliedMessageCountClaims:claimedMessages,
      claimedCompletedStreams:completeClaimedStreams,
      streamsMissingScanClaims:missingStreams,
      brokenCursorChains:brokenChains,failedPageRequests,
      unfinishedPageStreams:unfinishedStreams,
      untrustedPaginationClaimsInternallyComplete:
        missingStreams===0&&brokenChains===0&&failedPageRequests===0&&
        unfinishedStreams===0,
      monthRows:Object.freeze(rows),
      issueCount:items.length,issueItems:Object.freeze(items),
      discoveredAllActualLegacyChannels:false,
      providerPaginationAuthenticityVerified:false,
      deletedMessagesActuallyRecovered:false,
      original24MonthHistoryCompletelyAuthenticated:false,
      currentDiscordReaderExecutedHere:false,
      realDiscordMessagesStoredHere:false,
      bookingCountChanged:0,staffApprovalsCommitted:0,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={auditKingsDiscordHistoryPagination};
