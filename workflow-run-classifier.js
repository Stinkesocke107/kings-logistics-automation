'use strict';

// Only these three protected producers execute the SAME real synchronization
// on a main code-push as on their schedule/manual trigger. Most Kings push
// workflows are CI or previews; never classify arbitrary push success as live
// production health. This list requires reviewing each workflow's job gates.
const FULL_PRODUCTION_PUSH_WORKFLOWS = new Set([
  'driver-management.yml',
  'hr-leadership.yml',
  'staff-management.yml'
]);

function isOperationalWorkflowRun(run, workflowFile) {
  if (!run || typeof run !== 'object') return false;
  if (run.event === 'schedule') return true;
  if (run.event === 'workflow_run') {
    // Trigger-guard skips never executed an actual production check.
    return !(run.status === 'completed' && run.conclusion === 'skipped');
  }
  if (run.event === 'workflow_dispatch') {
    // Convoy manual dry-runs are not a live Convoy health check.
    return workflowFile !== 'convoy-checker.yml' ||
      /\blive\b/i.test(run.display_title || '');
  }
  if (run.event === 'push') {
    return FULL_PRODUCTION_PUSH_WORKFLOWS.has(workflowFile);
  }
  return false;
}

module.exports = { isOperationalWorkflowRun, FULL_PRODUCTION_PUSH_WORKFLOWS };
