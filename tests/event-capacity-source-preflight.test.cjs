'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspectKingsEventSourcePreflight:inspect}
  =require('../event-capacity-source-preflight');
const NOW=Date.parse('2027-03-20T12:00:00Z');
function brokenReader(failAt='getLatestScheduledRun'){
  const calls=[];
  const error=()=>{throw Error('PRIVATE SOURCE TOKEN AND DATA');};
  const ok={
    getLatestScheduledRun:async()=>({runId:'45502949674',attempt:1}),
    getRun:async()=>({}),getArtifacts:async()=>[],
    readArtifact:async()=>Buffer.alloc(0)
  };
  ok[failAt]=async()=>{calls.push(failAt);error();};
  return {reader:ok,calls};
}
test('Unavailable or denied latest scheduled ZIP fails closed without private output',async()=>{
  const {reader,calls}=brokenReader();
  const r=await inspect({reader,nowMs:NOW});
  assert.equal(r.status,'SOURCE_UNVERIFIED');
  assert.deepEqual(calls,['getLatestScheduledRun']);
  assert.equal(r.discordAccessed,false);
  assert.equal(r.discordWrites,0);
  assert.equal(r.githubWrites,0);
  assert.equal(r.bookingsCreated,0);
  assert.equal(r.freeSlotsCertified,false);
  assert.equal(r.automaticActivationAuthorized,false);
  assert.equal(JSON.stringify(r).includes('PRIVATE'),true);
  assert.equal(JSON.stringify(r).includes('PRIVATE SOURCE TOKEN AND DATA'),false);
});
test('Missing, malicious or invalid GitHub reader never passes preflight',async()=>{
  for(const reader of [undefined,null,{},{
    getLatestScheduledRun:async()=>({runId:'garbage'}),
    getRun:async()=>({}),getArtifacts:async()=>[],
    readArtifact:async()=>Buffer.alloc(0)
  }]){
    const r=await inspect({reader,nowMs:NOW});
    assert.equal(r.status,'SOURCE_UNVERIFIED');
    assert.equal(r.calendarProjectionChecked,false);
  }
});
test('Even source success could only reach private Calendar readiness, not activation',async()=>{
  const r=await inspect({reader:brokenReader('getRun').reader,nowMs:NOW});
  assert.equal(r.calendarProjectionChecked,false);
  assert.equal(r.sourceArtifactChecked,false);
  assert.equal(r.historicDiscordCoverageVerified,false);
  assert.equal(r.staffApprovalsVerified,false);
  assert.equal(r.automaticActivationAuthorized,false);
});
test('All preflight source code has no Discord or GitHub write transport',()=>{
  const root=path.join(__dirname,'..');
  const text=fs.readFileSync(path.join(root,
    'event-capacity-source-preflight.js'),'utf8');
  assert.doesNotMatch(text,/process\.env|DISCORD_BOT_TOKEN|https?:\/\/|\.create\(|\.edit\(|\.writeFileSync\(|await\s+fetch\(/);
  assert.match(text,/verifySourceFreshness\(reader,nowMs,null,monthlyFromReports\)/);
  assert.match(text,/state:|status:state/);
  assert.match(text,/freeSlotsCertified:false/);
});
