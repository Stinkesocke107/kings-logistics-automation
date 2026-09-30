const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const helper = path.resolve(__dirname, '../scripts/git-safe-push.sh');

function run(cwd, program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_SAFE_PUSH_BASE_DELAY_SECONDS: '0',
      ...options.env
    }
  });

  if (options.expectSuccess !== false) {
    assert.equal(result.status, 0, `${program} ${args.join(' ')}\n${result.stdout}${result.stderr}`);
  }

  return result;
}

function configure(cwd) {
  run(cwd, 'git', ['config', 'user.email', 'kings-test@invalid']);
  run(cwd, 'git', ['config', 'user.name', 'Kings Git Hardening Test']);
}

function write(cwd, file, value) {
  const full = path.join(cwd, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, value, 'utf8');
}

function commit(cwd, file, value, message = 'state update') {
  write(cwd, file, value);
  run(cwd, 'git', ['add', '--', file]);
  run(cwd, 'git', ['commit', '-m', message]);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kings-git-hardening-'));
  run(root, 'git', ['init', '--bare', '--initial-branch=main', 'remote.git']);
  run(root, 'git', ['clone', 'remote.git', 'seed']);
  const seed = path.join(root, 'seed');
  configure(seed);
  write(seed, 'data/base.json', '{"version":1}\n');
  run(seed, 'git', ['add', '.']);
  run(seed, 'git', ['commit', '-m', 'base']);
  run(seed, 'git', ['push', 'origin', 'main']);

  const clones = {};
  for (const name of ['a', 'b', 'c']) {
    run(root, 'git', ['clone', 'remote.git', name]);
    clones[name] = path.join(root, name);
    configure(clones[name]);
  }

  return { root, ...clones };
}

function safePush(cwd, extraEnv = {}) {
  return run(cwd, 'bash', [helper, 'main'], { env: extraEnv });
}

function remoteFile(cwd, file) {
  return run(cwd, 'git', ['show', `origin/main:${file}`]).stdout;
}

function localHead(cwd) {
  return run(cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim();
}

function writeReport(scenarios) {
  const outputDir = path.resolve(__dirname, '../output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'git-state-hardening-verification.json'),
    `${JSON.stringify({
      version: 1,
      checkedAt: new Date().toISOString(),
      point: 14,
      mode: 'isolated-local-git-race-injection',
      externalRepositoryWrites: false,
      scenarios,
      passed: scenarios.length,
      failed: 0,
      healthy: true
    }, null, 2)}\n`,
    'utf8'
  );
}

test('Kings Git/state conflict hardening matrix', () => {
  const scenarios = [];
  const cleanups = [];

  try {
    {
      const f = fixture(); cleanups.push(f.root);
      commit(f.a, 'data/one.json', '{"one":1}\n');
      commit(f.b, 'data/two.json', '{"two":2}\n');
      safePush(f.a);
      safePush(f.b);
      assert.equal(remoteFile(f.b, 'data/one.json'), '{"one":1}\n');
      assert.equal(remoteFile(f.b, 'data/two.json'), '{"two":2}\n');
      scenarios.push({ scenario: 'independent concurrent state commits survive rebase', passed: true });
    }

    {
      const f = fixture(); cleanups.push(f.root);
      commit(f.a, 'data/base.json', '{"owner":"remote"}\n');
      commit(f.b, 'data/base.json', '{"owner":"local"}\n');
      const localBefore = localHead(f.b);
      safePush(f.a);
      const failed = run(f.b, 'bash', [helper, 'main'], { expectSuccess: false });
      assert.notEqual(failed.status, 0);
      assert.match(failed.stdout + failed.stderr, /Rebase conflict detected/);
      assert.equal(localHead(f.b), localBefore);
      assert.equal(remoteFile(f.b, 'data/base.json'), '{"owner":"remote"}\n');
      assert.equal(fs.readFileSync(path.join(f.b, 'data/base.json'), 'utf8'), '{"owner":"local"}\n');
      assert.equal(fs.existsSync(path.join(f.b, '.git/rebase-merge')), false);
      assert.equal(fs.existsSync(path.join(f.b, '.git/rebase-apply')), false);
      scenarios.push({ scenario: 'same-file conflict aborts without overwriting either side', passed: true });
    }

    {
      const f = fixture(); cleanups.push(f.root);
      commit(f.b, 'data/workflow-b.json', '{"workflow":"b"}\n');
      commit(f.c, 'data/racer.json', '{"workflow":"racer"}\n');

      const hook = path.join(f.b, '.git/hooks/pre-push');
      const flag = path.join(f.root, 'race-fired');
      fs.writeFileSync(
        hook,
        `#!/usr/bin/env bash\nset -e\nif [ ! -f ${JSON.stringify(flag)} ]; then\n  touch ${JSON.stringify(flag)}\n  git -C ${JSON.stringify(f.c)} push origin main\nfi\n`,
        { mode: 0o755 }
      );

      const result = safePush(f.b, { GIT_SAFE_PUSH_ATTEMPTS: '4' });
      assert.match(result.stdout + result.stderr, /Remote changed during push/);
      run(f.b, 'git', ['fetch', 'origin', 'main']);
      assert.equal(remoteFile(f.b, 'data/workflow-b.json'), '{"workflow":"b"}\n');
      assert.equal(remoteFile(f.b, 'data/racer.json'), '{"workflow":"racer"}\n');
      scenarios.push({ scenario: 'remote advances between rebase and push; retry preserves both commits', passed: true });
    }

    {
      const f = fixture(); cleanups.push(f.root);
      write(f.a, 'data/base.json', '{"dirty":true}\n');
      let failed = run(f.a, 'bash', [helper, 'main'], { expectSuccess: false });
      assert.notEqual(failed.status, 0);
      assert.match(failed.stdout + failed.stderr, /tracked state changes/);
      run(f.a, 'git', ['restore', '--', 'data/base.json']);

      write(f.a, 'data/base.json', '{"staged":true}\n');
      run(f.a, 'git', ['add', '--', 'data/base.json']);
      failed = run(f.a, 'bash', [helper, 'main'], { expectSuccess: false });
      assert.notEqual(failed.status, 0);
      assert.match(failed.stdout + failed.stderr, /tracked state changes/);
      run(f.a, 'git', ['restore', '--staged', '--worktree', '--', 'data/base.json']);

      write(f.a, 'data/new-untracked-state.json', '{"new":true}\n');
      failed = run(f.a, 'bash', [helper, 'main'], { expectSuccess: false });
      assert.notEqual(failed.status, 0);
      assert.match(failed.stdout + failed.stderr, /untracked files under data/);
      scenarios.push({ scenario: 'dirty, staged and forgotten untracked data state are blocked', passed: true });
    }

    {
      const f = fixture(); cleanups.push(f.root);
      commit(f.a, 'data/invalid.json', '{broken json\n');
      const before = localHead(f.a);
      const failed = run(f.a, 'bash', [helper, 'main'], { expectSuccess: false });
      assert.notEqual(failed.status, 0);
      assert.match(failed.stdout + failed.stderr, /invalid JSON/);
      assert.equal(localHead(f.a), before);
      run(f.a, 'git', ['fetch', 'origin', 'main']);
      const missing = run(f.a, 'git', ['cat-file', '-e', 'origin/main:data/invalid.json'], { expectSuccess: false });
      assert.notEqual(missing.status, 0);
      scenarios.push({ scenario: 'invalid rebased JSON state is blocked before remote push', passed: true });
    }

    {
      const f = fixture(); cleanups.push(f.root);
      commit(f.a, 'data/live-tracker-snapshot.json', '{"online":4}\n');
      write(f.a, 'data/api-health/live.json', '{"status":"healthy"}\n');
      run(f.a, 'git', ['add', '--', 'data/api-health/live.json']);
      run(f.a, 'git', ['commit', '--amend', '--no-edit']);

      commit(f.b, 'data/system-alerts-state.json', '{"active":{}}\n');
      write(f.b, 'data/api-health/monitoring.json', '{"status":"healthy"}\n');
      run(f.b, 'git', ['add', '--', 'data/api-health/monitoring.json']);
      run(f.b, 'git', ['commit', '--amend', '--no-edit']);

      safePush(f.a);
      safePush(f.b);
      run(f.b, 'git', ['fetch', 'origin', 'main']);
      assert.equal(remoteFile(f.b, 'data/live-tracker-snapshot.json'), '{"online":4}\n');
      assert.equal(remoteFile(f.b, 'data/api-health/live.json'), '{"status":"healthy"}\n');
      assert.equal(remoteFile(f.b, 'data/system-alerts-state.json'), '{"active":{}}\n');
      assert.equal(remoteFile(f.b, 'data/api-health/monitoring.json'), '{"status":"healthy"}\n');
      scenarios.push({ scenario: 'parallel state plus API-health bundles are preserved together', passed: true });
    }

    {
      const f = fixture(); cleanups.push(f.root);
      commit(f.a, 'data/statistics.json', '{"generation":"newer"}\n');
      commit(f.b, 'data/statistics.json', '{"generation":"stale"}\n');
      safePush(f.a);
      const failed = run(f.b, 'bash', [helper, 'main'], { expectSuccess: false });
      assert.notEqual(failed.status, 0);
      run(f.b, 'git', ['fetch', 'origin', 'main']);
      assert.equal(remoteFile(f.b, 'data/statistics.json'), '{"generation":"newer"}\n');
      assert.equal(fs.readFileSync(path.join(f.b, 'data/statistics.json'), 'utf8'), '{"generation":"stale"}\n');
      scenarios.push({ scenario: 'stale same-state writer cannot overwrite newer remote state', passed: true });
    }

    {
      const f = fixture(); cleanups.push(f.root);
      commit(f.a, 'data/retry-budget.json', '{"attempt":1}\n');
      const hook = path.join(f.a, '.git/hooks/pre-push');
      fs.writeFileSync(hook, '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });
      const before = localHead(f.a);
      const failed = run(f.a, 'bash', [helper, 'main'], {
        expectSuccess: false,
        env: { GIT_SAFE_PUSH_ATTEMPTS: '3' }
      });
      assert.notEqual(failed.status, 0);
      assert.match(failed.stdout + failed.stderr, /Safe push failed after 3 attempts/);
      assert.equal((failed.stdout.match(/Safe push attempt/g) || []).length, 3);
      assert.equal(localHead(f.a), before);
      scenarios.push({ scenario: 'bounded retry exhaustion fails safely and preserves local commit', passed: true });
    }

    writeReport(scenarios);
    assert.equal(scenarios.length, 8);
  } finally {
    for (const root of cleanups) fs.rmSync(root, { recursive: true, force: true });
  }
});
