'use strict';

// MANUAL, explicit opt-in only. This publisher writes confidential case
// pages exclusively to a separately verified PRIVATE HR Discord channel.
// Never targets the original HR decision ledger or Driver identity register.
// No member/role changes, DELETE, public file writes or sensitive log output.
const {assertPrivateHrDecisionChannel}=require('./hr-driver-decision-source');
const {REGISTER_CHANNEL_ID}=require('./driver-register-completeness');

const DISCORD_API='https://discord.com/api/v10';
const ID=/^\d{17,20}$/;
const MARKER=/^👑 Kings HR Driver Case View \| (\d+)\/(\d+)\n/;
const MAX_PAGES=30;

function pageIndex(content){
  const m=MARKER.exec(String(content||''));
  if(!m)return null;
  const index=Number(m[1]),total=Number(m[2]);
  if(!Number.isSafeInteger(index)||!Number.isSafeInteger(total)||
     index<1||total<1||index>total)return null;
  return index;
}
function validatePrivatePages(pages){
  if(!Array.isArray(pages)||!pages.length||pages.length>MAX_PAGES) {
    throw new Error('Private Kings HR case view requires a bounded, complete case page set.');
  }
  const result=new Set();
  for(const [i,page] of pages.entries()){
    if(typeof page?.content!=='string'||page.content.length>1900||
       page.content.length<30||pageIndex(page.content)!==i+1 ||
       !page.content.startsWith('👑 Kings HR Driver Case View | '+(i+1)+'/'+pages.length+'\n') ||
       result.has(page.content)) {
      throw new Error('Private Kings HR case view pages are incomplete or unsafe.');
    }
    result.add(page.content);
  }
}

async function publishPrivateHrCasePages({
  pages,token,channelId,sourceChannelId,guildId,
  roles,members,ownerId,botId,transport=fetch
}={}) {
  validatePrivatePages(pages);
  if(!token||!ID.test(String(channelId||''))||
     !ID.test(String(sourceChannelId||''))||
     String(channelId)===String(sourceChannelId)||
     String(channelId)===String(REGISTER_CHANNEL_ID)||
     !ID.test(String(guildId||''))||!ID.test(String(botId||''))) {
    throw new Error('Private Kings HR case publication is not authorized or correctly configured.');
  }
  const headers={
    Authorization:'Bot '+token,
    Accept:'application/json',
    'User-Agent':'Kings Logistics HR Private Case View/1.0'
  };
  async function call(pathname,method='GET',body=null){
    const allowed=method==='GET' &&
      (pathname==='/channels/'+channelId||
       pathname==='/channels/'+channelId+'/messages?limit=100') ||
      method==='POST'&&pathname==='/channels/'+channelId+'/messages' ||
      method==='PATCH'&&new RegExp('^/channels/'+channelId+'/messages/\\d{17,20}$').test(pathname);
    if(!allowed)throw new Error('Kings HR case view Discord method or target rejected.');
    const reply=await transport(DISCORD_API+pathname,{
      method,headers:{
        ...headers,...(body?{'Content-Type':'application/json'}:{})
      },
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(12000),
      redirect:'error'
    });
    if(!reply?.ok)throw new Error('Private Kings HR case view request failed (HTTP '+
      reply?.status+'; message details withheld).');
    return reply.json();
  }
  // The content of the HR decision ledger is NOT reused as a view destination.
  const channel=await call('/channels/'+channelId);
  assertPrivateHrDecisionChannel(channel,guildId,roles,members,ownerId,botId);
  const recent=await call('/channels/'+channelId+'/messages?limit=100');
  if(!Array.isArray(recent)||recent.length>=100) {
    throw new Error('Private HR case view channel history incomplete; refusing partial report update.');
  }
  const existing=new Map();
  for(const message of recent){
    const idx=pageIndex(message?.content);
    if(idx===null)continue;
    if(String(message?.author?.id||'')!==String(botId) ||
       !ID.test(String(message?.id||'')) || existing.has(idx)) {
      throw new Error('Untrusted or duplicate private HR case view message; no writes allowed.');
    }
    existing.set(idx,message);
  }
  let created=0,updated=0,archived=0;
  for(const [i,page] of pages.entries()){
    const index=i+1,old=existing.get(index);
    if(old?.content===page.content)continue;
    const body={content:page.content,allowed_mentions:{parse:[]},flags:4};
    if(old){
      await call('/channels/'+channelId+'/messages/'+old.id,'PATCH',body);
      updated++;
    }else{
      await call('/channels/'+channelId+'/messages','POST',body);
      created++;
    }
  }
  for(const [index,old] of existing.entries()){
    if(index<=pages.length)continue;
    // Scrub previously displayed confidential cases if a case was resolved.
    // Never DELETE a message or modify a non-bot-authored message.
    await call('/channels/'+channelId+'/messages/'+old.id,'PATCH',{
      content:'👑 Kings HR Driver Case View [archived]\nResolved/older private case page replaced; no confidential cases remain on this message.',
      allowed_mentions:{parse:[]},flags:4
    });
    archived++;
  }
  return Object.freeze({created,updated,archived,pageCount:pages.length});
}
module.exports={pageIndex,validatePrivatePages,publishPrivateHrCasePages};
