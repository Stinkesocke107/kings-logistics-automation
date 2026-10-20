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

test('all post-monitor integrity/security mergers re-evaluate operational readiness from the same full issue set',()=>{
 const fs=require('node:fs');const path=require('node:path');
 for(const name of ['data-integrity.js','system-hardening.js','security-audit.js','discord-permission-audit.js']){
  const code=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  assert.match(code,/require\('\.\/system-health-readiness'\)/,name);
  assert.match(code,/health\.operationalReadiness = operationalReadinessFromIssues\(health\.issues\);/,name);
 }
});

test('stale resolved alerts remain in history without being mistaken for current outages',()=>{
 const {reconcileOperationalAlerts}=require('../system-health-readiness');
 const issues=[{id:'workflow-failed:final-freeze-verification.yml',severity:'warning'}];
 const operationalReadiness=operationalReadinessFromIssues(issues);
 const result=reconcileOperationalAlerts({issues,operationalReadiness},{
   active:{'workflow-failed:final-freeze-verification.yml':{},'workflow-overdue:news-production-verification.yml':{}},
   pending:{}
 });
 assert.equal(result.activeCurrent.length,0);
 assert.equal(result.retainedHistorical.length,2);
 assert.equal(result.currentIssueCount,0);
});
test('a real currently active workflow alert still blocks technical acceptance',()=>{
 const {reconcileOperationalAlerts}=require('../system-health-readiness');
 const issues=[{id:'workflow-failed:driver-updates.yml',severity:'critical'}];
 const operationalReadiness=operationalReadinessFromIssues(issues);
 const result=reconcileOperationalAlerts({issues,operationalReadiness},{
   active:{'workflow-failed:driver-updates.yml':{}},pending:{}
 });
 assert.deepEqual(result.activeCurrent,['workflow-failed:driver-updates.yml']);
 assert.equal(operationalReadiness.status,'UNHEALTHY');
});
test('Core and Final Freeze check live alert issues rather than raw historical counts',()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const name of ['core-e2e-verifier.js','final-freeze-verifier.js']){
  const code=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  assert.ok(code.includes('reconcileOperationalAlerts'),name);
  assert.doesNotMatch(code,/check\('No active System Alerts remain'/,name);
 }
 const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','system-monitoring.yml'),'utf8');
 assert.match(workflow,/workflow_run:[\s\S]*Kings News Production Verification/);
 assert.match(workflow,/Kings Final Freeze Verification/);
});
