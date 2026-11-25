'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const paths={
 'driver-leadership-reports.js':2,
 'hr-leadership-reports.js':2,
 'staff-leadership-reports.js':3,
 'event-leadership-reports.js':3
};
test('legacy Leader reports never checkpoint a suppressed Discord publication',()=>{
 for(const [file,expected] of Object.entries(paths)){
   const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
   const calls=[...src.matchAll(/  const result = await syncTextMessage\(\{[\s\S]*?\n  \}\);/g)];
   const guarded=[...src.matchAll(/  const result = await syncTextMessage\(\{[\s\S]*?\n  \}\);\n  if \(result\.action === 'suppressed'\) \{[\s\S]*?\n    return;\n  \}/g)];
   assert.equal(calls.length,expected,file+' has an unexpected number of sync calls');
   assert.equal(guarded.length,expected,file+' did not guard every sync immediately after delivery');
   for(const match of guarded){
     if(file==='event-leadership-reports.js'){
       // A source-only observation may be encrypted and saved even when the
       // former Discord report is suppressed; publishing and historical
       // change snapshots must still NOT be checkpointed as delivered.
       assert.match(match[0],/Legacy Leadership publication suppressed/,file);
       assert.match(match[0],/updateSourceObservation\(state,report,overview\)/,file);
       assert.doesNotMatch(match[0],/publishedDailyKeys\.push|publishedMonthlyKeys\.push|publishedWeeklyKeys\.push|lastSnapshot\s*=/,file);
     } else {
       assert.match(match[0],/no publication state or snapshots recorded/,file);
       assert.doesNotMatch(match[0],/saveReportState\(|saveState\(|publishedDailyKeys\.push|publishedMonthlyKeys\.push|publishedWeeklyKeys\.push|lastSnapshot\s*=/,file);
     }
   }
 }
});
test('consolidated-only Legacy reporting stays intentionally enabled and live writes are not introduced by this patch',()=>{
 const dir=path.join(__dirname,'../.github/workflows');
 for(const file of ['driver-leadership-reports.yml','hr-leadership-reports.yml','staff-leadership-reports.yml','event-leadership-reports.yml','management-weekly-overview.yml']){
   const yaml=fs.readFileSync(path.join(dir,file),'utf8');
   assert.match(yaml,/LEADERSHIP_CONSOLIDATED_ONLY:\s*'true'/,file);
 }
 const sync=fs.readFileSync(path.join(__dirname,'../leadership-message-sync.js'),'utf8');
 assert.match(sync,/if \(consolidatedOnly\(\)\) return \{ action: 'suppressed'/);
});
