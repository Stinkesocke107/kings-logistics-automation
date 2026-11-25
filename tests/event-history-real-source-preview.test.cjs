'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'event-history-real-source-preview.js'),'utf8');

function runWithPrivateFixtures(fail=false){
  const privateMarker='SENSITIVE_EVENT_OR_STAFF_NAME_NEVER_TO_LOG';
  const files={
    'output/convoy-check-results.json':JSON.stringify({privateMarker}),
    'output/convoy-overview.json':JSON.stringify({privateMarker})
  };
  const logs=[],errors=[],proc={exitCode:0};
  const fakeFs={
    statSync:(name)=>{if(fail)throw Error(privateMarker);
      return {isFile:()=>true,size:files[name].length};},
    readFileSync:name=>files[name]
  };
  const module={exports:{}};
  const context={
    module,process:proc,
    console:{log:value=>logs.push(value),error:value=>errors.push(value)},
    require:name=>{
      if(name==='node:fs')return fakeFs;
      if(name==='./event-history-leadership-bridge')return {
        summarizeOperations:()=>({
          mode:'READ_ONLY_SOURCE_HISTORY_REVIEW',
          utcHistoryWindowMonths:24,futureWindowMonths:12,
          freeSlotsCertified:false,original24MonthArchiveVerified:false,
          individualHistoricalDecisionsVerified:false,eventInvitationSourceLinked:false,
          bookingsCreated:0,
          privateMarker
        })
      };
      throw Error('Unexpected module dependency');
    }
  };
  vm.runInNewContext(source,context);
  const result=module.exports.main();
  return {result,logs,errors,exitCode:proc.exitCode,privateMarker};
}
test('real source proof reports only fixed public-safe success status',()=>{
  const x=runWithPrivateFixtures();
  assert.equal(x.result.status,'EVENT_HISTORY_CALENDAR_SOURCE_RECONCILED');
  assert.equal(x.exitCode,0);
  assert.match(x.logs.join('\n'),/EVENT_HISTORY_CALENDAR_SOURCE_RECONCILED/);
  assert.match(x.logs.join('\n'),/24-month history NOT verified/);
  assert.doesNotMatch(x.logs.join('\n'),new RegExp(x.privateMarker));
  assert.deepEqual(x.errors,[]);
});
test('real source proof fails closed and redacts private exception details',()=>{
  const x=runWithPrivateFixtures(true);
  assert.equal(x.result.status,'SOURCE_UNVERIFIED');
  assert.equal(x.exitCode,1);
  assert.match(x.errors.join('\n'),/SOURCE_UNVERIFIED/);
  assert.doesNotMatch(x.errors.join('\n'),new RegExp(x.privateMarker));
});
test('operational preflight uses existing read-only source flow and never prints raw Event data',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/event-leadership-reports.yml'),'utf8');
  const start=workflow.indexOf('      - name: Verify real Calendar and History source without public Event data');
  assert.ok(start>=0);
  const end=workflow.indexOf('\n      - name:',start+8);
  const step=workflow.slice(start,end);
  assert.match(step,/continue-on-error: true/);
  assert.match(step,/DISCORD_WRITE_MODE: 'false'/);
  assert.match(step,/CONVOY_FINALIZE_WRITE_MODE: 'false'/);
  assert.match(step,/for script in convoy-checker\\.js convoy-truckersmp-sync\\.js convoy-finalize\\.js convoy-overview\\.js; do/);
  assert.match(step,/node "\\$script" >\\/dev\\/null 2>&1/);
  assert.match(step,/node event-history-real-source-preview\.js/);
  assert.match(step,/>\/dev\/null 2>&1/);
  assert.doesNotMatch(step,/DISCORD_WRITE_MODE: 'true'|BOOKING|reservation|EVENT_SLOT_APPROVE/);
  assert.doesNotMatch(source,/console\.(?:log|error)\(.*(?:report|overview|JSON\.stringify)/);
});
