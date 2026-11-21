'use strict';

// Separate human HR decision authority. Original Kings joining dates remain
// exclusively in the Management-approved private Driver identity register.
// This module performs NO Discord, file, member or role writes.
const {activeDriverSourceCoverage}=require('./kings-data-sources');

const HEADER='KINGS_HR_DRIVER_DECISION_V1';
const MAX_EVENTS=2000;
const ID=/^\d{17,20}$/;
const ACTIONS=new Set(['approved','declined','revoked']);
const ADMISSION_TYPES=new Set(['first','return']);
const VIEW_CHANNEL=1n<<10n;
const ADMINISTRATOR=1n<<3n;

function normalizeRoleName(input) {
  return String(input||'').normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
const HR_APPROVER_ROLES=new Set([
  'ceo','ceo founder','kings ceo','kings ceo founder',
  'head management','kings head management','management','kings management',
  'hr management','hr head management','kings hr management','kings hr head management',
  'human resources management','human resources head management',
  'kings human resources management','kings human resources head management'
]);

function hrApproverRole(role) {
  return HR_APPROVER_ROLES.has(normalizeRoleName(role?.name));
}
function authorizedHrApprover(userId, members, roles, ownerId) {
  const id=String(userId||'');
  if (!ID.test(id)||!Array.isArray(members)||!Array.isArray(roles)) return false;
  const member=members.find(m=>String(m?.user?.id||'')===id);
  if (!member || member?.user?.bot || !Array.isArray(member.roles)) return false;
  if (id===String(ownerId)) return true;
  const byId=new Map(roles.map(r=>[String(r.id),r]));
  return member.roles.some(r=>hrApproverRole(byId.get(String(r))));
}

// Reject public or broadly readable channels before consuming HR records.
// Administrator bypasses channel overwrites, so a non-HR administrator role
// is not an acceptable place to store private personnel approvals.
function assertPrivateHrDecisionChannel(channel, guildId, roles, members, ownerId, botId) {
  if (!channel || String(channel.guild_id)!==String(guildId) ||
      Number(channel.type)!==0 || !Array.isArray(channel.permission_overwrites) ||
      !Array.isArray(roles)||!Array.isArray(members)||!ID.test(String(ownerId||'')) ||
      !ID.test(String(botId||''))) {
    throw new Error('Private HR decision source channel permissions could not be verified.');
  }
  const everyone=channel.permission_overwrites.find(w=>
    String(w.id)===String(guildId)&&Number(w.type)===0);
  if(!everyone || !(BigInt(String(everyone.deny||'0'))&VIEW_CHANNEL)) {
    throw new Error('Private HR decision source must deny View Channel to everyone.');
  }
  const byId=new Map(roles.map(role=>[String(role.id),role]));
  for(const role of roles) {
    if(role.id===guildId) continue;
    const isBot=String(role?.tags?.bot_id||'')===String(botId);
    if(!hrApproverRole(role)&&!isBot &&
       (BigInt(String(role.permissions||'0'))&ADMINISTRATOR)) {
      throw new Error('Private HR decision source is not isolated from unrelated Discord administrators.');
    }
  }
  for(const overwrite of channel.permission_overwrites) {
    if(!(BigInt(String(overwrite.allow||'0'))&VIEW_CHANNEL))continue;
    if(Number(overwrite.type)===0) {
      const role=byId.get(String(overwrite.id));
      if(!hrApproverRole(role)&&String(role?.tags?.bot_id||'')!==String(botId)) {
        throw new Error('Private HR decision source has an unauthorized view-role permission.');
      }
    } else if(Number(overwrite.type)===1) {
      if(String(overwrite.id)!==String(botId)&&
         !authorizedHrApprover(overwrite.id,members,roles,ownerId)) {
        throw new Error('Private HR decision source has an unauthorized member permission.');
      }
    } else {
      throw new Error('Private HR decision source has unsupported permission overwrite.');
    }
  }
  return true;
}

function parseHrDecisionRecord(content) {
  const text=String(content||'').trim();
  if(!text.startsWith(HEADER))return null;
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(lines[0]!==HEADER||lines.length!==5) {
    throw new Error('Invalid private Kings HR decision record layout.');
  }
  const values=new Map();
  for(const line of lines.slice(1)) {
    const match=/^([a-z_]+):\s*(\S+)$/.exec(line);
    if(!match || !new Set(['discord_id','decision','admission','ticket_id']).has(match[1]) ||
       values.has(match[1])) {
      throw new Error('Invalid or duplicate private HR decision field.');
    }
    values.set(match[1],match[2]);
  }
  const discordId=values.get('discord_id'),ticketId=values.get('ticket_id');
  const decision=values.get('decision'),admission=values.get('admission');
  if(!ID.test(String(discordId||''))||!ID.test(String(ticketId||''))||
     !ACTIONS.has(decision)||!ADMISSION_TYPES.has(admission)) {
    throw new Error('Invalid private HR decision identity, ticket or decision type.');
  }
  return Object.freeze({discordId,decision,admission,ticketId});
}

function verifyHrDecisionMessages(messages, members, roles, ownerId, now=new Date()) {
  if(!Array.isArray(messages)||messages.length>MAX_EVENTS ||
     !(now instanceof Date)||!Number.isFinite(now.getTime())) {
    throw new Error('Incomplete or invalid private Kings HR decision evidence.');
  }
  const events=[],seenIds=new Set();
  for(const message of messages) {
    const record=parseHrDecisionRecord(message?.content);
    if(!record)continue;
    const messageId=String(message?.id||'');
    const date=new Date(message?.timestamp);
    if(!ID.test(messageId)||seenIds.has(messageId) ||
       !Number.isFinite(date.getTime())||date>new Date(now.getTime()+5*60000) ||
       message.edited_timestamp || message.webhook_id ||
       message.author?.bot ||
       !authorizedHrApprover(message?.author?.id,members,roles,ownerId)) {
      throw new Error('Private Kings HR decision evidence lacks trusted unedited human authorization.');
    }
    seenIds.add(messageId);
    events.push(Object.freeze({...record,messageId,
      approvedBy:String(message.author.id),
      recordedAt:date.toISOString()}));
  }
  events.sort((a,b)=>{
    const aTime=Date.parse(a.recordedAt),bTime=Date.parse(b.recordedAt);
    return aTime-bTime || (BigInt(a.messageId)<BigInt(b.messageId)?-1:1);
  });
  // HR corrections are append-only: a later approved/declined/revoked
  // decision supersedes an earlier decision without deleting old evidence.
  const latest=new Map();
  for(const event of events)latest.set(event.discordId,event);
  return Object.freeze({latest,events:Object.freeze(events)});
}

function auditCurrentHrDecisions(driverRoleIds, identityRegister, evidence, at=new Date()) {
  const coverage=activeDriverSourceCoverage(identityRegister,driverRoleIds,at);
  if(!['complete','incomplete'].includes(coverage.status)||
     !(evidence?.latest instanceof Map)) {
    throw new Error('Kings HR decision audit needs verified private identity and decision sources.');
  }
  const active=new Set(driverRoleIds.map(String));
  let approvedFirst=0,approvedReturn=0,conflictingDecisions=0,noEvidence=0;
  let approvedWithoutIdentity=0;
  for(const id of active) {
    const event=evidence.latest.get(id);
    if(!event){noEvidence++;continue;}
    if(event.decision==='approved'){
      if(!identityRegister.identities.has(id))approvedWithoutIdentity++;
      if(event.admission==='first')approvedFirst++;
      else approvedReturn++;
    }else conflictingDecisions++;
  }
  return Object.freeze({
    status:conflictingDecisions||approvedWithoutIdentity?'requires-human-review':
      noEvidence?'partial-evidence':'complete-evidence',
    activeDrivers:coverage.activeDrivers,
    originalIdentityRegistered:coverage.registered,
    approvedFirst,approvedReturn,
    conflictingDecisions,approvedWithoutIdentity,
    noFormalDecisionEvidence:noEvidence,
    verifiedDecisionEvents:evidence.events?.length??evidence.latest.size,
    // These numbers represent proof availability, NEVER membership approval
    // or authority to remove/change a Discord Driver role.
    authority:'hr-human-approved-private-discord'
  });
}

module.exports={
  HEADER,MAX_EVENTS,hrApproverRole,authorizedHrApprover,
  assertPrivateHrDecisionChannel,parseHrDecisionRecord,
  verifyHrDecisionMessages,auditCurrentHrDecisions
};
