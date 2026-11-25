'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const files=[
  'event-capacity-discord-history-pagination-audit.js',
  'event-capacity-historical-discovery-workboard.js',
  'event-capacity-unified-evidence-coverage.js'
];
test('New historical channel source audits are never imported by live Convoy Checker',()=>{
  const workflow=read('.github/workflows/convoy-checker.yml'),
    runner=read('convoy-checker.js');
  for(const file of files){
    const name=file.slice(0,-3);
    assert.equal(workflow.includes(name),false);
    assert.equal(runner.includes(name),false);
  }
});
test('Offline source scans do not obtain production Discord secrets or initiate HTTP calls',()=>{
  for(const file of files){
    const s=read(file);
    assert.doesNotMatch(s,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/discord/);
    assert.doesNotMatch(s,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
    assert.match(s,/freeSlotsCertified:false/);
    assert.match(s,/safeToActivate:false/);
  }
});
test('Private 24-month rows and page receipts are explicitly not source authenticity',()=>{
  const pagination=read(files[0]),historical=read(files[1]),unified=read(files[2]);
  assert.match(pagination,/providerPaginationAuthenticityVerified:false/);
  assert.match(pagination,/deletedMessagesActuallyRecovered:false/);
  assert.match(historical,/full24MonthOriginalSourceInventoryIndependentlyVerified:false/);
  assert.match(unified,/original24MonthDiscordHistoryIndependentlyVerified:false/);
  assert.match(unified,/humanApprovalCommitted:0/);
});
test('Renderers produce ephemeral review-only output without enabling real Staff actions',()=>{
  const src=read(files[2]);
  assert.match(src,/flags:64,allowed_mentions:\{parse:\[\]\}/);
  assert.match(src,/autoReleasedHistoricalReservations|historyMonths/);
  assert.match(src,/actualDiscordReadsOrWritesHere:0/);
});
