'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('daily Driver onboarding review uses only the private, idempotent Discord audit',()=>{
  const source=fs.readFileSync(path.join(__dirname,
    '../.github/workflows/driver-register-onboarding.yml'),'utf8');
  assert.match(source,/cron: '17 7 \* \* \*'/);
  assert.match(source,/workflow_dispatch:/);
  assert.match(source,/contents: read/);
  assert.match(source,/group: kings-tmp-vtc-driver-date-review/);
  assert.match(source,/KINGS_TMP_VTC_REVIEW_MODE: audit-driver-only-publish/);
  assert.match(source,/DISCORD_BOT_TOKEN: \$\{\{ secrets.DISCORD_BOT_TOKEN \}\}/);
  assert.doesNotMatch(source,/DRIVER_LOYALTY_ROLE_MODE|audit-publish|git push|contents: write/);
});
