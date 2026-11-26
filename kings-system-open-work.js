'use strict';
// Read-only Kings completion audit. GitHub execution health is deliberately
// separate from verified functions, real-world evidence and CEO approval.
// No Discord/API access, credentials, staff actions or system writes.
const {snapshot,FUNCTION_IDS}=require('./kings-system-acceptance');
const {WORKFLOW_REGISTRY}=require('./kings-workflow-registry');
const {individualCloseoutRequirements}=require('./kings-workflow-closeout-requirements');

function buildOpenWork(acceptance=snapshot(),registry=WORKFLOW_REGISTRY,now=new Date()){
  const asOf=new Date(now);
  if(Number.isNaN(asOf.getTime()))throw Error('Invalid Kings closeout report date');
  if(!acceptance||!Array.isArray(acceptance.eventSystems)||
     !Array.isArray(acceptance.operationalSystems)||
     !Array.isArray(registry)||acceptance.totalWorkflows!==registry.length)
    throw Error('Kings acceptance and workflow inventory disagree');
  // snapshot() intentionally does not export raw workflow rows: derive the
  // same strict one-to-one owner mapping from the authoritative registry.
  // No unassessed workflow inherits verification from a neighbouring system.
  const mappedSystems=new Map([
    ['event-operations-discord-review.yml',
      acceptance.eventSystems.find(x=>x.id==='18')],
    ...acceptance.operationalSystems.map(x=>[x.workflow,x])
  ]);
  const requirements=individualCloseoutRequirements(registry);
  const files=new Set();
  const workflows=registry.map(w=>{
    if(files.has(w.file)||
       !['scheduled','manual','on-change'].includes(w.mode))
      throw Error('Kings workflow coverage is incomplete or inconsistent');
    files.add(w.file);
    const accepted=mappedSystems.get(w.file);
    const status=accepted?.acceptance||'NOT_ASSESSED';
    if(!['NOT_ASSESSED','PARTIALLY_VERIFIED','COMPLETE'].includes(status))
      throw Error('Invalid Kings workflow acceptance status');
    return {file:w.file,name:w.label,area:w.area,mode:w.mode,
      acceptance:status,open:status!=='COMPLETE',
      requirements:[...requirements[w.file]]};
  });
  if(workflows.filter(w=>w.acceptance!=='NOT_ASSESSED').length!==
     acceptance.assessedWorkflows)
    throw Error('Kings acceptance and workflow inventory disagree');
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
  return {asOf:asOf.toISOString().slice(0,10),counts,eventSystems,operationalSystems,
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
    'Report generated (UTC): '+r.asOf,
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
  lines.push('','### All 46 workflows — individual outstanding closeout evidence');
  for(const area of [...new Set(r.allWorkflows.map(w=>w.area))]){
    lines.push('','#### '+area);
    for(const w of r.allWorkflows.filter(x=>x.area===area)){
      lines.push(`**${w.name}** (\`${w.file}\`) — ${w.acceptance}`);
      for(const requirement of w.requirements)lines.push(`- [ ] ${requirement}`);
    }
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
