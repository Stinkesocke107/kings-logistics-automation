'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseDriverIdentityRecord}=require('../driver-identity-register');
const {verifyHrDecisionMessages}=require('../hr-driver-decision-source');
const {buildPrivateHrCaseView,privateHrCasePages}=require('../hr-driver-case-view');

const A='123456789012345678',B='123456789012345679',C='123456789012345680';
const D='123456789012345681',E='123456789012345682',F='123456789012345683';
const OWNER='199999999999999999',MANAGER='188888888888888888';
const MGTROLE='166666666666666666';
const NOW=new Date('2026-11-21T18:00:00Z');
const members=[{user:{id:OWNER,bot:false},roles:[]},
  {user:{id:MANAGER,bot:false},roles:[MGTROLE]}];
const roles=[{id:MGTROLE,name:'HR Management',permissions:'0'}];
function registered(ids=[A,B,C,F]){
 const identities=new Map(),records=new Map();
 for(const id of ids){
   const parsed=parseDriverIdentityRecord('discord_id: '+id+'\nkings_join_date: 14.11.2023',NOW);
   identities.set(id,parsed);records.set(id,parsed.joinedAt);
 }
 return {enabled:true,identities,records};
}
function msg(person,decision,admission,number){
 return {id:String(1777777777777777700n+BigInt(number)),
  content:'KINGS_HR_DRIVER_DECISION_V1\ndiscord_id: '+person+
    '\ndecision: '+decision+'\nadmission: '+admission+
    '\nticket_id: 1777777777777777999',
  author:{id:MANAGER,bot:false},timestamp:'2026-11-21T17:00:00Z',
  webhook_id:null,edited_timestamp:null};
}
function evidence(entries){
 return verifyHrDecisionMessages(entries,members,roles,OWNER,NOW);
}

test('private view separates first approval, return, current-role conflict and missing identity',()=>{
 const history=evidence([
   msg(A,'approved','first',1),msg(B,'approved','return',2),
   msg(D,'approved','first',3),msg(F,'declined','first',4)
 ]);
 const result=buildPrivateHrCaseView([A,B,C,D,E,F],registered(),history,NOW);
 assert.equal(result.status,'needs-human-review');
 assert.deepEqual(result.stats,{
   currentDrivers:6,originalIdentityRegistered:4,approvedFirst:1,
   approvedReturn:1,deniedOrRevokedWithActiveRole:1,
   approvedWithoutOriginalIdentity:1,
   missingOriginalIdentityAndDecision:1,unverifiedHistoricalDecision:1
 });
 assert.equal(result.cases.length,5);
 assert.equal(result.cases[0].status,'active-role-with-declined-decision');
 assert.equal(result.cases[0].needsHumanReview,true);
 assert.equal(result.cases[1].status,'approved-without-original-identity');
 assert.equal(result.cases[2].status,'missing-identity-and-decision');
 assert.equal(result.cases[3].status,'verified-approved-return');
 assert.equal(result.cases[4].status,'verified-approved-first');
 assert.ok(result.cases.find(x=>x.discordId===A).originalKingsJoinedAt.includes('2023-11-14'));
 assert.ok(!result.cases.some(x=>x.discordId===C),
   'registered legacy Driver without HR evidence is not singled out as unapproved');
 assert.equal(result.legacyNoFormalEvidenceIsNotRejection,true);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.cases));
});

test('private pages contain identities and ticket refs only in their deliberately private output',()=>{
 const history=evidence([msg(A,'approved','first',1),msg(B,'revoked','return',2)]);
 const view=buildPrivateHrCaseView([A,B,C,D],registered(),history,NOW);
 const pages=privateHrCasePages(view);
 assert.equal(pages.length,2);
 assert.equal(pages[0].marker,'Kings HR Driver Case View | 1/');
 assert.ok(pages[0].content.includes('Existing registered Drivers without formal HR record: **1**'));
 assert.ok(pages[1].content.includes(A));
 assert.ok(pages[1].content.includes(B));
 assert.ok(pages[1].content.includes('HR ticket ID: 1777777777777777999'));
 assert.ok(pages[1].content.includes('revoked-decision'));
 assert.ok(pages.every(x=>x.content.length<=1900));
 assert.ok(!pages[0].content.includes(A));
 assert.ok(!pages[0].content.includes('2023-11-14'));
});

test('legacy fully registered Drivers without any decision create aggregates, not a 74-person accusation list',()=>{
 const active=[A,B,C];
 const view=buildPrivateHrCaseView(active,registered(active),evidence([]),NOW);
 const pages=privateHrCasePages(view);
 assert.equal(view.status,'historical-evidence-unknown');
 assert.equal(view.stats.unverifiedHistoricalDecision,3);
 assert.equal(view.cases.length,0);
 assert.equal(pages.length,1);
 assert.ok(pages[0].content.includes('1/1'));
 assert.ok(!pages[0].content.includes(A));
 assert.ok(!pages[0].content.includes('approved first'));
});

test('future intake waves paginate all missing identity and decision cases without omissions or overflow',()=>{
 const ids=Array.from({length:75},(_,i)=>String(200000000000000001n+BigInt(i)));
 const view=buildPrivateHrCaseView(ids,{enabled:true,records:new Map(),identities:new Map()},evidence([]),NOW);
 assert.equal(view.stats.missingOriginalIdentityAndDecision,75);
 const pages=privateHrCasePages(view);
 assert.equal(pages.length,9);
 assert.ok(pages.every(page=>page.content.length<=1900));
 const details=pages.slice(1).map(page=>page.content).join('\n');
 assert.equal(ids.filter(id=>details.includes(id)).length,75);
 assert.ok(pages[0].content.includes('1/9'));
 assert.ok(pages.at(-1).content.includes('9/9'));
});

test('private case view fails closed for unverified author, missing identity source and inconsistent cases',()=>{
 assert.throws(()=>buildPrivateHrCaseView([A],{enabled:false,records:new Map(),identities:new Map()},evidence([]),NOW),/authorized current Driver/);
 assert.throws(()=>buildPrivateHrCaseView([A,A],registered(),evidence([]),NOW),/duplicates/);
 const untrusted={latest:new Map([[A,{decision:'approved',admission:'first',ticketId:'not-a-ticket',approvedBy:MANAGER,recordedAt:NOW.toISOString()}]]),events:[]};
 assert.throws(()=>buildPrivateHrCaseView([A],registered(),untrusted,NOW),/unverified or contradictory/);
 assert.throws(()=>privateHrCasePages({privateOnly:false,cases:[]}),/unverified private/);
});

test('HR case view cannot publish, read Discord, write public files or print private records',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','hr-driver-case-view.js'),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|writeFileSync\s*\(|appendFileSync\s*\(|console\.(?:log|error|warn)\s*\(/);
 assert.doesNotMatch(source,/method\s*:\s*['"](?:POST|PATCH|DELETE)['"]/);
 assert.match(source,/PRIVATE HR\/Management ONLY/);
});
