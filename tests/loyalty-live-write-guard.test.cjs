'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');
const root=path.resolve(__dirname,'..');

const plan=(removed=0)=>({stats:{roleRemovals:removed}});
const authority=(enabled=true)=>({enabled,records:[['dummy','2024-01-01']]});

test('live Loyalty writes are blocked if original private Kings register is missing',()=>{
  const s=sandbox('driver-loyalty-roles.js',{env:{DRIVER_LOYALTY_ROLE_MODE:'live'}});
  assert.throws(()=>s.run('ensureLiveMutationAuthorized('+JSON.stringify(plan(0))+',{enabled:false,records:new Map()}, "live")'),/private original Kings joining-date register is unavailable/);
  assert.throws(()=>s.run('ensureLiveMutationAuthorized('+JSON.stringify(plan(0))+',{enabled:true}, "live")'),/private original Kings joining-date register is unavailable/);
  assert.equal(s.run('ensureLiveMutationAuthorized('+JSON.stringify(plan(0))+',{enabled:true,records:new Map()}, "live")'),true);
});

test('planned live Loyalty removals require a second confirmed operator input',()=>{
  const s=sandbox('driver-loyalty-roles.js',{env:{DRIVER_LOYALTY_ROLE_MODE:'live'}});
  for(const count of [1,2,5]){
    assert.throws(()=>s.run('ensureLiveMutationAuthorized('+JSON.stringify(plan(count))+',{enabled:true,records:new Map()}, "live", "")'),/explicit separate removal confirmation/);
    assert.equal(s.run('ensureLiveMutationAuthorized('+JSON.stringify(plan(count))+',{enabled:true,records:new Map()}, "live", "confirmed")'),true);
  }
  assert.throws(()=>s.run('ensureLiveMutationAuthorized('+JSON.stringify(plan(6))+',{enabled:true,records:new Map()}, "live", "confirmed")'),/too many role removals/);
  assert.equal(s.run('MAX_ROLE_REMOVALS_PER_RUN'),5);
});

test('dry-run remains read-only even without register or removal confirmation',async()=>{
  const s=sandbox('driver-loyalty-roles.js',{env:{DRIVER_LOYALTY_ROLE_MODE:'dry-run'},fetch:async()=>{throw Error('No network write allowed');}});
  assert.equal(s.run('ensureLiveMutationAuthorized('+JSON.stringify(plan(2))+',{enabled:false}, "dry-run")'),true);
  await assert.rejects(s.run('discord("/guilds/fake/members/fake/roles/fake",{method:"DELETE"})'),/Dry-run cannot write Discord roles/);
  assert.equal(s.calls.length,0);
});

test('live role API errors do not disclose member IDs or response bodies in public CI',async()=>{
  const s=sandbox('driver-loyalty-roles.js',{
    env:{DRIVER_LOYALTY_ROLE_MODE:'live'},
    fetch:async()=>new Response('private-marker-never-print',{status:403})
  });
  await assert.rejects(s.run('discord("/guilds/1/members/private-member-id/roles/3",{method:"GET"})'),error=>{
    assert.match(error.message,/HTTP 403/);
    assert.doesNotMatch(error.message,/private-member-id|private-marker-never-print/);
    return true;
  });
  assert.equal(s.calls.length,1);
  assert.equal(s.calls[0].options.method,'GET');
});

test('production workflow requires independent manual checkbox before role-removal writes',()=>{
  const yaml=fs.readFileSync(path.join(root,'.github','workflows','driver-achievements.yml'),'utf8');
  const source=fs.readFileSync(path.join(root,'driver-loyalty-roles.js'),'utf8');
  assert.match(yaml,/confirm_role_removals:/);
  assert.match(yaml,/default: false/);
  assert.match(yaml,/DRIVER_LOYALTY_ROLE_REMOVALS_CONFIRMATION:/);
  assert.match(yaml,/inputs\.confirm_role_removals == true/);
  assert.match(source,/ensureLiveMutationAuthorized\(plan, register\);/);
  assert.match(source,/MAX_ROLE_REMOVALS_PER_RUN = 5/);
});
