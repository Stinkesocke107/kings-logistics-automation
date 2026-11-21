'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');

function setup(){
  return sandbox('management-overview.js');
}
function recognition(s,extra={}){
  const safe={
    source:'management-private-kings-date-register',registrationChannelActive:true,
    currentDrivers:74,eligibleForLoyaltyTier:69,registeredKingsDates:74,
    updatedAt:new Date().toISOString(),...extra
  };
  return s.run('recognitionStatus({memberCountAtLastUpdate:111,reachedMilestones:[]},'+JSON.stringify(safe)+',{awards:[{id:"driver"},{id:"staff"},{id:"recruiter"},{id:"photo"}]},111)');
}
function render(s,driver,rec){
  const old='2026-11-18T16:00:21Z';
  const events={active:0,submitted:0,needsInformation:0,readyForApproval:0,scheduled:0,other:0};
  const staff={available:true,currentStaff:14,staffRoles:4,changes:{joinedStaff:0,roleChanges:0,leftStaff:0},departments:[],updatedAt:new Date().toISOString()};
  const reports={retainedDays:10,currentMonthDays:5,hourlySamplesToday:12,allTimePeak:9,latestPublishedMonth:null};
  return s.run('buildEmbed('+JSON.stringify(driver)+','+
    JSON.stringify({updatedAt:old,online:9,members:110})+','+
    JSON.stringify({updatedAt:old})+','+
    JSON.stringify({updatedAt:new Date().toISOString(),reviews:[]})+','+
    JSON.stringify(events)+','+JSON.stringify(reports)+','+
    JSON.stringify(rec)+','+JSON.stringify(staff)+')');
}
const field=(embed,name)=>embed.fields.find(f=>f.name===name).value;

test('Management never presents stale tracker online number while observation is unavailable',()=>{
  const s=setup();
  const driver={updatedAt:new Date().toISOString(),currentDrivers:111,onlineObservationStatus:'unavailable',onlineNow:null,activity:{}};
  const embed=render(s,driver,recognition(s));
  const text=field(embed,'🚛 Driver Management');
  assert.match(text,/TruckersMP VTC Drivers: \*\*111\*\*/);
  assert.match(text,/Online: \*\*Unavailable\*\*/);
  assert.doesNotMatch(text,/Online: \*\*9\*\*|Online: \*\*0\*\*/);
  assert.match(field(embed,'📈 Statistics & Reporting'),/Hourly Samples Today: \*\*Unavailable \(statistics stale\)\*\*/);
});

test('Management shows verified fresh zero online only with explicit live status',()=>{
  const s=setup();
  const d={updatedAt:new Date().toISOString(),currentDrivers:111,onlineObservationStatus:'verified-live',onlineNow:0,activity:{}};
  const embed=render(s,d,recognition(s));
  assert.match(field(embed,'🚛 Driver Management'),/Online: \*\*0\*\*/);
});

test('Kings Loyalty uses only current private register aggregates and never TMP achievement tiers',()=>{
  const s=setup();
  const d={updatedAt:new Date().toISOString(),currentDrivers:111,onlineObservationStatus:'unavailable',onlineNow:null,activity:{}};
  const embed=render(s,d,recognition(s));
  const body=field(embed,'👑 Milestones & Recognition');
  assert.match(body,/Private Kings Loyalty: \*\*69\/74\*\* eligible/);
  assert.match(body,/Original joining dates recorded: \*\*74\*\*/);
  assert.match(body,/Manual Award Types: \*\*4\*\*/);
  assert.doesNotMatch(body,/Long-Term:|Upcoming Loyalty Achievements|1m 105|3m 94/);
});

test('stale or unverified private Loyalty status cannot be displayed as current',()=>{
  const s=setup();
  const d={updatedAt:new Date().toISOString(),currentDrivers:111,onlineObservationStatus:'unavailable',onlineNow:null,activity:{}};
  const rec=recognition(s,{updatedAt:'2026-01-01T00:00:00Z'});
  assert.equal(rec.loyalty,null);
  assert.match(field(render(s,d,rec),'👑 Milestones & Recognition'),/Private Kings Loyalty: \*\*Unavailable \/ stale\*\*/);
  assert.equal(recognition(s,{source:'discord-guild-joined_at'}).loyalty,null);
});

test('Management source file does not read deprecated TMP achievements summary as Kings Loyalty',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','management-overview.js'),'utf8');
  assert.doesNotMatch(source,/driver-achievements-summary\.json/);
  assert.match(source,/driver-loyalty-roles-summary\.json/);
  assert.match(source,/onlineObservationStatus === 'verified-live'/);
  assert.match(source,/source === 'management-private-kings-date-register'/);
});
