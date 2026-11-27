'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {
  readStatisticsDocument,validateStatisticsDocument,validDay
}=require('../statistics-source-provenance');
const root=path.resolve(__dirname,'..');

function fixture(t,content){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kings-stat-provenance-'));
  t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
  const file=path.join(dir,'statistics.json');
  if(content!==undefined)fs.writeFileSync(file,content,'utf8');
  return file;
}
function hour(date,h=12){return date+'T'+String(h).padStart(2,'0')+':00:00.000Z';}
function original(date='2026-11-18'){
  return {date,startMembers:110,members:110,peakOnline:2,peakETS2:2,peakATS:0,
    activitySamples:1,ets2PlayerSamples:2,atsPlayerSamples:0,
    serverPlayerSamples:{'ETS2 — Simulation 1':2},sampledHours:[hour(date)]};
}
test('last known published production Kings statistics history has genuine UTC hourly evidence',()=>{
  const file=path.join(root,'data/statistics.json');
  const raw=readStatisticsDocument(file);
  assert.ok(validateStatisticsDocument(raw).length>30);
  assert.ok(typeof raw.updatedAt==='string');
  assert.ok(raw.history.every(x=>x.activitySamples===x.sampledHours.length));
});
test('missing first-run Statistics state stays empty, while monthly requirement fails closed',t=>{
  const file=fixture(t);
  assert.deepEqual(readStatisticsDocument(file,{allowMissing:true}),{history:[]});
  assert.throws(()=>readStatisticsDocument(file),/verified history is missing/);
});
test('corrupt saved statistics may never be converted to a fake empty reset',t=>{
  for(const raw of ['{bad','null','[]','{}','{"history":null}','{"history":[{}]}']){
    assert.throws(()=>readStatisticsDocument(fixture(t,raw)),/unreadable|invalid structure|lacks|invalid UTC day/);
  }
});
test('no empty or synthetic day may close the monthly calendar with a fabricated zero',t=>{
  for(const bad of [
    {...original(),sampledHours:[],activitySamples:0},
    {...original(),sampledHours:[],activitySamples:1},
    {...original(),sampledHours:[hour('2026-11-17')]},
    {...original(),sampledHours:[hour('2026-11-18'),hour('2026-11-18')],activitySamples:2},
    {...original(),sampledHours:[hour('2026-11-18',24)]},
    {...original(),activitySamples:-1},
    {...original(),peakOnline:null},
    {...original(),serverPlayerSamples:{x:-1}},
  ]){
    assert.throws(()=>readStatisticsDocument(fixture(t,JSON.stringify({history:[bad]}))),
      /lacks original|invalid or duplicated|unverified/);
  }
});
test('UTC invalid dates and duplicate existing dates are never accepted',t=>{
  for(const bad of ['2026-02-30','2026-13-01','2026-00-10','2026-11-31','n/a'])
    assert.equal(validDay(bad),false,bad);
  const duplicated={history:[original(),original()]};
  assert.throws(()=>readStatisticsDocument(fixture(t,JSON.stringify(duplicated))),/duplicate UTC day/);
});
test('monthly publisher and independent verifier consume the same validated source, without webhook URL logs',()=>{
  for(const file of ['statistics.js','monthly-report-v2.js','monthly-report-verifier.js']){
    const code=fs.readFileSync(path.join(root,file),'utf8');
    assert.ok(code.includes("require('./statistics-source-provenance')"),file);
    assert.ok(code.includes('readStatisticsDocument('),file);
  }
  const verifier=fs.readFileSync(path.join(root,'monthly-report-verifier.js'),'utf8');
  assert.doesNotMatch(verifier,/GET \$\{url\}/);
  assert.doesNotMatch(verifier,/console\.error\(\s*error\s*\)/);
  const stats=fs.readFileSync(path.join(root,'statistics.js'),'utf8');
  assert.doesNotMatch(stats,/console\.error\(\s*error\s*\)/);
});
