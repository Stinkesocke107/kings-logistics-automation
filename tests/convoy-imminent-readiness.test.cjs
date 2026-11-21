'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const A=require('../convoy-imminent-readiness');
const meetup='2026-11-22T00:00:00.000Z';
const now=Math.floor(Date.parse('2026-11-21T23:15:00.000Z')/1000);
function approved(overrides={}){
 return {
  eventId:'36859',ignored:false,error:null,testThread:false,
  archived:false,locked:false,status:'Scheduled',duplicateEventId:false,
  staffStatus:{status:'Scheduled',authorId:'human-approver',roleSource:'message.member',matchedRoleIds:['approved-event-role']},
  truckersmpSync:{ok:true,authoritative:true,syncedAt:'2026-11-21T23:10:00Z'},
  truckersmp:{id:36859,meetupAtUtc:meetup,publicCancelled:false,authoritative:{eventDate:'2026-11-22'}},
  validation:{complete:true,checks:{eventLink:true,eventType:true,responsibleStaff:true,kingsSlotConfirmed:true,imageProof:true,truckersmpSync:true,eventDate:true,route:true,meetup:true,meetupTime:true},parsed:{kingsSlotImage:{messageId:'synthetic',attachmentId:'synthetic-image'}}},
  eventUnix:Math.floor(Date.parse(meetup)/1000),eventTimeValid:true,
  ...overrides
 };
}
test('valid approved upcoming convoy is eligible but not claimed delivered',()=>{
 const result=A.approvedUpcoming({threads:[approved()]},now);
 assert.equal(result[0].status,'ELIGIBLE_NOT_DELIVERY_PROOF');
 assert.equal(result[0].minutesUntil,45);
 assert.deepEqual(result[0].blockers,[]);
 assert.deepEqual(A.summary(result),{upcomingApproved:1,oneHour:1,blocked:0,blockedOneHour:0});
});
test('real SHL-shaped archived approved convoy is blocked by archived, stale final status and missing meeting time',()=>{
 const x=approved({
  archived:true,status:'Needs Information',eventUnix:null,eventTimeValid:null,
  validation:{complete:false,checks:{kingsSlotConfirmed:true,imageProof:true},
   parsed:{kingsSlotImage:{messageId:'synthetic'}}}
 });
 const result=A.approvedUpcoming({threads:[x]},now);
 assert.equal(result.length,1);
 assert.equal(result[0].status,'BLOCKED');
 assert.deepEqual(result[0].blockers,[
  'archived-approval-or-evidence-not-ready','final-status-not-scheduled',
  'required-fields-not-finalized','meeting-time-not-finalized'
 ]);
 assert.equal(A.summary(result).blockedOneHour,1);
});
test('archived human-approved future convoy is eligible after full read-only finalization',()=>{
 const result=A.approvedUpcoming({threads:[approved({archived:true})]},now);
 assert.equal(result.length,1);
 assert.equal(result[0].status,'ELIGIBLE_NOT_DELIVERY_PROOF');
 assert.deepEqual(result[0].blockers,[]);
});
test('unsupported approvals or cancelled public events are not advertised as due',()=>{
 const variants=[
  approved({staffStatus:{status:'Ready for Approval'}}),
  approved({status:'Cancelled'}),
  approved({duplicateEventId:true}),
  approved({ignored:true}),
  approved({testThread:true}),
  approved({truckersmpSync:{ok:false,authoritative:false}}),
  approved({truckersmp:{meetupAtUtc:meetup,publicCancelled:true,authoritative:{}}}),
  approved({eventId:'some-string'})
 ];
 assert.equal(A.approvedUpcoming({threads:variants},now).length,0);
});
test('missing slot verification, missing image and incorrect time remain blockers',()=>{
 const x=approved({
  archived:false,eventUnix:now+5000,
  validation:{complete:true,checks:{kingsSlotConfirmed:false,imageProof:false},parsed:{}}
 });
 const result=A.approvedUpcoming({threads:[x]},now);
 assert.deepEqual(result[0].blockers,[
  'meeting-time-differs-from-official-source',
  'kings-slot-not-confirmed',
  'slot-image-not-verified'
 ]);
});
test('no stale or far-future event is incorrectly identified as due',()=>{
 assert.equal(A.approvedUpcoming({threads:[approved()]},now+3600).length,0);
 assert.equal(A.approvedUpcoming({threads:[approved()]},now-2*86400).length,0);
 assert.throws(()=>A.approvedUpcoming({threads:null},now),/convoy-readiness-source-invalid/);
});
test('technical diagnostics never send Discord or log private case content',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../convoy-imminent-readiness.js'),'utf8');
 assert.doesNotMatch(code,/(?:fetch|request|https?\.request)\(/);
 assert.doesNotMatch(code,/(?:writeFileSync|unlinkSync)\(/);
 assert.doesNotMatch(code,/console\.log\([^\n]*(?:threadId|ownerId|staffStatus|slotImage|authorId|message\.content)/);
 const x=approved({ownerId:'SECRET-MEMBER-ID',name:'PRIVATE EVENT LABEL'});
 assert.ok(!JSON.stringify(A.approvedUpcoming({threads:[x]},now)).includes('SECRET'));
});
