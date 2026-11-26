'use strict';
// Kings Logistics acceptance ledger: an active GitHub workflow is not itself
// proof that every functional requirement of its parent business system is done.
// #17 Event Booking & Slot Management is explicitly cancelled and excluded.
const {WORKFLOW_REGISTRY}=require('./kings-workflow-registry');
const EVIDENCE_ROOT='https://github.com/Stinkesocke107/kings-logistics-automation/';
const VERIFIED='VERIFIED',PENDING='PENDING';
const FUNCTION_IDS=Object.freeze([
  'definition','implementation','offline_tests','integrations',
  'real_world_e2e','security','operations','owner_signoff'
]);
const GATE_LABELS=Object.freeze({
  definition:'Scope and acceptance criteria approved',
  implementation:'All required functions implemented',
  offline_tests:'Offline regression tests pass',
  integrations:'Dependent systems connected and checked',
  real_world_e2e:'Real source-to-destination end-to-end proof',
  security:'Access, privacy and failure behavior verified',
  operations:'Monitoring, recovery and operator instructions verified',
  owner_signoff:'Final owner acceptance explicitly recorded'
});
function item(id,label,state=PENDING,evidence=[]){
  return Object.freeze({id,label,state,evidence:Object.freeze([...evidence])});
}
function fullGateList(verified={}){
  return Object.freeze(FUNCTION_IDS.map(id=>
    item(id,GATE_LABELS[id],verified[id]?.length?VERIFIED:PENDING,
      verified[id]||[])));
}
const namedEventSystems=Object.freeze([
  {id:'12',name:'Event Capacity (advisory)',gates:fullGateList(),
    blockers:['System-specific final acceptance not independently documented']},
  {id:'14',name:'Event History',gates:fullGateList(),
    blockers:['System-specific final acceptance not independently documented']},
  {id:'15',name:'Invitation Tracker',gates:fullGateList(),
    blockers:['System-specific final acceptance not independently documented']},
  {id:'16',name:'Event Calendar',gates:fullGateList(),
    blockers:['System-specific final acceptance not independently documented']},
  {id:'18',name:'Event Operations — Discord Staff Review',
    gates:fullGateList({
      implementation:[EVIDENCE_ROOT+'pull/191'],
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45740001227'],
      security:[EVIDENCE_ROOT+'actions/runs/45737061788',
        EVIDENCE_ROOT+'actions/runs/45738190261'],
    }),
    capabilities:Object.freeze([
      item('private_channel_roles','Private channel and six authorized role IDs',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45737061788']),
      item('message_content','Authorized human message content is readable',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45738190261']),
      item('initial_cursor','First activation skips older Discord commands',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45738711922']),
      item('encrypted_journal','Valid Staff command updates AES-GCM protected journal',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45739168709',
          EVIDENCE_ROOT+'commit/994eb00f9b8e37b18bf37e8823bb7fc244c83107']),
      item('scheduled_idle','Automatic poll safely detects no new messages',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45878834923']),
      item('dashboard_publication','Revised private Event dashboard was published',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45740141908']),
      item('refresh_after_new_review','Live dashboard refresh triggered by a later real Staff change'),
      item('cross_system_review','Full live review flow across #12, #14, #15 and #16'),
      item('operator_handover','Event Team confirms understandable handling and error recovery')
    ]),
    blockers:[
      'A live change AFTER #191 must demonstrate automatic dashboard refresh',
      'Full end-to-end review across dependency systems has not been accepted',
      'Event staff operational handover and CEO final signoff remain open'
    ]}
].map(x=>Object.freeze(x)));
const AREA_ORDER=Object.freeze([
  'Automation','Backup','Changelog','Convoys','Drivers',
  'HR & Staff','Leadership','Live Data','News','Reports','Security'
]);
function assertEvidence(evidence){
  if(!Array.isArray(evidence))throw Error('System acceptance evidence must be a list');
  for(const uri of evidence){
    if(typeof uri!=='string'||!uri.startsWith(EVIDENCE_ROOT)||
      !/^https:\/\/github\.com\/Stinkesocke107\/kings-logistics-automation\/(actions\/runs\/\d+|commit\/[a-f0-9]{40}|pull\/\d+)$/.test(uri))
      throw Error('Only exact repository evidence references are permitted');
  }
}
function assertAcceptance(){
  const ids=namedEventSystems.map(x=>x.id);
  if(new Set(ids).size!==ids.length||ids.includes('17'))
    throw Error('Cancelled Event System #17 must never enter acceptance');
  if(new Set(WORKFLOW_REGISTRY.map(x=>x.file)).size!==WORKFLOW_REGISTRY.length)
    throw Error('Workflow inventory must be unique');
  for(const system of namedEventSystems){
    if(system.gates.length!==FUNCTION_IDS.length||
      new Set(system.gates.map(x=>x.id)).size!==FUNCTION_IDS.length)
      throw Error('System acceptance checklist is incomplete');
    for(const gate of [...system.gates,...(system.capabilities||[])]){
      if(![VERIFIED,PENDING].includes(gate.state))throw Error('Invalid verification state');
      assertEvidence(gate.evidence);
      if(gate.state===VERIFIED&&!gate.evidence.length)
        throw Error('Verified function requires exact evidence');
      if(gate.state===PENDING&&gate.evidence.length)
        throw Error('Unverified function cannot claim evidence');
    }
    if(!Array.isArray(system.blockers))throw Error('Blocker list required');
  }
  if(!WORKFLOW_REGISTRY.some(x=>x.file==='event-operations-discord-review.yml'))
    throw Error('Discord Staff review workflow missing from active inventory');
}
function acceptanceStatus({gates,capabilities=[],blockers=[],ownerApproval=null}){
  const all=[...gates,...capabilities];
  if(!all.length)throw Error('Completion requires defined acceptance functions');
  const allVerified=all.every(x=>x.state===VERIFIED&&x.evidence.length);
  const ownerApproved=ownerApproval?.approvedBy==='CEO'&&
    typeof ownerApproval?.approvedAt==='string'&&
    Array.isArray(ownerApproval?.evidence)&&ownerApproval.evidence.length>0;
  if(allVerified&&!blockers.length&&ownerApproved){
    assertEvidence(ownerApproval.evidence);
    return 'COMPLETE';
  }
  return all.some(x=>x.state===VERIFIED)?'PARTIALLY_VERIFIED':'NOT_ASSESSED';
}
function snapshot(){
  assertAcceptance();
  const eventSystems=namedEventSystems.map(s=>({
    ...s,ownerApproval:null,
    acceptance:acceptanceStatus({...s,ownerApproval:null})
  }));
  const eventDiscord=eventSystems.find(s=>s.id==='18');
  const workflows=WORKFLOW_REGISTRY.map(w=>({
    file:w.file,label:w.label,area:w.area,
    // A system-level evidence review may inform, but does NOT overwrite,
    // unrelated workflow acceptance decisions.
    status:w.file==='event-operations-discord-review.yml'?
      eventDiscord.acceptance:'NOT_ASSESSED'
  }));
  for(const workflow of workflows)
    if(!AREA_ORDER.includes(workflow.area))
      throw Error('Workflow area is missing from acceptance reporting');
  return Object.freeze({
    totalWorkflows:workflows.length,
    assessedWorkflows:workflows.filter(w=>w.status!=='NOT_ASSESSED').length,
    completeWorkflows:workflows.filter(w=>w.status==='COMPLETE').length,
    areas:AREA_ORDER.map(area=>{
      const members=workflows.filter(w=>w.area===area);
      return {
        name:area,total:members.length,
        acceptance:members.length&&members.every(w=>w.status==='COMPLETE')?
          'COMPLETE':members.some(w=>w.status!=='NOT_ASSESSED')?
            'PARTIALLY_VERIFIED':'NOT_ASSESSED'
      };
    }),
    eventSystems,
    excluded:Object.freeze(['17 — Event Booking & Slot Management (cancelled)'])
  });
}
if(require.main===module){
  const s=snapshot();
  console.log(JSON.stringify({
    totalWorkflows:s.totalWorkflows,
    fullyAccepted:s.completeWorkflows,
    note:'NOT_ASSESSED does not mean broken; production health is a separate signal',
    eventSystems:s.eventSystems.map(e=>({
      id:e.id,name:e.name,status:e.acceptance,
      verifiedFunctions:[...e.gates,...(e.capabilities||[])].filter(x=>x.state===VERIFIED).length,
      totalFunctions:e.gates.length+(e.capabilities||[]).length,
      openBlockers:e.blockers.length
    }))
  },null,2));
}
module.exports={
  VERIFIED,PENDING,FUNCTION_IDS,namedEventSystems,AREA_ORDER,
  assertAcceptance,acceptanceStatus,snapshot
};
