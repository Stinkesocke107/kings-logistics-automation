'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createLocalPrivateStore}=require('../event-capacity-private-store');
const {unsealLedger}=require('../event-capacity-decision-ledger');
const SCOPE={guildId:'1114967437788577792',forumId:'1550619824005062697'};
const SECRET='synthetic-test-only-private-ledger-secret-must-not-be-used-in-production';
const AT='2027-03-20T12:00:00Z';
const ACTOR={id:'synthetic-actor',verifiedRoles:['Event Coordination'],source:'trusted-server-gateway'};
const cmd=(revision,action='classification',value='Partner Convoy')=>({
  ref:'event:1234',action,value,expectedRevision:revision,evidenceRef:'private-test-proof'
});
function isolated(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kings-capacity-private-test-'));
  try{
    fs.chmodSync(root,0o700);
    return fn(root);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
}
const storeFor=(directory,params={})=>createLocalPrivateStore({directory,secret:SECRET,scope:SCOPE,...params});
const ledgerFile=directory=>path.join(directory,'event-capacity-ledger.encrypted.json');
test('Protected external storage initializes only encrypted ledger and no plaintext',()=>isolated(directory=>{
  const store=storeFor(directory);
  assert.deepEqual(store.initialize(AT),{revision:0});
  assert.deepEqual(store.metadata(),{revision:0,updatedAt:'2027-03-20T12:00:00.000Z'});
  const raw=fs.readFileSync(ledgerFile(directory),'utf8');
  const sealed=JSON.parse(raw);
  assert.equal(sealed.encrypted,true);
  assert.equal(sealed.algorithm,'aes-256-gcm');
  assert.equal(raw.includes('synthetic-actor'),false);
  assert.equal(raw.includes('event:1234'),false);
  assert.equal(fs.existsSync(path.join(directory,'event-capacity-ledger.lock')),false);
  assert.equal(fs.statSync(ledgerFile(directory)).mode&0o077,0);
}));
test('Private store atomically commits and increments expected revision',()=>isolated(directory=>{
  const store=storeFor(directory);
  store.initialize(AT);
  const result=store.commit(cmd(0),ACTOR,AT);
  assert.equal(result.revision,1);
  assert.equal(store.metadata().revision,1);
  const state=unsealLedger(JSON.parse(fs.readFileSync(ledgerFile(directory),'utf8')),SECRET,SCOPE);
  assert.equal(state.entries['event:1234'].eventType,'Partner Convoy');
  assert.equal(state.history.length,1);
  assert.equal(state.history[0].actorId,'synthetic-actor');
}));
test('Stale concurrent revision is rejected without overwriting current state',()=>isolated(directory=>{
  const store=storeFor(directory);
  store.initialize(AT);
  store.commit(cmd(0),ACTOR,AT);
  assert.throws(()=>store.commit(cmd(0,'classification','External Convoy'),ACTOR,AT));
  assert.equal(store.metadata().revision,1);
}));
test('Existing encrypted state is never reinitialized or silently reset',()=>isolated(directory=>{
  const store=storeFor(directory);
  store.initialize(AT);
  assert.throws(()=>store.initialize(AT));
  assert.equal(store.metadata().revision,0);
}));
test('Active or stale writer lock fails closed; it is never stolen',()=>isolated(directory=>{
  const store=storeFor(directory);
  store.initialize(AT);
  const lock=path.join(directory,'event-capacity-ledger.lock');
  fs.writeFileSync(lock,'locked',{mode:0o600,flag:'wx'});
  assert.throws(()=>store.commit(cmd(0),ACTOR,AT));
  assert.equal(fs.existsSync(lock),true);
  assert.equal(store.metadata().revision,0);
}));
test('Wrong encryption key, scope and malformed ciphertext fail closed',()=>isolated(directory=>{
  const store=storeFor(directory);store.initialize(AT);
  const wrongKey=storeFor(directory,{secret:'different-strong-synthetic-secret-that-is-not-real-at-all'});
  assert.throws(()=>wrongKey.metadata());
  const wrongScope=storeFor(directory,{scope:{guildId:'222222222222222222',forumId:SCOPE.forumId}});
  assert.throws(()=>wrongScope.metadata());
  fs.writeFileSync(ledgerFile(directory),JSON.stringify({encrypted:false,entries:{}}),{mode:0o600});
  assert.throws(()=>store.metadata());
  assert.throws(()=>store.commit(cmd(0),ACTOR,AT));
}));
test('An invalid actor cannot mutate state and leaves lock released',()=>isolated(directory=>{
  const store=storeFor(directory);store.initialize(AT);
  assert.throws(()=>store.commit(cmd(0),{...ACTOR,verifiedRoles:[]},AT));
  assert.equal(store.metadata().revision,0);
  assert.equal(fs.existsSync(path.join(directory,'event-capacity-ledger.lock')),false);
}));
test('Reject repository-relative private paths or paths inside source checkout',()=>isolated(directory=>{
  assert.throws(()=>storeFor('relative/directory'));
  assert.throws(()=>storeFor(path.resolve(__dirname,'..')));
}));
test('Reject permissive or symlinked private storage directory',()=>isolated(directory=>{
  const loose=path.join(directory,'loose');
  fs.mkdirSync(loose,{mode:0o777});
  fs.chmodSync(loose,0o777);
  if(process.platform!=='win32')assert.throws(()=>storeFor(loose));
  const link=path.join(directory,'link');
  fs.symlinkSync(directory,link,'dir');
  assert.throws(()=>storeFor(link));
}));
test('Reject symlink or group-readable state even when directory is private',()=>isolated(directory=>{
  const store=storeFor(directory);store.initialize(AT);
  const filename=ledgerFile(directory);
  if(process.platform!=='win32'){
    fs.chmodSync(filename,0o644);
    assert.throws(()=>store.metadata());
    fs.chmodSync(filename,0o600);
  }
  const original=fs.readFileSync(filename);
  const other=path.join(directory,'other.json');
  fs.writeFileSync(other,original,{mode:0o600});
  fs.unlinkSync(filename);
  fs.symlinkSync(other,filename);
  assert.throws(()=>store.metadata());
}));
