'use strict';
// Narrow individual FIRST technical reviews of the 18 previously unassessed
// Kings workflow jobs. Every VERIFIED item is a specific isolated tested
// contract, not a live publication, authentic personnel action or signoff.
// Source of technical regression evidence: PR #237 Node 24 CI #45917194916
// (864 tests passed, 0 failures). Never infer an entire workflow is complete.
const FIRST_REVIEWS=Object.freeze([
  {
    id:'API_RESILIENCE_VERIFICATION',name:'API Resilience Verification',
    workflow:'api-resilience-verification.yml',
    testFile:'tests/api-resilience.test.cjs',
    verified:'Independent offline API resilience failure matrix was exercised: local failures, fallback and bounded retry safety only',
    pending:'Confirm real API timeouts, circuit reopening and actual monitoring/recovery against original production calls'
  },
  {
    id:'CORE_BASELINE_VERIFICATION',name:'Core Baseline Verification',
    workflow:'core-baseline-verification.yml',
    testFile:'tests/operational-readiness.test.cjs',
    verified:'Offline readiness rules reject live unhealthy Core and tampered final status rather than promoting historical warnings',
    pending:'Repeat actual healthy Core baseline across original live maps, statistics, state and Discord after upstream recovery'
  },
  {
    id:'CORE_E2E_VERIFICATION',name:'Core End-to-End Verification',
    workflow:'core-e2e-verification.yml',
    testFile:'tests/core-systems.test.cjs',
    verified:'Isolated Core failure-path tests preserve unavailable tracker data instead of converting an unknown online count into zero',
    pending:'Prove full fresh original-source to saved state to actual Discord message chain on healthy Core services'
  },
  {
    id:'DRIVER_LEADERSHIP_REPORTS',name:'Driver Leadership Reports',
    workflow:'driver-leadership-reports.yml',
    testFile:'tests/driver-public-summary-privacy.test.cjs',
    verified:'Isolated private/public Driver leadership source separation preserves private identities while public summaries remain aggregate-only',
    pending:'Check genuine entire daily/monthly Driver Leadership source coverage, original joins and protected message delivery'
  },
  {
    id:'DRIVER_TMP_VTC_REVIEW',name:'Driver TMP/VTC Review',
    workflow:'driver-tmp-vtc-review.yml',
    testFile:'tests/driver-vtc-date-import.test.cjs',
    verified:'Isolated joining-date/membership matching rejects mismatched TruckersMP VTC source and duplicate profile links',
    pending:'Verify fresh original TruckersMP VTC join dates against private register with authorized manual correction review'
  },
  {
    id:'DRIVER_WEEKLY_SUMMARY',name:'Driver Weekly Summary',
    workflow:'driver-weekly-summary.yml',
    testFile:'tests/report-publication-journal-guard.test.cjs',
    verified:'Isolated weekly publication journal rejects corrupt history, duplicate weeks and unintended empty-state reset',
    pending:'Verify one authentic complete Driver week, original LOA/membership records and actual protected Discord delivery'
  },
  {
    id:'EVENT_OPERATIONS_MANUAL_REVIEW',name:'Event Operations Manual Review',
    workflow:'event-operations-manual-review.yml',
    testFile:'tests/event-operations-manual-review.test.cjs',
    verified:'Isolated manual Staff action guard rejects unapproved actors, unverified tasks and unsafe encrypted journal edits',
    pending:'Obtain authorized real Staff manual action and check protected saved Event state through actual leadership dashboard'
  },
  {
    id:'FINAL_FREEZE_VERIFICATION',name:'Final Freeze Verification',
    workflow:'final-freeze-verification.yml',
    testFile:'tests/operational-readiness.test.cjs',
    verified:'Isolated Final Freeze readiness gate rejects actual critical alerts, tampering and missing source health',
    pending:'Run true healthy final production freeze after all Core blockers resolved, then obtain explicit CEO approval'
  },
  {
    id:'HR_LEADERSHIP_REPORTS',name:'HR Leadership Reports',
    workflow:'hr-leadership-reports.yml',
    testFile:'tests/hr-driver-decision-audit.test.cjs',
    verified:'Isolated protected HR source audit refuses unauthorized decision authors and does not infer automatic HR approvals',
    pending:'Check genuine HR decisions, reviews and report completeness against private original sources and delivered message'
  },
  {
    id:'HR_WEEKLY_SUMMARY',name:'HR Weekly Summary',
    workflow:'hr-weekly-summary.yml',
    testFile:'tests/report-publication-journal-guard.test.cjs',
    verified:'Isolated HR weekly publication journal rejects corrupt or duplicate weeks before repeat publication',
    pending:'Check authentic full HR calendar week and privacy-safe original decision/Discord report read-back'
  },
  {
    id:'LEGACY_CONVOY_IMPORT',name:'Legacy Convoy Import',
    workflow:'legacy-convoy-import.yml',
    testFile:'tests/legacy-convoy-privacy.test.cjs',
    verified:'Isolated Legacy archive encrypted roundtrip, repeated import and redacted public projection are verified',
    pending:'Compare every authentic historical source Event and original approval without deleting holds or inventing free capacity'
  },
  {
    id:'MANAGEMENT_MONTHLY_REPORT',name:'Management Monthly Report',
    workflow:'management-monthly-report.yml',
    testFile:'tests/management-monthly-encrypted-event-source.test.cjs',
    verified:'Isolated Management Monthly reads and validates AES-encrypted Event monthly records, rejecting absent or inconsistent source data',
    pending:'Check full original Driver/HR/Staff/Event month consistency, genuine source completeness and actual Management delivery'
  },
  {
    id:'MANAGEMENT_WEEKLY_OVERVIEW',name:'Management Weekly Overview',
    workflow:'management-weekly-overview.yml',
    testFile:'tests/report-publication-journal-guard.test.cjs',
    verified:'Isolated Management weekly journal refuses invalid/double period keys instead of silently resetting the published history',
    pending:'Verify one full real Management week agrees with Driver, HR, Staff and Event original sources and Discord message'
  },
  {
    id:'MONTHLY_REPORT_VERIFICATION',name:'Monthly Report Verification',
    workflow:'monthly-report-verification.yml',
    testFile:'tests/core-systems.test.cjs',
    verified:'Offline monthly verifier distinguishes pre-publication window from the real publishing deadline',
    pending:'Close real missing statistics dates and recheck the original published month against source and actual Discord post'
  },
  {
    id:'MONTHLY_REPORT',name:'Monthly Report',
    workflow:'monthly-report.yml',
    testFile:'tests/report-publication-journal-guard.test.cjs',
    verified:'Isolated monthly publisher journal refuses corrupt existing history and duplicate month records before publication',
    pending:'Publish/reconcile only an authentic complete month and prove original source-to-message delivery without duplicates'
  },
  {
    id:'SELF_HEALING_STRESS_VERIFICATION',name:'Self-Healing Stress Verification',
    workflow:'self-healing-stress-verification.yml',
    testFile:'tests/self-healing.test.cjs',
    verified:'Isolated self-healing tests enforce technical allowlist, cooldown, retry budget and personnel action exclusion',
    pending:'Validate simultaneous real failure classes, escalation, cooldown and recovery without unauthorised production writes'
  },
  {
    id:'STAFF_LEADERSHIP_REPORTS',name:'Staff Leadership Reports',
    workflow:'staff-leadership-reports.yml',
    testFile:'tests/report-publication-journal-guard.test.cjs',
    verified:'Isolated Staff Leadership daily/weekly/monthly journal detects invalid period keys, duplicate history and corrupt data',
    pending:'Check real Staff structure, role changes and private daily/weekly/monthly message read-back independently'
  },
  {
    id:'WEEKLY_REPORTS_VERIFICATION',name:'Weekly Reports Verification',
    workflow:'weekly-reports-verification.yml',
    testFile:'tests/report-publication-journal-guard.test.cjs',
    verified:'Isolated weekly verifier does not turn damaged Driver/HR/Management publication journals into missing initial state',
    pending:'Independently compare authentic complete Driver/HR/Management weeks with original data and actual Discord posts'
  }
].map(x=>Object.freeze(x)));
module.exports={FIRST_REVIEWS};
