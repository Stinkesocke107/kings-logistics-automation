'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {operationalReadinessFromIssues,requireOperationalReadiness}=require('../system-health-readiness');
test('historical Final Freeze warnings remain published and do not veto their own replacement',()=>{
 const issue={id:'workflow-failed:final-freeze-verification.yml',severity:'warning',message:'previous gate failed'};
 const issues=[issue];const r=operationalReadinessFromIssues(issues);
 assert.equal(r.status,'HEALTHY');assert.equal(r.warnings,0);assert.equal(r.diagnosticsCount,1);
 assert.equal(issues.length,1);assert.equal(requireOperationalReadiness({issues,operationalReadiness:r}).status,'HEALTHY');
});
test('real failing Kings production services and monitoring always veto readiness',()=>{
 for(const id of ['workflow-failed:news.yml','workflow-failed:self-healing.yml',
  'workflow-overdue:system-monitoring.yml','workflow-failed:convoy-checker.yml','workflow-failed:driver-updates.yml']){
  const r=operationalReadinessFromIssues([{id,severity:'warning'}]);
  assert.equal(r.status,'DEGRADED',id);assert.equal(r.warnings,1,id);
 }
 const x=operationalReadinessFromIssues([{id:'convoy-completeness-stale',severity:'critical'}]);
 assert.equal(x.status,'UNHEALTHY');assert.equal(x.criticalIssues,1);
});
test('unmodified reports or tampered readiness fail closed',()=>{
 const issues=[{id:'workflow-failed:news.yml',severity:'warning'}];
 assert.throws(()=>requireOperationalReadiness({issues}),/missing/);
 assert.throws(()=>requireOperationalReadiness({issues,operationalReadiness:{status:'HEALTHY'}}),/does not match/);
});
