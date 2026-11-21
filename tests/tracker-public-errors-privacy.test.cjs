'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');

function format(code){
  const s=sandbox('tracker.js');
  return s.run('publicTrackerFailureReason('+code+')');
}

test('incomplete real map server coverage remains actionable without exposing thrown text',()=>{
  const e="new Error('Only 0/8 live TruckersMP server checks succeeded. Keeping last state. Private driver 123456789012345678 at x=151')"; 
  const message=format(e);
  assert.match(message,/Incomplete live map coverage \(0\/8 servers\)/);
  assert.match(message,/last known-good snapshot preserved/);
  assert.doesNotMatch(message,/123456789012345678|x=151|Private driver/);
  assert.match(format("new Error('Only 3/9 live TruckersMP server checks succeeded. Private Member 999')"),
    /\(3\/9 servers\)/);
});

test('unsafe arbitrary provider error messages, webhook URLs and person data are never repeated',()=>{
  const sensitive='Sensitive Staff/Driver Name 123456789012345678?token=secret-token';
  const message=format('new Error('+JSON.stringify(sensitive)+')');
  assert.equal(message,'Live Tracker execution or provider failure (details withheld).');
  assert.equal(message.includes('secret-token'),false);
  const nonError=format(JSON.stringify({message:sensitive}));
  assert.equal(nonError,message);
  assert.equal(format('null'),message);
});

test('known safe categories still diagnose Discord failures and provider timeouts',()=>{
  const discord=format("new Error('Live Tracker Discord update failed: HTTP 403.')");
  assert.equal(discord,'Discord Live Tracker message update failed (HTTP 403).');
  assert.equal(format("new Error('Live Tracker stored Discord message is missing or webhook ownership changed; refusing duplicate publication.')"),
    'Stored Discord Live Tracker message missing or changed ownership; refusing duplicate post.');
  assert.equal(format("Object.assign(new Error('Secret URL'),{name:'TimeoutError'})"),
    'Live Tracker provider timeout (details withheld).');
  assert.equal(format("Object.assign(new Error('Sensitive request'),{code:'CIRCUIT_OPEN'})"),
    'Live Tracker provider circuit open (details withheld).');
  assert.equal(format("Object.assign(new Error('TOKEN=abc'),{status:503})"),
    'Live Tracker provider HTTP 503 (details withheld).');
  assert.equal(format("new Error('No usable online TruckersMP servers; keeping the last known good tracker state.')"),
    'No usable online TruckersMP servers; last known-good snapshot preserved.');
});

test('malicious coverage numbers cannot bypass strict bound and leak raw messages',()=>{
  const text=format("new Error('Only 9/8 live TruckersMP server checks succeeded. Private key=abc')");
  assert.equal(text,'Live Tracker execution or provider failure (details withheld).');
  assert.doesNotMatch(text,/Private|abc/);
});

test('real Tracker entrypoint now logs only allowlisted redacted failure categories',()=>{
  const code=fs.readFileSync(path.join(__dirname,'..','tracker.js'),'utf8');
  assert.match(code,/function publicTrackerFailureReason\(error\)/);
  assert.match(code,/Kings Live Tracker failed: '\+publicTrackerFailureReason\(error\)/);
  assert.doesNotMatch(code,/console\.error\(\s*error\s*\)/);
  assert.doesNotMatch(code,/console\.log\(\s*kingsOnline\s*\)/);
  assert.match(code,/last known-good snapshot preserved/);
});
