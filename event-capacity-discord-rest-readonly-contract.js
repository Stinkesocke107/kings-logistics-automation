'use strict';
// PRIVATE, OFFLINE, DRAFT. Pure Discord v10 GET request and reply contract
// for a later explicit CEO-authorized source reader. This module NEVER sends
// network traffic, receives a bot token, reads env, or writes Discord data.
// Request paths and continuation cursors are PRIVATE MEMORY DATA; keep out
// of public logs, CI artifacts, PR comments, and public Discord messages.
const {createHash}=require('node:crypto');
const ERROR='Kings Discord historical read-only source contract refused.';
const ID=/^[1-9]\d{16,21}$/;
const TS=/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const ORIGIN='https://discord.com/api/v10';
const STREAMS={
  'current-forum':['active','archived-public'],
  'legacy-forum':['active','archived-public'],
  'legacy-thread-parent':['active','archived-public','archived-private'],
  'legacy-text':['messages']
};
function fail(){throw new Error(ERROR);}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;}
function utc(x){
  if(typeof x!=='string'||!TS.test(x)||!Number.isFinite(Date.parse(x))||
    new Date(x).toISOString()!==x)fail();
  return x;
}
function snow(x){if(typeof x!=='string'||!ID.test(x))fail();return x;}
function makeKingsDiscordReadOnlyRequest({
  guildId,channelId,sourceKind,stream,before=null,limit=100
}={}){
  try{
    snow(guildId);snow(channelId);
    if(!Object.hasOwn(STREAMS,sourceKind)||
      !STREAMS[sourceKind].includes(stream)||
      !Number.isSafeInteger(limit)||limit<1||limit>100)fail();
    const isActive=stream==='active';
    if(isActive&&before!==null)fail();
    if(!isActive&&before!==null){
      if(stream==='messages')snow(before);
      else utc(before);
    }
    let path;
    if(isActive)path='/guilds/'+guildId+'/threads/active';
    else if(stream==='messages'){
      path='/channels/'+channelId+'/messages?limit='+limit+
        (before===null?'':'&before='+encodeURIComponent(before));
    }else{
      const type=stream==='archived-public'?'public':'private';
      path='/channels/'+channelId+'/threads/archived/'+type+'?limit='+limit+
        (before===null?'':'&before='+encodeURIComponent(before));
    }
    return Object.freeze({
      method:'GET',origin:ORIGIN,path,channelId,guildId,sourceKind,
      stream,before,limit,
      mayWrite:false,noAuthorizationHeaderIncluded:true,
      runtimeTransportNotProvided:true,
      privateRequestDoNotLog:true,
      cannotCertifyOriginalHistory:true,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
function reduceKingsDiscordReadOnlyPage({request,response,fetchedAtUtc}={}){
  try{
    if(!plain(request)||request.method!=='GET'||
      request.origin!==ORIGIN||request.mayWrite!==false||
      request.noAuthorizationHeaderIncluded!==true||
      request.privateRequestDoNotLog!==true||!plain(response)||
      !Number.isSafeInteger(response.status)||
      ![200,403,404,429,500,502,503,504].includes(response.status))
      fail();
    const canonical=makeKingsDiscordReadOnlyRequest({
      guildId:request.guildId,channelId:request.channelId,
      sourceKind:request.sourceKind,stream:request.stream,
      before:request.before,limit:request.limit
    });
    if(canonical.path!==request.path)fail();
    utc(fetchedAtUtc);
    const nonSuccess=response.status!==200;
    if(nonSuccess){
      // All unsuccessful statuses return only sanitized metadata. Never
      // trust an error body; it can contain private or attacker data.
      return Object.freeze({
        status:response.status===403?'forbidden':
          response.status===404?'not-found':
          response.status===429?'rate-limited':'error',
        itemCount:0,hasMore:false,nextCursor:null,
        responseDigest:createHash('sha256')
          .update('kings-discord-failed-page-v1:'+response.status).digest('hex'),
        fetchedAtUtc,providerResponseAuthenticated:false,
        sourceRecordContentsRetained:false,rateLimitRetried:false,
        requestWasGetOnly:true,
        freeSlotsCertified:false,safeToActivate:false
      });
    }
    let items,hasMore=false,nextCursor=null;
    if(request.stream==='active'){
      if(!plain(response.data)||!Array.isArray(response.data.threads)||
        response.data.threads.length>20000)fail();
      const seen=new Set();
      items=response.data.threads.filter(t=>{
        if(!plain(t)||typeof t.id!=='string'||!ID.test(t.id)||
          typeof t.parent_id!=='string'||!ID.test(t.parent_id)||
          seen.has(t.id))fail();
        seen.add(t.id);
        return t.parent_id===request.channelId;
      });
      // Active guild threads are not paginated; this only sees what the
      // permissioned caller could access at that instant.
    }else if(request.stream==='messages'){
      if(!Array.isArray(response.data)||response.data.length>request.limit)fail();
      items=response.data;
      let previous=null;
      for(const row of items){
        if(!plain(row)||typeof row.id!=='string'||!ID.test(row.id))fail();
        if(row.channel_id!==undefined&&
          row.channel_id!==request.channelId)fail();
        if(previous!==null&&BigInt(row.id)>=BigInt(previous))fail();
        previous=row.id;
      }
      if(items.length===request.limit){
        nextCursor=items.at(-1).id;hasMore=true;
        if(request.before!==null&&
          BigInt(nextCursor)>=BigInt(request.before))fail();
      }
    }else{
      if(!plain(response.data)||!Array.isArray(response.data.threads)||
        typeof response.data.has_more!=='boolean'||
        response.data.threads.length>request.limit)fail();
      items=response.data.threads;
      let prev=Infinity;
      const ids=new Set();
      for(const thread of items){
        if(!plain(thread)||typeof thread.id!=='string'||
          !ID.test(thread.id)||thread.parent_id!==request.channelId||
          !plain(thread.thread_metadata)||typeof thread.thread_metadata.archive_timestamp!=='string'||
          ids.has(thread.id))fail();
        ids.add(thread.id);
        const timestamp=utc(
          new Date(thread.thread_metadata.archive_timestamp).toISOString());
        const ms=Date.parse(timestamp);
        if(ms>prev)fail();
        prev=ms;
      }
      hasMore=response.data.has_more;
      if(hasMore){
        if(items.length===0)fail();
        nextCursor=new Date(items.at(-1).thread_metadata.archive_timestamp)
          .toISOString();
        if(request.before!==null&&
          Date.parse(nextCursor)>=Date.parse(request.before))fail();
      }
    }
    const recordIds=items.map(x=>x.id);
    const hash=createHash('sha256')
      .update(JSON.stringify(['kings-discord-source-metadata-v1',
        request.stream,request.channelId,recordIds,nextCursor]))
      .digest('hex');
    return Object.freeze({
      status:'ok',itemCount:items.length,
      hasMore,nextCursor,responseDigest:hash,fetchedAtUtc,
      providerResponseAuthenticated:false,
      sourceRecordContentsRetained:false,
      rateLimitRetried:false,requestWasGetOnly:true,
      freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={makeKingsDiscordReadOnlyRequest,
  reduceKingsDiscordReadOnlyPage};
