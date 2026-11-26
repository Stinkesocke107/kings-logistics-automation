'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {snapshot}=require('../kings-system-acceptance');
const {WORKFLOW_REGISTRY}=require('../kings-workflow-registry');
const {buildOpenWork,renderMarkdown}=require('../kings-system-open-work');

test('completion audit inventories every workflow without reporting synthetic approval',()=>{
  const result=buildOpenWork();
  assert.equal(result.counts.workflows,46);
  assert.equal(result.counts.scheduled,33);
  assert.equal(result.counts.manualOrOnChange,13);
  assert.equal(result.counts.assessed,6);
  assert.equal(result.counts.notAssessed,40);
  assert.equal(result.counts.complete,0);
  assert.equal(result.allWorkflows.length,WORKFLOW_REGISTRY.length);
  assert.equal(new Set(result.allWorkflows.map(w=>w.file)).size,46);
  assert.ok(result.allWorkflows.every(w=>w.open));
  assert.equal(result.eventSystems.length,5);
  assert.equal(result.operationalSystems.length,5);
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
  assert.ok(report.unassessedWorkflows.some(x=>x.file==='core-recovery.yml'));
  assert.ok(report.unassessedWorkflows.some(x=>x.file==='monthly-report.yml'));
});
test('generated markdown is actionable and cannot pretend original records were accepted',()=>{
  const text=renderMarkdown();
  assert.match(text,/Open completion gates/);
  assert.match(text,/#18 Event Operations/);
  assert.match(text,/automatic full-map/i);
  assert.match(text,/NOT_ASSESSED does not mean broken/);
  assert.match(text,/Event Booking & Slot Management/);
  assert.match(text,/\[ \]/);
  assert.ok(!text.includes('https://discord.com/api'));
});
test('registry drift, missing workflows or forged complete status cause a hard failure',()=>{
  const s=snapshot();
  assert.throws(()=>buildOpenWork({...s,workflows:s.workflows.slice(1)}),
    /inventory disagree/);
  assert.throws(()=>buildOpenWork(s,WORKFLOW_REGISTRY.slice(1)),
    /inventory disagree/);
  const forged={...s,eventSystems:s.eventSystems.map(x=>
    x.id==='18'?{...x,acceptance:'COMPLETE'}:x)};
  assert.throws(()=>buildOpenWork(forged),/cannot be marked COMPLETE/);
});
