'use strict';

// Independent, READ-ONLY Discord delivery proof for the existing fixed Kings
// messages. Never POST, PATCH, DELETE, log webhook credentials, inspect member
// rosters, or persist message bodies to the public repository.
const fs=require('fs');
const path=require('path');
const {assessHrDriverRegistration}=require('./hr-driver-register-status');

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
        expectedMessageId:state?.[item.idKey] || null,
        ownerType:'webhook',
        expectedWebhookId:(webhookMessageUrl(process.env[item.secret],state?.[item.idKey]) || '')
          .match(/\/webhooks\/(\d{15,22})\/[^/]+\/messages\/\d+$/)?.[1] || null,
        headers:{Accept:'application/json'}
      };
    }),
    ...LEADERSHIP.map(item=>({
      key:item.key,label:item.label,
      url:validId(item.channel)&&validId(leadershipState?.messageIds?.[item.key])
        ? DISCORD_API+'/channels/'+item.channel+'/messages/'+leadershipState.messageIds[item.key]
        : null,
      expectedMessageId:leadershipState?.messageIds?.[item.key] || null,
      expectedChannelId:item.channel,
      ownerType:'bot',
      headers:{Accept:'application/json',Authorization:'Bot '+BOT_TOKEN,'User-Agent':'Kings Logistics Fixed Message Audit/1.0'}
    }))
  ];
}

// Only an aggregate status comparison, never member names or player records.
// This validates what the two live Leadership embeds actually display using
// the same Driver Management source that the producing dashboard reads.
function expectedDriverObservation(summary, at = Date.now()) {
  if (summary?.onlineObservationStatus !== 'verified-live') return 'Unavailable';
  const count=summary.onlineNow;
  if (!Number.isSafeInteger(count) || count<0 ||
      (Number.isSafeInteger(summary.currentDrivers) && count>summary.currentDrivers)) {
    return 'Unavailable';
  }
  const timestamp=Date.parse(summary.updatedAt || '');
  if (!Number.isFinite(timestamp) || timestamp>at+5*60000 || at-timestamp>160*60000) {
    return 'Unavailable';
  }
  return String(count);
}
function driverEmbeddedDataMatches(target, message) {
  if (target.key !== 'driver' && target.key !== 'management') return true;
  const driver=storedJson('driver-management-summary.json');
  if (!driver || !Number.isSafeInteger(driver.currentDrivers) || driver.currentDrivers<0) return false;
  const values=(message.embeds || []).flatMap(embed=>
    Array.isArray(embed?.fields) ? embed.fields.map(field=>String(field?.value || '')) : []
  ).join('\n');
  return values.includes('VTC Drivers **'+driver.currentDrivers+'**') &&
    values.includes('Online **'+expectedDriverObservation(driver)+'**');
}

// Independent verification of the ACTUAL fixed HR Leadership embed.
// Only compare aggregate Driver-role registration coverage with the source
// snapshot the producer uses. Never persist/log private source or message body.
function hrEmbeddedDataMatches(target, message) {
  if (target.key !== 'hr') return true;
  const fields=(message.embeds||[]).flatMap(embed=>
    Array.isArray(embed?.fields) ? embed.fields : []);
  const actual=fields.find(field=>
    String(field?.name||'')==='🗂️ Kings Driver Registration — HR Review');
  if (!actual || typeof actual.value!=='string') return false;
  const source=assessHrDriverRegistration(storedJson('driver-loyalty-roles-summary.json'));
  if(source.status==='unavailable') {
    return actual.value.includes('Unavailable / stale') &&
      !actual.value.includes('Needs HR registration review **0**');
  }
  return actual.value.includes(
    'Active Discord Kings Drivers registered **'+source.registered+'/'+source.activeDrivers+'**'
  ) && actual.value.includes(
    'Needs HR registration review **'+source.missing+'**'
  );
}

// Check the ORIGINAL Discord message and its actual publisher, not only whether
// some embed can be read from a stored URL. Return a generic status for public CI.
function verifyMessageIdentity(target,message,botId) {
  if (!validId(target.expectedMessageId) ||
      String(message?.id || '')!==String(target.expectedMessageId))
    return 'fixed-message-id-mismatch';
  if (target.ownerType==='webhook') {
    if (!validId(target.expectedWebhookId) ||
        String(message?.webhook_id || '')!==String(target.expectedWebhookId))
      return 'fixed-webhook-owner-mismatch';
  } else if (target.ownerType==='bot') {
    if (!validId(botId) ||
        String(message?.author?.id || '')!==String(botId))
      return 'fixed-bot-owner-mismatch';
    if (!validId(target.expectedChannelId) ||
        String(message?.channel_id || '')!==String(target.expectedChannelId))
      return 'fixed-leadership-channel-mismatch';
  } else {
    return 'fixed-publisher-type-unverified';
  }
  return null;
}

async function getBotIdentity(transport=fetch) {
  if (!BOT_TOKEN) return null;
  try {
    const response=await transport(DISCORD_API+'/users/@me',{
      method:'GET',
      headers:{Accept:'application/json',Authorization:'Bot '+BOT_TOKEN},
      signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) return null;
    const bot=await response.json();
    return validId(bot?.id)?String(bot.id):null;
  } catch { return null; }
}

async function inspect(target, transport=fetch, botId=null) {
  if (!target.url || (target.ownerType==='bot' && !BOT_TOKEN)) {
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
    const identityIssue=verifyMessageIdentity(target,message,botId);
    if (identityIssue) return {label:target.label,status:'UNVERIFIED',reason:identityIssue};
    if (!driverEmbeddedDataMatches(target,message)) {
      return {label:target.label,status:'UNVERIFIED',reason:'driver-roster-or-online-status-drift'};
    }
    if (!hrEmbeddedDataMatches(target,message)) {
      return {label:target.label,status:'UNVERIFIED',reason:'hr-register-coverage-drift'};
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
  const fixedTargets=targets();
  // Identify the actual Kings Bot once, only when Leadership messages exist.
  // A missing/failed read must fail closed, never silently accept another bot.
  const botId=fixedTargets.some(target=>target.ownerType==='bot' && target.url)
    ? await getBotIdentity(transport) : null;
  for(const target of fixedTargets){
    const status=await inspect(target,transport,botId);
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
