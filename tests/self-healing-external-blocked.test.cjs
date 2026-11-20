'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sandbox}=require('./sandbox.cjs');
const repairs=['live-tracker','driver-updates','core-backup'];
function report(workflow='live-tracker.yml'){
 return {
   version:1,point:21,mode:'technical-safe-self-healing',
   safety:{
    allowlistedWorkflows:repairs.map(x=>x+'.yml'),
    convoyLiveDispatchAllowed:false,personnelWorkflowDispatchAllowed:false,
    discordMutationAllowed:false,roleOrMemberMutationAllowed:false,
    automaticRestoreAllowed:false,forcePushAllowed:false
   },
   planning:{planned:[{workflow}]},
   results:[{workflow,status:'failed',action:'dispatched',runId:123}]
 };
}
function state(){
 return {
   version:1,mode:'technical-safe-self-healing',
   repairs:Object.fromEntries(repairs.map(x=>[x,{attempts:[]}]))
 };
}
function health(extra=[]){
 const issues=[
   {id:'api-health:ETS2Map area',severity:'critical',system:'API Resilience'},
   {id:'api-health:truckersmp-map-live',severity:'critical',system:'API Resilience'},
   {id:'workflow-failed:live-tracker.yml',severity:'critical',system:'Live Tracker'},
   {id:'workflow-overdue:live-tracker.yml',severity:'critical',system:'Live Tracker'},
   {id:'stale-data:data/live-tracker-snapshot.json',severity:'critical',system:'Live Tracker'},
   {id:'stale-data:data/statistics.json',severity:'critical',system:'Statistics'},
   ...extra
 ];
 return {
   status:'UNHEALTHY',issues,
   summary:{
     criticalIssues:issues.filter(x=>x.severity==='critical').length,
     warnings:issues.filter(x=>x.severity==='warning').length
   }
 };
}
function verify(healing=report(),production=health()){
 const s=sandbox('self-healing-verifier.js',{files:{
  'output/self-healing.json':JSON.stringify(healing),
  'data/self-healing-state.json':JSON.stringify(state()),
  'data/system-health.json':JSON.stringify(production)
 }});
 s.run('main()');
 return {exitCode:s.process.exitCode,evidence:JSON.parse(s.files.get('output/self-healing-verification.json'))};
}
test('Self-Healing reports external outage as blocked, not repaired or engine malfunction',()=>{
 const {exitCode,evidence}=verify();
 assert.equal(exitCode,0);
 assert.equal(evidence.status,'EXTERNAL-LIVE-DATA-BLOCKED');
 assert.equal(evidence.healthy,false);
 assert.equal(evidence.technicalVerifierPassed,true);
 assert.equal(evidence.externalProviderBlocked,true);
 assert.equal(evidence.summary.criticalIssues,6);
 assert.ok(evidence.summary.failed>=1,'Unrecovered source remains visible in verifier evidence');
});
test('Self-Healing never disguises unrelated production critical faults as external map provider',()=>{
 const result=verify(report(),health([{id:'workflow-failed:convoy-checker.yml',severity:'critical',system:'Convoy'}]));
 assert.equal(result.exitCode,1);
 assert.equal(result.evidence.status,'SELF-HEALING-VERIFICATION-FAILED');
 assert.equal(result.evidence.externalProviderBlocked,false);
});
test('Self-Healing still fails when another allowlisted producer actually fails',()=>{
 const result=verify(report('driver-updates.yml'),health());
 assert.equal(result.exitCode,1);
 assert.equal(result.evidence.status,'SELF-HEALING-VERIFICATION-FAILED');
});
test('No provider outage means an unrelated failure cannot use external-blocked verdict',()=>{
 const production=health();
 production.issues=production.issues.filter(x=>!x.id.startsWith('api-health:'));
 production.summary.criticalIssues=production.issues.length;
 const result=verify(report(),production);
 assert.equal(result.exitCode,1);
 assert.equal(result.evidence.externalProviderBlocked,false);
});
