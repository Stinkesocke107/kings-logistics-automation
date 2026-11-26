'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {WORKFLOW_REGISTRY}=require('../kings-workflow-registry');
const {
 VERIFIED,PENDING,FUNCTION_IDS,namedEventSystems,namedOperationalSystems,AREA_ORDER,
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
 assert.equal(s.assessedWorkflows,6);
 assert.equal(s.operationalSystems.length,5);
 assert.deepEqual(s.operationalSystems.map(x=>x.id),[
   'DRIVER_UPDATES','DRIVER_MANAGEMENT','HR_PROBATION','STAFF_MANAGEMENT','LIVE_TRACKER_OFFICIAL'
 ]);
 assertAcceptance();
});
test('a successful workflow or many offline tests never grant full System #18 acceptance',()=>{
 const s=snapshot(),event=s.eventSystems.find(x=>x.id==='18');
 assert.equal(event.acceptance,'PARTIALLY_VERIFIED');
 assert.equal(event.ownerApproval,null);
 assert.ok(event.capabilities.some(x=>x.id==='encrypted_journal'&&x.state===VERIFIED));
 assert.ok(event.capabilities.some(x=>x.id==='dashboard_readback_verified'&&x.state===VERIFIED));
 assert.ok(event.capabilities.some(x=>x.id==='current_encrypted_review_dashboard_live'&&x.state===VERIFIED));
 assert.ok(event.capabilities.some(x=>x.id==='refresh_after_new_review'&&x.state===PENDING));
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
 for(const system of [...namedEventSystems,...namedOperationalSystems]){
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


test('real Driver and Staff poll evidence is strictly partial and cannot authorize personnel activity',()=>{
  const s=snapshot(),workflows={
    DRIVER_UPDATES:'driver-updates.yml',
    DRIVER_MANAGEMENT:'driver-management.yml',
    HR_PROBATION:'hr-leadership.yml',
    STAFF_MANAGEMENT:'staff-management.yml'
  };
  for(const [id,filename] of Object.entries(workflows)){
    const item=s.operationalSystems.find(x=>x.id===id);
    assert.ok(item,id);
    assert.equal(item.workflow,filename);
    assert.equal(item.acceptance,'PARTIALLY_VERIFIED',id);
    assert.equal(item.ownerApproval,null,id);
    assert.ok(item.blockers.length>0,id);
    assert.ok(item.capabilities.some(x=>x.state===VERIFIED),id);
    assert.ok(item.capabilities.some(x=>x.state===PENDING),id);
    assert.ok(item.gates.some(x=>x.id==='owner_signoff'&&x.state===PENDING),id);
  }
  const staff=s.operationalSystems.find(x=>x.id==='STAFF_MANAGEMENT');
  assert.ok(staff.capabilities.some(x=>x.id==='corrupt_state_fail_closed'&&x.state===VERIFIED));
  assert.ok(staff.capabilities.some(x=>x.id==='real_staff_lifecycle'&&x.state===PENDING));
  const hr=s.operationalSystems.find(x=>x.id==='HR_PROBATION');
  assert.ok(hr.capabilities.some(x=>x.id==='real_authorized_hr_command'&&x.state===PENDING));
  const driver=s.operationalSystems.find(x=>x.id==='DRIVER_MANAGEMENT');
  assert.ok(driver.capabilities.some(x=>x.id==='real_driver_loa_lifecycle'&&x.state===PENDING));
  assert.equal(s.areas.find(x=>x.name==='Drivers').acceptance,'PARTIALLY_VERIFIED');
  assert.equal(s.areas.find(x=>x.name==='HR & Staff').acceptance,'PARTIALLY_VERIFIED');
  assert.equal(s.completeWorkflows,0);
});


test('new HR role, LOA pagination and Staff dedupe safety proof is recorded without false complete status',()=>{
  const s=snapshot();
  const checks={
    DRIVER_MANAGEMENT:['loa_private_cursor_pagination'],
    HR_PROBATION:['hr_command_cursor_pagination','hr_command_actor_authority'],
    STAFF_MANAGEMENT:['public_staff_journal_fail_closed']
  };
  for(const [id,codes] of Object.entries(checks)){
    const item=s.operationalSystems.find(x=>x.id===id);
    assert.ok(item,id);
    for(const code of codes){
      const cap=item.capabilities.find(c=>c.id===code);
      assert.ok(cap,id+' '+code);
      assert.equal(cap.state,VERIFIED);
      assert.ok(cap.evidence.every(uri=>uri.startsWith(ROOT+'actions/runs/')));
    }
    assert.equal(item.acceptance,'PARTIALLY_VERIFIED');
    assert.equal(item.ownerApproval,null);
    assert.ok(item.gates.some(g=>g.id==='real_world_e2e'&&g.state===PENDING));
    assert.ok(item.gates.some(g=>g.id==='owner_signoff'&&g.state===PENDING));
  }
  assert.equal(s.assessedWorkflows,6);
  assert.equal(s.completeWorkflows,0);
});


test('Kings Auto Tracker preserves verified official fallback but cannot claim real map recovery before it happens',()=>{
  const s=snapshot();
  const tracker=s.operationalSystems.find(x=>x.id==='LIVE_TRACKER_OFFICIAL');
  assert.ok(tracker);
  assert.equal(tracker.workflow,'live-tracker.yml');
  assert.equal(tracker.acceptance,'PARTIALLY_VERIFIED');
  assert.equal(tracker.ownerApproval,null);
  for(const id of ['official_no_map_gate','source_to_discord_live',
    'separate_public_snapshot','truthful_online_unavailability',
    'official_health_separation','monitor_post_deploy_live']){
    const feature=tracker.capabilities.find(x=>x.id===id);
    assert.ok(feature,id);
    assert.equal(feature.state,VERIFIED);
    assert.ok(feature.evidence.some(x=>x.startsWith(ROOT+'actions/runs/')));
  }
  for(const id of ['automatic_map_restoration_live','recurring_feed_resilience','operational_handover']){
    const feature=tracker.capabilities.find(x=>x.id===id);
    assert.ok(feature,id);
    assert.equal(feature.state,PENDING);
    assert.deepEqual([...feature.evidence],[]);
  }
  assert.ok(tracker.blockers.length>=2);
  assert.equal(s.areas.find(x=>x.name==='Live Data').acceptance,'PARTIALLY_VERIFIED');
  assert.equal(s.completeWorkflows,0);
  assert.equal(s.assessedWorkflows,6);
});
