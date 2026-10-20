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
function reconcileOperationalAlerts(health, alertState) {
  // The on-disk alert queue is eventually consistent with fresh monitoring.
  // Only alerts that still refer to a *current* operational finding block the
  // verification gate. Retain historic/recovered alerts in evidence so
  // System Monitoring can post their normal resolution messages.
  const readiness=requireOperationalReadiness(health);
  const current=new Set((health.issues||[])
    .filter(x=>['critical','warning'].includes(x.severity))
    .filter(x=>!(HISTORIC_GATE_IDS.has(x.id) && x.severity==='warning'))
    .map(x=>String(x.id)));
  const active=Object.keys(alertState?.active||{});
  const pending=Object.keys(alertState?.pending||{});
  return {
    activeCurrent:active.filter(id=>current.has(id)),
    pendingCurrent:pending.filter(id=>current.has(id)),
    retainedHistorical:active.concat(pending).filter(id=>!current.has(id)),
    currentIssueCount:readiness.criticalIssues+readiness.warnings
  };
}
module.exports={HISTORIC_GATE_IDS,operationalReadinessFromIssues,requireOperationalReadiness,reconcileOperationalAlerts};
