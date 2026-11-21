'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {sandbox}=require('./sandbox.cjs');

test('Leadership dashboards distinguish complete TruckersMP VTC rosters from separate Discord role membership',()=>{
  const s=sandbox('leadership-dashboard.js');
  const data={
    driver:{drivers:[{current:true}]},
    driverSummary:{currentDrivers:111,onlineNow:null,activity:{},tenure:{}},
    driverWeekly:{publishedWeeks:[]},driverReports:{monthlyReports:[]},
    loa:{leaves:[]},hr:{reviews:[]},hrWeekly:{publishedWeeks:[]},hrReports:{monthlyReports:[]},
    staff:{history:[]},staffSummary:{currentStaff:14,trackedStaffRecords:15,departmentCounts:{},changesLast30Days:{}},
    staffReports:{weeklyReports:[],monthlyReports:[]},eventReports:{lastSnapshot:[]},
    managementWeekly:{publishedWeeks:[]},managementMonthly:{monthlyReports:[]}
  };
  const d=JSON.stringify(data);
  const driver=s.run('buildDriver('+d+')');
  const hr=s.run('buildHr('+d+')');
  const staff=s.run('buildStaff('+d+')');
  const management=s.run('buildManagement('+d+',{}, {}, {}, {})');
  assert.match(JSON.stringify(driver),/VTC Drivers \\*\\*111\\*\\*/);
  assert.match(driver.description,/full TruckersMP VTC roster/);
  assert.match(JSON.stringify(driver),/Online \\*\\*Unavailable\\*\\*/);
  assert.match(JSON.stringify(hr),/VTC Drivers \\*\\*1\\*\\*/);
  assert.match(JSON.stringify(staff),/VTC-classified Staff \\*\\*14\\*\\*/);
  assert.match(staff.description,/Discord Staff-role membership is a different count/);
  assert.match(JSON.stringify(management),/VTC Drivers \\*\\*111\\*\\*/);
  assert.match(JSON.stringify(management),/VTC-classified Staff \\*\\*14\\*\\*/);
  assert.match(management.description,/Discord role-member counts are separate/);
});
