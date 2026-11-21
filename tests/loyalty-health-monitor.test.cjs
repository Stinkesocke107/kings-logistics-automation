'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('the monitored tenure source is active Kings Loyalty, not unscheduled historical achievements',()=>{
  const monitor=fs.readFileSync(path.join(__dirname,'../system-monitoring.js'),'utf8');
  assert.match(monitor,/file: 'data\/driver-loyalty-roles-summary\.json'/);
  assert.doesNotMatch(monitor,/file: 'data\/driver-achievements-summary\.json', label: 'Driver Achievement data'/);
});
test('scheduled Kings Loyalty stays read-only and refreshes only an aggregated health summary',()=>{
  const workflow=fs.readFileSync(path.join(__dirname,
    '../.github/workflows/driver-achievements.yml'),'utf8');
  assert.match(workflow,/if \[ "\$GITHUB_EVENT_NAME" = "schedule" \]; then\s+MODE="dry-run"/);
  assert.match(workflow,/- name: Save Driver Loyalty summary safely\s+shell: bash/);
  assert.match(workflow,/file=data\/driver-loyalty-roles-summary\.json/);
  assert.doesNotMatch(workflow,/git add -A -- data\/driver-loyalty-roles\.json/);
  assert.match(workflow,/if \[ "\$GITHUB_EVENT_NAME" = "workflow_dispatch" \] && \[ "\$REQUESTED_MODE" = "live" \]; then\s+MODE="live"/);
});
