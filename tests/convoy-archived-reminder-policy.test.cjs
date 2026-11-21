'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../convoy-archived-reminder-policy');

const meet='2030-04-22T18:30:00.000Z';
const now=Date.parse('2030-04-22T18:00:00.000Z')/1000;
const eventUnix=Date.parse(meet)/1000;
function source(changes={}){
 const checks={eventLink:true,eventType:true,responsibleStaff:true,kingsSlotConfirmed:true,imageProof:true,
  truckersmpSync:true,eventDate:true,route:true,meetup:true,meetupTime:true};
 return {
  eventId:'36859', archived:true, locked:false, status:'Scheduled',
  ignored:false, error:null, testThread:false, duplicateEventId:false,
  staffStatus:{status:'Scheduled',authorId:'staff',roleSource:'message.member',matchedRoleIds:['authorized-role']},
  truckersmpSync:{ok:true,authoritative:true},
  truckersmp:{id:36859,publicCancelled:false,meetupAtUtc:meet,authoritative:{eventDate:'2030-04-22'}},
  eventUnix,eventTimeValid:true,
  validation:{complete:true,checks,parsed:{kingsSlotImage:{messageId:'msg',attachmentId:'photo'}}},
  ...changes
 };
}
test('Archive is not an approval revocation for authenticated upcoming approved events',()=>{
 const x=source();
 assert.equal(P.officialMeetingUnix(x),eventUnix);
 assert.equal(P.hasHumanScheduledApproval(x),true);
 assert.equal(P.isArchivedApprovedFuture(x,now),true);
 assert.equal(P.archivedReminderReady(x,now),true);
 assert.equal(P.isArchivedApprovedFuture({...x,archived:false},now),false);
});
test('Future approval must be a real staff-role matching Scheduled message',()=>{
 const x=source();
 const variants=[
  {staffStatus:{status:'Ready for Approval',authorId:'staff',roleSource:'message.member',matchedRoleIds:['authorized-role']}},
  {staffStatus:{status:'Scheduled',authorId:'staff',roleSource:'none',matchedRoleIds:['authorized-role']}},
  {staffStatus:{status:'Scheduled',authorId:'staff',roleSource:'message.member',matchedRoleIds:[]}},
  {staffStatus:{status:'Scheduled',authorId:'',roleSource:'message.member',matchedRoleIds:['authorized-role']}},
  {duplicateEventId:true},{locked:true},{testThread:true},{ignored:true},{error:'unreadable'},
  {status:'Completed'},{status:'Cancelled'}
 ];
 for(const variant of variants)assert.equal(P.isArchivedApprovedFuture({...x,...variant},now),false,JSON.stringify(variant));
});
test('Official time, source event ID, cancellation and freshness are fail closed',()=>{
 const x=source();
 for(const variant of [
  {eventId:'36860'},
  {truckersmp:{...x.truckersmp,id:36860}},
  {truckersmp:{...x.truckersmp,publicCancelled:true}},
  {truckersmp:{...x.truckersmp,meetupAtUtc:'not-a-time'}},
  {truckersmpSync:{ok:false,authoritative:true}},
  {truckersmpSync:{ok:true,authoritative:false}},
  {truckersmp:{...x.truckersmp,authoritative:null}}
 ])assert.equal(P.isArchivedApprovedFuture({...x,...variant},now),false,JSON.stringify(variant));
 assert.equal(P.isArchivedApprovedFuture(x,eventUnix),false);
 assert.equal(P.isArchivedApprovedFuture(x,eventUnix+300),false);
});
test('Archived reminders need complete fields, a verified slot attachment, and matching meeting time',()=>{
 const x=source();
 assert.equal(P.archivedReminderReady(x,now),true);
 for(const variant of [
  {status:'Needs Information'},
  {eventTimeValid:false},
  {eventUnix:null},
  {eventUnix:eventUnix+120},
  {validation:{...x.validation,complete:false}},
  {validation:{...x.validation,checks:{...x.validation.checks,imageProof:false}}},
  {validation:{...x.validation,checks:{...x.validation.checks,kingsSlotConfirmed:false}}},
  {validation:{...x.validation,checks:{...x.validation.checks,truckersmpSync:false}}},
  {validation:{...x.validation,parsed:{kingsSlotImage:{messageId:'msg'}}}}
 ])assert.equal(P.archivedReminderReady({...x,...variant},now),false,JSON.stringify(variant));
});
