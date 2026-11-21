'use strict';

// HR-facing, aggregate-only view of the authoritative private Kings Driver
// identity register. The source snapshot is produced by the existing Loyalty
// workflow after validating current Discord Kings Driver roles against the
// Management-approved original Kings joining-date register.
//
// This module NEVER infers actual Kings joining dates from TruckersMP VTC
// membership, Discord guild joined_at or a Discord welcome message. It
// performs no network requests, files writes, personnel or role actions.

const MAX_AGE_MS=36*60*60*1000;
const CLOCK_TOLERANCE_MS=5*60*1000;

function assessHrDriverRegistration(summary, now=Date.now()) {
  const unavailable=reason=>Object.freeze({
    status:'unavailable',reason,activeDrivers:null,registered:null,
    missing:null,sourceAt:null
  });
  if (!summary || typeof summary!=='object') return unavailable('missing-source');
  if (summary.source!=='management-private-kings-date-register' ||
      summary.registrationChannelActive!==true) return unavailable('unverified-authority');
  const source=summary.identitySourceCoverage;
  if (!source || source.authority!=='management-approved-private-discord' ||
      !['complete','incomplete'].includes(source.status)) {
    return unavailable('source-not-verified');
  }
  const checkedAt=Date.parse(summary.updatedAt||'');
  const checkedNow=new Date(now).getTime();
  if (!Number.isFinite(checkedAt) || !Number.isFinite(checkedNow) ||
      checkedAt>checkedNow+CLOCK_TOLERANCE_MS ||
      checkedNow-checkedAt>MAX_AGE_MS) return unavailable('source-stale');
  const fields=[
    source.activeDrivers,source.registered,source.missing,
    summary.currentDrivers,summary.registeredKingsDates,summary.unregisteredDrivers
  ];
  if(fields.some(n=>!Number.isSafeInteger(n)||n<0)) return unavailable('invalid-count');
  if(source.activeDrivers===0 ||
     source.registered+source.missing!==source.activeDrivers ||
     source.activeDrivers!==summary.currentDrivers ||
     source.registered!==summary.registeredKingsDates ||
     source.missing!==summary.unregisteredDrivers ||
     (source.status==='complete')!==(source.missing===0)) {
    return unavailable('inconsistent-counts');
  }
  return Object.freeze({
    status:source.status,
    activeDrivers:source.activeDrivers,
    registered:source.registered,
    missing:source.missing,
    sourceAt:new Date(checkedAt).toISOString()
  });
}

function hrDriverRegistrationMessage(status) {
  const stamp=status?.sourceAt
    ? '<t:'+Math.floor(Date.parse(status.sourceAt)/1000)+':R>'
    : 'not available';
  if(!status || !['complete','incomplete'].includes(status.status)) {
    return [
      '## 🗂️ Kings Driver Register — HR',
      '**Private register coverage: Unavailable / stale.**',
      'Do not infer joining dates from Discord or VTC. Check the protected Driver Leadership register queue.'
    ].join('\n');
  }
  return [
    '## 🗂️ Kings Driver Register — HR',
    '**Registered current Discord Kings Drivers:** '+status.registered+'/'+status.activeDrivers+
      ' • **Needs registration review:** '+status.missing,
    'Verified private source '+stamp+'. New or returning Drivers require human HR/Management confirmation; see protected Driver Leadership queue.'
  ].join('\n');
}

module.exports={assessHrDriverRegistration,hrDriverRegistrationMessage};
