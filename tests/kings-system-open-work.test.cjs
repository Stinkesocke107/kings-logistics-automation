'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {snapshot}=require('../kings-system-acceptance');
const {WORKFLOW_REGISTRY}=require('../kings-workflow-registry');
const {individualCloseoutRequirements}=require('../kings-workflow-closeout-requirements');
const {buildOpenWork,renderMarkdown}=require('../kings-system-open-work');

test('completion audit inventories every workflow without reporting synthetic approval',()=>{
  const result=buildOpenWork();
  assert.equal(result.counts.workflows,46);
  assert.equal(result.counts.scheduled,33);
  assert.equal(result.counts.manualOrOnChange,13);
  assert.equal(result.counts.assessed,46);
  assert.equal(result.counts.notAssessed,0);
  assert.equal(result.counts.complete,0);
  assert.equal(result.allWorkflows.length,WORKFLOW_REGISTRY.length);
  assert.equal(new Set(result.allWorkflows.map(w=>w.file)).size,46);
  assert.ok(result.allWorkflows.every(w=>w.open));
  assert.equal(result.eventSystems.length,5);
  assert.equal(result.operationalSystems.length,45);
  assert.ok(!result.eventSystems.some(x=>x.id==='17'));
  assert.ok(result.exclusions.some(x=>x.startsWith('17')));
});
test('remaining real-world evidence and owner signoff are visible instead of assumed',()=>{
  const report=buildOpenWork();
  for(const sys of [...report.eventSystems,...report.operationalSystems]){
    assert.ok(sys.missing.some(x=>x.id==='owner_signoff'),sys.id);
    assert.ok(sys.missing.some(x=>x.id==='real_world_e2e'),sys.id);
    assert.ok(sys.blockers.length>0,sys.id);
    assert.equal(sys.ownerApproved,false,sys.id);
    assert.notEqual(sys.status,'COMPLETE',sys.id);
  }
  const review=report.eventSystems.find(x=>x.id==='18');
  assert.ok(review.missing.some(x=>x.id==='refresh_after_new_review'));
  const tracker=report.operationalSystems.find(x=>x.id==='LIVE_TRACKER_OFFICIAL');
  assert.ok(tracker.missing.some(x=>x.id==='automatic_map_restoration_live'));
  assert.ok(report.operationalSystems.some(x=>x.id==='BACKUP_RECOVERY'));
  assert.ok(report.operationalSystems.some(x=>x.id==='SYSTEM_MONITORING'));
  assert.ok(report.operationalSystems.some(x=>x.id==='GIT_STATE_HARDENING'));
  assert.ok(report.operationalSystems.some(x=>x.id==='OFFLINE_VERIFICATION'));
  assert.ok(report.operationalSystems.some(x=>x.id==='CONVOY_CHECKER'));
  assert.ok(report.operationalSystems.some(x=>x.id==='LEADERSHIP_DASHBOARD_VERIFICATION'));
  assert.ok(report.operationalSystems.some(x=>x.id==='EVENT_LEADERSHIP_REPORTS'));
  assert.ok(report.operationalSystems.some(x=>x.id==='CENTRAL_SCHEDULER'));
  assert.ok(report.operationalSystems.some(x=>x.id==='SAFE_SELF_HEALING'));
  assert.ok(report.operationalSystems.some(x=>x.id==='NEWS_PRODUCTION_VERIFICATION'));
  assert.ok(report.operationalSystems.some(x=>x.id==='CORE_BACKUP'));
  assert.ok(report.operationalSystems.some(x=>x.id==='CORE_RECOVERY'));
  assert.ok(!report.unassessedWorkflows.some(x=>x.file==='core-recovery.yml'));

  assert.ok(report.operationalSystems.some(x=>x.id==='DRIVER_ONBOARDING'));
  assert.ok(report.operationalSystems.some(x=>x.id==='DRIVER_ACHIEVEMENTS'));
  assert.ok(!report.unassessedWorkflows.some(x=>x.file==='backup-recovery-verification.yml'));
  assert.ok(!report.unassessedWorkflows.some(x=>x.file==='monthly-report.yml'));
});
test('generated markdown is actionable and cannot pretend original records were accepted',()=>{
  const text=renderMarkdown();
  assert.match(text,/Open completion gates/);
  assert.match(text,/#18 Event Operations/);
  assert.match(text,/map provider recovery|full.map automatic/i);
  assert.match(text,/NOT_ASSESSED does not mean broken/);
  assert.match(text,/Event Booking & Slot Management/);
  assert.match(text,/\[ \]/);
  assert.ok(!text.includes('https://discord.com/api'));
});
test('registry drift, missing workflows or forged complete status cause a hard failure',()=>{
  const s=snapshot();
  assert.throws(()=>buildOpenWork({...s,totalWorkflows:s.totalWorkflows-1}),
    /inventory disagree/);
  assert.throws(()=>buildOpenWork(s,WORKFLOW_REGISTRY.slice(1)),
    /inventory disagree/);
  const forged={...s,eventSystems:s.eventSystems.map(x=>
    x.id==='18'?{...x,acceptance:'COMPLETE'}:x)};
  assert.throws(()=>buildOpenWork(forged),/cannot be marked COMPLETE/);
});

test('all 46 workflows have individual explicit open evidence, not inferred signoff',()=>{
  const requirements=individualCloseoutRequirements();
  const rows=buildOpenWork().allWorkflows;
  assert.equal(Object.keys(requirements).length,46);
  assert.equal(rows.length,46);
  for(const w of rows){
    assert.deepEqual(w.requirements,requirements[w.file]);
    assert.equal(w.requirements.length,2,w.file);
    assert.ok(w.requirements.every(x=>typeof x==='string'&&x.trim().length>20),w.file);
  }
  const markdown=renderMarkdown();
  for(const w of rows)assert.ok(markdown.includes('(`'+w.file+'`)'),w.file);
  assert.match(markdown,/All 46 workflows — individual outstanding closeout evidence/);
  assert.throws(()=>individualCloseoutRequirements(WORKFLOW_REGISTRY.slice(1)),/inventory mismatch/);
  assert.throws(()=>individualCloseoutRequirements([...WORKFLOW_REGISTRY.slice(0,-1),WORKFLOW_REGISTRY[0]]),
    /Missing individual Kings workflow review/);
});

test('open work asOf is generated from UTC date, never fixed to a prior audit day',()=>{
  assert.equal(buildOpenWork(snapshot(),WORKFLOW_REGISTRY,'2030-01-05T23:45:00-05:00').asOf,'2030-01-06');
  assert.match(renderMarkdown(buildOpenWork(snapshot(),WORKFLOW_REGISTRY,'2030-01-05T23:45:00-05:00')),
    /Report generated \(UTC\): 2030-01-06/);
  assert.throws(()=>buildOpenWork(snapshot(),WORKFLOW_REGISTRY,'not-a-date'),/Invalid Kings closeout report date/);
});
