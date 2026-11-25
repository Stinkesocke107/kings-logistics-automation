'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const filename='event-capacity-staged-import-quarantine-plan.js';
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('Import plan cannot enter the live Convoy Checker or GitHub workflow',()=>{
  const stem=filename.slice(0,-3);
  for(const file of ['.github/workflows/convoy-checker.yml',
    'convoy-checker.js','scripts/event-capacity-github-actions.js'])
    assert.equal(read(file).includes(stem),false);
});
test('No network clients, production credentials, outbound Discord writes or disk persistence',()=>{
  const code=read(filename);
  assert.doesNotMatch(code,/process\.env|DISCORD_BOT_TOKEN|GITHUB_TOKEN|\bfetch\(/);
  assert.doesNotMatch(code,/\b(?:https|http)\.request\(/);
  assert.doesNotMatch(code,/console\.log|writeFileSync|appendFileSync/);
  assert.doesNotMatch(code,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
});
test('Every plan declares itself untrusted, read-only and completely blocked from production',()=>{
  const code=read(filename);
  for(const marker of ['stagingReadyForProduction:false',
    'importOperationsCommitted:0','externalWritesPerformed:0',
    'realEventApprovalsCommitted:0','freeSlotsCertified:false',
    'safeToActivate:false','original24MonthHistoryIndependentlyVerified:false',
    'independentOwnerHighwaterVerified:false'])
    assert.equal(code.includes(marker),true,marker);
});
test('Opaque private keys are HMAC-based with domain separation, not printable source IDs',()=>{
  const code=read(filename);
  assert.match(code,/createHmac\('sha256',secret\)/);
  assert.match(code,/kings-staged-item-v1/);
  assert.match(code,/kings-staged-plan-v1/);
  assert.doesNotMatch(code,/sourceRecords\s*\:\s*current\.convoyRecords/);
});
