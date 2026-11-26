'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {WORKFLOW_REGISTRY}=require('../kings-workflow-registry');
const {
 VERIFIED,PENDING,FUNCTION_IDS,namedEventSystems,AREA_ORDER,
 assertAcceptance,acceptanceStatus,snapshot
}=require('../kings-system-acceptance');
const ROOT='https://github.com/Stinkesocke107/kings-logistics-automation/';
test('every live Kings workflow appears exactly once in the acceptance overview',()=>{
 const s=snapshot();
 const files=s.eventSystems.map(x=>x.id);
 assert.equal(s.totalWorkflows,WORKFLOW_REGISTRY.length);
 assert.equal(s.totalWorkflows,46);
 assert.equal(new Set(WORKFLOW_REGISTRY.map(x=>x.file)).size,46);
 assert.equal(s.areas.reduce((n,a)=>n+a.total,0),46);
 assert.deepEqual(s.areas.map(x=>x.name),AREA_ORDER);
 assert.equal(s.completeWorkflows,0);
 assert.ok(s.excluded.some(x=>x.startsWith('17')));
 assert.equal(files.includes('17'),false);
 assert.equal(files.includes('18'),true);
 assert.equal(s.assessedWorkflows,1);
 assertAcceptance();
});
test('a successful workflow or many offline tests never grant full System #18 acceptance',()=>{
 const s=snapshot(),event=s.eventSystems.find(x=>x.id==='18');
 assert.equal(event.acceptance,'PARTIALLY_VERIFIED');
 assert.equal(event.ownerApproval,null);
 assert.ok(event.capabilities.some(x=>x.id==='encrypted_journal'&&x.state===VERIFIED));
 assert.ok(event.capabilities.some(x=>x.id==='refresh_after_new_review'&&x.state===PENDING));
 assert.ok(event.capabilities.some(x=>x.id==='operator_handover'&&x.state===PENDING));
 assert.ok(event.capabilities.some(x=>x.id==='webhook_timeout_guard'&&x.state===VERIFIED));
 assert.ok(event.capabilities.some(x=>x.id==='scheduler_recovery_guard'&&x.state===VERIFIED));
 assert.ok(event.capabilities.some(x=>x.id==='scheduler_live_recovery'&&x.state===VERIFIED));
 assert.ok(event.blockers.length>0);
 const capacity=s.eventSystems.find(x=>x.id==='12');
 assert.equal(capacity.acceptance,'PARTIALLY_VERIFIED');
 assert.ok(capacity.capabilities.some(x=>
   x.id==='live_calendar_source'&&x.state===VERIFIED));
 assert.ok(capacity.capabilities.some(x=>
   x.id==='live_capacity_staff_worklist'&&x.state===VERIFIED));
 assert.ok(capacity.capabilities.some(x=>
   x.id==='live_integrated_acceptance'&&x.state===PENDING));
 assert.ok(capacity.capabilities.some(x=>
   x.id==='owner_final_approval'&&x.state===PENDING));
 assert.ok(capacity.blockers.length>0);
 const history=s.eventSystems.find(x=>x.id==='14');
 assert.equal(history.acceptance,'PARTIALLY_VERIFIED');
 assert.equal(history.ownerApproval,null);
 assert.ok(history.capabilities.some(x=>
   x.id==='month_source_integrity'&&x.state===VERIFIED));
 assert.ok(history.capabilities.some(x=>
   x.id==='original_archive_completeness'&&x.state===PENDING));
 assert.ok(history.blockers.length>0);
 assert.ok(history.capabilities.some(x=>
   x.id==='live_reconciled_source_probe'&&x.state===VERIFIED));
 const invite=s.eventSystems.find(x=>x.id==='15');
 assert.equal(invite.acceptance,'PARTIALLY_VERIFIED');
 assert.ok(invite.capabilities.some(x=>
   x.id==='live_tag_schema'&&x.state===VERIFIED));
 assert.ok(invite.capabilities.some(x=>
   x.id==='invitation_archive_coverage'&&x.state===PENDING));
 const calendar=s.eventSystems.find(x=>x.id==='16');
 assert.equal(calendar.acceptance,'PARTIALLY_VERIFIED');
 assert.ok(calendar.capabilities.some(x=>
   x.id==='live_readonly_calendar_source'&&x.state===VERIFIED));
 assert.ok(calendar.capabilities.some(x=>
   x.id==='original_calendar_decisions'&&x.state===PENDING));
 assert.ok(!s.eventSystems.some(x=>x.acceptance==='COMPLETE'));
});
test('a system is only COMPLETE after every function, all checks, zero blockers, CEO signoff and source proof',()=>{
 const all=FUNCTION_IDS.map(id=>({id,state:VERIFIED,evidence:[ROOT+'pull/191']}));
 const capabilities=[{id:'channel',state:VERIFIED,evidence:[ROOT+'actions/runs/45739168709']}];
 const approval={approvedBy:'CEO',approvedAt:'2026-11-26T20:30:00Z',evidence:[ROOT+'pull/191']};
 const base={gates:all,capabilities,blockers:[],ownerApproval:approval};
 assert.equal(acceptanceStatus(base),'COMPLETE');
 assert.equal(acceptanceStatus({...base,blockers:['One live scenario missing']}),'PARTIALLY_VERIFIED');
 assert.equal(acceptanceStatus({...base,ownerApproval:null}),'PARTIALLY_VERIFIED');
 assert.equal(acceptanceStatus({...base,gates:[...all.slice(0,-1),
   {id:'owner_signoff',state:PENDING,evidence:[]}]}),'PARTIALLY_VERIFIED');
 assert.equal(acceptanceStatus({gates:all.map(x=>({...x,state:PENDING,evidence:[]}))}),
   'NOT_ASSESSED');
 assert.throws(()=>acceptanceStatus({...base,ownerApproval:{
   ...approval,evidence:['https://invalid.example/stuff']}}),/repository evidence/);
});
test('only exact evidence may be attached to a verified function',()=>{
 for(const system of namedEventSystems){
  assert.equal(system.gates.length,FUNCTION_IDS.length);
  for(const g of [...system.gates,...(system.capabilities||[])]){
   if(g.state===VERIFIED){
    assert.ok(g.evidence.length>0);
    assert.ok(g.evidence.every(s=>s.startsWith(ROOT)));
   } else assert.deepEqual([...g.evidence],[]);
  }
 }
 assert.equal(namedEventSystems.find(x=>x.id==='18').name,
   'Event Operations — Discord Staff Review');
});
