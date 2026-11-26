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
  {id:'12',name:'Event Capacity (advisory)',
    gates:fullGateList({
      implementation:[EVIDENCE_ROOT+'pull/194'],
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45899560178'],
      security:[EVIDENCE_ROOT+'actions/runs/45899560178']
    }),
    capabilities:Object.freeze([
      item('utc_policy','3 total UTC/day; Partner and External each 20/month; Kings monthly unlimited',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45899560178']),
      item('departure_warning','Under-120-minute departure gap, including UTC month boundary, is warning-only',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45899560178']),
      item('source_reconciliation','Mismatch, stale report and frozen Legacy hold do not create free capacity',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45899560178']),
      item('advisory_integration','Planning, 12-month Calendar, History/Leadership and Staff triage agree offline',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45899560178']),
      item('live_calendar_source','Real Convoy Checker completed read-only same-run Calendar source verification',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45897888431']),
      item('live_capacity_staff_worklist',
        'Real read-only Convoy/Calendar source passed mandatory Capacity-to-Staff worklist warning checks',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45901364553']),
      item('live_integrated_acceptance','Full real original-source planning-to-Staff human review verified'),
      item('operator_handover','Event Team validates capacity interpretation and incident handling'),
      item('owner_final_approval','CEO signs off #12 advisory capacity as a whole')
    ]),
    blockers:[
      'Actual remaining/bookable capacity must never be inferred from source claims',
      'Full real planning-to-authorized-Staff handover and monitoring proof pending',
      'Explicit CEO final acceptance not recorded'
    ]},
  {id:'14',name:'Event History',
    gates:fullGateList({
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45900507573']
    }),
    capabilities:Object.freeze([
      item('reconciled_history_projection',
        '24-month source-claim projection separates Convoy Center and frozen Legacy',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45899560178']),
      item('month_source_integrity',
        'Exact UTC month continuity, bounded counts and contradictory outcome protection',VERIFIED,
        [EVIDENCE_ROOT+'pull/195',EVIDENCE_ROOT+'actions/runs/45900507573']),
      item('protected_review_agenda',
        'Private month-level read-only evidence review without per-event identifiers',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45900507573']),
      item('live_reconciled_source_probe',
        'Real Convoy Center and frozen Legacy source passed read-only History/Calendar reconciliation',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45900603134']),
      item('original_archive_completeness',
        'All original 24-month Event records independently reconciled'),
      item('historical_staff_decisions',
        'Approvals, cancellations and attendance checked against original Staff evidence'),
      item('real_staff_to_dashboard_handover',
        'Real source-to-private-dashboard and team handling confirmed')
    ]),
    blockers:[
      'Original Event archive coverage across all 24 UTC months is unverified',
      'Historical Staff approvals, cancellations and attendance are not independently evidenced',
      'Real full source-to-Staff handover, operations and CEO signoff remain pending'
    ]},
  {id:'15',name:'Invitation Tracker',
    gates:fullGateList({offline_tests:[EVIDENCE_ROOT+'actions/runs/45900507573']}),
    capabilities:Object.freeze([
      item('live_forum_readonly', 'Original private invitation forum was fully readable through GET-only probe',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45900603134']),
      item('live_tag_schema','Three approved status tags matched actual Forum labels',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45900603134']),
      item('duplicate_and_reply_safety','Invitation reply/duplicate review and privacy boundaries pass offline checks',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45900507573']),
      item('invitation_archive_coverage','Original historical invitation archive independently checked for completeness'),
      item('real_observation_delivery','Fresh invitation observation confirmed in encrypted state and private dashboard'),
      item('recorded_reply_provenance','Recorded responses and invitation claims reconciled with original human records'),
      item('team_owner_handover','Event Coordination team and CEO complete operational signoff')
    ]),
    blockers:[
      'Forum readability does not certify historical invitation completeness or external response authenticity',
      'Real encrypted state-to-dashboard publication and authorized team handover remain unverified',
      'CEO final acceptance not recorded'
    ]},
  {id:'16',name:'Event Calendar',
    gates:fullGateList({offline_tests:[EVIDENCE_ROOT+'actions/runs/45900507573']}),
    capabilities:Object.freeze([
      item('twelve_month_review','12-month UTC calendar claims and warning calculations tested offline',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45899560178']),
      item('live_readonly_calendar_source','Real Convoy Center/Legacy Calendar read-only source reconciled',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45900603134']),
      item('original_calendar_decisions','All approvals, confirmed holds and cancellations reconciled with original Staff evidence'),
      item('live_staff_calendar_review','Real Calendar changes reach authorized Event Staff and private dashboard'),
      item('team_owner_handover','Event team confirms calendar interpretation, recovery and CEO signoff')
    ]),
    blockers:[
      'Source claims cannot certify free slots, confirmed holds or complete original calendar decisions',
      'Live Staff review and dashboard refresh after actual calendar change unverified',
      'CEO final acceptance not recorded'
    ]},
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
      item('cross_system_offline','Capacity, Calendar, History and Invitation sources pass a synthetic encrypted Staff-to-dashboard integration',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45899041605']),
      item('webhook_timeout_guard',
        'Webhooks cannot act as Staff commands and Discord source requests are GET-only, redirect-rejecting and time-bounded',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45901257045']),
      item('scheduler_recovery_guard',
        'Owner-enabled overdue Discord poll recovery has offline gating and cooldown tests',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45901478091']),
      item('scheduler_live_recovery',
        'Central Scheduler actually recovered a delayed Discord Staff poll; idle poll made no protected state write',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45901564388',EVIDENCE_ROOT+'actions/runs/45901614835']),
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

// Non-Event functional acceptance is added one explicitly scoped workflow at
// a time. A green producer poll is never proof that a real Driver transition,
// HR Staff approval, Discord publication or CEO signoff has happened.
const namedOperationalSystems=Object.freeze([
  {id:'DRIVER_UPDATES',name:'Driver Updates — VTC membership changes',
    workflow:'driver-updates.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('live_roster_poll','Actual VTC roster was fetched by the production Driver Updates workflow',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45901569737']),
      item('live_no_change','Production run detected no new Driver changes without inventing a join or departure',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45901569737']),
      item('real_join_leave_delivery','A genuine Driver membership change reaches protected state and the intended Discord update'),
      item('cross_system_driver_reconciliation','Driver Updates and Driver Management agree on a real roster change'),
      item('operational_handover','Driver Operations confirms real recovery, alerts and public output')
    ]),
    blockers:[
      'A green no-change poll does not test an actual join, departure or Discord delivery',
      'Full cross-system source-to-state-to-Discord evidence and operator recovery remain pending',
      'No CEO final acceptance is recorded'
    ]},
  {id:'DRIVER_MANAGEMENT',name:'Driver Management — internal roster and LOA',
    workflow:'driver-management.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('live_management_poll','Current Driver Management workflow completed after state safety update',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45902760777']),
      item('protected_conflict_detection','Real isolated Git race fails the workflow instead of hiding a lost Driver state commit',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45902677492']),
      item('real_driver_loa_lifecycle','An authorized real leave-of-absence request and return update protected state correctly'),
      item('driver_discord_handover','Real Driver change reaches the approved private management view and team'),
      item('recovery_without_personnel_changes','Recovery and operational ownership are signed off without automatic disciplinary action')
    ]),
    blockers:[
      'Actual LOA command lifecycle and source-to-private-management publication not yet verified end to end',
      'A same-file Git conflict is detected but a human-safe replay/reconciliation procedure still needs operational review',
      'No Driver Team handover or CEO final acceptance is recorded'
    ]},
  {id:'HR_PROBATION',name:'HR Leadership — private probation reviews',
    workflow:'hr-leadership.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('live_hr_poll','HR Leadership probation workflow completed after protected-state safety update',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45902760787']),
      item('protected_hr_conflict','Real isolated Git race fails rather than silently discarding encrypted HR review status',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45902677492']),
      item('real_authorized_hr_command','Authorized real probation command is processed and durably stored'),
      item('hr_leadership_handover','Current HR review, original evidence and private Leadership presentation are reconciled'),
      item('hr_recovery_confirmed','HR Team validates failed-save recovery and command idempotence')
    ]),
    blockers:[
      'The successful HR polling run is not evidence that a new human command was processed',
      'Private Staff decision provenance and a complete source-to-state-to-view live test remain open',
      'HR operator recovery procedure and CEO signoff remain open'
    ]},
  {id:'STAFF_MANAGEMENT',name:'Staff Management — VTC hierarchy and public Staff updates',
    workflow:'staff-management.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('live_staff_poll','Staff Management workflow completed after new state-integrity safeguards',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45902761042']),
      item('corrupt_state_fail_closed','Malformed existing encrypted Staff history cannot become a fake first-run baseline',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45902677492']),
      item('protected_staff_conflict','Real isolated Git race refuses false success if newer Staff state is already on main',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45902677492']),
      item('real_staff_lifecycle','Real joining, promotion and departure are reconciled with approved VTC and Discord evidence'),
      item('public_staff_delivery','Real approved Staff announcement is independently confirmed in the correct Discord channel'),
      item('staff_operator_handover','Staff team signs off role hierarchy, message safety and manual recovery')
    ]),
    blockers:[
      'Successful roster polling does not prove a real promotion, departure or public Discord delivery',
      'Auxiliary public Staff update errors and protected-state retry scenarios require live operator follow-up',
      'No Staff team or CEO final acceptance is recorded'
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
  const systems=[...namedEventSystems,...namedOperationalSystems];
  const ids=systems.map(x=>x.id);
  if(new Set(ids).size!==ids.length||ids.includes('17'))
    throw Error('Cancelled Event System #17 must never enter acceptance');
  if(new Set(namedOperationalSystems.map(x=>x.workflow)).size!==namedOperationalSystems.length||
    namedOperationalSystems.some(x=>!WORKFLOW_REGISTRY.some(w=>w.file===x.workflow)))
    throw Error('Operational acceptance requires unique registered workflows');
  if(new Set(WORKFLOW_REGISTRY.map(x=>x.file)).size!==WORKFLOW_REGISTRY.length)
    throw Error('Workflow inventory must be unique');
  for(const system of systems){
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
  const withStatus=s=>{
    const ownerApproval=s.ownerApproval||null;
    return {...s,ownerApproval,acceptance:acceptanceStatus({...s,ownerApproval})};
  };
  const eventSystems=namedEventSystems.map(withStatus);
  const operationalSystems=namedOperationalSystems.map(withStatus);
  // Map workflows to the independently accepted business systems that own
  // them. Additional mappings require explicitly reviewed systems first.
  const workflowSystemRefs=Object.freeze({
    'event-operations-discord-review.yml':'18',
    ...Object.fromEntries(namedOperationalSystems.map(x=>[x.workflow,x.id]))
  });
  const workflows=WORKFLOW_REGISTRY.map(w=>{
    const reference=workflowSystemRefs[w.file];
    const system=reference?[...eventSystems,...operationalSystems].find(s=>s.id===reference):null;
    if(reference&&!system)throw Error('Unregistered Kings system acceptance reference');
    return {
      file:w.file,label:w.label,area:w.area,
      // A documented system gate does not silently approve other workflows.
      status:system?system.acceptance:'NOT_ASSESSED'
    };
  });
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
    eventSystems,operationalSystems,
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
    })),
    operationalSystems:s.operationalSystems.map(e=>({
      id:e.id,name:e.name,status:e.acceptance,
      verifiedFunctions:[...e.gates,...(e.capabilities||[])].filter(x=>x.state===VERIFIED).length,
      totalFunctions:e.gates.length+(e.capabilities||[]).length,
      openBlockers:e.blockers.length
    }))
  },null,2));
}
module.exports={
  VERIFIED,PENDING,FUNCTION_IDS,namedEventSystems,namedOperationalSystems,AREA_ORDER,
  assertAcceptance,acceptanceStatus,snapshot
};
