'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {attachManualNameHints,parseRoster,reportPages,matchProfiles} =
  require('../kings-vtc-register-contract');
const now=new Date('2026-11-19T22:00:00Z');
const d1='123456789012345678',d2='123456789012345679';
test('name-only profile hints never turn into verified registrations',()=>{
  const roster=parseRoster({error:false,response:{members:[
    {user_id:1001,username:'Example A',joinDate:'2025-10-01T10:00:00Z'},
    {user_id:1002,username:'Example B',joinDate:'2025-10-02T10:00:00Z'}
  ]}},now);
  const drivers=[
    {discordId:d1,role:'Driver',possibleNames:['Example A']},
    {discordId:d2,role:'Trial',possibleNames:['Example B']}
  ];
  const matched=matchProfiles(roster,new Map(),drivers);
  assert.equal(matched.matched.length,0);
  const hint=attachManualNameHints(roster,matched);
  assert.equal(hint.manualHintCount,2);
  assert.equal(hint.matched.length,0);
  const pages=reportPages(hint,'1114967437788577792');
  assert.equal(pages.length,1);
  assert.match(pages[0].content,/Possible TMP/);
  assert.match(pages[0].content,/VERIFY/);
  assert.doesNotMatch(pages[0].content,/KINGS_REGISTER_BATCH_V1/);
});
test('duplicate display names or two Discord nicknames claiming the same TMP suppress hints',()=>{
  const roster=parseRoster({error:false,response:{members:[
    {user_id:1001,username:'Same',joinDate:'2025-10-01T10:00:00Z'},
    {user_id:1002,username:'Same',joinDate:'2025-10-02T10:00:00Z'}
  ]}},now);
  const drivers=[{discordId:d1,role:'Driver',possibleNames:['Same']}];
  const hint=attachManualNameHints(roster,matchProfiles(roster,new Map(),drivers));
  assert.equal(hint.manualHintCount,0);
  const unique=[roster[0]];
  const duplicateDrivers=[
    {discordId:d1,role:'Driver',possibleNames:['Same']},
    {discordId:d2,role:'Trial',possibleNames:['Same']}
  ];
  const conflict=attachManualNameHints(unique,matchProfiles(unique,new Map(),duplicateDrivers));
  assert.equal(conflict.manualHintCount,0);
});
