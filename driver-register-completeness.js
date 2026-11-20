'use strict';
// Pure, read-only comparison between current Kings Discord Driver/Trial roles,
// the official current TruckersMP VTC roster and the PRIVATE, manager-approved
// Kings identity register. Nothing in this module writes dates or roles.

const GUILD_ID = '1114967437788577792';
const REPORT_PREFIX = '👑 **Kings Driver Register Audit | ';
const REGISTER_CHANNEL_ID = '1572736232969084948';
const MAX_DISCORD_MESSAGE = 1900;

function snowflake(value) { return /^\d{17,20}$/.test(String(value || '')); }
function tmpId(value) { return /^[1-9]\d{0,17}$/.test(String(value || '')); }

function compareRegister({drivers, roster, identities, profiles = new Map(), historicalMappings = []}) {
  if (!Array.isArray(drivers) || !drivers.length ||
      !Array.isArray(roster) || !roster.length ||
      !(identities instanceof Map) || !(profiles instanceof Map) ||
      !Array.isArray(historicalMappings)) {
    throw new Error('Incomplete private register audit sources.');
  }
  const roleByDiscord = new Map();
  for (const driver of drivers) {
    if (!snowflake(driver.discordId) || roleByDiscord.has(driver.discordId)) {
      throw new Error('Invalid or duplicate current Kings Discord Driver ID.');
    }
    roleByDiscord.set(driver.discordId, driver);
  }
  const vtcByTmp = new Map();
  for (const member of roster) {
    if (!tmpId(member.tmpId) || vtcByTmp.has(String(member.tmpId))) {
      throw new Error('Invalid or duplicate official Kings TruckersMP VTC ID.');
    }
    vtcByTmp.set(String(member.tmpId), member);
  }
  const matchedVtc = new Map();
  const missingRecords = [];
  const missingTmpIds = [];
  const tmpNotInCurrentVtc = [];
  const identityConflicts = [];
  for (const driver of drivers) {
    const record = identities.get(driver.discordId);
    if (!record) {
      missingRecords.push(driver);
      continue;
    }
    const assignedTmp = record.platformIds?.truckersmp;
    if (!assignedTmp) {
      missingTmpIds.push(driver);
      continue;
    }
    if (!tmpId(assignedTmp) || !vtcByTmp.has(String(assignedTmp))) {
      tmpNotInCurrentVtc.push({...driver, tmpId:String(assignedTmp)});
      continue;
    }
    const profile = profiles.get(String(assignedTmp));
    if (profile?.valid && profile.discordId && profile.discordId !== driver.discordId) {
      identityConflicts.push({...driver,tmpId:String(assignedTmp),reason:'public-profile-disagreement'});
      continue;
    }
    matchedVtc.set(String(assignedTmp), driver.discordId);
  }

  // Historical mappings are only trusted when previously verified from an
  // exact TruckersMP profile link; the loader enforces their original source.
  const historicalByTmp = new Map();
  const disputedHistorical = new Set();
  for (const item of historicalMappings) {
    if (!tmpId(item?.tmpId) || !snowflake(item?.discordId)) continue;
    const id = String(item.tmpId);
    if (historicalByTmp.has(id) && historicalByTmp.get(id) !== item.discordId) {
      disputedHistorical.add(id);
    } else {
      historicalByTmp.set(id,item.discordId);
    }
  }
  const missingVtcLinks = [];
  for (const member of roster) {
    if (matchedVtc.has(member.tmpId)) continue;
    const profile = profiles.get(member.tmpId);
    const publicDiscord = profile?.valid ? profile.discordId : null;
    const historicalDiscord = disputedHistorical.has(member.tmpId)
      ? null : historicalByTmp.get(member.tmpId) || null;
    let candidateId = null;
    let candidateKind = null;
    if (publicDiscord && historicalDiscord && publicDiscord !== historicalDiscord) {
      candidateKind = 'conflicting-verifications';
    } else {
      candidateId = publicDiscord || historicalDiscord || null;
      candidateKind = candidateId
        ? (publicDiscord ? 'public-tmp-discord' : 'previously-verified') : 'unknown';
    }
    missingVtcLinks.push({
      tmpId:member.tmpId,
      candidateDiscordId:candidateId,
      candidateKind,
      currentKingsRole:Boolean(candidateId && roleByDiscord.has(candidateId))
    });
  }
  // A guild/role match never proves a historical Kings joining date.
  // A VTC member without an exact Discord mapping must not be assigned to a
  // guessed Discord member, even when the names seem identical.
  return {
    currentDrivers:drivers.length,
    officialVtcMembers:roster.length,
    registeredDrivers:drivers.length - missingRecords.length,
    matchedVtcCount:matchedVtc.size,
    missingRecords,
    missingTmpIds,
    tmpNotInCurrentVtc,
    identityConflicts,
    missingVtcLinks,
    complete:missingRecords.length===0 && missingTmpIds.length===0 &&
      tmpNotInCurrentVtc.length===0 && identityConflicts.length===0 &&
      missingVtcLinks.length===0
  };
}

function auditPages(report, checkedAt=new Date(), maxLength=MAX_DISCORD_MESSAGE) {
  if (!report || !(checkedAt instanceof Date) ||
      !Number.isFinite(checkedAt.getTime())) {
    throw new Error('Invalid Kings register audit result.');
  }
  const stamp=checkedAt.toISOString().replace('T',' ').slice(0,16)+' UTC';
  const status=report.complete ? 'COMPLETE – all current identities covered'
    : 'INCOMPLETE – Management review required';
  const sections=[
    {
      kind:'Missing Discord',
      label:'Current Kings Driver/Trial role with NO private register record',
      items:report.missingRecords.map(d=>'• '+d.role+' • Discord ID: '+d.discordId)
    },
    {
      kind:'Missing TMP ID',
      label:'Register record exists, but TruckersMP ID is missing',
      items:report.missingTmpIds.map(d=>'• '+d.role+' • Discord ID: '+d.discordId)
    },
    {
      kind:'Not in current VTC',
      label:'Registered TMP ID is not in the latest official Kings VTC roster – verify departures/rejoins',
      items:report.tmpNotInCurrentVtc.map(d=>'• '+d.role+' • Discord ID: '+d.discordId+
        ' • [TMP profile](https://truckersmp.com/user/'+d.tmpId+')')
    },
    {
      kind:'Identity conflict',
      label:'Private register conflicts with current exact TMP↔Discord profile link – verify manually',
      items:report.identityConflicts.map(d=>'• Discord ID: '+d.discordId+
        ' • [TMP profile](https://truckersmp.com/user/'+d.tmpId+') • VERIFY')
    },
    {
      kind:'Unlinked VTC',
      label:'Current official Kings VTC member not fully covered by a confirmed current Driver/Trial register link',
      items:report.missingVtcLinks.map(m=>'• [TMP '+m.tmpId+'](https://truckersmp.com/user/'+m.tmpId+')'+
        (m.candidateDiscordId
          ? ' • Candidate Discord ID: '+m.candidateDiscordId+
            (m.currentKingsRole?' (current Driver/Trial)':' (role not confirmed)')+
            ' • VERIFY'
          : m.candidateKind==='conflicting-verifications'
            ? ' • conflicting identity evidence • VERIFY'
            : ' • Discord ID unknown • VERIFY'))
    }
  ];
  const counts=sections.map(s=>s.kind+': '+s.items.length).join(' | ');
  const header=REPORT_PREFIX+'Summary**';
  const summary=[
    header,
    '**'+status+'** • '+stamp,
    'Discord Driver/Trial members: **'+report.currentDrivers+'**',
    'Private records for current members: **'+report.registeredDrivers+'/'+report.currentDrivers+'**',
    'Registered current VTC links: **'+report.matchedVtcCount+'/'+report.officialVtcMembers+'**',
    counts,
    'Only confirmed current memberships count as complete. VTC members without verified Discord links are NOT guessed from nicknames.',
    'No automatic register, Loyalty role, or personnel changes. Update private records in <#'+REGISTER_CHANNEL_ID+'>.',
    'Only the newest audit pages should be used for a new registration review.'
  ].join('\n');
  if (summary.length>maxLength) throw new Error('Summary exceeds safe Discord limit.');
  const pages=[{marker:header,content:summary}];
  for(const section of sections) {
    if(!section.items.length) continue;
    const batches=[];
    let current=[];
    const reserve=230;
    for(const item of section.items) {
      if(item.length+reserve>maxLength) throw new Error('Driver audit entry exceeds Discord limit.');
      if(current.length && current.join('\n').length+item.length+reserve>maxLength) {
        batches.push(current);
        current=[];
      }
      current.push(item);
    }
    if(current.length)batches.push(current);
    for(let i=0;i<batches.length;i++) {
      const marker=REPORT_PREFIX+section.kind+' '+(i+1)+'/';
      const content=[
        marker+batches.length+'**',
        '**'+section.label+'**',
        stamp+' • Only possible/verified account links are identified as such.',
        ...batches[i]
      ].join('\n');
      if(content.length>maxLength) throw new Error('Kings audit list exceeds Discord limit.');
      pages.push({marker,content});
    }
  }
  if(pages.length>30)throw new Error('Kings register audit report too large to publish safely.');
  return pages;
}

module.exports={GUILD_ID,REPORT_PREFIX,REGISTER_CHANNEL_ID,compareRegister,auditPages};
