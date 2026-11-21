'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');

const AT='2026-11-21T17:05:00Z';
function source(overrides={}){
  return {
    source:'management-private-kings-date-register',registrationChannelActive:true,
    updatedAt:'2026-11-21T16:56:09.702Z',
    currentDrivers:74,registeredKingsDates:74,unregisteredDrivers:0,
    identitySourceCoverage:{
      status:'complete',activeDrivers:74,registered:74,missing:0,
      platformLinksPresent:74,authority:'management-approved-private-discord'
    },
    ...overrides
  };
}
function state(loyalty) {
  return {
    driver:{drivers:[{current:true,joinDate:'2025-01-01'}]},
    driverLoyaltySummary:loyalty,
    loa:{leaves:[]},hr:{reviews:[]},
    hrWeekly:{publishedWeeks:[]},hrReports:{monthlyReports:[]},
    driverWeekly:{publishedWeeks:[]},driverReports:{monthlyReports:[]},
    staff:{history:[]},staffSummary:{currentStaff:3},
    staffReports:{weeklyReports:[],monthlyReports:[]},
    eventReports:{lastSnapshot:[]},
    managementWeekly:{publishedWeeks:[]},managementMonthly:{monthlyReports:[]}
  };
}

test('active fixed HR embed shows verified Discord Driver registration beside separate VTC totals',()=>{
  const s=sandbox('leadership-dashboard.js');
  const built=s.run('buildHr('+JSON.stringify(state(source()))+','+Date.parse(AT)+')');
  const live=built.fields.find(f=>f.name==='🔵 VTC Driver & HR Overview');
  assert.ok(live.value.includes('VTC Drivers **1**'));
  const register=built.fields.find(f=>f.name==='🗂️ Kings Driver Registration — HR Review');
  assert.ok(register);
  assert.ok(register.value.includes('Active Discord Kings Drivers registered **74/74**'));
  assert.ok(register.value.includes('Needs HR registration review **0**'));
  assert.ok(register.value.includes('Original Kings dates and rejoin decisions require human Management confirmation'));
  assert.ok(register.value.length<1024,'Discord embed field size');
  assert.ok(!register.value.includes('discord_id:'));
});

test('two missing original Kings registrations are flagged in fixed HR embed without personal records',()=>{
  const s=sandbox('leadership-dashboard.js');
  const summary=source({
    registeredKingsDates:72,unregisteredDrivers:2,
    identitySourceCoverage:{...source().identitySourceCoverage,status:'incomplete',registered:72,missing:2}
  });
  const built=s.run('buildHr('+JSON.stringify(state(summary))+','+Date.parse(AT)+')');
  const text=built.fields.find(f=>f.name.includes('Kings Driver Registration')).value;
  assert.ok(text.includes('72/74'));
  assert.ok(text.includes('Needs HR registration review **2**'));
  assert.ok(!text.includes('123456789012345678'));
});

test('source absent or stale never presents zero pending or an invented date in live HR embed',()=>{
  const s=sandbox('leadership-dashboard.js');
  for(const candidate of [null,
    source({updatedAt:'2026-10-11T01:00:00Z'}),
    source({source:'discord-guild-joined_at'}),
    source({currentDrivers:111}),
    source({registrationChannelActive:false})]){
    const rendered=s.run('buildHr('+JSON.stringify(state(candidate))+','+Date.parse(AT)+')');
    const text=rendered.fields.find(f=>f.name.includes('Kings Driver Registration')).value;
    assert.ok(text.includes('Unavailable / stale'));
    assert.ok(!text.includes('74/74'));
    assert.ok(!text.includes('Needs HR registration review **0**'));
  }
});

test('active Leadership workflow imports read-only authoritative source and uses existing fixed HR message',()=>{
  const root=path.resolve(__dirname,'..');
  const sourceCode=fs.readFileSync(path.join(root,'leadership-dashboard.js'),'utf8');
  assert.match(sourceCode,/assessHrDriverRegistration\(data\.driverLoyaltySummary,now\)/);
  assert.match(sourceCode,/driver-loyalty-roles-summary\.json/);
  assert.match(sourceCode,/hr: buildHr\(data\)/);
  const workflow=fs.readFileSync(path.join(root,'.github','workflows','leadership-dashboard.yml'),'utf8');
  assert.match(workflow,/node leadership-dashboard\.js/);
  assert.match(workflow,/node --check hr-driver-register-status\.js/);
  assert.doesNotMatch(workflow,/node hr-leadership\.js/);
});
