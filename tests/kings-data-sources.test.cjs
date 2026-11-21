'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  sourceFor,privateDriverIdentity,activeDriverSourceCoverage,
  registeredSourceAvailable,SOURCES
}=require('../kings-data-sources');
const {parseDriverIdentityRecord,createPlatformIndex,addIdentityToIndex}=
  require('../driver-identity-register');

const A='123456789012345678';
const B='123456789012345679';
const C='123456789012345680';
const at=new Date('2026-11-21T16:00:00Z');

function makeRegister(lines){
  const identities=new Map();
  const records=new Map();
  const platformIndex=createPlatformIndex();
  for(const source of lines){
    const identity=parseDriverIdentityRecord(source,at);
    identities.set(identity.userId,identity);
    records.set(identity.userId,identity.joinedAt);
    addIdentityToIndex(platformIndex,identity);
  }
  return {enabled:true,identities,records,platformIndex};
}
const approved=makeRegister([
  'discord_id: '+A+'\nkings_join_date: 2.2.2021\ntruckersmp_id: 1234567\nhaulmp_id: HMPtest123',
  'id: '+B+'\ndatum: 14.11.2026'
]);

test('each source owns only its verified fields; Discord join and VTC join are not Kings join',()=>{
  assert.equal(sourceFor('kings_join_date').key,'driverIdentity');
  assert.equal(sourceFor('discord_id').key,'driverIdentity');
  assert.equal(sourceFor('truckersmp_id').key,'driverIdentity');
  assert.equal(sourceFor('haulmp_id').key,'driverIdentity');
  assert.equal(sourceFor('trucklinemp_id').key,'driverIdentity');
  assert.equal(sourceFor('current_kings_driver_role').key,'driverRole');
  assert.equal(sourceFor('tmp_vtc_join_date').key,'tmpVtc');
  assert.equal(sourceFor('online_now').key,'liveOnline');
  assert.equal(sourceFor('approved_award_winner').key,'awards');
  assert.equal(sourceFor('verified_active_subscription').key,'supporter');
  assert.equal(sourceFor('discord_joined_at'),null);
  assert.equal(sourceFor('unverified_player_nickname'),null);
  assert.equal(SOURCES.driverIdentity.status,'active');
  assert.equal(SOURCES.awards.status,'planned-unified-register');
});

test('private source works with legacy and future platform fields, without name inference',()=>{
  assert.equal(registeredSourceAvailable(approved),true);
  const a=privateDriverIdentity(approved,A,at);
  assert.equal(a.discordId,A);
  assert.equal(a.originalKingsJoinedAt,'2021-02-02T00:00:00.000Z');
  assert.deepEqual({...a.platformIds},{truckersmp:'1234567',haulmp:'HMPtest123',trucklinemp:null});
  const b=privateDriverIdentity(approved,B,at);
  assert.equal(b.originalKingsJoinedAt,'2026-11-14T00:00:00.000Z');
  assert.equal(b.platformIds.truckersmp,null);
  assert.equal(privateDriverIdentity(approved,C,at),null);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.platformIds));
  assert.equal(approved.records.get(A).toISOString(),'2021-02-02T00:00:00.000Z');
});

test('missing private source never silently substitutes Discord guild joined_at',()=>{
  assert.throws(()=>privateDriverIdentity({enabled:false,records:new Map(),identities:new Map()},A,at),
    /source is unavailable/);
  assert.throws(()=>privateDriverIdentity({enabled:true,records:new Map()},A,at),
    /source is unavailable/);
  assert.throws(()=>privateDriverIdentity(approved,'nickname',at),
    /Invalid private Driver identity lookup key/);
  const summary=activeDriverSourceCoverage({enabled:false},[A,B],at);
  assert.deepEqual({...summary},{
    status:'source-unavailable',activeDrivers:2,registered:null,missing:null,
    platformLinksPresent:null,authority:'management-approved-private-discord'
  });
});

test('coverage for current Driver roles excludes Trial, former and VTC-only records',()=>{
  const result=activeDriverSourceCoverage(approved,[A,B],at);
  assert.deepEqual({...result},{
    status:'complete',activeDrivers:2,registered:2,missing:0,
    platformLinksPresent:1,authority:'management-approved-private-discord'
  });
  const partial=activeDriverSourceCoverage(approved,[A,C],at);
  assert.equal(partial.status,'incomplete');
  assert.equal(partial.activeDrivers,2);
  assert.equal(partial.registered,1);
  assert.equal(partial.missing,1);
  assert.equal(JSON.stringify(partial).includes(A),false);
  assert.equal(JSON.stringify(partial).includes(C),false);
  assert.equal(JSON.stringify(partial).includes('2021-02-02'),false);
});

test('bad active roles and inconsistent private original dates never appear complete',()=>{
  assert.throws(()=>activeDriverSourceCoverage(approved,[A,A],at),/invalid or contains duplicates/);
  assert.throws(()=>activeDriverSourceCoverage(approved,['unverified-nickname'],at),/invalid or contains duplicates/);
  const inconsistent={
    ...approved,records:new Map(approved.records),
    identities:new Map(approved.identities)
  };
  inconsistent.records.set(A,new Date('2022-01-01T00:00:00Z'));
  assert.throws(()=>privateDriverIdentity(inconsistent,A,at),/consistency/);
  inconsistent.records.set(A,new Date('2027-01-01T00:00:00Z'));
  assert.throws(()=>privateDriverIdentity(inconsistent,A,at),/consistency/);
});

test('source contract has no IO, role mutation, Discord network or public personal data writer',()=>{
  const script=fs.readFileSync(path.join(__dirname,'..','kings-data-sources.js'),'utf8');
  assert.doesNotMatch(script,/fetch\s*\(|writeFileSync\s*\(|appendFileSync\s*\(|method\s*:\s*['"](?:POST|PATCH|DELETE)['"]/);
  assert.doesNotMatch(script,/console\.(?:log|warn|error)/);
  assert.match(script,/management-approved-private-discord/);
});
