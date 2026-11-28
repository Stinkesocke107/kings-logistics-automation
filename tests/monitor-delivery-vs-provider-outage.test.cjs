'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sandbox}=require('./sandbox.cjs');
const {operationalReadinessFromIssues}=require('../system-health-readiness.js');

const root=path.resolve(__dirname,'..');
const scenarios=[
  'workflow retry after failed attempt',
  'API HTTP 503 recovery',
  'API timeout recovery',
  'stale data producer restart',
  'scheduler fallback without duplicate dispatch',
  'corrupt state safe recovery',
  'unsafe error is alert-only / no automatic action',
  'repair loop prevention',
  'duplicate repair planning suppression',
  'combined recoverable and unsafe failures escalate without forbidden dispatch',
  'unknown repair state fails closed rather than enabling forbidden action'
];
function stress(failed=false) {
  return {
    version:1,point:22,mode:'isolated-controlled-failure-stress-test',
    status:failed?'STRESS-TEST-FAILED':'STRESS-TEST-PASSED',
    safety:{
      productionFailureInjection:false,localApiMockOnly:true,
      productionDiscordWrites:false,productionPersonnelActions:false,
      productionConvoyLiveActions:false,automaticRestore:false,forcePush:false
    },
    summary:{failed:failed?1:0},
    scenarios:scenarios.map((name,i)=>({
      name,status:failed && i===0?'FAIL':'PASS',logs:['independent mock exercised']
    }))
  };
}
function outageHealth(){
  const issues=[
    {id:'api-health:ETS2Map area',severity:'critical',system:'API Resilience',message:'Provider down'},
    {id:'stale-data:data/statistics.json',severity:'critical',system:'Statistics',message:'No live data'}
  ];
  return {
    status:'UNHEALTHY',issues,
    summary:{criticalIssues:2,warnings:0},
    operationalReadiness:operationalReadinessFromIssues(issues)
  };
}
function verify(stressReport) {
  const s=sandbox('self-healing-stress-verifier.js',{files:{
    'output/self-healing-stress.json':JSON.stringify(stressReport),
    'data/system-health.json':JSON.stringify(outageHealth())
  }});
  s.run('main()');
  return {code:s.process.exitCode,report:JSON.parse(s.files.get('output/self-healing-stress-verification.json'))};
}
test('Point 22 mock verification passes without pretending provider outage is resolved',()=>{
  const {code,report}=verify(stress());
  assert.equal(code,0);
  assert.equal(report.healthy,true);
  assert.equal(report.status,'VERIFIED-SELF-HEALING-STRESS');
  assert.equal(report.summary.productionReadiness,'UNHEALTHY');
  assert.equal(report.summary.productionCriticalIssues,2);
  assert.equal(report.summary.productionWarnings,0);
  const freeze=fs.readFileSync(path.join(root,'final-freeze-verifier.js'),'utf8');
  assert.match(freeze,/Operational Critical Issues = 0/);
  assert.match(freeze,/ready\.criticalIssues === 0/);
});
test('Point 22 still fails strictly when an isolated safety or recovery scenario fails',()=>{
  const {code,report}=verify(stress(true));
  assert.equal(code,1);
  assert.equal(report.healthy,false);
  assert.equal(report.status,'SELF-HEALING-STRESS-FAILED');
  assert.ok(report.summary.failed>0);
});
test('System Monitor publishes true red production state without failing just for reporting it',()=>{
  const yml=fs.readFileSync(path.join(root,'.github/workflows/system-monitoring.yml'),'utf8');
  assert.match(yml,/Verify technical monitor delivery/);
  assert.match(yml,/Verify technical monitor delivery[^\n]*\n(?:[^\n]*\n){0,6}\s*if: success\(\)/);
  assert.doesNotMatch(yml,/Verify technical monitor delivery[^\n]*\n\s*if: always\(\)/);
  assert.match(yml,/real production status/);
  assert.match(yml,/health\.status === 'UNHEALTHY' && critical === 0/);
  assert.doesNotMatch(yml,/h\.status==='UNHEALTHY'\|\|h\.status==='UNKNOWN'/);
  assert.match(yml,/run: node system-monitor-discord\.js/);
  assert.match(yml,/run: node system-alerts\.js/);
});
test('Self-Healing persists only its own state and cannot race System Monitoring alert writer',()=>{
  const yml=fs.readFileSync(path.join(root,'.github/workflows/self-healing.yml'),'utf8');
  assert.match(yml,/Persist Self-Healing technical state \(single-writer ownership\)/);
  assert.match(yml,/git restore --worktree -- data\/api-health data\/system-alerts-state\.json/);
  assert.match(yml,/git add -- data\/self-healing-state\.json/);
  assert.doesNotMatch(yml,/git add -A -- data\/self-healing-state\.json data\/system-alerts-state\.json/);
  assert.doesNotMatch(yml,/run: node system-alerts\.js/);
  assert.match(yml,/node self-healing-verifier\.js/);
});
