'use strict';
// Read-only Kings completion audit. GitHub execution health is deliberately
// separate from verified functions, real-world evidence and CEO approval.
// No Discord/API access, credentials, staff actions or system writes.
const {snapshot,FUNCTION_IDS}=require('./kings-system-acceptance');
const {WORKFLOW_REGISTRY}=require('./kings-workflow-registry');

function buildOpenWork(acceptance=snapshot(),registry=WORKFLOW_REGISTRY){
  if(!acceptance||!Array.isArray(acceptance.workflows)||
     !Array.isArray(acceptance.eventSystems)||
     !Array.isArray(acceptance.operationalSystems)||
     !Array.isArray(registry)||
     acceptance.totalWorkflows!==registry.length||
     acceptance.workflows.length!==registry.length)
    throw Error('Kings acceptance and workflow inventory disagree');
  const files=new Set();
  const workflows=acceptance.workflows.map(w=>{
    const registered=registry.find(r=>r.file===w.file);
    if(!registered||files.has(w.file)||registered.area!==w.area||
       !['NOT_ASSESSED','PARTIALLY_VERIFIED','COMPLETE'].includes(w.status))
      throw Error('Kings workflow coverage is incomplete or inconsistent');
    files.add(w.file);
    return {file:w.file,name:w.label,area:w.area,mode:registered.mode,
      acceptance:w.status,open:w.status!=='COMPLETE'};
  });
  const summarizeSystem=system=>{
    const checks=[...system.gates,...(system.capabilities||[])];
    const missing=checks.filter(x=>x.state!=='VERIFIED').map(x=>({
      id:x.id,label:x.label
    }));
    const verified=checks.length-missing.length;
    const blocking=(system.blockers||[]).slice();
    const ownerApproved=!!(system.ownerApproval&&
      system.ownerApproval.approvedBy==='CEO');
    if(system.acceptance==='COMPLETE'&&
       (missing.length||blocking.length||!ownerApproved))
      throw Error('Unverified Kings system cannot be marked COMPLETE');
    if(system.gates.length!==FUNCTION_IDS.length)
      throw Error('Every assessed system requires all final gates');
    return {id:system.id,name:system.name,status:system.acceptance,
      verifiedChecks:verified,totalChecks:checks.length,
      missing,blockers:blocking,ownerApproved};
  };
  const eventSystems=acceptance.eventSystems.map(summarizeSystem);
  const operationalSystems=acceptance.operationalSystems.map(summarizeSystem);
  if(eventSystems.some(s=>s.id==='17')||
     operationalSystems.some(s=>s.id==='17')||
     acceptance.excluded?.every(s=>!s.startsWith('17')))
    throw Error('Cancelled Event Booking #17 must stay excluded');
  const counts={
    workflows:workflows.length,
    scheduled:workflows.filter(w=>w.mode==='scheduled').length,
    manualOrOnChange:workflows.filter(w=>w.mode!=='scheduled').length,
    assessed:workflows.filter(w=>w.acceptance!=='NOT_ASSESSED').length,
    notAssessed:workflows.filter(w=>w.acceptance==='NOT_ASSESSED').length,
    complete:workflows.filter(w=>w.acceptance==='COMPLETE').length
  };
  return {asOf:'2026-11-26',counts,eventSystems,operationalSystems,
    unassessedWorkflows:workflows.filter(w=>w.acceptance==='NOT_ASSESSED'),
    allWorkflows:workflows,
    externalBlockers:[
      'Full map-derived live data depends on independent third-party providers; the official fallback must remain truthful.',
      'Real Staff, Driver, Event and Discord changes require authentic authorized source evidence; never fabricate these in CI.',
      'Owner acceptance is recorded only after explicit CEO signoff.',
      'Daily and monthly Event Capacity limits require separate CEO confirmation before business acceptance.'
    ],
    exclusions:['17 — Event Booking & Slot Management (cancelled)'],
    disclaimer:'NOT_ASSESSED does not mean broken. A green workflow is not a real-world or CEO acceptance proof.'};
}
function renderMarkdown(report=buildOpenWork()){
  const r=report,c=r.counts;
  const lines=[
    '## 👑 Kings Logistics — Open completion gates',
    '',
    '| Workflow inventory | Automatic | Assessed | Complete | Not yet assessed |',
    '|---:|---:|---:|---:|---:|',
    `| ${c.workflows} | ${c.scheduled} | ${c.assessed} | ${c.complete} | ${c.notAssessed} |`,
    '',
    '**Meaning:** NOT_ASSESSED does not mean broken. Production health, evidence and CEO final acceptance are separate.',
    '',
    '### Event systems — pending verifications'
  ];
  for(const item of r.eventSystems){
    lines.push(`**#${item.id} ${item.name}** — ${item.status}; ${item.verifiedChecks}/${item.totalChecks} checks verified.`);
    for(const pending of item.missing)lines.push(`- [ ] ${pending.label}`);
    for(const blocker of item.blockers)lines.push(`- **Blocker:** ${blocker}`);
  }
  lines.push('','### Operational systems — pending verifications');
  for(const item of r.operationalSystems){
    lines.push(`**${item.name}** — ${item.status}; ${item.verifiedChecks}/${item.totalChecks} checks verified.`);
    for(const pending of item.missing)lines.push(`- [ ] ${pending.label}`);
    for(const blocker of item.blockers)lines.push(`- **Blocker:** ${blocker}`);
  }
  lines.push('','### Workflows awaiting individual review (not broken by definition)');
  for(const area of [...new Set(r.unassessedWorkflows.map(w=>w.area))]){
    const names=r.unassessedWorkflows.filter(w=>w.area===area)
      .map(w=>`${w.name} (\`${w.file}\`)`);
    lines.push(`- **${area}:** ${names.join(', ')}`);
  }
  lines.push('','### External and human acceptance blockers');
  for(const blocker of r.externalBlockers)lines.push(`- ${blocker}`);
  lines.push('','**Cancelled:** #17 Event Booking & Slot Management. No artificial approvals, slots, online drivers or source updates.');
  return lines.join('\n')+'\n';
}
if(require.main===module){
  const report=buildOpenWork();
  const mode=process.argv[2]||'--json';
  if(mode==='--json')process.stdout.write(JSON.stringify(report,null,2)+'\n');
  else if(mode==='--summary')process.stdout.write(renderMarkdown(report));
  else {console.error('Use --json or --summary');process.exitCode=2}
}
module.exports={buildOpenWork,renderMarkdown};
