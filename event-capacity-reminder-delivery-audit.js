'use strict';
// DRAFT / PRIVATE / OFFLINE / READ-ONLY.
// Model a GitHub Actions-only Workboard reminder outbox. Receipts are untrusted
// caller claims, NOT proof of delivery. Never call Discord or publish IDs.
// Durable compare-and-swap storage, trusted bot sender and role checks are
// explicit release gates outside this module.
const crypto=require('node:crypto');
const {validate,attention}=require('./event-capacity-workboard');
const ERROR='Kings Event Reminder delivery audit refused.';
const KINDS=Object.freeze(['coordination-reminder','leadership-overview',
  'follow-up-due','department-reminder','department-leadership-overview']);
const CLAIMS=new Set(['Delivered','Pending','Unknown']);
function fail(){throw new Error(ERROR);}
function plain(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||
    Object.getPrototypeOf(v)===null);}
function instant(x){
  if(typeof x!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x))fail();
  const t=Date.parse(x);
  if(!Number.isFinite(t)||new Date(t).toISOString()!==x&&
    new Date(t).toISOString().replace('.000Z','Z')!==x)fail();
  return t;
}
function count(x){if(!Number.isSafeInteger(x)||x<0||x>10000)fail();return x;}
function keyOf(secret,scope,raw){
  return 'kings-workboard-reminder:'+crypto.createHmac('sha256',secret)
    .update(['kings-event-reminder-v1',scope.guildId,scope.forumId,raw]
      .join('\0')).digest('hex').slice(0,48);
}
function auditKingsEventReminderDelivery({
  workboard,nowUtc,secret,receiptClaims=[]
}={}){
  try{
    validate(workboard);
    if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32||
      Buffer.byteLength(secret,'utf8')>4096||!Array.isArray(receiptClaims)||
      receiptClaims.length>10000)fail();
    const now=instant(nowUtc),last=instant(workboard.updatedAt);
    if(now<last||instant(workboard.createdAt)>last)fail();
    const scope=workboard.scope,all=new Map();
    // Workboard.validate checks shape, not snapshot origin/identity coherence.
    for(const [id,t] of Object.entries(workboard.tasks)){
      if(!plain(t)||t.id!==id||
        instant(t.createdAt)>instant(t.updatedAt)||
        instant(t.updatedAt)>last)fail();
    }
    for(const [id,r] of Object.entries(workboard.requests)){
      if(!plain(r)||r.id!==id||
        instant(r.createdAt)>instant(r.updatedAt)||
        instant(r.updatedAt)>last)fail();
    }
    const notices=attention(workboard,nowUtc);
    if(notices.length>10000)fail();
    for(const n of notices){
      if(!plain(n)||!KINDS.includes(n.kind)||typeof n.key!=='string'||
        n.key.length>512)fail();
      const digest=keyOf(secret,scope,n.key);
      if(all.has(digest))fail();
      all.set(digest,n.kind);
    }
    const receipts=new Map(),claimsByState=Object.fromEntries(
      [...CLAIMS].map(k=>[k,0]));
    for(const r of receiptClaims){
      if(!plain(r)||
        Object.keys(r).sort().join(',')!==
          ['dedupeKey','state','claimedAtUtc'].sort().join(',')||
        typeof r.dedupeKey!=='string'||
        !/^kings-workboard-reminder:[a-f0-9]{48}$/.test(r.dedupeKey)||
        !CLAIMS.has(r.state)||receipts.has(r.dedupeKey)||
        instant(r.claimedAtUtc)>now)fail();
      receipts.set(r.dedupeKey,r.state);
      claimsByState[r.state]++;
    }
    const unrecognized=[...receipts.keys()].filter(k=>!all.has(k)).length;
    const claimedMatches=Object.fromEntries([...CLAIMS].map(s=>[s,0]));
    const kindCounts=Object.fromEntries(KINDS.map(kind=>[kind,0]));
    for(const [key,kind] of all){
      kindCounts[kind]++;
      if(receipts.has(key))claimedMatches[receipts.get(key)]++;
    }
    // These counts are diagnostics only. In particular, Delivered receipts
    // do not prove Discord accepted a message and Pending does not authorize
    // a retry; both need authenticated storage/response reconciliation.
    const needsClaimReview=all.size-claimedMatches.Delivered;
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',readOnly:true,
      workboardRevision:count(workboard.revision),
      dueReminderClaims:count(all.size),
      dueByKind:Object.freeze(kindCounts),
      receiptClaimsSupplied:count(receipts.size),
      matchingDeliveredClaims:count(claimedMatches.Delivered),
      matchingPendingClaims:count(claimedMatches.Pending),
      matchingUnknownClaims:count(claimedMatches.Unknown),
      matchingNoReceiptClaims:count(all.size-
        claimedMatches.Delivered-claimedMatches.Pending-
        claimedMatches.Unknown),
      unrelatedReceiptClaims:count(unrecognized),
      needsAuthenticatedReceiptReview:count(needsClaimReview),
      rawReminderKeysReturned:false,rawStaffIdsReturned:false,
      receiptsCryptographicallyVerified:false,
      externalDeliveryAcknowledgedHere:false,
      workboardSourceAuthenticated:false,
      claimedDeliveryIsNotProof:true,
      sendAllowed:false,automaticRetryAllowed:false,
      allReceiptsNeedHumanOrTrustedHostReview:true,
      remindersSent:0,workboardWrites:0,discordMessagesSent:0,
      staffDecisionsCommitted:0,safeToActivate:false
    });
  }catch{fail();}
}
function renderKingsEventReminderDeliveryPreview(r){
  try{
    if(!plain(r)||r.version!==1||r.visibility!=='PRIVATE_ONLY'||
      r.readOnly!==true||r.safeToActivate!==false||
      r.sendAllowed!==false||r.automaticRetryAllowed!==false||
      r.receiptsCryptographicallyVerified!==false||
      r.externalDeliveryAcknowledgedHere!==false||
      r.workboardSourceAuthenticated!==false||
      r.claimedDeliveryIsNotProof!==true||
      r.rawReminderKeysReturned!==false||r.rawStaffIdsReturned!==false||
      r.allReceiptsNeedHumanOrTrustedHostReview!==true||
      r.remindersSent!==0||r.workboardWrites!==0||
      r.discordMessagesSent!==0||r.staffDecisionsCommitted!==0||
      !plain(r.dueByKind)||Object.keys(r.dueByKind).length!==KINDS.length)
      fail();
    const sum=KINDS.reduce((n,k)=>n+count(r.dueByKind[k]),0);
    if(sum!==count(r.dueReminderClaims)||
      count(r.matchingDeliveredClaims)+
      count(r.matchingPendingClaims)+
      count(r.matchingUnknownClaims)+
      count(r.matchingNoReceiptClaims)!==sum||
      count(r.receiptClaimsSupplied)!==
        r.matchingDeliveredClaims+r.matchingPendingClaims+
        r.matchingUnknownClaims+count(r.unrelatedReceiptClaims)||
      count(r.needsAuthenticatedReceiptReview)!==
        sum-r.matchingDeliveredClaims||
      count(r.workboardRevision)>10000)fail();
    const content='**Kings Event Workboard — OFFLINE Reminder Audit**\n'+
      'Due reminder claims: '+sum+' | Claimed delivered '+
      r.matchingDeliveredClaims+' | Pending '+r.matchingPendingClaims+
      ' | Unknown '+r.matchingUnknownClaims+'\n'+
      'No receipt '+r.matchingNoReceiptClaims+
      ' | Unrelated claims '+r.unrelatedReceiptClaims+
      '\n**No Discord delivery proven. No message sent or automatic retry.**';
    if(content.length>2000)fail();
    return Object.freeze({type:4,data:{
      flags:64,allowed_mentions:{parse:[]},content,embeds:[]}});
  }catch{fail();}
}
// Exposed only to synthetic tests and a future protected caller with a
// separately configured secret; do not expose raw source keys in public logs.
module.exports={auditKingsEventReminderDelivery,
  renderKingsEventReminderDeliveryPreview};
