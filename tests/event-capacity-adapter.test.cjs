'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {adaptConvoyReports,evaluateConvoyReports}=require('../event-capacity-adapter');
const NOW=Date.parse('2027-03-20T12:00:00Z');
const GUILD='example-guild',FORUM='example-forum';
const O={
  nowMs:NOW,trustedSource:true,expectedGuildId:GUILD,expectedForumId:FORUM
};
function item(id=10,status='Scheduled',more={}){
  const s=String(id);
  return {
    threadId:s,eventId:s,name:'Sample convoy',status,
    staffStatus:{status,authorId:'synthetic-staff',matchedRoleIds:['mock-role'],roleSource:'message.member'},
    validation:{parsed:{eventType:'Partner Convoy',departureAtUtc:'2027-03-20T16:00:00Z'}},
    truckersmpSync:{ok:true,authoritative:true,syncedAt:'2027-03-20T11:55:00Z'},
    truckersmp:{
      id,meetupAtUtc:'2027-03-20T15:00:00Z',
      startAtUtc:'2027-03-20T16:00:00Z',authoritative:{eventDate:'2027-03-20'}
    },
    ...more
  };
}
function report(threads=[item()]){
  return {guildId:GUILD,forumId:FORUM,generatedAt:'2027-03-20T11:53:00Z',
    finalization:{finalizedAt:'2027-03-20T11:55:00Z'},summary:{totalThreads:threads.length,actualConvoys:threads.length},threads};
}
function overview(legacyConvoys=[]){
  const center={
    source:'convoy-center',eventId:'10',threadId:'10',status:'Scheduled',
    departureAtUtc:'2027-03-20T16:00:00Z'
  };
  return {guildId:GUILD,forumId:FORUM,generatedAt:'2027-03-20T11:56:00Z',
    overall:{convoyReadErrors:0,legacyImportedConvoys:legacyConvoys.length,
      legacyDuplicatesSuppressed:0,realConvoySubmissions:1},
    registeredConvoys:[center,...legacyConvoys]};
}
function decision(type='Partner Convoy',extra={}){
  return {approved:true,approvedByRole:'Event Coordination',evidenceRef:'private-verification-ref',eventType:type,
    endVerified:true,plannedEndAtUtc:'2027-03-20T19:00:00Z',...extra};
}
test('Trusted, fresh normalized reports count accepted event with private classification proof',()=>{
  const r=evaluateConvoyReports(report(),overview(),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.adapter.dataFresh,true);
  assert.equal(r.capacity.days['2027-03-20'].partner,1);
  assert.equal(r.capacity.issues.length,0);
  assert.equal(r.capacity.attendanceInferred,false);
});
test('Event type in raw Convoy Center is insufficient without Kings confirmation',()=>{
  const r=evaluateConvoyReports(report(),overview(),O);
  assert.equal(r.capacity.counted,0);
  assert.equal(r.capacity.issues.some(x=>x.code==='unverified-event-type'),true);
  assert.equal(r.adapter.issues.some(x=>x.code==='classification-needs-event-coordination-verification'),true);
});
test('Incomplete derived status conflicting with an actual Staff Scheduled cannot free a slot',()=>{
  const src=item(10,'Needs Information',{staffStatus:item().staffStatus});
  const r=evaluateConvoyReports(report([src]),overview(),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.capacity.counted,0);
  assert.equal(r.capacity.issues.some(x=>x.code==='unverified-status'),true);
  assert.equal(r.adapter.issues.some(x=>x.code==='staff-status-vs-derived-status-conflict'),true);
});
test('If TruckersMP sync is stale, departure cannot be trusted even if report is recent',()=>{
  const src=item(10,'Scheduled',{truckersmpSync:{ok:true,authoritative:true,syncedAt:'2027-03-20T10:00:00Z'}});
  const r=evaluateConvoyReports(report([src]),overview(),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.capacity.counted,0);
  assert.equal(r.capacity.issues.some(x=>x.code==='unverified-departure'),true);
});
test('No trusted report scope or late report means no verified available capacity',()=>{
  const r=evaluateConvoyReports(report([]),overview(),{...O,expectedForumId:'wrong'});
  assert.equal(r.adapter.dataFresh,false);
  assert.equal(r.capacity.globalUncertainty,true);
});
test('Publicly cancelled and verified TMP events release quota',()=>{
  const src=item(10,'Cancelled',{staffStatus:null,truckersmp:{...item().truckersmp,publicCancelled:true}});
  const r=evaluateConvoyReports(report([src]),overview(),O);
  assert.equal(r.capacity.counted,0);
});
test('Completed status is only accepted as confirmed internal Staff status, not attendance',()=>{
  const src=item(10,'Completed');
  const r=evaluateConvoyReports(report([src]),overview(),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.capacity.counted,1);
  assert.equal(r.capacity.attendanceInferred,false);
});
test('Frozen legacy events appear as review blockers, not as confirmed slots',()=>{
  const l={source:'legacy-calendar',eventId:'old-22',threadId:'old-thread',status:'Scheduled',
    eventType:'Legacy Calendar',departureAtUtc:'2027-03-21T16:00:00Z'};
  const r=evaluateConvoyReports(report(),overview([l]),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.capacity.counted,1);
  assert.equal(r.capacity.issues.some(x=>x.code==='unverified-status'),true);
  assert.ok(r.capacity.uncertainDates.includes('2027-03-21'));
});
test('Legacy entries lacking verified departure fail closed globally',()=>{
  const l={source:'legacy-calendar',threadId:'old-thread',status:'Scheduled',
    eventType:'Legacy Calendar',eventDate:'2027-03-21'};
  const r=evaluateConvoyReports(report(),overview([l]),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.capacity.globalUncertainty,true);
});
test('Classification conflicts are flagged without silently accepting external label',()=>{
  const r=evaluateConvoyReports(report(),overview(),{...O,classifications:{'event:10':decision('External Convoy')}});
  assert.equal(r.capacity.days['2027-03-20'].external,1);
  assert.ok(r.capacity.issues.some(x=>x.code==='data-conflict'));
});
test('Manual evidence can support a HaulMP-style record without TruckersMP sync',()=>{
  const src=item('haulmp-custom','Scheduled',{
    truckersmpSync:null,truckersmp:null,
    validation:{parsed:{eventType:'External Convoy'}},
    staffStatus:{status:'Scheduled',authorId:'synthetic-staff',matchedRoleIds:['mock-role'],roleSource:'message.member'}
  });
  const proof=decision('External Convoy',{
    departureVerified:true,departureAtUtc:'2027-03-20T16:00:00Z',
    meetingVerified:true,meetingAtUtc:'2027-03-20T15:00:00Z'
  });
  const r=evaluateConvoyReports(report([src]),overview(),{
    ...O,classifications:{'event:haulmp-custom':proof}
  });
  assert.equal(r.capacity.days['2027-03-20'].external,1);
  assert.equal(r.capacity.issues.length,0);
});
test('Missing end evidence counts accepted quota but keeps calendar unverified',()=>{
  const proof=decision('Partner Convoy',{endVerified:false});
  const r=evaluateConvoyReports(report(),overview(),{...O,classifications:{'event:10':proof}});
  assert.equal(r.capacity.counted,1);
  assert.equal(r.capacity.issues.some(x=>x.code==='end-time-unknown'),true);
  assert.equal(r.capacity.uncertainDates.includes('2027-03-20'),true);
});
test('Adapter must not return staff identifiers or raw confidential descriptions',()=>{
  const r=adaptConvoyReports(report(),overview(),{...O,classifications:{'event:10':decision()}});
  const text=JSON.stringify(r);
  assert.equal(text.includes('synthetic-staff'),false);
  assert.equal(text.includes('private-verification-ref'),false);
  assert.equal(text.includes('Sample convoy'),false);
});
test('Duplicate Event IDs are not counted twice and source conflict requires review',()=>{
  const a=item(10),b={...item(10),threadId:'alternate-thread',duplicateEventId:true};
  const r=evaluateConvoyReports(report([a,b]),overview(),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.capacity.counted,0);
  assert.equal(r.capacity.issues.some(x=>x.code==='conflicting-duplicate'),true);
});

test('Classification approval does not authorize a quota exception by itself',()=>{
  const forged=decision('Partner Convoy',{exceptionApprovedBy:'CEO'});
  const r=evaluateConvoyReports(report(),overview(),{...O,classifications:{'event:10':forged}});
  assert.equal(r.capacity.days['2027-03-20'].approvedExceptions,0);
});
test('Independently documented Event Management exception is counted, never changes limits',()=>{
  const proof=decision('Partner Convoy',{exception:{approved:true,approvedByRole:'Event Management',evidenceRef:'private-exception'}}); 
  const r=evaluateConvoyReports(report(),overview(),{...O,classifications:{'event:10':proof}});
  assert.equal(r.capacity.days['2027-03-20'].approvedExceptions,1);
  assert.equal(r.capacity.limits.weekdayCombined,3);
  assert.equal(r.capacity.limits.weekendCombined,5);
  assert.equal(r.capacity.limits.combinedDaily,null);
});
test('Missing or contradictory source inventory fails closed',()=>{
  const partial=report();
  partial.summary.totalThreads=2;
  const r=evaluateConvoyReports(partial,overview(),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.adapter.dataFresh,false);
  assert.equal(r.capacity.globalUncertainty,true);
});
test('Recognized staff identity without verified authorization role is not sufficient',()=>{
  const src=item(10,'Scheduled',{staffStatus:{status:'Scheduled',authorId:'synthetic-staff',matchedRoleIds:[],roleSource:'message.member'}});
  const r=evaluateConvoyReports(report([src]),overview(),{...O,classifications:{'event:10':decision()}});
  assert.equal(r.capacity.counted,0);
  assert.equal(r.capacity.issues.some(x=>x.code==='unverified-status'),true);
});

test('A matching count but different Center Event ID blocks verified availability',()=>{
  const suspect=overview();
  suspect.registeredConvoys[0].eventId='another-event';
  const r=evaluateConvoyReports(report(),suspect,{
    ...O,classifications:{'event:10':decision()}
  });
  assert.equal(r.adapter.dataFresh,false);
  assert.equal(r.capacity.globalUncertainty,true);
  assert.ok(r.adapter.issues.some(x=>x.code==='overview-center-identity-conflict'));
});
test('An Overview status mismatch blocks source freshness despite equal counts',()=>{
  const suspect=overview();
  suspect.registeredConvoys[0].status='Cancelled';
  const r=evaluateConvoyReports(report(),suspect,{
    ...O,classifications:{'event:10':decision()}
  });
  assert.equal(r.adapter.dataFresh,false);
  assert.equal(r.capacity.globalUncertainty,true);
});
