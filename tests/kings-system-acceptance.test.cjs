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
 assert.equal(s.assessedWorkflows,28);
 assert.equal(s.operationalSystems.length,27);
 assert.deepEqual(s.operationalSystems.map(x=>x.id),[
   'DRIVER_UPDATES','DRIVER_MANAGEMENT','HR_PROBATION','STAFF_MANAGEMENT','LIVE_TRACKER_OFFICIAL','BACKUP_RECOVERY',
   'OFFLINE_VERIFICATION','GIT_STATE_HARDENING','SYSTEM_MONITORING',
   'CONVOY_CHECKER','CONVOY_ANNOUNCEMENT_VERIFICATION',
   'STAFF_LEADERSHIP_LIVE_OVERVIEW','LEADERSHIP_DASHBOARD',
   'LEADERSHIP_DASHBOARD_VERIFICATION','EVENT_LEADERSHIP_REPORTS',
   'VTC_MILESTONES','TRUCKERSMP_NEWS','CHANGELOG_EDITOR','CHANGELOG_PUBLISHER',
   'CENTRAL_SCHEDULER','SAFE_SELF_HEALING','DRIVER_PROBATION',
   'NEWS_PRODUCTION_VERIFICATION','CORE_BACKUP','CORE_RECOVERY',
   'DRIVER_ONBOARDING','DRIVER_ACHIEVEMENTS'
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
  assert.equal(s.assessedWorkflows,28);
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
  assert.equal(s.assessedWorkflows,28);
});

test('real 441-file isolated backup restoration is evidenced but real production recovery stays pending',()=>{
 const s=snapshot(),backup=s.operationalSystems.find(x=>x.id==='BACKUP_RECOVERY');
 assert.ok(backup);
 assert.equal(backup.workflow,'backup-recovery-verification.yml');
 assert.equal(backup.acceptance,'PARTIALLY_VERIFIED');
 assert.equal(backup.ownerApproval,null);
 for(const id of [
   'full_current_source_coverage','isolated_full_archive_roundtrip',
   'restored_sha256_integrity','secret_and_symlink_exclusions'
 ]){
   const verified=backup.capabilities.find(x=>x.id===id);
   assert.equal(verified?.state,VERIFIED,id);
   assert.ok(verified.evidence.length>0,id);
 }
 for(const id of ['actual_disaster_recovery','private_key_recovery_handover',
   'backup_operations_signoff']){
   assert.equal(backup.capabilities.find(x=>x.id===id)?.state,PENDING,id);
 }
 assert.equal(backup.gates.find(x=>x.id==='real_world_e2e').state,PENDING);
 assert.equal(backup.gates.find(x=>x.id==='owner_signoff').state,PENDING);
 assert.equal(s.areas.find(x=>x.name==='Backup').acceptance,'PARTIALLY_VERIFIED');
 assert.equal(s.completeWorkflows,0);
});

test('real security and technical monitoring runs count as partial evidence only',()=>{
 const s=snapshot();
 const specs={
   OFFLINE_VERIFICATION:['real_ci_syntax_and_regressions','real_ci_closeout_report'],
   GIT_STATE_HARDENING:['isolated_conflict_matrix','repository_policy_audit'],
   SYSTEM_MONITORING:['real_46_workflow_monitor','live_monitor_discord_update','real_discord_permissions']
 };
 for(const [id,verifiedIds] of Object.entries(specs)){
   const system=s.operationalSystems.find(x=>x.id===id);
   assert.ok(system,id);
   assert.equal(system.acceptance,'PARTIALLY_VERIFIED');
   assert.equal(system.ownerApproval,null);
   for(const code of verifiedIds){
     const proof=system.capabilities.find(x=>x.id===code);
     assert.equal(proof?.state,VERIFIED,id+' '+code);
     assert.ok(proof.evidence.every(x=>x.startsWith(ROOT+'actions/runs/')||x.startsWith(ROOT+'pull/')));
   }
   assert.ok(system.capabilities.some(x=>x.state===PENDING));
   assert.equal(system.gates.find(x=>x.id==='real_world_e2e').state,PENDING);
   assert.equal(system.gates.find(x=>x.id==='owner_signoff').state,PENDING);
   assert.ok(system.blockers.length);
 }
 assert.equal(s.assessedWorkflows,28);
 assert.equal(s.completeWorkflows,0);
});

test('five real Convoy, Staff and Leadership workflows have bounded individual proof only',()=>{
 const s=snapshot();
 const required={
   CONVOY_CHECKER:['real_center_source_pipeline','real_calendar_and_discord_overview'],
   CONVOY_ANNOUNCEMENT_VERIFICATION:['real_historical_post_readback','real_empty_window_verification'],
   STAFF_LEADERSHIP_LIVE_OVERVIEW:['real_current_role_overview_update','real_safe_state_persistence'],
   LEADERSHIP_DASHBOARD:['real_consolidated_dashboard_update','real_encrypted_event_review_readback'],
   LEADERSHIP_DASHBOARD_VERIFICATION:['real_five_content_contract_audit','real_event_driven_and_public_audit']
 };
 for(const [id,codes] of Object.entries(required)){
   const system=s.operationalSystems.find(x=>x.id===id);
   assert.ok(system,id);
   assert.equal(system.acceptance,'PARTIALLY_VERIFIED',id);
   assert.equal(system.ownerApproval,null,id);
   assert.ok(system.blockers.length>0,id);
   for(const code of codes){
     const proof=system.capabilities.find(x=>x.id===code);
     assert.equal(proof?.state,VERIFIED,id+' '+code);
     assert.ok(proof.evidence.every(uri=>uri.startsWith(ROOT+'actions/runs/')));
   }
   assert.ok(system.capabilities.some(x=>x.state===PENDING),id);
   assert.equal(system.gates.find(x=>x.id==='real_world_e2e').state,PENDING,id);
   assert.equal(system.gates.find(x=>x.id==='owner_signoff').state,PENDING,id);
 }
 assert.equal(s.assessedWorkflows,28);
 assert.equal(s.completeWorkflows,0);
});

test('real integrated Event source-to-triage proof covers all five linked Events, not original approval',()=>{
 const s=snapshot();
 for(const id of ['12','14','15','16','18']){
   const sys=s.eventSystems.find(x=>x.id===id);
   assert.ok(sys,id);
   const p=sys.capabilities.find(x=>x.id==='real_joint_source_advisory_triage');
   assert.equal(p?.state,VERIFIED,id);
   assert.deepEqual([...p.evidence],[ROOT+'actions/runs/45911909091']);
   assert.equal(sys.acceptance,'PARTIALLY_VERIFIED');
   assert.equal(sys.ownerApproval,null);
   assert.equal(sys.gates.find(x=>x.id==='real_world_e2e').state,PENDING);
   assert.equal(sys.gates.find(x=>x.id==='owner_signoff').state,PENDING);
 }
 const reporting=s.operationalSystems.find(x=>x.id==='EVENT_LEADERSHIP_REPORTS');
 assert.ok(reporting);
 assert.equal(reporting.workflow,'event-leadership-reports.yml');
 assert.equal(reporting.acceptance,'PARTIALLY_VERIFIED');
 for(const code of ['real_all_event_sources_to_worklist','real_invitation_forum_tag_source'])
   assert.equal(reporting.capabilities.find(x=>x.id===code)?.state,VERIFIED);
 for(const code of ['real_daily_report_publication','real_weekly_monthly_report_periods'])
   assert.equal(reporting.capabilities.find(x=>x.id===code)?.state,PENDING);
 assert.equal(s.assessedWorkflows,28);
 assert.equal(s.completeWorkflows,0);
});

test('seven other live News, Scheduler, Milestone, Probation and Healing checks remain partial',()=>{
 const s=snapshot();
 const cases={
   VTC_MILESTONES:['real_member_threshold_poll','real_no_event_dedupe'],
   TRUCKERSMP_NEWS:['real_current_news_api_read','real_no_new_article_dedupe'],
   CHANGELOG_PUBLISHER:['real_empty_queue_safety','independent_existing_changelog_audit'],
   CENTRAL_SCHEDULER:['real_registered_schedule_check','real_overdue_safe_dispatch'],
   SAFE_SELF_HEALING:['real_fail_closed_external_escalation','real_technical_state_and_monitor_check'],
   DRIVER_PROBATION:['real_due_reminder_poll','real_no_change_persistence'],
   NEWS_PRODUCTION_VERIFICATION:['real_prior_article_publication_proof','verified_news_dedupe_security_tests']
 };
 for(const [id,verifiedIds] of Object.entries(cases)){
   const item=s.operationalSystems.find(x=>x.id===id);
   assert.ok(item,id);
   assert.equal(item.acceptance,'PARTIALLY_VERIFIED',id);
   assert.equal(item.ownerApproval,null,id);
   for(const code of verifiedIds){
     const cap=item.capabilities.find(c=>c.id===code);
     assert.equal(cap?.state,VERIFIED,id+' '+code);
     assert.ok(cap.evidence.some(uri=>uri.startsWith(ROOT+'actions/runs/')));
   }
   assert.ok(item.capabilities.some(c=>c.state===PENDING),id);
   assert.equal(item.gates.find(x=>x.id==='real_world_e2e').state,PENDING);
   assert.equal(item.gates.find(x=>x.id==='owner_signoff').state,PENDING);
   assert.ok(item.blockers.length>0);
 }
 assert.equal(s.assessedWorkflows,28);
 assert.equal(s.completeWorkflows,0);
});

test('historical live Backup, protected Driver register and Loyalty dry-run are only partially verified',()=>{
 const s=snapshot(),expected={
   CORE_BACKUP:['real_historical_backup_package','real_historical_archive_integrity'],
   DRIVER_ONBOARDING:['real_driver_only_register_audit','real_safe_audit_publication'],
   DRIVER_ACHIEVEMENTS:['real_private_driver_source_dry_run','real_manual_live_write_guard']
 };
 for(const [id,names] of Object.entries(expected)){
   const system=s.operationalSystems.find(x=>x.id===id);
   assert.ok(system,id);
   assert.equal(system.acceptance,'PARTIALLY_VERIFIED',id);
   for(const name of names){
     const item=system.capabilities.find(x=>x.id===name);
     assert.equal(item?.state,VERIFIED,id+' '+name);
     assert.ok(item.evidence.some(uri=>uri.startsWith(ROOT+'actions/runs/')));
   }
   assert.ok(system.capabilities.some(x=>x.state===PENDING),id);
   assert.ok(system.blockers.length>0);
   assert.equal(system.ownerApproval,null);
   assert.equal(system.gates.find(x=>x.id==='real_world_e2e').state,PENDING);
   assert.equal(system.gates.find(x=>x.id==='owner_signoff').state,PENDING);
 }
 assert.equal(s.assessedWorkflows,28);
 assert.equal(s.completeWorkflows,0);
});

test('manual Changelog Editor and protected new Backup/Publisher guards are partial verified evidence only',()=>{
 const s=snapshot();
 assert.equal(s.assessedWorkflows,28);
 assert.equal(s.completeWorkflows,0);
 const needs={
   BACKUP_RECOVERY:'safe_manifest_and_target_guard_live',
   CORE_BACKUP:'post_guard_isolated_real_backup',
   CHANGELOG_PUBLISHER:'safe_archive_version_preflight',
   CHANGELOG_EDITOR:'isolated_manual_entry_dedupe',
   CORE_RECOVERY:'isolated_preview_and_apply'
 };
 for(const [id,code] of Object.entries(needs)){
   const sys=s.operationalSystems.find(x=>x.id===id);
   assert.ok(sys,id);
   assert.equal(sys.acceptance,'PARTIALLY_VERIFIED');
   const cap=sys.capabilities.find(x=>x.id===code);
   assert.equal(cap?.state,VERIFIED,id+' '+code);
   assert.ok(cap.evidence.length>=1);
   assert.equal(sys.gates.find(g=>g.id==='owner_signoff').state,PENDING);
   assert.equal(sys.ownerApproval,null);
   assert.ok(sys.blockers.length>0);
 }
 assert.equal(s.operationalSystems.find(x=>x.id==='CHANGELOG_EDITOR').workflow,
   'add-changelog-entry.yml');
 assert.equal(s.operationalSystems.find(x=>x.id==='CHANGELOG_EDITOR')
   .capabilities.find(x=>x.id==='genuine_authorized_entry').state,PENDING);
});
