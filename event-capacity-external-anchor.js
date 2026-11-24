'use strict';
// EXTERNAL-ANCHOR CONTRACT for private Kings Event Capacity snapshots.
// This module does NOT implement a real independent monotonic authority.
// The host must provide a separately protected, authenticated, durable CAS
// service; local memory or a file on the SQLite disk is NOT independent.
const {isDeepStrictEqual}=require('node:util');
const ERROR='Kings Event Capacity independent snapshot checkpoint could not be verified.';
const DIGEST=/^[a-f0-9]{64}$/;
const SNOWFLAKE=/^\d{17,22}$/;
function fail(){throw new Error(ERROR);}
function scopeOf(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    !SNOWFLAKE.test(String(value.guildId||''))||
    !SNOWFLAKE.test(String(value.forumId||'')))fail();
  return {guildId:String(value.guildId),forumId:String(value.forumId)};
}
function checkpoint(value){
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='digest,revision'||
    !Number.isSafeInteger(value.revision)||value.revision<1||
    !DIGEST.test(value.digest))fail();
  return Object.freeze({revision:value.revision,digest:value.digest});
}
function same(left,right){
  return isDeepStrictEqual(checkpoint(left),checkpoint(right));
}
function createExternallyAnchoredSnapshotStore({store,anchor,scope}={}){
  const expected=scopeOf(scope);
  if(!store||!anchor||
    ['checkpoint','readCursor','readLatest','commitSnapshot']
      .some(x=>typeof store[x]!=='function')||
    typeof anchor.load!=='function'||
    typeof anchor.compareAndAdvance!=='function')fail();
  async function checkPair(){
    let local,remote;
    try{
      local=checkpoint(await store.checkpoint());
      remote=checkpoint(await anchor.load({scope:expected}));
    }catch{fail();}
    // A missing anchor with an existing DB, a changed ciphertext, a restored
    // older snapshot or a DB commit not yet externally acknowledged all deny
    // new reads/writes until an independently authorized recovery review.
    if(!same(local,remote))fail();
    return {local,remote};
  }
  async function readCursor(){
    await checkPair();
    try{return await store.readCursor();}catch{fail();}
  }
  async function readLatest(){
    await checkPair();
    try{return await store.readLatest();}catch{fail();}
  }
  async function commitSnapshot(input){
    if(!input||!isDeepStrictEqual(scopeOf(input.scope),expected))fail();
    const {local,remote}=await checkPair();
    let accepted;
    try{accepted=await store.commitSnapshot(input);}catch{fail();}
    if(accepted===false)return false;
    if(accepted!==true)fail();
    let next;
    try{next=checkpoint(await store.checkpoint());}catch{fail();}
    if(!next||next.revision!==(local?.revision||0)+1)fail();
    let anchored;
    try{
      // Only a separately authenticated linearizable durable anchor can
      // implement this CAS correctly. Never assume success on HTTP timeout.
      anchored=await anchor.compareAndAdvance({
        scope:expected,expected:remote,next
      });
    }catch{fail();}
    // SQLite has ALREADY committed. If anchoring fails, do NOT roll back the
    // new SQLite record or claim success. Future read/checkPair fails closed.
    // Dedicated operator recovery must reconcile with trusted source history.
    if(anchored!==true)fail();
    await checkPair();
    return true;
  }
  return Object.freeze({readCursor,readLatest,commitSnapshot,verifyCheckpoint:checkPair});
}
module.exports={createExternallyAnchoredSnapshotStore,checkpoint};
