'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const now=Date.now();
const fresh=new Date(now-60000).toISOString();
const stale=new Date(now-4*60*60000).toISOString();
const future=new Date(now+8*60000).toISOString();

function data(summary){
  return {
    driver:{drivers:[]},driverSummary:summary,loa:{leaves:[]},hr:{reviews:[]},
    driverWeekly:{publishedWeeks:[]},driverReports:{monthlyReports:[]},
    hrWeekly:{publishedWeeks:[]},hrReports:{monthlyReports:[]},
    staff:{history:[]},staffSummary:{currentStaff:3,changesLast30Days:{}},
    staffReports:{weeklyReports:[],monthlyReports:[]},
    eventReports:{lastSnapshot:[]},managementWeekly:{publishedWeeks:[]},
    managementMonthly:{monthlyReports:[]}
  };
}

test('only explicitly verified, fresh, bounded live counts are accepted',()=>{
  const s=sandbox('leadership-dashboard.js');
  const expr=summary=>'verifiedLiveOnline('+JSON.stringify(summary)+','+now+')';
  const base={onlineObservationStatus:'verified-live',updatedAt:fresh,currentDrivers:111};
  assert.equal(s.run(expr({...base,onlineNow:0})),'0');
  assert.equal(s.run(expr({...base,onlineNow:5})),'5');
  for(const invalid of [
    {...base,onlineObservationStatus:'unavailable',onlineNow:5},
    {...base,onlineObservationStatus:null,onlineNow:0},
    {...base,onlineNow:null},
    {...base,onlineNow:-1},
    {...base,onlineNow:1.5},
    {...base,onlineNow:'5'},
    {...base,onlineNow:112},
    {...base,onlineNow:5,updatedAt:stale},
    {...base,onlineNow:5,updatedAt:future},
    {...base,onlineNow:5,updatedAt:null}
  ]) assert.equal(s.run(expr(invalid)),'Unavailable');
});

test('production Driver and Management Leadership views reject contradictory stale counts',()=>{
  const s=sandbox('leadership-dashboard.js');
  const driverSummary={currentDrivers:111,onlineObservationStatus:'unavailable',onlineNow:9,updatedAt:stale,activity:{},tenure:{}};
  const payload=JSON.stringify(data(driverSummary));
  const driver=s.run('buildDriver('+payload+','+now+')');
  const management=s.run('buildManagement('+payload+')');
  const text=JSON.stringify(driver)+' '+JSON.stringify(management);
  assert.match(text,/VTC Drivers \\*\\*111\\*\\*/);
  assert.match(text,/Online \\*\\*Unavailable\\*\\*/);
  assert.doesNotMatch(text,/Online \\*\\*9\\*\\*/);
});

test('actual Leadership cards display genuine observed zero without claiming an outage',()=>{
  const s=sandbox('leadership-dashboard.js');
  const payload=JSON.stringify(data({
    currentDrivers:111,onlineObservationStatus:'verified-live',onlineNow:0,updatedAt:fresh,activity:{},tenure:{}
  }));
  const driver=s.run('buildDriver('+payload+','+now+')');
  const management=s.run('buildManagement('+payload+')');
  assert.ok(JSON.stringify(driver).includes('Online **0**'));
  assert.ok(JSON.stringify(management).includes('Online **0**'));
});
