'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {FIRST_REVIEWS}=require('../kings-first-review-catalog');
const {WORKFLOW_REGISTRY}=require('../kings-workflow-registry');
const {snapshot,VERIFIED,PENDING}=require('../kings-system-acceptance');
const root=path.resolve(__dirname,'..');
const EXPECTED=[
  'api-resilience-verification.yml','core-baseline-verification.yml','core-e2e-verification.yml',
  'driver-leadership-reports.yml','driver-tmp-vtc-review.yml','driver-weekly-summary.yml',
  'event-operations-manual-review.yml','final-freeze-verification.yml',
  'hr-leadership-reports.yml','hr-weekly-summary.yml','legacy-convoy-import.yml',
  'management-monthly-report.yml','management-weekly-overview.yml',
  'monthly-report-verification.yml','monthly-report.yml',
  'self-healing-stress-verification.yml','staff-leadership-reports.yml',
  'weekly-reports-verification.yml'
].sort();

test('all 18 prior unassessed workflow names get individual narrow test-only review',()=>{
  assert.equal(FIRST_REVIEWS.length,18);
  const files=FIRST_REVIEWS.map(x=>x.workflow).sort();
  assert.deepEqual(files,EXPECTED);
  assert.equal(new Set(files).size,18);
  for(const review of FIRST_REVIEWS){
    assert.ok(WORKFLOW_REGISTRY.some(x=>x.file===review.workflow),review.id);
    assert.ok(!review.workflow.includes('booking'),review.workflow);
    assert.match(review.name,/\S/);
    assert.match(review.pending,/\S.{35,}/);
    assert.match(review.verified,/\S.{35,}/);
    assert.ok(fs.existsSync(path.join(root,'.github/workflows',review.workflow)),review.workflow);
    const testFile=path.join(root,review.testFile);
    assert.ok(fs.existsSync(testFile),review.testFile);
    assert.match(fs.readFileSync(testFile,'utf8'),/\btest\(/,review.testFile);
  }
});

test('first review proves only tested functions, never human operations or CEO system acceptance',()=>{
  const s=snapshot();
  assert.equal(s.totalWorkflows,46);
  assert.equal(s.assessedWorkflows,46);
  assert.equal(s.completeWorkflows,0);
  assert.equal(s.eventSystems.length,5);
  assert.equal(s.operationalSystems.length,45);
  const reviewed=FIRST_REVIEWS.map(review=>s.operationalSystems.find(x=>x.id===review.id));
  assert.equal(reviewed.length,18);
  for(let i=0;i<reviewed.length;i++){
    const r=reviewed[i],info=FIRST_REVIEWS[i];
    assert.ok(r,info.id);
    assert.equal(r.workflow,info.workflow);
    assert.equal(r.acceptance,'PARTIALLY_VERIFIED');
    assert.equal(r.ownerApproval,null);
    assert.ok(r.blockers.length>=3);
    assert.ok(r.gates.every(x=>x.state===PENDING));
    assert.equal(r.capabilities.filter(x=>x.state===VERIFIED).length,1);
    assert.equal(r.capabilities.filter(x=>x.state===PENDING).length,2);
    assert.deepEqual(r.capabilities[0].evidence,
      ['https://github.com/Stinkesocke107/kings-logistics-automation/actions/runs/45917194916']);
  }
});
