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
   const matches=[...src.matchAll(/  const result = await syncTextMessage\(\{[\s\S]*?\n  \}\);[\s\S]*?(?=\n  (?:const|if|reportState\.messageIds|state\.lastSnapshot))/g)];
   assert.equal(matches.length,expected,file+' has an unreviewed sync call');
   for(const match of matches){
     assert.match(match[0],/if \(result\.action === 'suppressed'\) \{[\s\S]*?return;[\s\S]*?\}/,file);
     const guard=match[0].indexOf("if (result.action === 'suppressed')");
     const save=match[0].search(/saveReportState\(|saveState\(|publishedDailyKeys\.push|publishedMonthlyKeys\.push|publishedWeeklyKeys\.push|lastSnapshot\s*=/);
     assert.ok(save<0||save>guard,file+' must not save before suppression check');
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
