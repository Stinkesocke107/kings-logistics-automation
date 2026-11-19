'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {parseVerifiedLegacyMappings}=require('../driver-legacy-verified-mappings');
const {matchProfiles,parseRoster,reportPages}=require('../kings-vtc-register-contract');
const SECRET='demo-secret-at-least-thirty-two-characters';
const DOMAIN='kings-driver-loyalty-roles-v1';
function encrypt(mappings) {
  const key=crypto.createHash('sha256').update(DOMAIN+'\0').update(SECRET).digest();
  const iv=Buffer.alloc(12,7);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify({mappings})),cipher.final()]);
  return {encrypted:true,algorithm:'aes-256-gcm',
    iv:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64'),
    ciphertext:ciphertext.toString('base64')};
}
const D1='123456789012345678',D2='123456789012345679',D3='123456789012345680';
test('only legacy mappings previously sourced from exact public TruckersMP Discord links survive',()=>{
  const entries=parseVerifiedLegacyMappings(encrypt([
    {tmpId:1001,discordUserId:D1,source:'truckersmp-discordSnowflake'},
    {tmpId:1002,discordUserId:D2,source:'stored-verified-mapping'},
    {tmpId:1003,discordUserId:D3,source:'name-fallback'}
  ]),SECRET);
  assert.equal(entries.length,2);
  assert.equal(entries[0].discordId,D1);
  assert.equal(entries[1].source,'historical-verified');
  assert.throws(()=>parseVerifiedLegacyMappings(encrypt([
    {tmpId:1001,discordUserId:D1,source:'truckersmp-discordSnowflake'},
    {tmpId:1002,discordUserId:D1,source:'stored-verified-mapping'}
  ]),SECRET),/Conflicting historical/);
  assert.throws(()=>parseVerifiedLegacyMappings(encrypt([]),'wrong secret'),/unsafe|authenticate/i);
  const corrupt=encrypt([]);corrupt.ciphertext=corrupt.ciphertext.slice(0,-3)+'abc';
  assert.throws(()=>parseVerifiedLegacyMappings(corrupt,SECRET),/authenticate/);
});
test('historical exact links recover private public profiles without guessing names',()=>{
  const now=new Date('2026-11-19T22:00:00Z');
  const roster=parseRoster({error:false,response:{members:[
    {user_id:1001,joinDate:'2025-02-01T00:00:00Z'},
    {user_id:1002,joinDate:'2025-03-01T00:00:00Z'},
    {user_id:1003,joinDate:'2025-04-01T00:00:00Z'}
  ]}},now);
  const drivers=[{discordId:D1,role:'Driver'},{discordId:D2,role:'Driver'},
    {discordId:D3,role:'Trial'}];
  const profiles=new Map([
    ['1001',{valid:true,discordId:null}],
    ['1002',{valid:true,discordId:D2}],
    ['1003',{valid:false,discordId:null}]
  ]);
  const old=[{tmpId:'1001',discordId:D1},{tmpId:'1002',discordId:D2}];
  const match=matchProfiles(roster,profiles,drivers,old);
  assert.equal(match.matched.length,2);
  assert.equal(match.outstanding.length,1);
  assert.equal(match.matched[0].source,'historical-verified');
  assert.equal(match.matched[1].source,'public-truckersmp-discord-link');
  const pages=reportPages(match,'1114967437788577792');
  assert.match(pages[0].content,/1 historic/);
  assert.match(pages[0].content,/KINGS_REGISTER_BATCH_V1/);
  const conflicting=matchProfiles(roster,new Map([
    ['1001',{valid:true,discordId:D3}]
  ]),drivers,old);
  assert.ok(!conflicting.matched.some(x=>x.discordId===D1));
  assert.equal(conflicting.duplicateCount,1);
});
