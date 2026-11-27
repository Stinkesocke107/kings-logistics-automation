'use strict';
// Advisory-only Discord notifications. Never modifies a convoy, approval, or forum tag.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const REPORT='output/convoy-planning-limits.json';
const STATE='data/convoy-planning-alert-state.json';
function keyOf(w){
  const threshold=w.code==='external-month-threshold'||w.code==='partner-month-threshold';
  const stable=threshold?[w.code,w.period,w.threshold]:
    w.code==='departure-under-two-hours'?[w.code,...[w.first,w.second].sort()]:
    [w.code,w.period];
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0,24);
}
function pending(warnings,state){
  const sent=new Set(Array.isArray(state?.sent)?state.sent:[]);
  return (warnings||[]).map(w=>({key:keyOf(w),warning:w})).filter(x=>!sent.has(x.key));
}
// One aggregate private Staff triage reminder per UTC day; the source may
// contain Event names/IDs, but none are interpolated into Discord or logs.
// A review request never grants bookings or edits an existing Convoy.
function sourceTriageNotices(report,at=new Date().toISOString()){
  if(report?.version!==2||report?.mode!=='advisory-only'||
     report?.sourceClaimsOnly!==true||report?.freeSlotsCertified!==false||
     !Array.isArray(report.unknownTypes)||!Array.isArray(report.missingDepartures)||
     !/^\d{4}-\d{2}-\d{2}T/.test(at))return [];
  const unknown=report.unknownTypes.length,missing=report.missingDepartures.length;
  if(unknown===0&&missing===0)return [];
  return [{
    code:'event-source-triage',period:at.slice(0,10),
    unknownTypes:unknown,missingDepartures:missing
  }];
}
function describe(w){
  if(w.code==='duplicate-source-claim')
    return 'Convoy Center has **'+w.count+
      '** duplicate source claim(s) for '+w.period+
      ' (UTC). Original Event/Forum records need Staff reconciliation.'+
      ' No duplicate claim is a confirmed extra Event; no capacity is released.';
  if(w.code==='event-source-triage'){
    return 'Convoy Center requires Staff source review: **'+w.unknownTypes+
      '** unclassified Event type(s) and **'+w.missingDepartures+
      '** missing verified UTC departure(s). Review in <#1550619824005062697>.'+
      ' This is not an Event approval, capacity release or booking.';
  }
  if(w.code==='external-month-threshold'||w.code==='partner-month-threshold'){
    const type=w.code.startsWith('partner')?'Partner':'External';
    return type+' Convoy source claims: '+w.count+'/30 in '+w.period+
      ' (review threshold '+w.threshold+'/30; not automatic approval).';
  }
  if(w.code==='external-month-over-limit'||w.code==='partner-month-over-limit'){
    const type=w.code.startsWith('partner')?'Partner':'External';
    return type+' Convoy source claims exceed the 30/month planning limit: '+
      w.count+'/30 in '+w.period+'. Staff review required; no existing approval is displaced.';
  }
  if(w.code==='total-day-over-limit')return 'Combined Kings + Partner + External Convoy source claims: '+
    w.count+'/3 on '+w.period+' (UTC); Staff review required, no automatic refusal or reschedule.';
  if(w.code==='departure-under-two-hours')return 'Departure spacing review: '+w.first+' and '+w.second+
    ' are '+w.minutesApart+' minutes apart (under 120 minutes is WARNING ONLY, not automatic refusal).';
  return 'Planning advisory: '+w.code;
}
// Only the authenticated bot's own notices count as delivered. A human
// or webhook may copy a marker but must never suppress a genuine reminder.
// An exactly full Discord history page cannot prove older keys are absent.
function botOwnedAlertKeys(history, botId) {
  if (!Array.isArray(history) || history.length >= 100 ||
      !/^\d{17,22}$/.test(String(botId || '')))
    throw Error('Convoy alert history incomplete');
  const keys = new Set();
  for (const message of history) {
    if (String(message?.author?.id || '') !== String(botId) ||
        message?.author?.bot !== true) continue;
    const match = String(message.content || '')
      .match(/(?:^|\n)Convoy Alert Key: ([a-f0-9]{24})$/);
    if (match) keys.add(match[1]);
  }
  return keys;
}
function validAlertDelivery(message, {id, botId, channelId, content}) {
  return /^\d{17,22}$/.test(String(id || '')) &&
    String(message?.id || '') === String(id) &&
    String(message?.channel_id || '') === String(channelId) &&
    String(message?.author?.id || '') === String(botId) &&
    message?.author?.bot === true &&
    message?.content === content;
}

async function main(){
  if(!fs.existsSync(REPORT))throw Error('Planning report not found');
  const report=JSON.parse(fs.readFileSync(REPORT,'utf8'));
  if(report.mode!=='advisory-only'||!Array.isArray(report.warnings))throw Error('Invalid advisory report');
  const existing=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{version:1,sent:[]};
  if(!Array.isArray(existing.sent))throw Error('Invalid alert state');
  const monthNow=new Date().toISOString().slice(0,7);
  const activeWarnings=report.warnings.filter(w=>String(w.period||'').slice(0,7)>=monthNow);
  const notices=pending([...activeWarnings,...sourceTriageNotices(report)],existing);
  if(!notices.length){console.log('No new convoy planning warnings.');return;}
  if(process.env.CONVOY_DRY_RUN==='true'){
    // PUBLIC Actions logs: never print Staff/Event names, event IDs, links
    // or routes when running a restricted dry-run.
    console.log('Read-only Kings capacity planning advisories: '+notices.length+
      ' new warning(s); private event details withheld.');
    return;
  }
  const token=process.env.DISCORD_BOT_TOKEN;
  const guild=process.env.DISCORD_GUILD_ID;
  if(!token||!guild)throw Error('Discord settings missing');
  async function call(uri,options={}){
    const res=await fetch('https://discord.com/api/v10'+uri,{
      ...options,redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:'Bot '+token,'Content-Type':'application/json',
        'User-Agent':'Kings Convoy Planning Alerts/1.0'}
    });
    // Raw Discord response bodies may contain private source records.
    if(!res?.ok)throw Error('Discord Convoy alert API unavailable');
    if(res.status===204)return null;
    try{return await res.json();}
    catch{throw Error('Discord Convoy alert response invalid');}
  }
  let channel=process.env.DISCORD_EVENT_LEADERSHIP_CHANNEL_ID;
  if(!channel){
    const channels=await call('/guilds/'+guild+'/channels');
    const matches=channels.filter(c=>String(c.name||'').replace(/^[^a-z]+/i,'').toLowerCase()==='event-leadership');
    if(matches.length!==1)throw Error('Cannot uniquely resolve event-leadership channel');
    channel=matches[0].id;
  }
  // Check the actual destination and authenticated bot before accepting
  // stored markers, posting, or declaring a publication recovered.
  const [bot,destination] = await Promise.all([
    call('/users/@me'), call('/channels/'+channel)
  ]);
  if(!/^\d{17,22}$/.test(String(bot?.id||'')) ||
     bot.bot!==true || String(destination?.id||'')!==String(channel) ||
     String(destination?.guild_id||'')!==String(guild) ||
     destination.type!==0)
    throw Error('Convoy alert identity or destination unverified');

  // Discord is the recovery ledger if Git persistence fails AFTER posting.
  // Ignore copied human/webhook keys; stop on ambiguous 100-message history.
  const recent=await call('/channels/'+channel+'/messages?limit=100');
  const posted=botOwnedAlertKeys(recent,bot.id);
  const state={version:1,sent:[...existing.sent]};
  for(const notice of notices){
    if(posted.has(notice.key)){
      console.log('Recovered previously posted alert (private content withheld).');
    }else{
      const content='⚠️ **Kings Convoy Planning Advisory**\n'+
        describe(notice.warning)+
        '\nReview in Convoy Center. No convoy status has been changed.\nConvoy Alert Key: '+
        notice.key;
      const acknowledgment=await call('/channels/'+channel+'/messages',{
        method:'POST',body:JSON.stringify({content,allowed_mentions:{parse:[]}})
      });
      const messageId=String(acknowledgment?.id||'');
      if(!/^\d{17,22}$/.test(messageId))
        throw Error('Convoy alert Discord acknowledgment unverified');
      const saved=await call('/channels/'+channel+'/messages/'+messageId);
      if(!validAlertDelivery(saved,{
        id:messageId,botId:bot.id,channelId:channel,content
      })) throw Error('Convoy alert stored Discord readback failed');
      posted.add(notice.key);
    }
    state.sent.push(notice.key);
    // Persist only after a genuine stored bot-owned message or a safe
    // read-only recovery. The workflow will commit the file afterward.
    fs.mkdirSync(path.dirname(STATE),{recursive:true});
    fs.writeFileSync(STATE,JSON.stringify(state,null,2)+'\n');
  }
  console.log('Reconciled '+notices.length+' private Convoy planning advisory notices.');
}
if(require.main===module)main().catch(()=>{
  // Never print raw Discord HTTP errors or private Event source details.
  console.error('Kings Convoy Planning Alerts: SOURCE_OR_DELIVERY_UNAVAILABLE');
  process.exitCode=1;
});
module.exports={keyOf,pending,describe,sourceTriageNotices,
  botOwnedAlertKeys,validAlertDelivery};
