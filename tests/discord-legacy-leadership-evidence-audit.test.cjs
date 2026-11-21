'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {reportDefs,storedId,verifyReport}=require('../discord-legacy-leadership-evidence-audit');
test('legacy report catalog is deliberately separate from five consolidated dashboards',()=>{
 assert.deepEqual(reportDefs.map(x=>x.key),['legacy-staff-daily','legacy-staff-weekly','legacy-staff-monthly','legacy-management-weekly']);
 assert.equal(storedId(reportDefs[0],{messageIds:{daily:'123'}}),'123');
 assert.equal(storedId(reportDefs[3],{messageId:'456'}),'456');
});
test('historical message proof uses exact channel, bot owner, stored ID and report marker',()=>{
 const d=reportDefs[0],id='1559441637086597123',bot='1404524559214051499';
 const m={id,channel_id:d.channel,author:{id:bot},content:'🟢 **Kings Staff Leadership — Daily Changes**'};
 assert.equal(verifyReport(m,d,id,bot),null);
 assert.equal(verifyReport({...m,author:{id:'999999999999999999'}},d,id,bot),'legacy-message-identity-mismatch');
 assert.equal(verifyReport({...m,content:'Unrelated'},d,id,bot),'legacy-report-marker-missing');
});
test('legacy audit is GET-only and cannot advertise the old publishedKeys as proof',()=>{
 const file=fs.readFileSync(path.join(__dirname,'../discord-legacy-leadership-evidence-audit.js'),'utf8');
 assert.doesNotMatch(file,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
 assert.match(file,/published-keys\/snapshot updates/i);
 assert.match(file,/NOT_VISIBLE/);
});
