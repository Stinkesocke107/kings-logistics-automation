'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const draft=[
  'event-capacity-outbound-center-link-audit.js',
  'event-capacity-unified-team-review.js'
];
test('Draft outbound source audit and unified review never enter production Convoy Checker',()=>{
  const live=source('.github/workflows/convoy-checker.yml'),
    checker=source('convoy-checker.js');
  for(const file of draft){
    const stem=file.slice(0,-3);
    assert.equal(live.includes(stem),false);
    assert.equal(checker.includes(stem),false);
  }
});
test('Pure private integration cannot import Discord tokens or perform HTTP writes',()=>{
  for(const file of draft){
    const text=source(file);
    assert.doesNotMatch(text,/process\.env|DISCORD_BOT_TOKEN|fetch\(|https?:\/\/discord/);
    assert.doesNotMatch(text,/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
    assert.match(text,/safeToActivate:false/);
    assert.match(text,/freeSlotsCertified:false/);
  }
});
test('Outbound acceptance cannot silently authorize Kings staff approvals',()=>{
  const link=source(draft[0]),combined=source(draft[1]);
  assert.match(link,/trackerAcceptanceNeverCertifiesKingsStaffApproval:true/);
  assert.match(link,/multipleOutboundInvitationsNotAssumedDuplicateEvents:true/);
  assert.match(combined,/outboundAcceptedIsNotKingsApproval:true/);
  assert.match(combined,/realEventsApproved:0/);
});
test('Unified view preserves distinct archival and deletion source checks',()=>{
  const combined=source(draft[1]);
  assert.match(combined,/archiveCountContradictions/);
  assert.match(combined,/deletionCountContradictions/);
  assert.match(combined,/sourceIssueCountsAreNonadditive:true/);
});
