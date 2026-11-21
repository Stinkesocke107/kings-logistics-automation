'use strict';
const { selectChannel,assertPrivateLeadershipChannel,currentDrivers } =
  require('./driver-welcome-register-review');
const { syncTextMessage } = require('./leadership-message-sync');
const {VTC_ID,parseRoster,readPublicProfile,matchProfiles,attachManualNameHints,reportPages} =
  require('./kings-vtc-register-contract');
const {loadVerifiedLegacyMappings}=require('./driver-legacy-verified-mappings');
const {loadRegister}=require('./driver-loyalty-register');
const {activeDriverSourceCoverage}=require('./kings-data-sources');
const {compareRegister,auditPages,REPORT_PREFIX,REGISTER_CHANNEL_ID}=require('./driver-register-completeness');
const {inspectRegisterMessages,diagnosticPages}=require('./driver-register-format-diagnostics');

const GUILD='1114967437788577792';
const TMP_API='https://api.truckersmp.com/v2';
const DISCORD_API='https://discord.com/api/v10';
const QUEUE_PREFIX='👑 **Kings Driver Registration Queue | ';
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function getJson(url, headers={}, transport=fetch, attempts=2) {
  let error=null;
  for(let i=0;i<attempts;i++) {
    try {
      const response=await transport(url,{
        method:'GET',
        headers:{Accept:'application/json',...headers},
        signal:AbortSignal.timeout(12000),redirect:'error'
      });
      if(!response?.ok) {
        if([429,500,502,503,504].includes(response.status) && i+1<attempts) {
          await delay(900+(i*750));continue;
        }
        throw Error('Public service request unavailable (HTTP '+response?.status+').');
      }
      return await response.json();
    }catch(e){
      error=e;
      if(i+1<attempts)await delay(650);
    }
  }
  throw error||Error('API request unavailable.');
}
async function fetchPublicProfiles(roster, transport=fetch) {
  // A bounded four-request worker pool avoids launching 110 requests at once.
  // Player/Discord mappings and profile IDs NEVER enter public GitHub logs.
  const index=new Map(),failed=new Set();
  let cursor=0;
  async function worker(){
    while(cursor<roster.length) {
      const item=roster[cursor++];
      try{
        const body=await getJson(TMP_API+'/player/'+item.tmpId,
          {'User-Agent':'Kings Logistics Driver Identity Review/1.0'},transport);
        const observed=readPublicProfile(body,item.tmpId);
        if(observed.valid)index.set(item.tmpId,observed);
        else failed.add(item.tmpId);
      }catch{
        failed.add(item.tmpId);
      }
    }
  }
  await Promise.all([worker(),worker(),worker(),worker()]);
  return {index,failedCount:failed.size};
}
// Report only missing ACTIVE Discord Kings Driver register entries.
// This never calls TruckersMP, guesses account links, or changes personnel.
function driverOnlyAuditPages(drivers, register, checkedAt=new Date()){
  if(!Array.isArray(drivers) || !drivers.length)
    throw Error('Invalid active Driver-only audit sources.');
  const active=drivers.filter(d=>d.role==='Driver');
  if(!active.length)throw Error('No active Kings Driver role holders to audit.');
  // The shared, read-only Kings Data Sources contract validates original
  // dates and platform identities, not merely a Discord-ID key's existence.
  const coverage=activeDriverSourceCoverage(register,active.map(d=>d.discordId),checkedAt);
  if(!['complete','incomplete'].includes(coverage.status))
    throw Error('Private Kings Driver identity source is unavailable for onboarding.');
  const missing=active.filter(d=>!register.identities.has(d.discordId));
  if(coverage.registered!==active.length-missing.length ||
     coverage.missing!==missing.length)
    throw Error('Private Driver register audit does not match authoritative Kings source.');
  const stamp=checkedAt.toISOString().replace('T',' ').slice(0,16)+' UTC';
  const header=QUEUE_PREFIX+'Summary**';
  const summary=[
    header,'**Active Kings Driver registration review** • '+stamp,
    'Discord Kings Driver roles: **'+active.length+'**',
    'Approved current Driver records: **'+coverage.registered+'/'+coverage.activeDrivers+'**',
    'Missing current Driver registrations: **'+coverage.missing+'**',
    'Register records with at least one platform ID: **'+coverage.platformLinksPresent+'** (not proof of current VTC membership).',
    'Joining-date authority: **private Management-approved Kings Driver Register**.',
    'Only current Discord Kings Driver holders are in scope. Kings Trial and',
    'TruckersMP VTC-only accounts are excluded from registration requirements.',
    'The separate TruckersMP verification was NOT performed in this report.',
    'Correct missing entries in <#'+REGISTER_CHANNEL_ID+'>.',
    'No records, joining dates or roles were modified.'
  ].join('\n');
  if(summary.length>1900)throw Error('Private Driver summary exceeds limit.');
  const pages=[{marker:header,content:summary}];
  for(let i=0;i<missing.length;i+=15){
    const batch=missing.slice(i,i+15);
    const marker=QUEUE_PREFIX+'Missing Discord '+(1+Math.floor(i/15))+'/';
    const content=[
      marker+Math.ceil(missing.length/15)+'**',
      '**Active Kings Driver members missing from the private Driver Register**',
      'Verify each Discord identity, TruckersMP ID and original Kings join date before registering:',
      ...batch.map(d=>'• Discord ID: '+d.discordId+' • Kings Driver')
    ].join('\n');
    if(content.length>1900)throw Error('Private missing Driver page exceeds limit.');
    pages.push({marker,content});
  }
  return {pages,counts:{currentDrivers:coverage.activeDrivers,
    registered:coverage.registered,missingRecords:coverage.missing,
    platformLinksPresent:coverage.platformLinksPresent,
    sourceStatus:coverage.status,
    complete:coverage.status==='complete'}};
}

async function review({token,transport=fetch,mode='preview'}) {
  if(!token)throw Error('DISCORD_BOT_TOKEN is missing.');
  const botHeaders={
    Authorization:'Bot '+token,
    'User-Agent':'Kings Logistics Private VTC Date Review/1.0'
  };
  const getDiscord=path=>getJson(DISCORD_API+path,botHeaders,transport);
  const [channels,roles]=await Promise.all([
    getDiscord('/guilds/'+GUILD+'/channels'),
    getDiscord('/guilds/'+GUILD+'/roles')
  ]);
  const leadership=selectChannel(channels,'driver-leadership');
  assertPrivateLeadershipChannel(leadership,roles,GUILD);

  const members=[];
  let after='';
  for(let page=0;page<20;page++){
    const qs=new URLSearchParams({limit:'1000'});
    if(after)qs.set('after',after);
    const batch=await getDiscord('/guilds/'+GUILD+'/members?'+qs);
    if(!Array.isArray(batch))throw Error('Incomplete Kings Discord member roster.');
    members.push(...batch);
    if(batch.length<1000)break;
    after=String(batch.at(-1)?.user?.id||'');
    if(!/^\d{17,20}$/.test(after)||page===19)throw Error('Incomplete Kings Discord member pagination.');
  }
  const drivers=currentDrivers(roles,members)
    .filter(driver=>!mode.startsWith('audit-') || driver.role==='Driver')
    .map(driver=>{
    const member=members.find(m=>String(m.user?.id)===driver.discordId);
    return {...driver,possibleNames:[
      member?.nick,member?.user?.global_name,member?.user?.username
    ].filter(value=>typeof value==='string' && value.length>0)};
  });
  let register=null;
  if(mode.startsWith('audit-')) {
    // Read ONLY the existing validated Management register. Fail closed when
    // the private channel is public, roles are unsafe or records conflict.
    const bot=await getDiscord('/users/@me');
    if(!/^\d{17,20}$/.test(String(bot?.id||'')))
      throw Error('Could not validate Kings Systems Bot identity.');
    try {
      register=await loadRegister(getDiscord,GUILD,roles,members,bot.id,
        {channelId:REGISTER_CHANNEL_ID});
    }catch(error){
      // Keep the strict Loyalty loader fail-closed. Only formatting, duplicate
      // or authorship failures can produce a private diagnostic report.
      // Permission failures and inaccessible channels still abort the audit.
      const msg=String(error?.message||'');
      if(!/identity record|joining date|Duplicate|non-Management member|private Kings Driver register batch|Invalid .* ID|record field or line|batch must contain/i.test(msg))
        throw error;
      const diagnostic=await inspectRegisterMessages(getDiscord,roles,members,bot.id);
      if(!diagnostic.issues.length)throw error;
      return {
        channelId:String(leadership.id),type:'audit-diagnostics',
        pages:diagnosticPages(diagnostic),
        counts:{invalidMessages:diagnostic.issues.length,
          scannedMessages:diagnostic.scanned,
          parseableEntries:diagnostic.validEntries,
          complete:false}
      };
    }
    if(!register.enabled)throw Error('Private Driver register is not configured.');
  }
  if(mode.startsWith('audit-driver-only-')) {
    const audit=driverOnlyAuditPages(drivers,register);
    return {channelId:String(leadership.id),type:'audit-driver-only',...audit};
  }
  // Invalid or unauthorized register entries are diagnosed without hitting
  // the rate-limited TruckersMP API. A complete register still requires the
  // official VTC roster and exact public/previously verified profile links.
  const rosterData=await getJson(TMP_API+'/vtc/'+VTC_ID+'/members',
    {'User-Agent':'Kings Logistics Driver Identity Review/1.0'},transport);
  const roster=parseRoster(rosterData);
  // Audit only active Driver IDs already approved in the private register.
  // TMP-only accounts must not require 100+ public profile fetches.
  const profileRoster=mode.startsWith('audit-')
    ? roster.filter(member=>new Set(drivers.map(driver=>
        register.identities.get(driver.discordId)?.platformIds?.truckersmp)
        .filter(Boolean)).has(member.tmpId))
    : roster;
  const profiles=await fetchPublicProfiles(profileRoster,transport);
  // Reuse ONLY older Kings mappings whose provenance is a previously
  // verified exact TruckersMP /player discordSnowflake. No old name
  // heuristics or unverifiable public profile guesses enter the result.
  const stored=loadVerifiedLegacyMappings();
  const matched=attachManualNameHints(roster,
    matchProfiles(roster,profiles.index,drivers,stored));
  if(mode.startsWith('audit-')) {
    const coverage=activeDriverSourceCoverage(register,
      drivers.filter(driver=>driver.role==='Driver').map(driver=>driver.discordId));
    if(!['complete','incomplete'].includes(coverage.status))
      throw Error('Private Kings Driver identity source is unavailable for VTC audit.');
    const audit=compareRegister({drivers,roster,identities:register.identities,
      profiles:profiles.index,historicalMappings:stored});
    if(audit.currentDrivers!==coverage.activeDrivers ||
       audit.registeredDrivers!==coverage.registered)
      throw Error('Kings Driver VTC audit does not match the authoritative private identity source.');
    const pages=auditPages(audit);
    return {channelId:String(leadership.id),pages,type:'audit',
      counts:{currentDrivers:audit.currentDrivers,vtc:audit.officialVtcMembers,
        registered:audit.registeredDrivers,linkedVtc:audit.matchedVtcCount,
        sourceStatus:coverage.status,
        platformLinksPresent:coverage.platformLinksPresent,
        missingRecords:audit.missingRecords.length,missingTmp:audit.missingTmpIds.length,
        notOnVtc:audit.tmpNotInCurrentVtc.length,
        identityConflicts:audit.identityConflicts.length,
        unlinkedVtc:audit.missingVtcLinks.length,
        discordComplete:audit.discordComplete,vtcComplete:audit.vtcComplete,
        complete:audit.complete}};
  }
  const pages=reportPages(matched,GUILD);
  return {
    channelId:String(leadership.id),pages,
    counts:{vtc:roster.length,drivers:drivers.length,verified:matched.matched.length,
      unmatched:matched.outstanding.length,conflicts:matched.duplicateCount,
      profileFailures:profiles.failedCount, manualHints:matched.manualHintCount, historical:matched.matched.filter(x=>x.source==='historical-verified').length}
  };
}
// Remove only obsolete, BOT-authored pages from this specific Kings audit.
// Never delete human messages, other Leadership reports or private register data.
async function cleanupObsoleteAuditPages({token,channelId,markers,transport=fetch,prefix=REPORT_PREFIX}) {
  if(![REPORT_PREFIX,QUEUE_PREFIX].includes(prefix) ||
     !Array.isArray(markers) || !markers.every(m=>String(m).startsWith(prefix))) {
    throw Error('Unrecognized private Kings audit cleanup scope.');
  }
  const headers={Authorization:'Bot '+token,'User-Agent':'Kings Driver Register Audit/1.0'};
  const me=await getJson(DISCORD_API+'/users/@me',headers,transport);
  if(!/^\d{17,20}$/.test(String(me?.id||'')))throw Error('Cannot validate audit publisher identity.');
  let before='';
  let removed=0;
  for(let page=0;page<10;page++){
    const qs=new URLSearchParams({limit:'100'});
    if(before)qs.set('before',before);
    const messages=await getJson(DISCORD_API+'/channels/'+channelId+'/messages?'+qs,
      headers,transport);
    if(!Array.isArray(messages))throw Error('Cannot verify private Leadership audit history.');
    for(const message of messages){
      const text=String(message?.content||'');
      if(String(message?.author?.id||'')!==String(me.id) ||
         !text.startsWith(prefix) ||
         markers.some(marker=>text.includes(marker)))continue;
      if(!/^\d{17,20}$/.test(String(message.id||'')))continue;
      const response=await transport(DISCORD_API+'/channels/'+channelId+'/messages/'+message.id,{
        method:'DELETE',headers,signal:AbortSignal.timeout(12000),redirect:'error'
      });
      if(!response?.ok)throw Error('Could not safely remove outdated bot-owned audit page.');
      removed++;
    }
    if(messages.length<100)break;
    before=String(messages.at(-1)?.id||'');
    if(!/^\d{17,20}$/.test(before))throw Error('Invalid private Leadership history cursor.');
  }
  return removed;
}

async function main(){
  const mode=String(process.env.KINGS_TMP_VTC_REVIEW_MODE||'preview').trim();
  if(!['preview','publish','audit-preview','audit-publish',
       'audit-driver-only-preview','audit-driver-only-publish'].includes(mode))
    throw Error('Invalid VTC review mode.');
  const token=process.env.DISCORD_BOT_TOKEN;
  const result=await review({token,mode});
  // Print counts only, never Discord identities, profiles, joining dates or
  // complete message content in publicly visible GitHub Actions logs.
  if(result.type==='audit-diagnostics'){
    console.log('Private Kings Driver register audit: '+
      result.counts.invalidMessages+' invalid or unsafe register messages out of '+
      result.counts.scannedMessages+' inspected; '+result.counts.parseableEntries+
      ' initially parseable entries. INCOMPLETE. No IDs/dates printed.');
  }else if(result.type==='audit-driver-only') {
    console.log('Private active Kings Driver-only register audit: '+
      result.counts.registered+'/'+result.counts.currentDrivers+
      ' recorded; '+result.counts.missingRecords+
      ' current Kings Drivers missing. TruckersMP API not queried.');
  }else if(result.type==='audit') {
    console.log('Private Kings Driver register audit: '+
      result.counts.registered+'/'+result.counts.currentDrivers+
      ' active Discord Kings Drivers recorded, '+
      result.counts.linkedVtc+'/'+result.counts.currentDrivers+
      ' active Kings Driver VTC links (VTC roster: '+result.counts.vtc+' accounts), '+
      result.counts.missingRecords+' missing register records, '+
      result.counts.missingTmp+' records missing TMP IDs, '+
      result.counts.notOnVtc+' noncurrent VTC IDs, '+
      result.counts.identityConflicts+' contradictory exact profile links, '+
      'VTC-only accounts excluded from completion. '+
      'Discord complete: '+result.counts.discordComplete+','+
      ' VTC complete: '+result.counts.vtcComplete+','+
      ' both complete: '+result.counts.complete+'.');
  }else console.log('Kings TMP VTC review: '+result.counts.vtc+' roster members, '+
    result.counts.drivers+' Discord Drivers/Trials, '+
    result.counts.verified+' exact public Discord-profile matches, '+
    result.counts.unmatched+' requiring confirmation, '+
    result.counts.manualHints+' name-only suggestions for manual review, '+
    result.counts.historical+' recovered from previously verified encrypted links, '+
    result.counts.profileFailures+' inaccessible/invalid profiles, '+
    result.counts.conflicts+' ambiguous links.');
  if(!['publish','audit-publish','audit-driver-only-publish'].includes(mode)){
    console.log('PREVIEW: no Discord writes, no register entries and no Loyalty role changes.');
    return;
  }
  for(const page of result.pages){
    const sync=await syncTextMessage({
      token,channelId:result.channelId,marker:page.marker,
      content:page.content,
      userAgent:'Kings TMP VTC Register Review/1.0'
    });
    if(sync.action==='suppressed')throw Error('Leadership report publication disabled.');
  }
  if(['audit','audit-diagnostics','audit-driver-only'].includes(result.type)){
    const deleted=await cleanupObsoleteAuditPages({token,channelId:result.channelId,
      markers:result.pages.map(page=>page.marker),
      prefix:result.type==='audit-driver-only'?QUEUE_PREFIX:REPORT_PREFIX});
    console.log('Private Kings Driver Register audit published ('+result.type+'); '+
      deleted+' outdated bot-owned audit pages removed. No register or role writes.');
  }else console.log('Published VTC review candidates to private Driver Leadership; no register or role writes.');
}
if(require.main===module){
  main().catch(err=>{
    console.error('Kings TMP VTC import review failed: '+err.message);
    process.exit(1);
  });
}
module.exports={getJson,fetchPublicProfiles,review,driverOnlyAuditPages,cleanupObsoleteAuditPages};
