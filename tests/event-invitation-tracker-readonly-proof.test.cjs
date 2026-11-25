'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','event-invitation-tracker-readonly-proof.js'),'utf8');
async function execute(fail=false,sourceReason=null,tagSchemaVerified=true,configuredTagIds=null){
  const marker='PRIVATE_INVITER_OR_VTC_MARKER_NEVER_TO_LOG';
  const logs=[],warnings=[],proc={exitCode:0},calls=[];
  const module={exports:{}};
  function req(name){
    if(name!=='./event-invitation-tracker-source')throw Error('Unexpected require');
    return {
      readInvitationTracker:async args=>{calls.push(args);
        if(fail){const e=Error(marker);if(sourceReason)e.sourceReason=sourceReason;throw e;}
        return {bookingsCreated:0,staffApprovalsVerified:false,
          invitationDecisionsVerified:false,tagSchemaVerified,privateMarker:marker};
      },
      trustedInvitationObservation:x=>x
    };
  }
  req.main=null;
  vm.runInNewContext(src,{
    module,require:req,process:proc,
    console:{log:x=>logs.push(x),warn:x=>warnings.push(x)},
    fetch:async()=>{throw Error('Unexpected network in simulated proof');},
    Date
  });
  const env={DISCORD_BOT_TOKEN:'SYNTHETIC'};
  if(configuredTagIds!==null)env.DISCORD_INVITATION_TAG_IDS=configuredTagIds;
  const status=await module.exports.verify({env,nowMs:Date.now()});
  return {status,logs,warnings,exitCode:proc.exitCode,marker,calls};
}
test('real-source proof emits only fixed public-safe status after synthetic success',async()=>{
  const x=await execute();
  assert.equal(x.status,'READ_ONLY_SOURCE_VERIFIED');
  assert.equal(x.exitCode,0);
  assert.match(x.logs.join('\n'),/READ_ONLY_SOURCE_VERIFIED/);
  assert.doesNotMatch(x.logs.join('\n'),new RegExp(x.marker));
});
test('real-source proof keeps mismatched Forum tags as an explicit warning, not verified status',async()=>{
  const x=await execute(false,null,false);
  assert.equal(x.status,'INVITATIONS_READABLE_TAG_SCHEMA_UNVERIFIED');
  assert.equal(x.exitCode,1);
  assert.match(x.warnings.join('\n'),/INVITATIONS_READABLE_TAG_SCHEMA_UNVERIFIED/);
  assert.doesNotMatch(x.warnings.join('\n'),new RegExp(x.marker));
});
test('real-source proof fails closed on read failure without logging original error content',async()=>{
  const x=await execute(true);
  assert.equal(x.status,'SOURCE_UNAVAILABLE');
  assert.equal(x.exitCode,1);
  assert.match(x.warnings.join('\n'),/SOURCE_UNAVAILABLE \(SOURCE_INCONSISTENT\)/);
  assert.doesNotMatch(x.warnings.join('\n'),new RegExp(x.marker));
});
test('production workflow isolates real private-source review from core Event reporting jobs',()=>{
  const yaml=fs.readFileSync(path.join(__dirname,'../.github/workflows/event-leadership-reports.yml'),'utf8');
  assert.match(yaml,/invitation_source_verify:/);
  assert.match(yaml,/node event-invitation-tracker-readonly-proof\.js/);
  assert.match(yaml,/DISCORD_BOT_TOKEN: \$\{\{ secrets\.DISCORD_BOT_TOKEN \}\}/);
  assert.match(yaml,/continue-on-error: true/);
  assert.doesNotMatch(src,/console\.(?:log|warn)\([^)]*JSON\.stringify/);
  assert.doesNotMatch(src,/(?:writeFileSync|appendFileSync|unlinkSync)\(/);
});

test('private approved tag mapping reaches the GET-only source but never appears in public probe logs',async()=>{
  const secret='123456789012345678,123456789012345679,123456789012345680';
  const x=await execute(false,null,true,secret);
  assert.equal(x.status,'READ_ONLY_SOURCE_VERIFIED');
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].tagIds,secret);
  assert.equal(x.exitCode,0);
  assert.ok(!JSON.stringify(x.logs).includes(secret));
  assert.ok(!JSON.stringify(x.warnings).includes(secret));
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/event-leadership-reports.yml'),'utf8');
  assert.ok(workflow.includes('DISCORD_INVITATION_TAG_IDS: ${{ secrets.DISCORD_INVITATION_TAG_IDS }}'));
});
test('access failure exposes endpoint category but no private details',async()=>{
  const x=await execute(true,'ACCESS_DENIED_ARCHIVE');
  assert.equal(x.status,'SOURCE_UNAVAILABLE');
  assert.match(x.warnings.join('\n'),/SOURCE_UNAVAILABLE \(ACCESS_DENIED_ARCHIVE\)/);
  assert.doesNotMatch(x.warnings.join('\n'),new RegExp(x.marker));
});
