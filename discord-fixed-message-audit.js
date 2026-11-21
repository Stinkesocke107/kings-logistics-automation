'use strict';

// Independent, READ-ONLY Discord delivery proof for the existing fixed Kings
// messages. Never POST, PATCH, DELETE, log webhook credentials, inspect member
// rosters, or persist message bodies to the public repository.
const fs=require('fs');
const path=require('path');

const ROOT=__dirname;
const DISCORD_API='https://discord.com/api/v10';
const BOT_TOKEN=process.env.DISCORD_BOT_TOKEN || '';
const FIXED=[
  {key:'live-tracker',label:'Live Tracker',file:'live-tracker-snapshot.json',idKey:'discordMessageId',secret:'DISCORD_WEBHOOK_URL'},
  {key:'statistics',label:'Advanced Statistics',file:'statistics.json',idKey:'messageId',secret:'STATS_DISCORD_WEBHOOK_URL'},
  {key:'central-overview',label:'Central Overview',file:'central-overview.json',idKey:'messageId',secret:'CENTRAL_OVERVIEW_WEBHOOK_URL'}
];
const LEADERSHIP=[
  {key:'driver',label:'Driver Leadership',channel:process.env.DRIVER_LEADERSHIP_CHANNEL_ID || '1551675577226887229'},
  {key:'hr',label:'HR Leadership',channel:process.env.HR_LEADERSHIP_CHANNEL_ID || '1383508442857340969'},
  {key:'staff',label:'Staff Leadership',channel:process.env.STAFF_LEADERSHIP_CHANNEL_ID || '1551675877178474526'},
  {key:'event',label:'Event Leadership',channel:process.env.EVENT_LEADERSHIP_CHANNEL_ID || '1551675735633297418'},
  {key:'management',label:'Management Leadership',channel:process.env.MANAGEMENT_OVERVIEW_CHANNEL_ID || '1492936683304517792'}
];

function storedJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT,'data',relative),'utf8'));
  } catch {
    return null;
  }
}
function validId(value) { return /^\d{17,22}$/.test(String(value || '')); }
function webhookMessageUrl(raw, messageId) {
  if (!validId(messageId) || !raw) return null;
  let value;
  try {value=new URL(raw);} catch{return null;}
  if (value.protocol!=='https:' || !['discord.com','discordapp.com'].includes(value.hostname) ||
      value.port || !/^\/api(?:\/v(?:9|10))?\/webhooks\/\d{15,22}\/[^/]+\/?$/.test(value.pathname)) {
    return null;
  }
  // Discard all query parameters; never expose the webhook token or URL in logs.
  return value.origin+value.pathname.replace(/\/$/,'')+'/messages/'+String(messageId);
}
function targets() {
  const leadershipState=storedJson('leadership-dashboard-state.json');
  return [
    ...FIXED.map(item=>{
      const state=storedJson(item.file);
      return {
        key:item.key,label:item.label,
        url:webhookMessageUrl(process.env[item.secret],state?.[item.idKey]),
        headers:{Accept:'application/json'}
      };
    }),
    ...LEADERSHIP.map(item=>({
      key:item.key,label:item.label,
      url:validId(item.channel)&&validId(leadershipState?.messageIds?.[item.key])
        ? DISCORD_API+'/channels/'+item.channel+'/messages/'+leadershipState.messageIds[item.key]
        : null,
      headers:{Accept:'application/json',Authorization:'Bot '+BOT_TOKEN,'User-Agent':'Kings Logistics Fixed Message Audit/1.0'}
    }))
  ];
}
async function inspect(target, transport=fetch) {
  if (!target.url || (LEADERSHIP.some(item=>item.key===target.key) && !BOT_TOKEN)) {
    return {label:target.label,status:'UNVERIFIED',reason:'configuration-or-stored-id-missing'};
  }
  try {
    const response=await transport(target.url,{
      method:'GET',headers:target.headers,signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      return {label:target.label,status:'UNVERIFIED',reason:'discord-http-'+response.status};
    }
    const message=await response.json();
    if (!message || typeof message!=='object' || !validId(message.id) ||
        !Array.isArray(message.embeds) || message.embeds.length===0) {
      return {label:target.label,status:'UNVERIFIED',reason:'message-or-embed-invalid'};
    }
    // Never output or store message bodies, embeds, IDs or player information.
    return {label:target.label,status:'VERIFIED',reason:'message-readable-with-embed'};
  } catch (error) {
    return {
      label:target.label,status:'UNVERIFIED',
      reason:error?.name==='TimeoutError'||error?.name==='AbortError'
        ? 'request-timeout':'request-failed'
    };
  }
}
async function main(transport=fetch) {
  const result=[];
  for(const target of targets()){
    const status=await inspect(target,transport);
    result.push(status);
    console.log('[Kings Discord Read-Only] '+status.label+': '+status.status+' ('+status.reason+')');
  }
  const verified=result.filter(item=>item.status==='VERIFIED').length;
  console.log('Kings fixed Discord messages confirmed: '+verified+'/'+result.length);
  if (verified!==result.length) {
    throw new Error('Some fixed Discord messages could not be independently verified (read-only audit; no writes performed).');
  }
  return result;
}
main().catch(error=>{
  console.error('Kings fixed Discord delivery audit:',error.message);
  process.exitCode=1;
});
