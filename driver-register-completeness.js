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

function compareRegister({drivers, roster, identities, profiles = new Map()}) {
  if (!Array.isArray(drivers) || !drivers.length ||
      !Array.isArray(roster) || !roster.length ||
      !(identities instanceof Map) || !(profiles instanceof Map)) {
    throw new Error('Incomplete private register audit sources.');
  }

  // Only the authoritative Discord Kings Driver role establishes active Driver
  // status. Trials and TMP-only members must not become missing registrations.
  const seenDiscord = new Set(), activeDrivers = [];
  for (const member of drivers) {
    if (!snowflake(member?.discordId) ||
        !['Driver', 'Trial'].includes(member.role) ||
        seenDiscord.has(member.discordId)) {
      throw new Error('Invalid or duplicate current Kings Discord Driver ID.');
    }
    seenDiscord.add(member.discordId);
    if (member.role === 'Driver') activeDrivers.push(member);
  }
  if (!activeDrivers.length) {
    throw new Error('No current Kings Driver roles in roster; refusing empty audit.');
  }

  const vtcByTmp = new Map();
  for (const member of roster) {
    if (!tmpId(member.tmpId) || vtcByTmp.has(String(member.tmpId))) {
      throw new Error('Invalid or duplicate official Kings TruckersMP VTC ID.');
    }
    vtcByTmp.set(String(member.tmpId), member);
  }
  const matchedVtc = new Set();
  const missingRecords = [], missingTmpIds = [];
  const tmpNotInCurrentVtc = [], identityConflicts = [];
  for (const driver of activeDrivers) {
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
    if (matchedVtc.has(String(assignedTmp))) {
      identityConflicts.push({...driver,tmpId:String(assignedTmp),reason:'duplicate-active-driver-link'});
      continue;
    }
    matchedVtc.add(String(assignedTmp));
  }

  const discordComplete = missingRecords.length === 0;
  const vtcComplete = discordComplete && missingTmpIds.length === 0 &&
    tmpNotInCurrentVtc.length === 0 && identityConflicts.length === 0;
  return {
    currentDrivers: activeDrivers.length,
    officialVtcMembers: roster.length, // Context only; NOT the audit denominator.
    registeredDrivers: activeDrivers.length - missingRecords.length,
    matchedVtcCount: matchedVtc.size,
    missingRecords,
    missingTmpIds,
    tmpNotInCurrentVtc,
    identityConflicts,
    missingVtcLinks: [], // Legacy output contract; no VTC-only accounts are actionable.
    discordComplete,
    vtcComplete,
    complete: discordComplete && vtcComplete
  };
}

function auditPages(report, checkedAt=new Date(), maxLength=MAX_DISCORD_MESSAGE) {
  if (!report || !(checkedAt instanceof Date) ||
      !Number.isFinite(checkedAt.getTime())) {
    throw new Error('Invalid Kings register audit result.');
  }
  const stamp=checkedAt.toISOString().replace('T',' ').slice(0,16)+' UTC';
  const status=report.complete ? 'COMPLETE – all current Kings Drivers covered'
    : 'INCOMPLETE – Management review required';
  const sections=[
    {
      kind:'Missing Discord',
      label:'Current Kings Driver role with NO private register record (Trials excluded)',
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
    }
  ];
  const counts=sections.map(s=>s.kind+': '+s.items.length).join(' | ');
  const header=REPORT_PREFIX+'Summary**';
  const summary=[
    header,
    '**'+status+'** • '+stamp,
    'Active Discord Kings Drivers: **'+report.currentDrivers+'**',
    'Private records for current members: **'+report.registeredDrivers+'/'+report.currentDrivers+'**',
    'Current Kings Driver register coverage: **'+(report.discordComplete?'COMPLETE':'INCOMPLETE')+'**',
    'Active Kings Driver TMP verification: **'+(report.vtcComplete?'COMPLETE':'INCOMPLETE')+'**',
    'Verified current Driver VTC links: **'+report.matchedVtcCount+'/'+report.currentDrivers+'**',
    counts,
    'Kings Trial and additional TruckersMP VTC-only accounts are outside active Driver coverage; they do not block completion. No nickname-based identity guesses.',
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
