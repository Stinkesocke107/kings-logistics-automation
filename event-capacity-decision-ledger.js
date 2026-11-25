'use strict';
// Private Kings Event Capacity decision ledger. Pure state mutations plus
// AES-256-GCM seal/unseal. Not imported by any existing production workflow.
// Caller MUST supply identity/roles verified by a private trusted gateway.
// Passing actor metadata to this library is not, by itself, authentication.
const crypto=require('node:crypto');
const {timestamp}=require('./event-capacity-core');
const DOMAIN='kings-event-capacity-private-decision-ledger-v1';
const TYPES=new Set(['Kings Convoy','Partner Convoy','External Convoy']);
const STAFF=new Set(['Event Coordination','Event Leadership','CEO']);
const EXCEPTION=new Set(['Event Management','CEO']);
const ACTIONS=new Set([
  'classification','departure','meeting','end','reschedule',
  'exception','revoke-classification','revoke-departure',
  'revoke-meeting','revoke-end','revoke-exception'
]);
const REF=/^(?:event|thread):[a-zA-Z0-9_-]{1,128}$/;
const ERROR='Kings Event Capacity private ledger validation or authorization failed.';
const SNOWFLAKE=/^\d{17,22}$/;
const SOURCE_RUN=/^[1-9]\d{5,19}$/;
const SHA256=/^[a-f0-9]{64}$/;
const SIGNED_DISCORD_PROOF=/^discord:(\d{17,22}):review:(\d{17,22})$/;
const MAX_SOURCE_AGE_MS=45*60*1000;
function validatedReviewProof(p,ref,action,actorId,evidenceRef,at){
  if(!p||typeof p!=='object'||Array.isArray(p)||
    Object.keys(p).sort().join(',')!==
      'evidenceMessageId,reviewMessageId,reviewerId,sourceAttempt,sourceDigest,sourceRunId,submitterId,verifiedAt,version'||
    p.version!==1||
    ![p.evidenceMessageId,p.reviewMessageId,p.reviewerId,p.submitterId]
      .every(v=>typeof v==='string'&&SNOWFLAKE.test(v))||
    !SOURCE_RUN.test(String(p.sourceRunId||''))||
    !Number.isSafeInteger(p.sourceAttempt)||p.sourceAttempt<1||
    p.sourceAttempt>100||
    !SHA256.test(String(p.sourceDigest||''))||
    p.evidenceMessageId===p.reviewMessageId||
    p.reviewerId===p.submitterId||
    actorId!==p.reviewerId||
    !['classification','departure','end'].includes(action)||
    evidenceRef!=='discord:'+p.evidenceMessageId+':review:'+p.reviewMessageId||
    !validIso(p.verifiedAt)||!validIso(at)||
    timestamp(p.verifiedAt)>timestamp(at)||
    timestamp(at)-timestamp(p.verifiedAt)>MAX_SOURCE_AGE_MS)fail();
  return structuredClone(p);
}


function fail(){throw new Error(ERROR);}
function validIso(value){return typeof value==='string'&&timestamp(value)!==null;}
function iso(value){return new Date(timestamp(value)).toISOString();}
function validateScope(scope){
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
     !/^\d{5,25}$/.test(String(scope.guildId||''))||
     !/^\d{5,25}$/.test(String(scope.forumId||'')))fail();
  return {guildId:String(scope.guildId),forumId:String(scope.forumId)};
}
function validEvidence(value){
  return typeof value==='string'&&value.trim().length>0&&
    value.length<=256&&!/[\u0000-\u001f]/.test(value);
}
function validateLedger(state,expectedScope){
  if(!state||typeof state!=='object'||Array.isArray(state)||state.version!==1||
     !Number.isSafeInteger(state.revision)||state.revision<0||
     !validIso(state.createdAt)||!validIso(state.updatedAt)||
     !state.entries||typeof state.entries!=='object'||Array.isArray(state.entries)||
     !Array.isArray(state.history)||state.history.length!==state.revision)fail();
  const scope=validateScope(state.scope);
  if(expectedScope){
    const expected=validateScope(expectedScope);
    if(expected.guildId!==scope.guildId||expected.forumId!==scope.forumId)fail();
  }
  if(Object.keys(state.entries).length>50000||state.history.length>250000)fail();
  for(const [ref,record] of Object.entries(state.entries)){
    if(!REF.test(ref)||!record||typeof record!=='object'||Array.isArray(record))fail();
    if(record.eventType!==null&&!TYPES.has(record.eventType))fail();
    if(record.approved!==false&&record.approved!==true)fail();
    if(record.approved===true&&
       (!STAFF.has(record.approvedByRole)||!validEvidence(record.evidenceRef)||!TYPES.has(record.eventType)))fail();
    for(const key of ['departureAtUtc','meetingAtUtc','plannedEndAtUtc']){
      if(record[key]!==null&&record[key]!==undefined&&!validIso(record[key]))fail();
    }
    if(record.departureVerified===true&&!validIso(record.departureAtUtc))fail();
    if(record.meetingVerified===true&&!validIso(record.meetingAtUtc))fail();
    if(record.endVerified===true&&!validIso(record.plannedEndAtUtc))fail();
    if(record.rescheduleApproved===true&&!validIso(record.departureAtUtc))fail();
    if(record.exception){
      const exc=record.exception;
      if(typeof exc!=='object'||Array.isArray(exc)||typeof exc.approved!=='boolean')fail();
      if(exc.approved===true&&(!EXCEPTION.has(exc.approvedByRole)||!validEvidence(exc.evidenceRef)))fail();
    }
    if(!Array.isArray(record.rescheduleHistory))fail();
    for(const h of record.rescheduleHistory){
      if(!h||!validIso(h.previousDepartureAtUtc)||!validIso(h.newDepartureAtUtc))fail();
    }
  }
  const usedEvidence=new Set(),usedReviews=new Set();
  for(let i=0;i<state.history.length;i++){
    const h=state.history[i];
    if(!h||typeof h!=='object'||!REF.test(h.ref)||!ACTIONS.has(h.action)||
       !Number.isSafeInteger(h.revision)||h.revision!==i+1||
       !validIso(h.at)||typeof h.actorId!=='string'||!h.actorId.trim()||
       !validEvidence(h.evidenceRef))fail();
    if(SIGNED_DISCORD_PROOF.test(h.evidenceRef)&&!h.reviewProof)fail();
    if(h.reviewProof!==undefined){
      if(h.actorRole!=='Event Leadership'&&h.actorRole!=='CEO')fail();
      const p=validatedReviewProof(h.reviewProof,h.ref,h.action,
        h.actorId,h.evidenceRef,h.at);
      if(usedEvidence.has(p.evidenceMessageId)||
        usedReviews.has(p.reviewMessageId))fail();
      usedEvidence.add(p.evidenceMessageId);
      usedReviews.add(p.reviewMessageId);
    }
  }
  return state;
}
function createEmptyLedger(scope,at){
  const checked=validateScope(scope);
  if(!validIso(at))fail();
  return {version:1,scope:checked,revision:0,createdAt:iso(at),updatedAt:iso(at),
    entries:{},history:[]};
}
function verifiedRole(actor,needed){
  // Trusted gateway must derive these fields from independently verified
  // Discord membership/role checks on EVERY interaction, never from input.
  if(!actor||actor.source!=='trusted-server-gateway'||
     typeof actor.id!=='string'||!actor.id.trim()||actor.id.length>128||
     !Array.isArray(actor.verifiedRoles)||actor.verifiedRoles.length>25)fail();
  const order=['CEO','Event Management','Event Leadership','Event Coordination'];
  const role=order.find(x=>needed.has(x)&&actor.verifiedRoles.includes(x));
  if(!role)fail();
  return role;
}
function newEntry(){
  return {approved:false,eventType:null,approvedByRole:null,evidenceRef:null,
    departureAtUtc:null,departureVerified:false,
    meetingAtUtc:null,meetingVerified:false,
    plannedEndAtUtc:null,endVerified:false,
    rescheduleApproved:false,rescheduleHistory:[],exception:null};
}
function applyDecision(input,command,actor,at){
  validateLedger(input);
  if(!command||typeof command!=='object'||Array.isArray(command)||
     !REF.test(String(command.ref||''))||!ACTIONS.has(command.action)||
     !Number.isSafeInteger(command.expectedRevision)||
     command.expectedRevision!==input.revision||
     !validEvidence(command.evidenceRef)||!validIso(at))fail();
  const hasProof=command.reviewProof!==undefined;
  if(SIGNED_DISCORD_PROOF.test(command.evidenceRef)!==hasProof)fail();
  let reviewProof;
  if(hasProof){
    reviewProof=validatedReviewProof(command.reviewProof,command.ref,
      command.action,actor?.id,command.evidenceRef,at);
    if(input.history.some(h=>
      h.reviewProof?.evidenceMessageId===reviewProof.evidenceMessageId||
      h.reviewProof?.reviewMessageId===reviewProof.reviewMessageId))fail();
  }
  const role=verifiedRole(actor,
    ['exception','revoke-exception'].includes(command.action)?EXCEPTION:STAFF);
  // A reviewed Discord proposal requires a DIFFERENT current leadership
  // member, never just a self-asserted operational Staff role.
  if(hasProof&&role!=='Event Leadership'&&role!=='CEO')fail();
  const state=structuredClone(input);
  const ref=command.ref;
  const record=state.entries[ref]||newEntry();
  const before=structuredClone(record);
  switch(command.action){
    case 'classification':
      if(!TYPES.has(command.value))fail();
      // Approval belongs to a specific category. Do not carry a quota
      // exception across a change from Partner to External (or Kings).
      if(record.eventType!==command.value)record.exception=null;
      record.approved=true;
      record.eventType=command.value;
      record.approvedByRole=role;
      record.evidenceRef=command.evidenceRef;
      // A Kings-owned event cannot have an external quota exception.
      if(command.value==='Kings Convoy')record.exception=null;
      break;
    case 'departure':
      if(!validIso(command.value))fail();
      // A changed verified departure is a reschedule/correction requiring
      // its own audited decision, never an untracked in-place overwrite.
      if(record.departureVerified&&record.departureAtUtc!==iso(command.value))fail();
      record.departureAtUtc=iso(command.value);
      record.departureVerified=true;
      record.rescheduleApproved=false;
      break;
    case 'meeting':
      if(!validIso(command.value))fail();
      record.meetingAtUtc=iso(command.value);
      record.meetingVerified=true;
      break;
    case 'end':
      if(!validIso(command.value))fail();
      record.plannedEndAtUtc=iso(command.value);
      record.endVerified=true;
      break;
    case 'reschedule': {
      if(!record.approved||!record.departureVerified||!validIso(record.departureAtUtc)||
        !validIso(command.value)||iso(command.value)===record.departureAtUtc)fail();
      const previousDepartureAtUtc=record.departureAtUtc;
      const newDepartureAtUtc=iso(command.value);
      record.rescheduleHistory.push({
        previousDepartureAtUtc,newDepartureAtUtc,
        at:iso(at),approvedByRole:role,evidenceRef:command.evidenceRef
      });
      record.departureAtUtc=newDepartureAtUtc;
      record.departureVerified=true;
      record.rescheduleApproved=true;
      record.status='Rescheduled';
      // An exception is not transferable across capacity dates/months.
      record.exception=null;
      // An old meeting/end may no longer describe the new time slot.
      record.meetingAtUtc=null;
      record.meetingVerified=false;
      record.plannedEndAtUtc=null;
      record.endVerified=false;
      break;
    }
    case 'exception':
      if(record.approved!==true||record.eventType==='Kings Convoy')fail();
      record.exception={approved:true,approvedByRole:role,evidenceRef:command.evidenceRef};
      break;
    case 'revoke-classification':
      record.approved=false;
      record.eventType=null;
      record.approvedByRole=null;
      record.evidenceRef=null;
      record.exception=null;
      record.rescheduleApproved=false;
      record.status=null;
      break;
    case 'revoke-departure':
      record.departureAtUtc=null;
      record.departureVerified=false;
      record.rescheduleApproved=false;
      record.status=null;
      record.exception=null;
      break;
    case 'revoke-meeting':
      record.meetingAtUtc=null;
      record.meetingVerified=false;
      break;
    case 'revoke-end':
      record.plannedEndAtUtc=null;
      record.endVerified=false;
      break;
    case 'revoke-exception':
      record.exception=null;
      break;
    default:fail();
  }
  state.entries[ref]=record;
  state.revision++;
  state.updatedAt=iso(at);
  state.history.push({
    revision:state.revision,ref,action:command.action,
    actorId:actor.id,actorRole:role,evidenceRef:command.evidenceRef,
    ...(hasProof?{reviewProof}:{}),
    at:state.updatedAt,before,after:structuredClone(record)
  });
  return validateLedger(state);
}
function privateDecisions(state){
  validateLedger(state);
  const result=Object.create(null);
  for(const [ref,entry] of Object.entries(state.entries)){
    if(entry.approved!==true)continue;
    result[ref]={
      approved:true,approvedByRole:entry.approvedByRole,
      evidenceRef:entry.evidenceRef,eventType:entry.eventType,
      departureAtUtc:entry.departureAtUtc,departureVerified:entry.departureVerified,
      meetingAtUtc:entry.meetingAtUtc,meetingVerified:entry.meetingVerified,
      plannedEndAtUtc:entry.plannedEndAtUtc,endVerified:entry.endVerified,
      status:entry.status||null,rescheduleApproved:entry.rescheduleApproved,
      exception:entry.exception?structuredClone(entry.exception):null
    };
  }
  return result;
}
function derivedKey(secret){
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32)fail();
  return crypto.createHash('sha256').update(DOMAIN+'\0').update(secret).digest();
}
function aad(scope){
  const s=validateScope(scope);
  return Buffer.from([DOMAIN,s.guildId,s.forumId].join('\0'),'utf8');
}
function sealLedger(ledger,secret){
  validateLedger(ledger);
  const key=derivedKey(secret);
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad(ledger.scope));
  const ciphertext=Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(ledger),'utf8')),cipher.final()
  ]);
  return {version:1,encrypted:true,algorithm:'aes-256-gcm',
    iv:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64'),
    ciphertext:ciphertext.toString('base64')};
}
function exactBase64(value){
  return typeof value==='string'&&value.length>0&&value.length<=32*1024*1024&&
    value.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}
function unsealLedger(container,secret,scope){
  const expected=validateScope(scope);
  const key=derivedKey(secret);
  if(!container||typeof container!=='object'||Array.isArray(container)||
     Object.keys(container).sort().join(',')!==
       'algorithm,authTag,ciphertext,encrypted,iv,version'||
     container.version!==1||container.encrypted!==true||
     container.algorithm!=='aes-256-gcm'||
     !exactBase64(container.iv)||!exactBase64(container.authTag)||
     !exactBase64(container.ciphertext)||
     Buffer.from(container.iv,'base64').length!==12||
     Buffer.from(container.authTag,'base64').length!==16)fail();
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(container.iv,'base64'));
    decipher.setAAD(aad(expected));
    decipher.setAuthTag(Buffer.from(container.authTag,'base64'));
    const raw=Buffer.concat([
      decipher.update(Buffer.from(container.ciphertext,'base64')),decipher.final()
    ]);
    return validateLedger(JSON.parse(raw.toString('utf8')),expected);
  }catch{
    fail();
  }
}
module.exports={createEmptyLedger,validateLedger,applyDecision,privateDecisions,sealLedger,unsealLedger};
