'use strict';

// The Kings field-ownership contract. Do not confuse an authoritative,
// Management-approved original join date with Discord joined_at, a VTC join
// date or a last-known map observation. This module makes NO network calls,
// persists NO private records and performs NO Discord/role writes.
const { PLATFORMS } = require('./driver-identity-register');

const SOURCES = Object.freeze({
  driverIdentity: Object.freeze({
    name: 'Kings Driver Identity Register',
    authority: 'management-approved-private-discord',
    status: 'active',
    privacy: 'restricted',
    fields: Object.freeze([
      'discord_id','kings_join_date','truckersmp_id','haulmp_id','trucklinemp_id'
    ]),
    noPublicPersonalData: true
  }),
  driverRole: Object.freeze({
    name: 'Kings Discord Guild Roles',
    authority: 'live-discord-guild',
    status: 'active',
    privacy: 'restricted',
    fields: Object.freeze(['current_kings_driver_role','current_kings_trial_role']),
    noPublicPersonalData: true
  }),
  tmpVtc: Object.freeze({
    name: 'Official TruckersMP Kings VTC Roster',
    authority: 'official-truckersmp-api',
    status: 'active',
    privacy: 'aggregated-public',
    fields: Object.freeze(['current_tmp_vtc_membership','tmp_vtc_join_date']),
    noPublicPersonalData: true
  }),
  liveOnline: Object.freeze({
    name: 'Verified Complete Multiplayer Live Provider',
    authority: 'verified-all-server-live-observation',
    status: 'blocked-upstream',
    privacy: 'aggregate-public',
    fields: Object.freeze(['online_now','last_verified_online_at']),
    noPublicPersonalData: true
  }),
  hrAdmissions: Object.freeze({
    name: 'Human-approved Kings HR Driver Admissions and Re-entry Decisions',
    authority: 'hr-human-approved-private-discord',
    status: 'opt-in-source-not-yet-configured',
    privacy: 'restricted',
    fields: Object.freeze([
      'hr_driver_admission_decision','hr_driver_return_decision','hr_approval_ticket_ref'
    ]),
    noPublicPersonalData: true
  }),
  staff: Object.freeze({
    name: 'Verified Kings Staff Roles and Encrypted HR Records',
    authority: 'discord-roles-plus-hr-approval',
    status: 'active',
    privacy: 'restricted',
    fields: Object.freeze(['current_staff_assignment','staff_appointment_date']),
    noPublicPersonalData: true
  }),
  awards: Object.freeze({
    name: 'Kings Human-approved Award Decisions',
    authority: 'human-leadership-decision',
    status: 'planned-unified-register',
    privacy: 'restricted',
    fields: Object.freeze(['approved_award_winner','award_granted_at']),
    noPublicPersonalData: true
  }),
  partners: Object.freeze({
    name: 'Kings Partner Management',
    authority: 'human-approved-partnership-agreement',
    status: 'planned-unified-register',
    privacy: 'restricted',
    fields: Object.freeze(['partner_approved','partnership_start_at']),
    noPublicPersonalData: true
  }),
  events: Object.freeze({
    name: 'Kings Event Planning and Approved Slots',
    authority: 'event-leadership-approval',
    status: 'planned-unified-register',
    privacy: 'restricted',
    fields: Object.freeze(['approved_event','approved_convoy_slot']),
    noPublicPersonalData: true
  }),
  supporter: Object.freeze({
    name: 'Kings Payment and Subscription Provider',
    authority: 'verified-payment-provider',
    status: 'future-website-integration',
    privacy: 'restricted',
    fields: Object.freeze(['verified_active_subscription','verified_shop_purchase']),
    noPublicPersonalData: true
  })
});

const FIELD_AUTHORITY = Object.freeze(Object.fromEntries(
  Object.entries(SOURCES).flatMap(([source, definition]) =>
    definition.fields.map(field => [field, source])
  )
));

function sourceFor(field) {
  const key=FIELD_AUTHORITY[String(field || '')];
  return key ? {key, ...SOURCES[key]} : null;
}

function validDiscordId(value) {
  return /^\d{17,20}$/.test(String(value || ''));
}

function registeredSourceAvailable(register) {
  return Boolean(register?.enabled &&
    register.records instanceof Map &&
    register.identities instanceof Map);
}

// Private in-memory lookup only: requires an existing permission-validated
// loadRegister() result. Original date and platform IDs are never inferred.
function privateDriverIdentity(register, discordId, at = new Date()) {
  if (!registeredSourceAvailable(register)) {
    throw new Error('Private Kings Driver identity source is unavailable or incomplete.');
  }
  const id=String(discordId || '');
  if (!validDiscordId(id)) throw new Error('Invalid private Driver identity lookup key.');
  const records=register.records;
  const identities=register.identities;
  if (!records.has(id) && !identities.has(id)) return null;
  if (!records.has(id) || !identities.has(id)) {
    throw new Error('Private Kings Driver source entry is inconsistent.');
  }
  const identity=identities.get(id);
  const original=records.get(id);
  const date=original instanceof Date ? original : new Date(NaN);
  const instant=new Date(at);
  if (!identity || identity.userId!==id || !Number.isFinite(date.getTime()) ||
      date.getUTCFullYear()<2015 || date>instant ||
      !Number.isFinite(instant.getTime()) ||
      identity.joinedAt?.getTime()!==date.getTime()) {
    throw new Error('Private Kings Driver source entry failed identity/date consistency.');
  }
  const platforms={};
  for(const platform of PLATFORMS) {
    const value=identity.platformIds?.[platform];
    if (value !== null && value !== undefined && typeof value!=='string') {
      throw new Error('Private Kings Driver source has invalid platform ID representation.');
    }
    platforms[platform]=value || null;
  }
  // ISO string prevents a caller from mutating the original Date in register.
  // Caller must keep this result private; never add it to public JSON or logs.
  return Object.freeze({
    discordId:id,
    originalKingsJoinedAt:date.toISOString(),
    platformIds:Object.freeze(platforms),
    authority:'management-approved-private-discord'
  });
}

// Intentionally aggregate-only. This does NOT define current Driver status:
// callers supply the currently verified Discord Kings Driver-role IDs.
// Former Drivers or VTC-only members in the private register do not increase
// the active Kings Driver denominator.
function activeDriverSourceCoverage(register, activeDiscordDriverIds, at=new Date()) {
  if (!Array.isArray(activeDiscordDriverIds)) {
    throw new Error('Current Kings Driver-role list is unavailable.');
  }
  const set=new Set();
  for (const rawId of activeDiscordDriverIds) {
    if (!validDiscordId(rawId) || set.has(String(rawId))) {
      throw new Error('Current Driver-role list is invalid or contains duplicates.');
    }
    set.add(String(rawId));
  }
  if (!set.size) {
    return Object.freeze({
      status:'no-active-drivers',
      activeDrivers:0,registered:null,missing:null,
      platformLinksPresent:null,
      authority:'management-approved-private-discord'
    });
  }
  if (!registeredSourceAvailable(register)) {
    return Object.freeze({
      status:'source-unavailable',
      activeDrivers:set.size,
      registered:null,
      missing:null,
      platformLinksPresent:null,
      authority:'management-approved-private-discord'
    });
  }
  let registered=0,platformLinksPresent=0;
  for(const id of set) {
    const record=privateDriverIdentity(register,id,at);
    if(!record)continue;
    registered++;
    if(Object.values(record.platformIds).some(Boolean)) platformLinksPresent++;
  }
  return Object.freeze({
    status:registered===set.size?'complete':'incomplete',
    activeDrivers:set.size,
    registered,
    missing:set.size-registered,
    platformLinksPresent,
    authority:'management-approved-private-discord'
  });
}

module.exports={
  SOURCES,FIELD_AUTHORITY,sourceFor,registeredSourceAvailable,
  privateDriverIdentity,activeDriverSourceCoverage
};
