'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Kings monthly awards match the four CEO-approved categories without automatic decisions', () => {
  const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','awards-catalog.json'),'utf8'));
  assert.equal(catalog.mode,'manual-recognition-only');
  assert.deepEqual(catalog.awards.map(a=>a.id),[
    'driver-of-the-month','staff-of-the-month','recruiter-of-the-month','photo-of-the-month'
  ]);
  assert.equal(new Set(catalog.awards.map(a=>a.id)).size,4);
  for(const award of catalog.awards){
    assert.equal(award.cadence,'monthly',award.id);
    assert.equal(award.assignment,'human-leadership-only',award.id);
  }
  assert.equal(catalog.awards[1].includesLeadership,true);
  assert.equal(catalog.awards[3].winningLiveryRecognition,true);
  assert.ok(!catalog.awards.some(a=>/excellence|high-staff/.test(a.id)), 'Retired awards must not be part of current monthly selection');
  assert.match(catalog.note,/historical recipient records remain preserved/i);
  assert.match(catalog.note,/never automatically select winners/i);
});
