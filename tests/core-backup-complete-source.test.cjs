'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const backup=fs.readFileSync(path.join(ROOT,'core-backup.js'),'utf8');
const verification=fs.readFileSync(path.join(ROOT,'.github/workflows/backup-recovery-verification.yml'),'utf8');
test('Core backup includes every current automation code, test and operator-document directory',()=>{
 const selected=backup.slice(backup.indexOf('const BASE_PATHS'),backup.indexOf('const CRITICAL_FILES'));
 for(const dir of ['data','.github/workflows','scripts','tests','docs','README.md']){
   assert.ok(selected.includes('"'+dir+'"'),dir);
 }
 // Existing source allowlist must retain environment and key-file exclusion.
 for(const rule of ['".git"','"node_modules"','"backup-staging"','"restore-source"',
   '".pem"','".key"','".p12"','".pfx"']){
   assert.ok(backup.includes(rule),rule);
 }
 assert.match(backup,/basename === "\.env"/);
});
test('Core backup cannot follow symlinks into runner secrets or external files',()=>{
 assert.match(backup,/fs\.lstatSync\(/);
 assert.match(backup,/stat\.isSymbolicLink\(\)/);
 assert.doesNotMatch(backup,/fs\.statSync\(\s*absolutePath/);
});

test('Critical backup checks cover protected Event review, live data and recovery scripts',()=>{
 const critical=backup.slice(backup.indexOf('const CRITICAL_FILES'),
   backup.indexOf('const EXCLUDED_PREFIXES'));
 for(const required of [
   'kings-workflow-registry.js','kings-system-acceptance.js',
   'event-review-dashboard-readonly-proof.js','event-leadership-state.js',
   'live-outage-notice.js','live-map-auto-probe.js',
   'scripts/git-safe-push.sh','scripts/migrate-event-leadership-state.js',
   'recovery-path-guard.js'
 ]){
   assert.ok(critical.includes('"'+required+'"'),required);
   assert.ok(fs.existsSync(path.join(ROOT,required)),required);
 }
});
test('real isolated backup verification enforces presence and SHA256 of new source groups',()=>{
 for(const required of [
   'scripts/git-safe-push.sh',
   'scripts/migrate-event-leadership-state.js',
   'tests/sandbox.cjs',
   'docs/KINGS-ALL-SYSTEMS-INVENTORY.md',
   'event-review-dashboard-readonly-proof.js',
   'recovery-path-guard.js','tests/recovery-path-guard.test.cjs'
 ])assert.ok(verification.includes("'"+required+"'"),required);
 assert.match(verification,/restore\.summary\.manifestFiles!==restore\.summary\.restoredFiles/);
 assert.match(verification,/restore\.summary\.manifestFiles!==restore\.summary\.checksumsVerified/);
 assert.match(verification,/crypto\.createHash\('sha256'\)/);
 assert.match(verification,/Verify disposable restore sandbox was removed/);
});
