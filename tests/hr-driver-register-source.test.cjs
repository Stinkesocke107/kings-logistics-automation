'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');
const {assessHrDriverRegistration,hrDriverRegistrationMessage} =
  require('../hr-driver-register-status');

const NOW='2026-11-21T17:00:00Z';
const at=Date.parse(NOW);
function source(overrides={}){
  return {
    source:'management-private-kings-date-register',
    registrationChannelActive:true,
    updatedAt:'2026-11-21T16:56:09.702Z',
    currentDrivers:74,
    registeredKingsDates:74,
    unregisteredDrivers:0,
    identitySourceCoverage:{
      status:'complete',
      activeDrivers:74,registered:74,missing:0,platformLinksPresent:74,
      authority:'management-approved-private-discord'
    },
    ...overrides
  };
}
function minimalHrData(count=111){
  return {
    current:Array.from({length:count},()=>({})),
    joinedLast7Days:[],
    probationActive:[],probationReviews:[],probationExtended:[],
    hrReviews:[],approvedLeave:[]
  };
}

test('HR reads separate current Discord Driver registration coverage, not 111-member TMP VTC count',()=>{
  const result=assessHrDriverRegistration(source(),at);
  assert.deepEqual(result,{
    status:'complete',activeDrivers:74,registered:74,missing:0,
    sourceAt:'2026-11-21T16:56:09.702Z'
  });
  const text=hrDriverRegistrationMessage(result);
  assert.match(text,/74\/74/);
  assert.match(text,/Needs registration review:.*0/);
  assert.match(text,/New or returning Drivers require human HR\/Management confirmation/);
  const s=sandbox('hr-leadership.js');
  const output=s.run('buildMessage('+JSON.stringify({updatedAt:NOW})+','+
    JSON.stringify(minimalHrData())+','+JSON.stringify(result)+')');
  assert.match(output,/Tracked TruckersMP VTC Drivers:\*\* 111/);
  assert.match(output,/Kings Driver Register — HR/);
  assert.match(output,/74\/74/);
  assert.doesNotMatch(output,/Current Drivers:\*\* 111/);
  assert.ok(output.length<2000,'HR overview must remain within Discord 2000-character limit for empty lists');
});

test('missing approved original Kings records are visible to HR as pending without exposing identity',()=>{
  const result=assessHrDriverRegistration(source({
    registeredKingsDates:72,unregisteredDrivers:2,
    identitySourceCoverage:{...source().identitySourceCoverage,status:'incomplete',registered:72,missing:2}
  }),at);
  assert.equal(result.status,'incomplete');
  assert.equal(result.missing,2);
  const text=hrDriverRegistrationMessage(result);
  assert.match(text,/72\/74/);
  assert.match(text,/Needs registration review:\*\* 2/);
  assert.doesNotMatch(text,/123456789012345678|truckersmp_id|joined_at/);
});

test('HR never presents stale, unverified or contradictory source as fully registered',()=>{
  const base=source();
  const cases=[
    null,
    source({source:'discord-guild-joined_at'}),
    source({registrationChannelActive:false}),
    source({updatedAt:'2026-10-18T00:00:00Z'}),
    source({updatedAt:'2026-11-22T00:00:00Z'}),
    source({currentDrivers:111}),
    source({registeredKingsDates:73}),
    source({identitySourceCoverage:{...base.identitySourceCoverage,registered:73}}),
    source({identitySourceCoverage:{...base.identitySourceCoverage,missing:1}}),
    source({identitySourceCoverage:{...base.identitySourceCoverage,status:'source-unavailable'}}),
    source({identitySourceCoverage:{...base.identitySourceCoverage,authority:'unverified-guild'}})
  ];
  for(const candidate of cases){
    const status=assessHrDriverRegistration(candidate,at);
    assert.equal(status.status,'unavailable','Invalid source must be unavailable: '+status.reason);
    assert.equal(status.missing,null);
    assert.match(hrDriverRegistrationMessage(status),/Unavailable \/ stale/);
    assert.doesNotMatch(hrDriverRegistrationMessage(status),/74\/74/);
  }
});

test('HR Overview never includes original joining dates, Discord IDs or inferred return approvals',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','hr-leadership.js'),'utf8');
  const helper=fs.readFileSync(path.join(__dirname,'..','hr-driver-register-status.js'),'utf8');
  assert.match(src,/assessHrDriverRegistration\(/);
  assert.match(src,/hrDriverRegistrationMessage\(/);
  assert.match(src,/driver-loyalty-roles-summary\.json/);
  assert.doesNotMatch(helper,/method:\s*['"](?:POST|PATCH|DELETE)['"]|fetch\s*\(|writeFileSync\(/);
  assert.doesNotMatch(helper,/\.discordId|\.joinedAt|\.username|\.platformIds/);
  assert.ok(helper.includes('human HR/Management confirmation'));
});
