const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');
const MATRIX_REPORT = path.join(ROOT, 'output', 'git-state-hardening-verification.json');
const FINAL_REPORT = path.join(ROOT, 'output', 'git-state-hardening-final-report.json');
const SAFE_PUSH_FILE = path.join(ROOT, 'scripts', 'git-safe-push.sh');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function main() {
  const issues = [];

  if (!fs.existsSync(MATRIX_REPORT)) {
    issues.push('Git/state conflict matrix report is missing.');
  }

  const matrix = fs.existsSync(MATRIX_REPORT)
    ? JSON.parse(read(MATRIX_REPORT))
    : null;

  if (matrix) {
    if (matrix.healthy !== true) issues.push('Git/state conflict matrix is not healthy.');
    if (Number(matrix.failed || 0) !== 0) issues.push(`Git/state matrix has ${matrix.failed} failed scenario(s).`);
    if (!Array.isArray(matrix.scenarios) || matrix.scenarios.length < 8) {
      issues.push(`Git/state matrix is incomplete: ${matrix.scenarios?.length || 0}/8 scenarios.`);
    }
    if (matrix.externalRepositoryWrites !== false) {
      issues.push('Git/state conflict injection was not isolated from the production repository.');
    }
  }

  if (!fs.existsSync(SAFE_PUSH_FILE)) {
    issues.push('scripts/git-safe-push.sh is missing.');
  }

  const safePush = fs.existsSync(SAFE_PUSH_FILE) ? read(SAFE_PUSH_FILE) : '';
  const helperCapabilities = {
    trackedDirtyGuard: safePush.includes('git diff --quiet') && safePush.includes('git diff --cached --quiet'),
    untrackedDataGuard: safePush.includes('git ls-files --others --exclude-standard -- data'),
    boundedRetry: safePush.includes('MAX_ATTEMPTS') && safePush.includes('Safe push failed after'),
    fetchBeforeRebase: safePush.includes('git fetch origin "$BRANCH"'),
    rebaseLatestRemote: safePush.includes('git rebase "origin/$BRANCH"'),
    abortOnConflict: safePush.includes('git rebase --abort'),
    jsonValidationAfterRebase: safePush.includes('validate_rebased_json'),
    explicitHeadPush: safePush.includes('git push origin "HEAD:$BRANCH"')
  };

  for (const [name, ok] of Object.entries(helperCapabilities)) {
    if (!ok) issues.push(`Safe-push capability missing: ${name}.`);
  }

  const workflowFiles = fs.existsSync(WORKFLOW_DIR)
    ? fs.readdirSync(WORKFLOW_DIR).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml')).sort()
    : [];

  const workflows = [];
  let commitWorkflows = 0;
  let protectedCommitWorkflows = 0;

  for (const name of workflowFiles) {
    const source = read(path.join(WORKFLOW_DIR, name));
    const hasCommit = /\bgit\s+commit\b/.test(source);
    const usesSafePush = /bash\s+scripts\/git-safe-push\.sh(?:\s+main)?/.test(source);
    const directPushes = [...source.matchAll(/\bgit\s+push\b/g)].length;
    const broadGitAdd = /(?:^|\n)\s*git\s+add\s+(?:-A\s+)?\.\s*(?:\n|$)/m.test(source);

    if (hasCommit) {
      commitWorkflows += 1;
      if (usesSafePush) protectedCommitWorkflows += 1;
      else issues.push(`State-writing workflow does not use safe push: ${name}.`);
    }

    if (directPushes > 0) {
      issues.push(`Workflow contains direct git push instead of safe helper: ${name}.`);
    }

    if (broadGitAdd) {
      issues.push(`Workflow stages the entire repository with broad git add: ${name}.`);
    }

    workflows.push({
      file: name,
      commits: hasCommit,
      usesSafePush,
      directPushes,
      broadGitAdd
    });
  }

  if (commitWorkflows === 0) issues.push('No state-writing workflows were detected; verifier assumptions may be wrong.');
  if (protectedCommitWorkflows !== commitWorkflows) {
    issues.push(`Only ${protectedCommitWorkflows}/${commitWorkflows} state-writing workflows use safe push.`);
  }

  const report = {
    version: 1,
    checkedAt: new Date().toISOString(),
    point: 14,
    mode: 'isolated-conflict-tests-plus-repository-policy-audit',
    conflictMatrix: matrix
      ? {
          scenarios: matrix.scenarios.length,
          passed: Number(matrix.passed || 0),
          failed: Number(matrix.failed || 0),
          externalRepositoryWrites: matrix.externalRepositoryWrites
        }
      : null,
    safePushCapabilities: helperCapabilities,
    workflowAudit: {
      totalWorkflowFiles: workflowFiles.length,
      stateWritingWorkflows: commitWorkflows,
      protectedStateWritingWorkflows: protectedCommitWorkflows,
      workflows
    },
    issues,
    healthy: issues.length === 0
  };

  fs.mkdirSync(path.dirname(FINAL_REPORT), { recursive: true });
  fs.writeFileSync(FINAL_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('Kings Git / State Conflict Hardening Verification');
  console.log(`Conflict scenarios: ${report.conflictMatrix?.passed || 0}/${report.conflictMatrix?.scenarios || 0}`);
  console.log(`Safe-push capabilities: ${Object.values(helperCapabilities).filter(Boolean).length}/${Object.keys(helperCapabilities).length}`);
  console.log(`State-writing workflows protected: ${protectedCommitWorkflows}/${commitWorkflows}`);
  console.log(`Workflow files audited: ${workflowFiles.length}`);
  console.log(`Issues: ${issues.length}`);
  for (const issue of issues) console.error(`- ${issue}`);

  if (issues.length > 0) process.exitCode = 1;
}

main();
