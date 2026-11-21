'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('scheduler cannot perform automatic Loyalty live role sync or recover it from stale summaries',()=>{
 const scheduler=fs.readFileSync(path.join(root,'.github/workflows/central-scheduler.yml'),'utf8');
 assert.doesNotMatch(scheduler,/recover_missed_daily_loyalty/);
 assert.doesNotMatch(scheduler,/inputs\[role_sync_mode\]=live/);
 assert.doesNotMatch(scheduler,/actions\/workflows\/driver-achievements\.yml\/dispatches/);
 assert.match(scheduler,/manual CEO\/authorized review required for live/);
});
test('Loyalty roles remain dry-run for push and schedule with independent removal confirmation',()=>{
 const code=fs.readFileSync(path.join(root,'.github/workflows/driver-achievements.yml'),'utf8');
 assert.match(code,/if \[ "\$GITHUB_EVENT_NAME" = "schedule" \]; then\s+MODE="dry-run"/);
 assert.match(code,/elif \[ "\$GITHUB_EVENT_NAME" = "workflow_dispatch" \] && \[ "\$REQUESTED_MODE" = "live" \]/);
 assert.match(code,/confirm_role_removals/);
 const logic=fs.readFileSync(path.join(root,'driver-loyalty-roles.js'),'utf8');
 assert.match(logic,/confirm_role_removals|DRIVER_LOYALTY_ROLE_REMOVALS_CONFIRMATION/);
});
