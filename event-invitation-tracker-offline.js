'use strict';
// Kings Logistics Event Invitation Tracker — standalone OFFLINE source-claim
// reviewer. No Discord, GitHub or network access; no approval, booking, send,
// role change, archive import, or certification. Inputs are UNTRUSTED.
const ERROR = 'Kings Event Invitation offline review refused.';
const ID = /^[A-Za-z0-9_.:-]{1,96}$/;
const EVENT = /^[A-Za-z0-9_-]{1,64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UTC = /^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const STATUSES = Object.freeze(['Draft','Sent','Accepted','Declined','Withdrawn','Unknown']);
const NEXT = Object.freeze({
  Draft: ['Sent','Withdrawn'],
  Sent: ['Accepted','Declined','Withdrawn','Unknown'],
  Accepted: [], Declined: [], Withdrawn: [], Unknown: []
});
const MAX_RECORDS=10000,MAX_CHANGES=50000;
function fail(){throw Error(ERROR);}
function plain(x){return x!==null && typeof x==='object' && !Array.isArray(x) && Object.getPrototypeOf(x)===Object.prototype;}
function exact(x, names){if(!plain(x)||Object.keys(x).sort().join(',')!==names.slice().sort().join(','))fail();}
function instant(x){
  if(typeof x!=='string'||!UTC.test(x))fail();
  const ms=Date.parse(x);
  if(!Number.isFinite(ms)||new Date(ms).toISOString()!==x)fail();
  return ms;
}
function reviewKingsEventInvitationsOffline({asOfUtc,invitations,changes}={}){
  try{
    const now=instant(asOfUtc);
    if(!Array.isArray(invitations)||invitations.length>MAX_RECORDS||
      !Array.isArray(changes)||changes.length>MAX_CHANGES)fail();
    const records=new Map(),states=new Map(),eventLinks=new Map();
    for(const [index,row] of invitations.entries()){
      exact(row,['invitationId','eventId','departureAtUtc','createdAtUtc','replyDueAtUtc','sourceDigest']);
      if(!ID.test(row.invitationId)||records.has(row.invitationId)||
        (row.eventId!==null&&!EVENT.test(row.eventId))||
        !DIGEST.test(row.sourceDigest))fail();
      const created=instant(row.createdAtUtc),depart=instant(row.departureAtUtc);
      const due=row.replyDueAtUtc===null?null:instant(row.replyDueAtUtc);
      if(created>now||depart<=created||due!==null&&(due<created||due>depart))fail();
      records.set(row.invitationId,{index,eventId:row.eventId,created,depart,due});
      states.set(row.invitationId,{status:'Draft',last:created,digests:new Set([row.sourceDigest])});
      if(row.eventId!==null)eventLinks.set(row.eventId,(eventLinks.get(row.eventId)||0)+1);
    }
    // Changes are strictly chronological PER invitation, never inferred from
    // created/due/departure times. A response without a proven Sent transition
    // is not silently promoted to a valid acceptance.
    for(const change of changes){
      exact(change,['invitationId','status','atUtc','sourceDigest']);
      if(!ID.test(change.invitationId)||!records.has(change.invitationId)||
        !STATUSES.includes(change.status)||!DIGEST.test(change.sourceDigest))fail();
      const at=instant(change.atUtc),state=states.get(change.invitationId),row=records.get(change.invitationId);
      if(at<=state.last||at>now||at<row.created||
        state.digests.has(change.sourceDigest)||
        !NEXT[state.status].includes(change.status))fail();
      state.status=change.status;
      state.last=at;
      state.digests.add(change.sourceDigest);
    }
    const counts={total:records.size,draft:0,sent:0,accepted:0,declined:0,withdrawn:0,unknown:0,
      pendingReplies:0,overdueReplyReview:0,unlinkedEventClaims:0,
      duplicateEventLinkClaims:0,departedUnresolved:0};
    const reviews=[];
    function review(index,reason){reviews.push(Object.freeze({sourceRow:index,reason,humanReviewRequired:true}));}
    for(const [id,row] of records){
      const status=states.get(id).status;
      counts[status.toLowerCase()]++;
      if(status==='Sent'){
        counts.pendingReplies++;
        if(row.due!==null&&row.due<now&&row.depart>now){
          counts.overdueReplyReview++;
          review(row.index,'REPLY_DUE_HUMAN_FOLLOWUP');
        }
      }
      if(row.eventId===null){counts.unlinkedEventClaims++;review(row.index,'EVENT_LINK_MISSING');}
      else if(eventLinks.get(row.eventId)>1){
        counts.duplicateEventLinkClaims++;
        review(row.index,'DUPLICATE_EVENT_LINK_REVIEW');
      }
      if(status==='Unknown')review(row.index,'RESPONSE_UNVERIFIED');
      if(row.depart<=now&&['Draft','Sent','Unknown'].includes(status)){
        counts.departedUnresolved++;
        review(row.index,'DEPARTURE_PASSED_UNRESOLVED');
      }
    }
    reviews.sort((a,b)=>a.sourceRow-b.sourceRow||a.reason.localeCompare(b.reason));
    // Caller-supplied status and digests are claims, not authenticated Discord
    // source, not a record of a real organizer response and NEVER staff approval.
    return Object.freeze({
      version:1,visibility:'PRIVATE_ONLY',mode:'OFFLINE_UNTRUSTED_SOURCE_REVIEW',
      readOnly:true,counts:Object.freeze(counts),reviewItems:Object.freeze(reviews),
      reviewItemCount:reviews.length,
      trackerConnectedHere:false,discordSourceAuthenticatedHere:false,
      eventCenterLinksIndependentlyVerified:false,
      repliesProviderVerified:false,humansNotified:0,remindersSent:0,
      eventBookingsCreated:0,staffApprovalsCommitted:0,
      capacityReservationsChanged:0,freeSlotsCertified:false,safeToActivate:false
    });
  }catch{fail();}
}
module.exports={reviewKingsEventInvitationsOffline};
