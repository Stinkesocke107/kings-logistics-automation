'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const STATE='data/staff-discord-updates.json';
test('only genuinely absent Staff publication journal may initialize a new baseline',()=>{
  const s=sandbox('staff-discord-updates.js');
  assert.equal(s.run('loadState()'),null);
  assert.equal(s.files.has(STATE),false);
});
test('corrupted existing Staff publication history must fail closed without resetting dedupe evidence',()=>{
  for(const raw of ['{broken','null','[]','{}',
    '{"encrypted":false,"algorithm":"aes-256-gcm"}',
    '{"encrypted":true,"algorithm":"bad"}']){
    const s=sandbox('staff-discord-updates.js',{files:{[STATE]:raw}});
    assert.throws(()=>s.run('loadState()'),/invalid|refusing to reset/);
    assert.equal(s.files.get(STATE),raw);
    assert.equal(s.calls.length,0);
  }
});
test('encrypted Staff publication journal requires the valid existing version-1 dedupe layout',()=>{
  const original=sandbox('staff-discord-updates.js');
  const now='2026-11-26T22:10:00.000Z';
  const base={version:1,initializedAt:now,updatedAt:now,
    members:[],delivered:['stable-event-digest']};
  const good=original.run('encrypt('+JSON.stringify(base)+')');
  const valid=sandbox('staff-discord-updates.js',{
    files:{[STATE]:JSON.stringify(good)}
  });
  assert.equal(valid.run('loadState().version'),1);
  assert.equal(valid.run('loadState().delivered[0]'),'stable-event-digest');
  for(const damaged of [
    {...base,version:2},{...base,members:null},
    {...base,delivered:null},{...base,delivered:[null]},
    {...base,delivered:['x'.repeat(300)]}
  ]){
    const container=original.run('encrypt('+JSON.stringify(damaged)+')');
    const raw=JSON.stringify(container);
    const s=sandbox('staff-discord-updates.js',{files:{[STATE]:raw}});
    assert.throws(()=>s.run('loadState()'),/schema invalid; refusing to reset/);
    assert.equal(s.files.get(STATE),raw);
  }
});
test('corrupt dependent Staff Management or verified Driver Loyalty mapping cannot be treated as missing',()=>{
  for(const [file,expr] of [
    ['data/staff-management.json','loadStaffManagementState()'],
    ['data/driver-loyalty-roles.json','loadLoyaltyMappings()']
  ]){
    const s=sandbox('staff-discord-updates.js',{files:{[file]:'{private broken'}});
    assert.throws(()=>s.run(expr),/stored JSON invalid; refusing to reset/);
    assert.equal(s.files.get(file),'{private broken');
    assert.equal(s.calls.length,0);
  }
});
