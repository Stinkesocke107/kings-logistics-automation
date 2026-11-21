'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');

const D1='123456789012345678';
const D2='123456789012345679';
const TRIAL='123456789012345680';
const ROLE='1204836048845410405';
const at='2026-11-21T16:00:00Z';
const members=[
  {user:{id:D1,bot:false},roles:[ROLE]},
  {user:{id:D2,bot:false},roles:[ROLE]},
  {user:{id:TRIAL,bot:false},roles:['trial-role']},
  {user:{id:'123456789012345681',bot:true},roles:[ROLE]}
];

function script({enabled=true,otherDate=at,stats={currentDrivers:2,registeredKingsDates:1,unregisteredDrivers:1}}={}){
  const record=enabled
    ? `{enabled:true,records:new Map([['${D1}',new Date('${at}')]]),
        identities:new Map([['${D1}',{userId:'${D1}',joinedAt:new Date('${otherDate}'),
          platformIds:{truckersmp:'1234567',haulmp:null,trucklinemp:null}}]])}`
    : '{enabled:false,records:new Map(),identities:new Map()}';
  return 'verifyLoyaltyIdentityCoverage('+JSON.stringify(members)+','+
    JSON.stringify({driver:{id:ROLE}})+','+record+','+JSON.stringify(stats)+
    ',new Date('+JSON.stringify(at)+'))';
}

test('shared loyalty source status counts active Drivers and registered platform IDs only',()=>{
  const s=sandbox('driver-loyalty-roles.js');
  const result=s.run(script());
  assert.equal(result.status,'incomplete');
  assert.equal(result.activeDrivers,2);
  assert.equal(result.registered,1);
  assert.equal(result.missing,1);
  assert.equal(result.platformLinksPresent,1);
  assert.equal(result.authority,'management-approved-private-discord');
  const aggregate=JSON.stringify(result);
  for(const forbidden of [D1,D2,TRIAL,'1234567',at]) {
    assert.ok(!aggregate.includes(forbidden),'Public Loyalty aggregate must exclude private identifiers');
  }
});

test('Loyalty source fails closed on discrepancy between role plan and verified register',()=>{
  const s=sandbox('driver-loyalty-roles.js');
  assert.throws(()=>s.run(script({stats:{currentDrivers:3,registeredKingsDates:1,unregisteredDrivers:2}})),
    /Driver-role total differs/);
  assert.throws(()=>s.run(script({stats:{currentDrivers:2,registeredKingsDates:2,unregisteredDrivers:0}})),
    /registration totals differ/);
  assert.throws(()=>s.run(script({otherDate:'2025-02-02T00:00:00Z'})),/consistency/);
});

test('missing private identity source remains unavailable and cannot claim registered Drivers',()=>{
  const s=sandbox('driver-loyalty-roles.js');
  const status=s.run(script({enabled:false,stats:{currentDrivers:2,registeredKingsDates:0,unregisteredDrivers:0}}));
  assert.equal(status.status,'source-unavailable');
  assert.equal(status.registered,null);
  assert.equal(status.platformLinksPresent,null);
  assert.throws(()=>s.run(script({enabled:false})),/cannot claim private Driver registration/);
});

test('Loyalty workflow stores source coverage counters only; never records individual Drivers to public state',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','driver-loyalty-roles.js'),'utf8');
  assert.match(source,/verifyLoyaltyIdentityCoverage\(\s*members, managed, register, plan\.stats\)/);
  assert.match(source,/identitySourceCoverage:/);
  assert.match(source,/platformLinksPresent:identityCoverage\.platformLinksPresent/);
  assert.match(source,/activeDriverSourceCoverage\(register,activeIds,at\)/);
  assert.doesNotMatch(source,/identitySourceCoverage:\s*\{[^}]*\b(?:userId|discordId|joinedAt|username)\b/s);
});
