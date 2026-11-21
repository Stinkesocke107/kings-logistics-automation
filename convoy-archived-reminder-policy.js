'use strict';
// Kings Convoy Center: Discord archive is not a Kings Event approval decision.
// Only independently verified, explicitly staff-approved FUTURE events may
// continue to finalize and send reminders while their source thread is archived.
// This module is pure: never reads Discord, writes messages, unarchives a thread
// or changes an event status / approval.
const TRUSTED_ROLE_SOURCES=new Set(['guild-member-lookup','message.member']);
const EVENT_ID=/^\d{3,10}$/;

function officialMeetingUnix(item){
 const tmp=item?.truckersmp, sync=item?.truckersmpSync;
 if(sync?.ok!==true||sync?.authoritative!==true||
    !tmp?.authoritative||tmp.publicCancelled===true)return null;
 if(!EVENT_ID.test(String(item.eventId||'')))return null;
 if(String(tmp.id)!==String(item.eventId))return null;
 const timestamp=Date.parse(tmp.meetupAtUtc||'');
 if(!Number.isFinite(timestamp)||timestamp<=0)return null;
 return Math.floor(timestamp/1000);
}

function hasHumanScheduledApproval(item){
 const staff=item?.staffStatus;
 return staff?.status==='Scheduled'&&
  TRUSTED_ROLE_SOURCES.has(staff.roleSource)&&
  typeof staff.authorId==='string'&&staff.authorId.length>0&&
  Array.isArray(staff.matchedRoleIds)&&staff.matchedRoleIds.length>0;
}

function isArchivedApprovedFuture(item,nowUnix=Math.floor(Date.now()/1000)){
 if(!item?.archived||item.locked||item.ignored||item.error||
    item.testThread===true||item.duplicateEventId===true||
    item.status==='Cancelled'||item.status==='Completed')return false;
 if(!hasHumanScheduledApproval(item))return false;
 const meeting=officialMeetingUnix(item);
 return meeting!==null&&meeting>nowUnix;
}

function archivedReminderReady(item,nowUnix=Math.floor(Date.now()/1000)){
 if(!isArchivedApprovedFuture(item,nowUnix))return false;
 if(item.status!=='Scheduled'||item.eventTimeValid!==true||
    item.validation?.complete!==true)return false;
 if(!Number.isSafeInteger(item.eventUnix))return false;
 const checks=item.validation.checks||{};
 if(checks.eventLink!==true||checks.eventType!==true||
    checks.responsibleStaff!==true||checks.kingsSlotConfirmed!==true||
    checks.imageProof!==true||checks.truckersmpSync!==true||
    checks.eventDate!==true||checks.route!==true||
    checks.meetup!==true||checks.meetupTime!==true)return false;
 const image=item.kingsSlotImage||item.validation?.parsed?.kingsSlotImage;
 if(!image?.messageId||!image?.attachmentId)return false;
 const official=officialMeetingUnix(item);
 return official!==null&&Math.abs(item.eventUnix-official)<=60;
}

module.exports={officialMeetingUnix,hasHumanScheduledApproval,isArchivedApprovedFuture,archivedReminderReady};
