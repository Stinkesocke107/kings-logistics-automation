'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {empty,apply,compare}=require('../event-capacity-publication-review');
const ACTOR={source:'trusted-server-gateway',id:'111111111111111111',
  verifiedRoles:['Event Coordination']};
const NOW='2027-03-20T10:00:00Z';
const ITEM={id:'post1',platform:'Discord',assetVersion:'banner-v1',
  verification:'Verified',contentCompared:true,matchesCurrentEvent:false,
  evidenceRef:'private-publication-snapshot'};
const unavailable={id:'post2',platform:'External',assetVersion:'banner-v1',
  verification:'Unavailable'};
function start(){return empty('event:12345',NOW);}
function doIt(s,what){return apply(s,{expectedRevision:s.revision,...what},ACTOR,NOW);}
function open(s=start(),publications=[ITEM]){return doIt(s,{action:'open',changeKey:'route-change',
  fields:['route'],sourceVerified:true,publications});}
test('Verified outdated event post needs update, inaccessible content needs verification',()=>{
  const s=open(start(),[ITEM,unavailable]);
  assert.equal(s.items.post1.status,'Update Required');
  assert.equal(s.items.post2.status,'Needs Verification');
  assert.equal(compare(unavailable),'Needs Verification');
  assert.throws(()=>doIt(s,{action:'close'}));
});
test('Only independently verified update evidence can resolve an affected publication',()=>{
  let s=open();
  assert.throws(()=>doIt(s,{action:'resolve',publicationId:'post1',
    value:'Verified Updated',evidenceRef:'a'}));
  s=doIt(s,{action:'resolve',publicationId:'post1',value:'Verified Updated',
    evidenceRef:'private-proof',verifiedAgainstCurrent:true});
  s=doIt(s,{action:'close'});
  assert.equal(s.status,'Closed');
  assert.equal(s.summaries.length,1);
  assert.equal(s.summaries[0].itemResults[0].assetVersion,'banner-v1');
});
test('A bad or inaccessible URL can never be treated as proven deleted',()=>{
  let s=open(start(),[unavailable]);
  assert.throws(()=>doIt(s,{action:'resolve',publicationId:'post2',
    value:'No Update Needed',evidenceRef:'link-down',reason:'gone'}));
  s=doIt(s,{action:'resolve',publicationId:'post2',
    value:'No Update Needed',evidenceRef:'verified-removal-proof',
    reason:'Independently proven removed',verifiedAbsent:true});
  s=doIt(s,{action:'close'});
  assert.equal(s.status,'Closed');
});
test('A later relevant publication error reopens the same review and keeps old summary',()=>{
  let s=open();
  s=doIt(s,{action:'resolve',publicationId:'post1',value:'Verified Updated',
    evidenceRef:'proof',verifiedAgainstCurrent:true});
  s=doIt(s,{action:'close'});
  const summary=JSON.stringify(s.summaries[0]);
  s=doIt(s,{action:'recheck',publicationId:'post1',changeKey:'post-edit-2',
    relevantChangeDetected:true,verification:'Verified',
    contentCompared:true,matchesCurrentEvent:false,evidenceRef:'new-mismatch'});
  assert.equal(s.status,'Open');
  assert.equal(s.cycle,2);
  assert.equal(s.items.post1.status,'Update Required');
  assert.equal(JSON.stringify(s.summaries[0]),summary);
});
test('Cosmetic edits and still-matching publication do not reopen completed review',()=>{
  let s=open();
  s=doIt(s,{action:'resolve',publicationId:'post1',value:'Verified Updated',
    evidenceRef:'proof',verifiedAgainstCurrent:true});
  s=doIt(s,{action:'close'});
  const v=s.revision;
  s=doIt(s,{action:'recheck',publicationId:'post1',relevantChangeDetected:false});
  assert.equal(s.revision,v);
  s=doIt(s,{action:'recheck',publicationId:'post1',relevantChangeDetected:true,
    verification:'Verified',contentCompared:true,matchesCurrentEvent:true});
  assert.equal(s.status,'Closed');
});
test('Missing event change source, unsafe text, and outsider cannot create an impact review',()=>{
  assert.throws(()=>doIt(start(),{action:'open',changeKey:'c',fields:['route'],
    sourceVerified:false,publications:[ITEM]}));
  assert.throws(()=>doIt(start(),{action:'open',changeKey:'c',fields:['invalid'],
    sourceVerified:true,publications:[ITEM]}));
  assert.throws(()=>apply(start(),{action:'open',changeKey:'c',
    fields:['route'],sourceVerified:true,publications:[ITEM],expectedRevision:0},
    {...ACTOR,source:'untrusted-webhook'},NOW));
});
test('Duplicate publication IDs and change keys are idempotent or rejected',()=>{
  assert.throws(()=>open(start(),[ITEM,ITEM]));
  const s=open();
  const again=doIt(s,{action:'open',changeKey:'route-change',fields:['route'],
    sourceVerified:true,publications:[ITEM]});
  assert.equal(again.revision,s.revision);
  assert.equal(again.cycle,s.cycle);
});
test('A new verified event modification generates a new cycle without erasing history',()=>{
  let s=open();
  s=doIt(s,{action:'resolve',publicationId:'post1',value:'Verified Updated',
    evidenceRef:'proof',verifiedAgainstCurrent:true});
  s=doIt(s,{action:'close'});
  s=doIt(s,{action:'open',changeKey:'departure-change',fields:['departure'],
    sourceVerified:true,publications:[{...ITEM,assetVersion:'banner-v2'}]});
  assert.equal(s.cycle,2);
  assert.equal(s.summaries.length,1);
  assert.equal(s.items.post1.status,'Update Required');
});
