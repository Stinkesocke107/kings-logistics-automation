'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const producers=[
  'driver-management.yml',
  'hr-leadership.yml',
  'staff-management.yml'
];

for(const name of producers){
  test(name+' checks out fresh main at job start to avoid queued stale source conflicts',()=>{
    const yml=fs.readFileSync(path.join(ROOT,'.github/workflows',name),'utf8');
    assert.match(yml,/\bon:\s*\n/);
    assert.match(yml,/if: github\.ref == 'refs\/heads\/main'/);
    assert.match(yml, /uses:\s+actions\/checkout@[^\n]+\n\s+with:\n(?:\s+#.*\n)*\s+ref: main\n\s+fetch-depth: 0/);
    assert.match(yml,/bash scripts\/git-safe-push\.sh main/);
    assert.match(yml,/cancel-in-progress: false/);
    assert.doesNotMatch(yml,/\bgit\s+(?:reset\s+--hard|push\s+--force|checkout\s+--theirs)\b/);
  });
}

test('Safe git push still refuses same-file personnel state conflicts',()=>{
  const sh=fs.readFileSync(path.join(ROOT,'scripts/git-safe-push.sh'),'utf8');
  assert.match(sh,/git rebase --abort/);
  assert.match(sh,/Rebase conflict detected\. Aborting safely/);
  assert.match(sh,/validate_public_driver_privacy/);
  assert.match(sh,/validate_public_legacy_privacy/);
  assert.match(sh,/GIT_SAFE_PUSH_EXPECT_REMOTE/);
  assert.doesNotMatch(sh,/git push --force/);
});
