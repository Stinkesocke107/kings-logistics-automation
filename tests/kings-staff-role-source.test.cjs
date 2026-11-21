'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {currentStaffRoleSnapshot,HIERARCHY}=require('../kings-staff-role-source');
const {sourceFor,SOURCES}=require('../kings-data-sources');

const A='123456789012345678',B='123456789012345679',C='123456789012345680';
const BOT='123456789012345681';
const roleIds=[
  '223456789012345678','223456789012345679','223456789012345680',
  '223456789012345681','223456789012345682'
];
const at=new Date('2026-11-21T18:30:00.000Z');
const roleList=()=>HIERARCHY.map((name,i)=>({id:roleIds[i],name,position:55-i}));
const guildMembers=[
  {user:{id:A,bot:false},roles:[roleIds[0],roleIds[3]]},
  {user:{id:B,bot:false},roles:[roleIds[2],roleIds[4]]},
  {user:{id:C,bot:false},roles:[roleIds[4]]},
  {user:{id:BOT,bot:true},roles:[roleIds[4]]}
];

test('verified current Discord Staff roles count unique humans and each hierarchy level separately',()=>{
  const snap=currentStaffRoleSnapshot(guildMembers,roleList(),at);
  assert.equal(snap.status,'verified-role-snapshot');
  assert.equal(snap.source,'live-discord-staff-hierarchy-roles');
  assert.equal(snap.uniqueStaffRoleHolders,3);
  assert.deepEqual(snap.roleCounts.map(x=>x.count),[1,0,1,1,2]);
  assert.equal(snap.rolesAreHrAppointmentProof,false);
  assert.equal(snap.vtcStaffClassificationComparable,false);
  assert.equal(snap.hrAppointmentEvidence,'unavailable-no-authorized-staff-appointment-source');
  assert.equal(snap.observedAt,at.toISOString());
  const publicSafe=JSON.stringify(snap);
  for(const forbidden of [A,B,C,BOT,'tmpId','joinedAt','department']){
    assert.equal(publicSafe.includes(forbidden),false);
  }
  assert.ok(Object.isFrozen(snap));
  assert.ok(Object.isFrozen(snap.roleCounts));
});

test('decorated Discord role names match hierarchy without using nicknames',()=>{
  const roles=roleList();
  roles[0].name='│ Head Management';
  roles[3].name='┃ Team Lead';
  const snap=currentStaffRoleSnapshot(guildMembers,roles,at);
  assert.equal(snap.roleCounts[0].count,1);
  assert.equal(snap.roleCounts[3].count,1);
});

test('incomplete, duplicated or ambiguous guild role snapshots fail closed',()=>{
  assert.throws(()=>currentStaffRoleSnapshot(guildMembers,roleList().slice(0,4),at),/missing/);
  assert.throws(()=>currentStaffRoleSnapshot([],roleList(),at),/incomplete/);
  assert.throws(()=>currentStaffRoleSnapshot([...guildMembers,guildMembers[0]],roleList(),at),/duplicate verified identities/);
  assert.throws(()=>currentStaffRoleSnapshot([{user:{id:'invalid'},roles:[]}],roleList(),at),/missing or duplicate/);
  assert.throws(()=>currentStaffRoleSnapshot(guildMembers,[...roleList(),roleList()[0]],at),/duplicate role IDs/);
  const extra={id:'223456789012345683',name:'Staff',position:1};
  const roles=roleList();
  roles[4].position=1;
  assert.throws(()=>currentStaffRoleSnapshot([{user:{id:A,bot:false},roles:[]}], [...roles,extra],at),/ambiguous/);
  assert.throws(()=>currentStaffRoleSnapshot(guildMembers,roleList(),new Date('invalid')),/incomplete/);
});

test('current Discord Staff, TMP VTC Staff and human-approved appointment remain separate authorities',()=>{
  assert.equal(sourceFor('current_staff_assignment').key,'staff');
  assert.equal(sourceFor('current_staff_role_membership').key,'staff');
  assert.equal(sourceFor('tmp_vtc_staff_classification').key,'staffVtc');
  assert.equal(sourceFor('staff_appointment_date').key,'staffAppointments');
  assert.equal(sourceFor('approved_staff_department').key,'staffAppointments');
  assert.equal(SOURCES.staff.status,'active-roles-only');
  assert.equal(SOURCES.staffAppointments.status,'planned-not-configured');
  assert.equal(SOURCES.staffVtc.status,'active-separate-classification');
});

test('actual live Staff Discord publisher imports the shared source but cannot change personnel permissions',()=>{
  const root=path.resolve(__dirname,'..');
  const publisher=fs.readFileSync(path.join(root,'staff-leadership-live-overview.js'),'utf8');
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/staff-leadership-live-overview.yml'),'utf8');
  const source=fs.readFileSync(path.join(root,'kings-staff-role-source.js'),'utf8');
  assert.match(publisher,/currentStaffRoleSnapshot\(members,roles\)/);
  assert.match(publisher,/Staff appointment \/ HR authorization/);
  assert.match(publisher,/Not verified/);
  assert.match(workflow,/node --check kings-staff-role-source\.js/);
  assert.doesNotMatch(source, /fetch\s*\(|writeFileSync\s*\(|appendFileSync\s*\(|console\.(?:log|warn|error)\s*\(/);
  assert.doesNotMatch(source, /(?:POST|PATCH|DELETE)\s*.*(?:guilds|roles|members)/);
});
