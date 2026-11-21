'use strict';

// READ-ONLY audit of explicitly human-approved HR admission/re-entry decisions.
// Disabled until an HR-private Discord source channel ID is configured.
// No role changes, approvals, register edits, Discord message posts or public
// personal data output. An absent source never implies historical approval.
const {loadRegister}=require('./driver-loyalty-register');
const {currentDrivers}=require('./driver-welcome-register-review');
const {REGISTER_CHANNEL_ID}=require('./driver-register-completeness');
const {
  assertPrivateHrDecisionChannel,verifyHrDecisionMessages,
  auditCurrentHrDecisions,MAX_EVENTS
}=require('./hr-driver-decision-source');

const GUILD='1114967437788577792';
const API='https://discord.com/api/v10';
const ID=/^\d{17,20}$/;

async function auditHrDecisions({
  token=process.env.DISCORD_BOT_TOKEN,
  channelId=process.env.KINGS_HR_DECISIONS_CHANNEL_ID,
  transport=fetch
}={}) {
  if(!channelId) {
    // A missing decision channel is not evidence of HR approval. No network,
    // no name, ID, date or member record is read or written in this case.
    return Object.freeze({status:'not-configured'});
  }
  if(!ID.test(String(channelId))) {
    throw new Error('Kings HR decision source configuration is invalid.');
  }
  if(!token)throw new Error('Private Kings HR decision audit requires Discord bot read credentials.');
  const headers={
    Authorization:'Bot '+token,Accept:'application/json',
    'User-Agent':'Kings Logistics HR Decision Audit/1.0'
  };
  const discord=async pathname=>{
    if(!/^\/(guilds|channels|users)\//.test(pathname)) {
      throw new Error('Private HR audit cannot request this API endpoint.');
    }
    const response=await transport(API+pathname,{
      method:'GET',headers,signal:AbortSignal.timeout(12000),redirect:'error'
    });
    if(!response?.ok) {
      throw new Error('Private Kings HR decision read failed (HTTP '+response?.status+
        '; response data withheld).');
    }
    return response.json();
  };

  const [roles,memberships,channel,guild,bot]=await Promise.all([
    discord('/guilds/'+GUILD+'/roles'),
    (async()=>{
      const all=[];let after='';
      for(let page=0;page<20;page++) {
        const q=new URLSearchParams({limit:'1000'});
        if(after)q.set('after',after);
        const batch=await discord('/guilds/'+GUILD+'/members?'+q);
        if(!Array.isArray(batch))throw new Error('Incomplete private HR Discord roster.');
        all.push(...batch);
        if(batch.length<1000)return all;
        after=String(batch.at(-1)?.user?.id||'');
        if(!ID.test(after))throw new Error('Invalid private HR Discord roster cursor.');
      }
      throw new Error('Incomplete private HR Discord roster pagination.');
    })(),
    discord('/channels/'+channelId),
    discord('/guilds/'+GUILD),
    discord('/users/@me')
  ]);
  if(!Array.isArray(roles)||!ID.test(String(guild?.owner_id||''))||
     !ID.test(String(bot?.id||''))) {
    throw new Error('Private Kings HR approver roles or bot identity unavailable.');
  }
  // Do not read decision message contents until the channel is proven private.
  assertPrivateHrDecisionChannel(
    channel,GUILD,roles,memberships,guild.owner_id,bot.id
  );
  const drivers=currentDrivers(roles,memberships)
    .filter(d=>d.role==='Driver').map(d=>d.discordId);
  const privateIdentityRegister=await loadRegister(
    discord,GUILD,roles,memberships,bot.id,
    {channelId:REGISTER_CHANNEL_ID}
  );
  if(!privateIdentityRegister.enabled) {
    throw new Error('Original Kings identity register is not available for HR audit.');
  }
  let before='';
  const events=[];
  for(let page=0;page<MAX_EVENTS/100;page++) {
    const q=new URLSearchParams({limit:'100'});
    if(before)q.set('before',before);
    const batch=await discord('/channels/'+channelId+'/messages?'+q);
    if(!Array.isArray(batch))throw new Error('Incomplete private HR decision history.');
    events.push(...batch);
    if(batch.length<100) {
      const evidence=verifyHrDecisionMessages(events,memberships,roles,guild.owner_id);
      return auditCurrentHrDecisions(drivers,privateIdentityRegister,evidence);
    }
    before=String(batch.at(-1)?.id||'');
    if(!ID.test(before))throw new Error('Invalid private HR decision history cursor.');
  }
  throw new Error('Private HR decision history exceeds the safe read-only limit.');
}

async function main() {
  const result=await auditHrDecisions();
  if(result.status==='not-configured') {
    console.log('Private HR Driver decision source: NOT CONFIGURED. No historic HR approvals inferred.');
    return;
  }
  // Public GitHub Actions logs must contain AGGREGATES ONLY. In particular,
  // never print names, Discord IDs, ticket references or approval author IDs.
  console.log('Private HR Driver decision evidence: '+result.status+
    '; current Drivers: '+result.activeDrivers+
    '; original Kings identity records: '+result.originalIdentityRegistered+
    '; approved first entries: '+result.approvedFirst+
    '; approved returners: '+result.approvedReturn+
    '; conflicting decision evidence: '+result.conflictingDecisions+
    '; approved without original identity: '+result.approvedWithoutIdentity+
    '; historical decisions without verified evidence: '+result.noFormalDecisionEvidence+
    '. No HR actions or Discord writes performed.');
}
if(require.main===module)main().catch(()=>{
  console.error('Private HR Driver decision verification failed; no personal details published.');
  process.exitCode=1;
});
module.exports={auditHrDecisions,main};
