'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('public Staff summary contains aggregate mismatches, never personal mismatch details',()=>{
  const summary=JSON.parse(fs.readFileSync(path.join(root,'data','staff-discord-updates-summary.json'),'utf8'));
  assert.ok(Number.isInteger(summary.sourceMismatches));
  assert.ok(summary.sourceMismatches>=0);
  assert.equal(Object.hasOwn(summary,'mismatchDetails'),false);
  const forbidden=['username','discordUserId','tmpId','discordSnowflake'];
  const walk=(obj)=>{
    if(Array.isArray(obj)){obj.forEach(walk);return;}
    if(obj&&typeof obj==='object'){
      for(const [key,value] of Object.entries(obj)){
        assert.ok(!forbidden.includes(key),'Public Staff summary has identifying field '+key);
        walk(value);
      }
    }
  };
  walk(summary);
});

test('Staff writer must not reintroduce per-person mismatch metadata or detailed public CI logs',()=>{
  const source=fs.readFileSync(path.join(root,'staff-discord-updates.js'),'utf8');
  assert.doesNotMatch(source,/mismatchDetails\s*:/);
  assert.doesNotMatch(source,/Staff member:.*person\.username/);
  assert.doesNotMatch(source,/person\.roleNames\.join\(/);
  assert.doesNotMatch(source,/ADVISORY SOURCE MISMATCH:.*mismatch\.username/);
  assert.doesNotMatch(source,/TruckersMP Discord verification failed for.*person\.username/);
  assert.doesNotMatch(source,/console\.(log|warn)\([^\n]*event\.username/);
  assert.doesNotMatch(source,/Discord API \$\{response\.status\}.*text\.slice/);
});

test('Tracker logs aggregate online counts without publishing individual player names or cities',()=>{
  const source=fs.readFileSync(path.join(root,'tracker.js'),'utf8');
  assert.doesNotMatch(source,/console\.log\(\s*`\$\{player\.name\}/);
  assert.doesNotMatch(source,/console\.log\(\s*`\$\{player\.city\}/);
  assert.match(source,/Online: \$\{kingsOnline\.length\}/);
});
