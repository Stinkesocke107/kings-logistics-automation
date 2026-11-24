'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reconcileSourceInventory}=require('../event-capacity-source-reconcile');
function pair(){
  const thread={
    threadId:'100',eventId:'200',name:'Sample event',status:'Scheduled',
    validation:{parsed:{departureAtUtc:'2027-03-20T16:00:00Z'}}
  };
  return {
    report:{summary:{totalThreads:1,actualConvoys:1},threads:[thread]},
    overview:{overall:{realConvoySubmissions:1,convoyReadErrors:0,
        legacyImportedConvoys:0,legacyDuplicatesSuppressed:0},
      registeredConvoys:[{source:'convoy-center',threadId:'100',eventId:'200',
        status:'Scheduled',departureAtUtc:'2027-03-20T16:00:00Z'}]
    }
  };
}
function result(edit){
  const a=pair();
  if(edit)edit(a);
  return reconcileSourceInventory(a.report,a.overview);
}
const has=(r,code)=>r.issues.includes(code);
test('Matching authoritative Center registration and overview passes the read-only consistency check',()=>{
  const r=result();
  assert.equal(r.ok,true);
  assert.deepEqual(r.issues,[]);
  assert.equal(r.counts.center,1);
  assert.equal(r.counts.registeredCenter,1);
});
test('Missing required overview Center registration is not treated as verified coverage',()=>{
  const r=result(a=>{a.overview.registeredConvoys=[];});
  assert.equal(r.ok,false);
  assert.ok(has(r,'overview-center-entry-missing'));
});
test('Unrelated phantom Center registration fails inventory matching',()=>{
  const r=result(a=>{a.overview.registeredConvoys[0].threadId='999';});
  assert.equal(r.ok,false);
  assert.ok(has(r,'overview-center-orphan'));
});
test('Status disagreements must not silently free a confirmed staff slot',()=>{
  const r=result(a=>{a.overview.registeredConvoys[0].status='Cancelled';});
  assert.equal(r.ok,false);
  assert.ok(has(r,'overview-center-status-conflict'));
});
test('Comparing timestamp instants allows different timezone representations',()=>{
  const r=result(a=>{a.overview.registeredConvoys[0].departureAtUtc='2027-03-20T17:00:00+01:00';});
  assert.equal(r.ok,true);
});
test('Departure disagreement is a non-free-availability blocker',()=>{
  const r=result(a=>{a.overview.registeredConvoys[0].departureAtUtc='2027-03-21T16:00:00Z';});
  assert.equal(r.ok,false);
  assert.ok(has(r,'overview-center-departure-conflict'));
});
test('Legacy records properly suppressed against active Center event IDs',()=>{
  const r=result(a=>{
    a.overview.overall.legacyImportedConvoys=1;
    a.overview.overall.legacyDuplicatesSuppressed=1;
  });
  assert.equal(r.ok,true);
});
test('Unsuppressed legacy duplicate is a blocker',()=>{
  const r=result(a=>{
    a.overview.registeredConvoys.push({
      source:'legacy-calendar',eventId:'200',threadId:'legacy',status:'Scheduled'
    });
    a.overview.overall.legacyImportedConvoys=1;
  });
  assert.equal(r.ok,false);
  assert.ok(has(r,'legacy-not-suppressed-for-center-id'));
});
test('Legacy import/suppression count must match exactly',()=>{
  const r=result(a=>{a.overview.overall.legacyImportedConvoys=2;});
  assert.equal(r.ok,false);
  assert.ok(has(r,'legacy-coverage-mismatch'));
});
test('Duplicate Center threads may not silently collapse in Overview',()=>{
  const r=result(a=>{
    a.report.summary.totalThreads=2;
    a.report.summary.actualConvoys=2;
    a.report.threads.push({...a.report.threads[0]});
    a.overview.overall.realConvoySubmissions=2;
  });
  assert.equal(r.ok,false);
  assert.ok(has(r,'center-duplicate-thread-id'));
});
test('Overview duplicate Center registration is not treated as independent event',()=>{
  const r=result(a=>{
    a.overview.registeredConvoys.push({...a.overview.registeredConvoys[0]});
  });
  assert.equal(r.ok,false);
  assert.ok(has(r,'overview-center-duplicate'));
});
test('Checker read errors prevent verified snapshot acceptance',()=>{
  const r=result(a=>{
    a.report.threads[0].error='private error text';
    a.overview.overall.realConvoySubmissions=0;
    a.overview.overall.convoyReadErrors=1;
  });
  assert.equal(r.ok,false);
  assert.ok(has(r,'center-read-errors'));
  assert.equal(JSON.stringify(r).includes('private error text'),false);
});
test('Center without Event ID and without Completed is correctly absent from registration overview',()=>{
  const r=result(a=>{
    a.report.threads[0].eventId=null;
    a.report.threads[0].status='Needs Information';
    a.overview.registeredConvoys=[];
  });
  assert.equal(r.ok,true);
});
test('Positive completed staff event without Event ID remains required in overview',()=>{
  const r=result(a=>{
    a.report.threads[0].eventId=null;
    a.report.threads[0].status='Completed';
    a.overview.registeredConvoys[0].eventId=null;
    a.overview.registeredConvoys[0].status='Completed';
  });
  assert.equal(r.ok,true);
});
test('Ignore template and test threads when reconciling actual Center registrants',()=>{
  const r=result(a=>{
    a.report.threads.push({threadId:'105',name:'[TEST] sample',testThread:true});
    a.report.threads.push({threadId:'106',name:'Template',ignored:true});
    a.report.summary.totalThreads=3;
    a.report.summary.actualConvoys=2;
  });
  assert.equal(r.ok,true);
});
test('Internal evidence references and organizer names are never returned',()=>{
  const a=pair();
  a.report.threads[0].staffStatus={authorId:'private-staff-id',evidenceRef:'private-data'};
  a.report.threads[0].name='private-event-title';
  const r=reconcileSourceInventory(a.report,a.overview);
  assert.equal(JSON.stringify(r).includes('private-staff-id'),false);
  assert.equal(JSON.stringify(r).includes('private-event-title'),false);
});
test('Reject unknown overview sources rather than silently trusting them',()=>{
  const r=result(a=>{a.overview.registeredConvoys.push({source:'untrusted-new-source'});});
  assert.equal(r.ok,false);
  assert.ok(has(r,'overview-center-inventory-mismatch'));
});

test('Two different Center threads sharing an Event ID cannot be treated as verified free capacity',()=>{
  const r=result(a=>{
    a.report.threads.push({...a.report.threads[0],threadId:'101'});
    a.report.summary.totalThreads=2;
    a.report.summary.actualConvoys=2;
    a.overview.overall.realConvoySubmissions=2;
    a.overview.registeredConvoys.push({...a.overview.registeredConvoys[0],threadId:'101'});
  });
  assert.equal(r.ok,false);
  assert.ok(has(r,'center-duplicate-event-id'));
});
