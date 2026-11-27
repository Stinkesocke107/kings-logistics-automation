'use strict';
// Kings Logistics acceptance ledger: an active GitHub workflow is not itself
// proof that every functional requirement of its parent business system is done.
// #17 Event Booking & Slot Management is explicitly cancelled and excluded.
const {WORKFLOW_REGISTRY}=require('./kings-workflow-registry');
const {FIRST_REVIEWS}=require('./kings-first-review-catalog');
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
      item('real_joint_source_advisory_triage',
        'Real Convoy Center, 24-month History, 12-month Calendar and Invitation Forum source claims reconciled into the existing Event Operations Staff triage without writes',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911909091']),
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
      item('real_joint_source_advisory_triage',
        'Real Convoy Center, 24-month History, 12-month Calendar and Invitation Forum source claims reconciled into the existing Event Operations Staff triage without writes',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911909091']),
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
      item('real_joint_source_advisory_triage',
        'Real Convoy Center, 24-month History, 12-month Calendar and Invitation Forum source claims reconciled into the existing Event Operations Staff triage without writes',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911909091']),
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
      item('real_joint_source_advisory_triage',
        'Real Convoy Center, 24-month History, 12-month Calendar and Invitation Forum source claims reconciled into the existing Event Operations Staff triage without writes',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911909091']),
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
      item('dashboard_readback_verified',
        'A real consolidated Event dashboard update was read back from Discord and validated against all visible Event fields',VERIFIED,
        [EVIDENCE_ROOT+'pull/212',EVIDENCE_ROOT+'actions/runs/45907968169']),
      item('current_encrypted_review_dashboard_live',
        'Real production compared the current protected Event Staff review journal to the existing Discord Event Leadership progress field after publication',VERIFIED,
        [EVIDENCE_ROOT+'pull/218',EVIDENCE_ROOT+'actions/runs/45909541123']),
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
      item('real_joint_source_advisory_triage',
        'Real Convoy Center, 24-month History, 12-month Calendar and Invitation Forum source claims reconciled into the existing Event Operations Staff triage without writes',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911909091']),
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
      item('loa_private_cursor_pagination','Driver LOA command cursor handles real-structure multi-page history and rejects truncated batches offline',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45903917911',
         EVIDENCE_ROOT+'actions/runs/45904002762']),
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
      item('hr_command_cursor_pagination','HR private command reader paginates back to protected cursor and rejects gaps and bad IDs',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45903917911',
         EVIDENCE_ROOT+'actions/runs/45904002869']),
      item('hr_command_actor_authority','Actual guild membership and approved HR roles are required for unedited human commands; outsider or webhook rejected offline',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45904130702',
         EVIDENCE_ROOT+'actions/runs/45904230707']),
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
      item('public_staff_journal_fail_closed','Corrupted encrypted public Staff announcement dedupe history cannot silently create a new baseline; actual Staff producer still ran after deployment',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45904297317',
         EVIDENCE_ROOT+'actions/runs/45904393705']),
      item('real_staff_lifecycle','Real joining, promotion and departure are reconciled with approved VTC and Discord evidence'),
      item('public_staff_delivery','Real approved Staff announcement is independently confirmed in the correct Discord channel'),
      item('staff_operator_handover','Staff team signs off role hierarchy, message safety and manual recovery')
    ]),
    blockers:[
      'Successful roster polling does not prove a real promotion, departure or public Discord delivery',
      'Auxiliary public Staff update errors and protected-state retry scenarios require live operator follow-up',
      'No Staff team or CEO final acceptance is recorded'
    ]},
  {id:'LIVE_TRACKER_OFFICIAL',name:'Live Tracker — automatic live-map recovery and official fallback',
    workflow:'live-tracker.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('official_no_map_gate',
        'Verified official fallback needs no player-map source and never invents Kings online presence during outages',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45905349148']),
      item('source_to_discord_live',
        'Real official VTC roster and server aggregates were published by updating all three existing Discord displays',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45905430735']),
      item('separate_public_snapshot',
        'Actual production run saved current non-personal official source data without rewriting older Kings player-map measurements',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45905430735']),
      item('truthful_online_unavailability',
        'Offline tests prohibit equating overall TruckersMP players with Kings Drivers currently online',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45905349148']),
      item('official_health_separation',
        'Read-only monitoring differentiates the verified map-free Tracker from full historical map-based Core status',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45905628464']),
      item('monitor_post_deploy_live','Actual production monitoring artifact confirms the official map-free source verified and three displays delivered, while Core remains honestly UNHEALTHY',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45905733795']),
      item('automatic_map_restoration_live','After map provider recovery, the real complete multi-server tracker, synchronized Statistics, Central Overview and matching verified-live delivery are confirmed in production'),
      item('recurring_feed_resilience','Repeated automatic full-map and official-fallback scheduled refreshes are verified in production'),
      item('operational_handover','Driver/Leadership operators review source limits, display accuracy and outage handling')
    ]),
    blockers:[
      'Official outage fallback has succeeded in production; actual full-map automatic restoration is not yet confirmed against a recovered provider',
      'Repeated scheduled dual-mode stability and operator handover remain open',
      'CEO final signoff has not been issued; map-derived per-player status is intentionally out of scope and never fabricated'
    ]},
  {id:'BACKUP_RECOVERY',name:'Backup & Recovery — complete source and isolated roundtrip',
    workflow:'backup-recovery-verification.yml',
    gates:fullGateList({
      implementation:[EVIDENCE_ROOT+'pull/220'],
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45909939222',EVIDENCE_ROOT+'actions/runs/45915470464'],
      security:[EVIDENCE_ROOT+'pull/220',
        EVIDENCE_ROOT+'actions/runs/45909939222']
    }),
    capabilities:Object.freeze([
      item('full_current_source_coverage',
        'The backup includes current automation scripts, all 46 workflow sources, tests, docs, protected data files and required operator procedures',VERIFIED,
        [EVIDENCE_ROOT+'pull/220',EVIDENCE_ROOT+'actions/runs/45910026083',EVIDENCE_ROOT+'actions/runs/45915470464']),
      item('isolated_full_archive_roundtrip',
        'The latest isolated production verification restored all 454 manifest files, without touching the live repo, and removed its disposable sandbox',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910026083',EVIDENCE_ROOT+'actions/runs/45915470464']),
      item('restored_sha256_integrity',
        'All 454 restored files passed SHA-256 comparison; all 49 critical source files were present',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910026083',EVIDENCE_ROOT+'actions/runs/45915470464']),
      item('secret_and_symlink_exclusions',
        'Repo symlinks are not followed and environment/private key paths are excluded from published backup collection',VERIFIED,
        [EVIDENCE_ROOT+'pull/220',EVIDENCE_ROOT+'actions/runs/45909939222']),
      item('safe_manifest_and_target_guard_live',
        'Actual backup roundtrip on main validates all sources and independently guards malicious manifest, symlink, destination-directory overwrite and modified file bytes before recovery writes',VERIFIED,
        [EVIDENCE_ROOT+'pull/233',EVIDENCE_ROOT+'actions/runs/45915470464']),
      item('actual_disaster_recovery',
        'A real controlled disaster-recovery scenario and cross-service return to service are independently verified'),
      item('private_key_recovery_handover',
        'Authorized operator verifies protected key custody, restore prerequisites and revocation procedure without exposing keys'),
      item('backup_operations_signoff',
        'Owner and responsible operators validate backup rotation, retention and production restoration playbook')
    ]),
    blockers:[
      'A successful disposable isolated restore is not proof of a real production disaster recovery or full external-service restoration',
      'Secret/key custody and a runbook for personnel-authorized live restore still need operator verification',
      'Formal CEO final acceptance has not been recorded'
    ]},
  {id:'OFFLINE_VERIFICATION',name:'Offline System Verification — safe regression suite',
    workflow:'system-tests.yml',
    gates:fullGateList({
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45910987965',EVIDENCE_ROOT+'actions/runs/45918478489']
    }),
    capabilities:Object.freeze([
      item('real_ci_syntax_and_regressions',
        'Production CI passed JavaScript/shell syntax and 873 isolated regression and integration tests in the latest full Core verification',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910987965',EVIDENCE_ROOT+'actions/runs/45918478489',EVIDENCE_ROOT+'actions/runs/45918478537']),
      item('real_ci_closeout_report',
        'Actual CI generated the open-system acceptance summary for all 46 registered workflows',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910987965',EVIDENCE_ROOT+'actions/runs/45918478489',EVIDENCE_ROOT+'pull/222']),
      item('independent_functional_coverage',
        'Each registered producer and manual verifier has separately audited functional and recovery coverage'),
      item('production_vs_offline_handover',
        'Operators verify that safe CI coverage never substitutes for real integration and final CEO acceptance')
    ]),
    blockers:[
      'Passing an offline suite does not prove real Driver, HR, Event or Discord operations',
      'Individual regression scope and operator handover are not fully accepted',
      'Final CEO acceptance has not been recorded'
    ]},
  {id:'GIT_STATE_HARDENING',name:'Git State Hardening Verification — safe state writes',
    workflow:'git-state-hardening-verification.yml',
    gates:fullGateList({
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45910026256',EVIDENCE_ROOT+'actions/runs/45918478552']
    }),
    capabilities:Object.freeze([
      item('isolated_conflict_matrix',
        'Actual GitHub verification passed the isolated Git/state race matrix and reported 9 of 9 safe-push capabilities',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910026256',EVIDENCE_ROOT+'actions/runs/45918478552']),
      item('repository_policy_audit',
        'Actual verification completed the repository Git-state policy audit and hardening report',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910026256',EVIDENCE_ROOT+'actions/runs/45918478552']),
      item('real_protected_writer_recovery',
        'Safe operator-guided reconciliation after a real conflicting protected production write is independently accepted'),
      item('operational_security_handover',
        'Operators validate actual protected pushes, recovery procedures, permissions and CEO signoff')
    ]),
    blockers:[
      'Isolated state-race success does not demonstrate all live concurrent production writer recovery paths',
      'Recovery handover and full cross-system write conflict evidence remain open',
      'Final CEO acceptance has not been recorded'
    ]},
  {id:'SYSTEM_MONITORING',name:'System Monitoring — technical incident detection and Discord report',
    workflow:'system-monitoring.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_46_workflow_monitor',
        'Actual production monitoring evaluated source freshness and recorded four still-unresolved critical map/freshness findings',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910473380']),
      item('live_monitor_discord_update',
        'Actual production run updated its existing Discord system-monitor message and completed technical health verification',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910473380']),
      item('real_discord_permissions',
        'Live Discord permission audit completed 13 of 13 approved technical permission checks',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45910473380']),
      item('discord_get_readback_and_recovery',
        'Stored monitor message content independently read back from Discord after a real alert and a later resolution'),
      item('full_real_alert_lifecycle',
        'Operators confirm alert, dedupe, acknowledge, recovery and escalation under a real transient failure')
    ]),
    blockers:[
      'A production Discord update log does not independently establish content GET readback or successful later resolution',
      'Full real alert-to-recovery lifecycle and operator handover still require proof',
      'Four external map/freshness critical Core findings remain open; CEO final acceptance is not recorded'
    ]},
  {id:'CONVOY_CHECKER',name:'Convoy Checker — live Center and advisory overview',
    workflow:'convoy-checker.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_center_source_pipeline',
        'Real Convoy Center production run fetched and finalized current sources and generated complete source reports',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45909598171']),
      item('real_calendar_and_discord_overview',
        'Same-run read-only Event Calendar accepted source-claim projection and existing Convoy Overview message was updated in Discord',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45909598171']),
      item('real_reapproval_and_source_conflicts',
        'Actual modified Event, conflicting original record and omitted fields reach authorized Event Staff without automatic approval'),
      item('concurrent_baseline_recovery',
        'Earlier concurrent completeness-state Git conflict is reconciled and the saved baseline independently checked'),
      item('convoy_team_handover',
        'Event Coordinators validate full notification, change, error and recovery lifecycle')
    ]),
    blockers:[
      'Real source pipeline and existing Discord overview ran, but no original Event approval or new conflict resolution is verified',
      'An observed concurrent completeness baseline Git conflict was handled as a warning; recovery requires independent review',
      'Operator and CEO final signoff are missing'
    ]},
  {id:'CONVOY_ANNOUNCEMENT_VERIFICATION',name:'Convoy Announcement Verification — public post audit',
    workflow:'convoy-announcement-verifier.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_historical_post_readback',
        'Production proof collector verified a historical actual public Convoy announcement message',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911305606']),
      item('real_empty_window_verification',
        'Latest run checked current source and reported no due in-window entries without manufacturing a new post',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911305606']),
      item('new_announcement_lifecycle',
        'A new eligible current Convoy announcement passes original source, publication and independent Discord readback'),
      item('missing_duplicates_retry',
        'Missing, stale, duplicate and retry announcement cases are accepted in real operations')
    ]),
    blockers:[
      'Historical publication proof is not a newly due announcement',
      'The latest source query had zero due in-window entries, so new-post and retry delivery are unproven',
      'Team handover and CEO final approval are missing'
    ]},
  {id:'STAFF_LEADERSHIP_LIVE_OVERVIEW',name:'Staff Leadership Live Overview — current hierarchy display',
    workflow:'staff-leadership-live-overview.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_current_role_overview_update',
        'Production run updated the existing Staff hierarchy message from current role data while retaining message identity',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45908590431']),
      item('real_safe_state_persistence',
        'The same Staff overview run committed its message state through a successful protected safe push',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45908590431']),
      item('actual_role_transition',
        'A real authorized Staff promotion or departure is reconciled through role source, display and independent Discord readback'),
      item('hierarchy_privacy_recovery',
        'Staff leadership validates ordering, data privacy, failure recovery and operator handover')
    ]),
    blockers:[
      'Successful hierarchy polling does not by itself prove a real promotion or departure lifecycle',
      'Independent Discord readback after a new role change and team signoff remain open',
      'CEO final approval is not recorded'
    ]},
  {id:'LEADERSHIP_DASHBOARD',name:'Leadership Dashboard — consolidated live Discord views',
    workflow:'leadership-dashboard.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_consolidated_dashboard_update',
        'Actual production updated the existing consolidated Leadership messages without creating extra replacements',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45909541123']),
      item('real_encrypted_event_review_readback',
        'Actual protected Event Staff review field matched current encrypted source after a live dashboard update and Discord GET readback',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45909541123']),
      item('all_source_section_changes',
        'Fresh actual Driver, HR, Staff, Event and Management changes each reach the correct protected view'),
      item('all_dashboard_recovery',
        'All five role and privacy boundaries, failure replay, message ownership and operator handover fully accepted')
    ]),
    blockers:[
      'Current Event journal readback is proven; a newly authorized Staff command followed by an actual refresh remains unverified',
      'The full source-by-source Driver/HR/Staff/Management live update matrix has not been accepted',
      'CEO final approval is not recorded'
    ]},
  {id:'LEADERSHIP_DASHBOARD_VERIFICATION',name:'Leadership Dashboard Verification — direct read-only audit',
    workflow:'leadership-dashboard-verification.yml',
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_five_content_contract_audit',
        'Production read-only verification completed all five consolidated Leadership content contracts and mapped channels',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45909350372',EVIDENCE_ROOT+'actions/runs/45917281944']),
      item('real_event_driven_and_public_audit',
        'Actual Discord source/content audit verified current report, changelog and technical-alert publications and did not falsely count untriggered Staff/milestone events',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45909350372',EVIDENCE_ROOT+'actions/runs/45917281944']),
      item('historical_legacy_coverage',
        'Four historical no-longer-visible Legacy Leadership messages are resolved or explicitly retired with independently reviewed evidence'),
      item('future_cross_source_readback',
        'Every new actual protected dashboard change has correct Discord readback, retry, privacy and operator validation')
    ]),
    blockers:[
      'Four original historical Legacy Leadership messages were NOT_VISIBLE in the production audit',
      'One successful cross-channel read-only audit does not prove future real changes and recovery',
      'Full Team and CEO final approval are missing'
    ]},
  {id:'EVENT_LEADERSHIP_REPORTS',name:'Event Leadership Reports — reconciled advisory source and reporting',
    workflow:'event-leadership-reports.yml',
    gates:fullGateList({
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45911822884']
    }),
    capabilities:Object.freeze([
      item('real_all_event_sources_to_worklist',
        'Actual main workflow read Convoy/Calendar/History and private Invitation sources and reconciled all advisory warnings into the protected Staff worklist',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911909091']),
      item('real_invitation_forum_tag_source',
        'Actual private Forum source read reported READ_ONLY_SOURCE_VERIFIED and human-only tag mapping, without Event approval',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911909091']),
      item('real_daily_report_publication',
        'Genuine daily Event Leadership report reaches its authorized Discord target and is independently read back'),
      item('real_weekly_monthly_report_periods',
        'Whole real weekly and monthly report periods agree with original source decisions and exactly-once delivery'),
      item('event_team_reporting_handover',
        'Event Coordination verifies operating instructions, recovery, source completeness and CEO approval')
    ]),
    blockers:[
      'This read-only cross-source proof verifies current source claims, not real new human Staff decisions, 24-month archive completeness or actual invitations accepted',
      'Recurring daily, weekly and monthly report delivery with direct Discord readback is still not independently accepted',
      'Operator recovery and formal CEO final approval remain open'
    ]},
  {id:'VTC_MILESTONES',name:'VTC Milestones — genuine threshold detection',
    workflow:'milestones.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_member_threshold_poll',
        'Actual production fetched the current Kings VTC membership threshold and evaluated the next milestone',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911512791']),
      item('real_no_event_dedupe',
        'No new milestone was due; production correctly published no fabricated celebration and made no unnecessary state write',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911512791']),
      item('real_milestone_publication',
        'A genuinely reached new VTC milestone is posted once in the approved Discord channel and independently read back'),
      item('milestone_operator_recovery',
        'Source change, retry, dedupe and operator/CEO signoff are accepted')
    ]),
    blockers:[
      'The verified current run had no newly reached milestone, so new announcement delivery remains unproven',
      'Cross-system celebration/Changelog source agreement and retry remain open',
      'No CEO final acceptance is recorded'
    ]},
  {id:'TRUCKERSMP_NEWS',name:'TruckersMP News — current Kings source polling',
    workflow:'news.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_current_news_api_read',
        'Actual production fetched the TruckersMP Kings VTC News API and processed the current historical article feed',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911292610']),
      item('real_no_new_article_dedupe',
        'No new article was due and the producer sent zero messages rather than replaying earlier posts',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911292610']),
      item('real_new_article_delivery',
        'A genuinely new original article reaches the intended Discord message with independent content readback'),
      item('news_api_recovery',
        'Failures, altered/deleted articles, retry/idempotence, privacy and operator handover are accepted')
    ]),
    blockers:[
      'The latest successful API poll found no new post; new-message delivery is not proven by this run',
      'End-to-end recovery and independent original-article/Discord agreement remain open',
      'Final CEO signoff is not recorded'
    ]},
  {id:'CHANGELOG_EDITOR',name:'Changelog Editor — authorized release queue input',
    workflow:'add-changelog-entry.yml',
    gates:fullGateList({
      implementation:[EVIDENCE_ROOT+'pull/234'],
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45915696150'],
      security:[EVIDENCE_ROOT+'actions/runs/45915696150']
    }),
    capabilities:Object.freeze([
      item('isolated_manual_entry_dedupe',
        'Actual manual editor CLI in disposable sandbox saved a valid record, rejected duplicate input and did not print release content',VERIFIED,
        [EVIDENCE_ROOT+'pull/234',EVIDENCE_ROOT+'actions/runs/45915696150']),
      item('corrupt_queue_guard',
        'Existing malformed queue content is refused without rewriting or appending untrusted records',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45915696150']),
      item('genuine_authorized_entry',
        'New real approved human Changelog input is committed with correct source provenance'),
      item('real_editor_to_publisher',
        'One genuine queued release is safely passed to Publisher and independently read back from existing Discord destination'),
      item('operator_handover',
        'Owner verifies Git conflict/retry, privacy, permissions and final CEO signoff')
    ]),
    blockers:[
      'Synthetic editor CLI is not evidence of an authentic authorized human release entry',
      'Actual queue-to-Discord lifecycle, ambiguous delivery conflict recovery and operator handover remain unverified',
      'Explicit CEO final acceptance is not recorded'
    ]},
  {id:'CHANGELOG_PUBLISHER',name:'Changelog Publisher — queued changes',
    workflow:'changelog.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_empty_queue_safety',
        'Production Changelog publisher observed an empty queue and did not manufacture duplicate publications',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45911969613']),
      item('independent_existing_changelog_audit',
        'Independent real Discord source/content audit confirmed the existing latest Changelog publication against release history',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45909350372']),
      item('safe_archive_version_preflight',
        'Corrupt history, stale numbering, invalid queue and oversized changelog sections now stop without a Discord POST or queue clear in isolated CLI tests',VERIFIED,
        [EVIDENCE_ROOT+'pull/234',EVIDENCE_ROOT+'actions/runs/45915696150']),
      item('new_queue_delivery_lifecycle',
        'New authorized entry is validated, committed, posted and independently read back exactly once'),
      item('changelog_retry_recovery',
        'A failed Discord delivery is retried safely without losing or duplicating queued entries')
    ]),
    blockers:[
      'The newest producer run had no pending Changelog entry, so fresh queue-to-publication was not exercised',
      'Historic content audit and an empty queue do not close the next delivery/recovery lifecycle',
      'Team ownership and CEO final approval remain open'
    ]},
  {id:'CENTRAL_SCHEDULER',name:'Central Scheduler — approved overdue workflow recovery',
    workflow:'central-scheduler.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_registered_schedule_check',
        'Actual production checked approved enabled schedule workflows and their most recent successful runs',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45912098795']),
      item('real_overdue_safe_dispatch',
        'Actual scheduler dispatched overdue HR Leadership and Staff Management polling workflows as recovery, without claiming human decisions',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45912098795']),
      item('real_recovery_result_and_dedupe',
        'Every authorized recovery dispatch is traced to completed downstream results and repeat/overlap limits'),
      item('scheduler_failures_and_handover',
        'Recovery failure, escalation, authorization, retention and operator/CEO approval are accepted')
    ]),
    blockers:[
      'Recovery dispatch succeeded, but the end-to-end downstream HR/Staff action and any authentic decisions are separate',
      'Parallel recovery, lockout behavior and failure escalation still need independent real observation',
      'No final operator or CEO signoff'
    ]},
  {id:'SAFE_SELF_HEALING',name:'Safe Self-Healing — bounded technical recovery',
    workflow:'self-healing.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_fail_closed_external_escalation',
        'Production Self-Healing explicitly reported EXTERNAL-LIVE-DATA-BLOCKED and did not claim the external map API was repaired',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45908025405']),
      item('real_technical_state_and_monitor_check',
        'Actual run re-checked monitoring and backup health, safely persisted repair state and kept critical incidents visible',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45908025405']),
      item('real_permitted_fault_recovery',
        'A safe allowed internal failure is recovered with verified downstream result, limited retries and no forbidden writes'),
      item('healing_recurring_stress',
        'Repeated parallel faults, exclusions, escalation and recovery handover accepted')
    ]),
    blockers:[
      'The provider-dependent tracker recovery was explicitly blocked, not completed',
      'A real successful permitted internal recovery plus stress/race handling is not yet accepted',
      'Final Team and CEO signoff remain open'
    ]},
  {id:'DRIVER_PROBATION',name:'Driver Probation — HR-controlled reminder tracking',
    workflow:'probation.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_due_reminder_poll',
        'Actual scheduled protected probation check completed and found no reminders to send, without generating false Staff decisions',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45905153729']),
      item('real_no_change_persistence',
        'No probation reminders were due and no unnecessary protected state change was written',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45905153729']),
      item('real_due_reminder_delivery',
        'A genuinely due probation review reaches the authorized HR channel and saved reminder dedupe status'),
      item('real_human_probation_result',
        'Authentic authorized HR decision, correct preserved audit history, failure retry and operator handover confirmed')
    ]),
    blockers:[
      'Zero due reminders cannot prove actual reminder or HR-decision delivery',
      'No automatic disciplinary or membership decisions may be inferred or generated',
      'HR Team and CEO final acceptance remain open'
    ]},
  {id:'NEWS_PRODUCTION_VERIFICATION',name:'News Production Verification — original article readback',
    workflow:'news-production-verification.yml',
    gates:fullGateList({
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45906382475']
    }),
    capabilities:Object.freeze([
      item('real_prior_article_publication_proof',
        'Production verifier recognized a previously accepted genuine article publication evidence record for article 71252',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45906382475']),
      item('verified_news_dedupe_security_tests',
        'Actual run passed offline tests for first-run suppression, message checkpointing, invalid state and refusal to advance when Discord lacks delivery evidence',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45906382475']),
      item('next_article_independent_readback',
        'A newly published original article is independently matched to its current Discord message and state checkpoint'),
      item('news_fault_recovery_handover',
        'Real API outage, retry, duplicate prevention, stale-message recovery and operator/CEO review completed')
    ]),
    blockers:[
      'Previously accepted article evidence is not a newly generated article in the latest verification run',
      'Real source and Discord discrepancy/retry scenarios still require operational evidence',
      'Final team handover and CEO acceptance remain open'
    ]}
,
  {id:'CORE_BACKUP',name:'Core Backup — recurring protected source backup',
    workflow:'core-backup.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_historical_backup_package',
        'Real scheduled Core Backup produced a source package and uploaded the verified backup artifact, with healthy source and archive checks',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45817451307']),
      item('real_historical_archive_integrity',
        'That production run checked all 266 then-selected source files and their SHA-256 checksums, including six encrypted state fields',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45817451307']),
      item('post_guard_isolated_real_backup',
        'After defensive recovery rollout, a real main-branch job built and restored the current entire source archive in a disposable sandbox, validated checksums and removed the sandbox',VERIFIED,
        [EVIDENCE_ROOT+'pull/233',EVIDENCE_ROOT+'actions/runs/45915470464']),
      item('updated_current_441_plus_retention',
        'Repeated current production backups after source evolution, integrity, retention and storage alerting independently verified'),
      item('backup_real_disaster_and_handover',
        'Operator verifies complete authorized restore, secret/key custody and cross-service recovery')
    ]),
    blockers:[
      'The 266-file production archive is historical; the newer separately verified 441-file isolated restore does not independently prove current recurring backup retention',
      'Production disaster recovery and protected secret custody are still unaccepted',
      'CEO final signoff not recorded'
    ]},
  {id:'CORE_RECOVERY',name:'Core Recovery — protected manual emergency restore',
    workflow:'core-recovery.yml',
    gates:fullGateList({
      implementation:[EVIDENCE_ROOT+'pull/233'],
      offline_tests:[EVIDENCE_ROOT+'actions/runs/45915374413'],
      security:[EVIDENCE_ROOT+'actions/runs/45915470464']
    }),
    capabilities:Object.freeze([
      item('isolated_preview_and_apply',
        'The actual recovery CLI proved preview and confirmed APPLY inside disposable test directories; no real repository data were overwritten',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45915470464']),
      item('symlink_and_manifest_preflight',
        'Malformed manifests, source/target symlinks, parent collisions and occupied directories now fail before restore writes',VERIFIED,
        [EVIDENCE_ROOT+'pull/233',EVIDENCE_ROOT+'actions/runs/45915470464']),
      item('protected_recovery_workflow_contract',
        'Existing recovery workflow retains explicit main-branch confirmation and protected production environment; it now runs isolated guard tests before any restore',VERIFIED,
        [EVIDENCE_ROOT+'pull/233',EVIDENCE_ROOT+'actions/runs/45915374413']),
      item('authorized_real_disaster_restore',
        'Approved real Recovery Point APPLY is completed under protected operator authority and post-restore data checks'),
      item('cross_service_restart',
        'Operators independently verify service state, key custody, Discord outputs, required secrets and rollback after a real restore'),
      item('operator_owner_signoff',
        'Emergency handover and explicit CEO final release acceptance are recorded')
    ]),
    blockers:[
      'The successful APPLY proof ran exclusively on disposable synthetic directories; no genuine production recovery was performed',
      'Disaster/key custody, post-restore service readiness, recovery timing and operator approval remain unverified',
      'CEO final acceptance not recorded'
    ]},
  {id:'DRIVER_ONBOARDING',name:'Driver Registration & Onboarding — protected roster audit',
    workflow:'driver-register-onboarding.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_driver_only_register_audit',
        'Actual private Driver registration audit compared all then-current Kings Driver identities in the private register without editing roles',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45869866678']),
      item('real_safe_audit_publication',
        'The real read-only register audit published a protected summary, without creating approvals or register writes',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45869866678']),
      item('real_new_driver_registration_and_human_hr',
        'Authentic new Driver onboarding or returner has verified VTC/Discord source mapping and a recorded HR handover'),
      item('register_errors_and_operator_handover',
        'Missing identity, duplicates, private permission recovery, original HR decisions and CEO acceptance verified')
    ]),
    blockers:[
      'Existing Driver-only registration audit is not evidence of a genuinely new onboarding event',
      'The optional private HR decision source was NOT_CONFIGURED in that run; HR admission cannot be inferred',
      'Team handover and CEO final signoff not recorded'
    ]},
  {id:'DRIVER_ACHIEVEMENTS',name:'Driver Achievements — protected Loyalty role dry-run',
    workflow:'driver-achievements.yml',gates:fullGateList(),
    capabilities:Object.freeze([
      item('real_private_driver_source_dry_run',
        'Actual Driver Loyalty production dry-run validated the then-current private Driver roster/date records without applying a role change',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45881195938']),
      item('real_manual_live_write_guard',
        'Actual run explicitly selected dry-run and did not change any Discord roles; protected summary was safely persisted',VERIFIED,
        [EVIDENCE_ROOT+'actions/runs/45881195938']),
      item('achievement_award_lifecycle',
        'An actually eligible Driver meets validated achievement rules and any authorized one-time recognition is independently confirmed'),
      item('loyalty_live_authority',
        'Management explicitly approves each real role sync, rollback and conflict recovery, without reintroducing retired Driver Level roles')
    ]),
    blockers:[
      'A clean dry-run proves no roles were changed; it is not evidence of an achievement being newly earned or granted',
      'Live roles require explicit separate private approval, source validation and operator follow-up',
      'No CEO final signoff'
    ]},
  // Narrow per-workflow initial technical assessment: the cited isolated
  // regression is verified, but NONE of the 8 release gates nor real E2E
  // or owner approval has been satisfied by this fact.
  ...FIRST_REVIEWS.map(review=>({
    id:review.id,name:review.name,workflow:review.workflow,
    gates:fullGateList(),
    capabilities:Object.freeze([
      item('isolated_tested_contract',
        review.verified+' ('+review.testFile+')',
        VERIFIED,[EVIDENCE_ROOT+'actions/runs/45917194916']),
      item('real_source_to_destination_acceptance',review.pending),
      item('operator_and_ceo_release',
        'Human operator ownership, failure recovery, original evidence and explicit CEO approval confirmed')
    ]),
    blockers:[
      'Isolated tested subfunction is not a live original-source full workflow acceptance',
      review.pending,
      'Missing monitored real E2E, responsible Team handover and explicit CEO release'
    ]
  }))
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
