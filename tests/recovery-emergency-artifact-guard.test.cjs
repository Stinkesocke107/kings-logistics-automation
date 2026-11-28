'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assertUploadedBackupArtifact}=require('../backup-artifact-verifier');

const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/core-recovery.yml'),'utf8');

test('Core Recovery APPLY always confirms emergency backup artifact before running restoration',()=>{
  const upload=workflow.indexOf('      - name: Upload Emergency Pre-Recovery Backup');
  const evidence=workflow.indexOf('      - name: Confirm durable emergency backup artifact before any APPLY');
  const enforce=workflow.indexOf('      - name: Enforce Emergency Backup Health');
  const apply=workflow.indexOf('      - name: Run Kings Recovery');
  assert.ok(upload>0&&evidence>upload&&enforce>evidence&&apply>enforce);
  const part=workflow.slice(evidence,enforce);
  assert.match(part,/if: inputs\.recovery_mode == 'apply'/);
  assert.match(part,/KINGS_BACKUP_ARTIFACT_NAME: kings-emergency-pre-recovery-\$\{\{ github\.run_number \}\}/);
  assert.match(part,/KINGS_BACKUP_SOURCE_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(part,/node backup-artifact-verifier\.js/);
  assert.match(part,/exit 1/);
  assert.doesNotMatch(part,/continue-on-error/);
  assert.match(workflow,/name: \$\{\{ inputs\.recovery_mode == 'apply' && 'kings-production-recovery' \|\| 'kings-recovery-preview' \}\}/);
  assert.match(workflow,/KINGS_RECOVERY_ENVIRONMENT_ARMED/);
  assert.match(workflow,/git fetch origin main/);
});

test('Emergency rollback archive must be unexpired, nonempty and owned by exact recovery run',()=>{
  const name='kings-emergency-pre-recovery-42', id='123';
  const sample={
    total_count:1, artifacts:[{
      id:456,name,size_in_bytes:789,expired:false,workflow_run:{id:123},
      archive_download_url:'https://api.github.com/repos/test/kings/actions/artifacts/456/zip'
    }]
  };
  assert.equal(assertUploadedBackupArtifact(sample,{name,runId:id}).name,name);
  for(const change of [{expired:true},{size_in_bytes:0},{workflow_run:{id:999}}]){
    assert.throws(()=>assertUploadedBackupArtifact({
      total_count:1,artifacts:[{...sample.artifacts[0],...change}]
    },{name,runId:id}),/artifact|run/i);
  }
});

test('Core Recovery never runs live APPLY on schedule, workflow_run or push',()=>{
  assert.match(workflow,/on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow,/^\s+schedule:/m);
  assert.doesNotMatch(workflow,/^\s+workflow_run:/m);
  assert.doesNotMatch(workflow,/^\s+push:/m);
});
