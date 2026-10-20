'use strict';

// Historic results of a *Final Freeze* quality gate cannot veto the current
// Final Freeze forever. They stay in health.issues, summary.warnings and the
// Discord monitor, but are not input failures for production-readiness checks.
// All actual drivers, HR, staff, convoy, API, backup, data, news, security,
// monitoring and self-healing issues remain full blockers.
const HISTORIC_GATE_IDS = new Set([
  'workflow-failed:final-freeze-verification.yml',
  'workflow-overdue:final-freeze-verification.yml'
]);
function operationalReadinessFromIssues(issues) {
  if (!Array.isArray(issues)) throw Error('Complete Kings monitoring findings are required');
  const blocking=[], diagnostic=[];
  for(const item of issues) {
    if(HISTORIC_GATE_IDS.has(item?.id) && item?.severity === 'warning') diagnostic.push(item);
    else blocking.push(item);
  }
  const criticalIssues=blocking.filter(x=>x.severity==='critical').length;
  const warnings=blocking.filter(x=>x.severity==='warning').length;
  return {
    status:criticalIssues?'UNHEALTHY':warnings?'DEGRADED':'HEALTHY',
    criticalIssues,warnings,
    diagnosticsCount:diagnostic.length,
    diagnosticGateFindings:diagnostic.map(x=>({id:x.id,message:String(x.message||'')}))
  };
}
function requireOperationalReadiness(health) {
  if(!health || !Array.isArray(health.issues) || !health.operationalReadiness) throw Error('Operational readiness report missing');
  const computed=operationalReadinessFromIssues(health.issues);
  if(JSON.stringify(computed)!==JSON.stringify(health.operationalReadiness)) throw Error('Operational readiness does not match published issues');
  return computed;
}
module.exports={HISTORIC_GATE_IDS,operationalReadinessFromIssues,requireOperationalReadiness};
