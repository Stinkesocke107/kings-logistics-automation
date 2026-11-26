'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {EXPECTED,STAGES,assertCatalog,monthBounds,monthlyAwardsReview,renderReview}
  =require('../kings-monthly-awards-review');
test('award process uses the four fixed monthly categories and no retired awards',()=>{
  const cycle=monthlyAwardsReview('2026-11');
  assert.deepEqual(cycle.awards.map(x=>x.id),[...EXPECTED]);
  assert.equal(cycle.awards.length,4);
  assert.equal(cycle.mode,'MANUAL_REVIEW_ONLY');
  assert.equal(cycle.awards[1].includesLeadership,true);
  assert.equal(cycle.awards[3].winningLiveryRecognition,true);
  assert.equal(cycle.rolesChanged,0);
  assert.equal(cycle.discordMessagesSent,0);
  assert.equal(cycle.automaticAwardsGranted,0);
  assert.equal(cycle.winnersSelected,false);
  assert.equal(cycle.originalEvidenceVerified,false);
  assert.equal(cycle.privateNominationsStored,false);
  assert.equal(cycle.pendingCeoFinalApproval,true);
  assert.ok(cycle.awards.every(x=>x.steps.length===STAGES.length&&
    x.steps.every(y=>y.status==='PENDING_AUTHORIZED_REVIEW')));
  assert.doesNotMatch(JSON.stringify(cycle),/high-staff-of-the-month|excellence-award/);
});
test('monthly UTC boundaries are deterministic; invalid dates and catalog mutations fail closed',()=>{
  assert.deepEqual(monthBounds('2027-12'),{
    month:'2027-12',startUtc:'2027-12-01T00:00:00.000Z',
    endExclusiveUtc:'2028-01-01T00:00:00.000Z'
  });
  for(const value of ['2026-00','2026-13','2026-1','2026-11-01','2010-11',null,{},'2099-x1'])
    assert.throws(()=>monthBounds(value));
  const cat=require('../data/awards-catalog.json');
  assertCatalog(cat);
  for(const altered of [
    {...cat,mode:'automatic'},
    {...cat,awards:cat.awards.slice(1)},
    {...cat,awards:cat.awards.map((x,i)=>i===1?{...x,includesLeadership:false}:x)},
    {...cat,awards:cat.awards.map((x,i)=>i===3?{...x,winningLiveryRecognition:false}:x)}
  ])assert.throws(()=>assertCatalog(altered));
});
test('staff checklist remains candidate-free, human-controlled and side-effect-free',()=>{
  const text=renderReview('2026-11');
  for(const award of ['Driver of the Month','Staff of the Month',
    'Recruiter of the Month','Photo of the Month'])
    assert.ok(text.includes(award));
  assert.equal((text.match(/## /g)||[]).length,4);
  assert.equal((text.match(/- \[ \]/g)||[]).length,STAGES.length*4);
  const source=fs.readFileSync(path.join(__dirname,'../kings-monthly-awards-review.js'),'utf8');
  assert.doesNotMatch(source,/fetch\(|writeFileSync|appendFileSync|POST|PATCH|DELETE|DISCORD_BOT_TOKEN|grantRole/);
  assert.doesNotMatch(text,/\<@\d+\>|https:\/\/discord\.com\/api/);
});
