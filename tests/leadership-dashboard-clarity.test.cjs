'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');

function fixture(){
 return {
  driver:{drivers:[]},driverSummary:{currentDrivers:111,onlineNow:null,activity:{},tenure:{}},
  driverReports:{monthlyReports:[]},driverWeekly:{publishedWeeks:[]},
  driverLoyaltySummary:{},loa:{leaves:[]},hr:{reviews:[]},
  hrWeekly:{publishedWeeks:[]},hrReports:{monthlyReports:[]},
  staff:{history:[]},staffSummary:{currentStaff:5,trackedStaffRecords:5,departmentCounts:{},changesLast30Days:{}},
  staffReports:{weeklyReports:[] ,monthlyReports:[]},
  eventReports:{weeklyReports:[],monthlyReports:[],lastSnapshot:[]},
  managementWeekly:{publishedWeeks:[]},managementMonthly:{monthlyReports:[]}
 };
}
test('All private Leadership departments show next work without hiding provenance',()=>{
 const sb=sandbox('leadership-dashboard.js');
 const d=JSON.stringify(fixture());
 const driver=sb.run('buildDriver('+d+')');
 const hr=sb.run('buildHr('+d+')');
 const staff=sb.run('buildStaff('+d+')');
 const event=sb.run('buildEvent('+d+')');
 const management=sb.run('buildManagement('+d+',{}, {}, {}, {})');
 for(const dashboard of [driver,hr,staff,event,management]){
  assert.ok(dashboard.fields.some(f=>f.name.includes('Next ')),dashboard.title);
  assert.ok(dashboard.fields.some(f=>f.name.includes('Last Completed Week')),dashboard.title);
  assert.ok(dashboard.fields.some(f=>f.name.includes('Last Completed Month')),dashboard.title);
 }
 assert.match(driver.fields.find(f=>f.name.includes('Next Driver Review')).value,/Unavailable/);
 assert.match(hr.fields.find(f=>f.name.includes('Next HR Review')).value,/Human HR\/Management confirmation/);
 assert.match(staff.fields.find(f=>f.name.includes('Next Staff Review')).value,/no automatic personnel action/);
 assert.match(event.fields.find(f=>f.name.includes('Next Staff Step')).value,/Unavailable|Validate/);
 assert.match(management.fields.find(f=>f.name.includes('Next Review')).value,/no automatic personnel decisions/);
});
