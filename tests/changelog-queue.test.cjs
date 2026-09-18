const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Execute the real functions with in-memory files and a fake Discord transport.
// No real webhook, repository data, or network request is used.
const root = path.resolve(__dirname, '..');
const existing = { category: 'Kings Systems', text: 'Existing entry', source: 'manual-test' };
function sandbox(script, queue, failSend = false) {
  const files = new Map();
  if (queue !== undefined) files.set('changelog-queue.json', queue);
  files.set('changelog-state.json', JSON.stringify({ season: 'S01', nextNumber: 6 }));
  files.set('changelog-history.json', JSON.stringify({ changelogs: [] }));
  const sent = [];
  const fakeFs = {
    existsSync: p => files.has(path.basename(p)),
    readFileSync: p => files.get(path.basename(p)),
    mkdirSync: () => {},
    writeFileSync: (p, value) => files.set(path.basename(p), value)
  };
  const ctx = vm.createContext({
    require: name => name === 'fs' ? fakeFs : require(name),
    __dirname: root,
    console: { log() {}, error() {} },
    process: { env: { CHANGELOG_DISCORD_WEBHOOK_URL: 'https://invalid.test/webhook' } },
    fetch: async (url, options) => {
      sent.push(JSON.parse(options.body));
      return { ok: !failSend, status: 500, text: async () => 'simulated failure' };
    }
  });
  const source = fs.readFileSync(path.join(root, script), 'utf8');
  vm.runInContext(source.slice(0, source.lastIndexOf('start().catch')), ctx);
  return { files, sent, run: code => vm.runInContext(code, ctx) };
}

for (const [label, value] of [
  ['array', [existing]], ['legacy object', { entries: [existing] }]
]) {
  test(`publisher reads and archives ${label} without losing entries`, async () => {
    const s = sandbox('changelog.js', JSON.stringify(value));
    assert.equal(s.run('loadQueue().entries.length'), 1);
    await s.run('publishChangelog()');
    assert.equal(s.sent.length, 1);
    assert.match(s.sent[0].content, /Existing entry/);
    assert.deepEqual(JSON.parse(s.files.get('changelog-queue.json')), []);
    assert.deepEqual(JSON.parse(s.files.get('changelog-history.json')).changelogs[0].entries[0].text, existing.text);
    assert.equal(JSON.parse(s.files.get('changelog-state.json')).nextNumber, 7);
  });
  test(`milestone survives serialization and preserves ${label} entries`, () => {
    const s = sandbox('milestones.js', JSON.stringify(value));
    s.run('addMilestoneToChangelog(150)');
    s.run('addMilestoneToChangelog(150)');
    const queue = JSON.parse(s.files.get('changelog-queue.json'));
    assert.equal(queue.length, 2);
    assert.deepEqual(queue[0], existing);
    assert.equal(queue[1].source, 'milestone-150');
    const publisher = sandbox('changelog.js', JSON.stringify(queue));
    assert.equal(publisher.run('loadQueue().entries.length'), 2);
  });
}
test('failed Discord send keeps queue, history and numbering unchanged', async () => {
  const s = sandbox('changelog.js', JSON.stringify([existing]), true);
  const before = [...s.files];
  await assert.rejects(s.run('publishChangelog()'), /simulated failure/);
  assert.deepEqual([...s.files], before);
});
for (const value of ['{broken', 'null', '{"unexpected":true}']) {
  test(`invalid queue is rejected without overwriting: ${value}`, () => {
    for (const script of ['changelog.js', 'milestones.js']) {
      const s = sandbox(script, value);
      assert.throws(() => s.run(script === 'changelog.js' ? 'loadQueue()' : 'addMilestoneToChangelog(150)'));
      assert.equal(s.files.get('changelog-queue.json'), value);
      assert.equal(s.sent.length, 0);
    }
  });
}
test('empty or missing queue sends nothing; first milestone can be added', async () => {
  for (const value of [undefined, '[]', '{"entries":[]}']) {
    const s = sandbox('changelog.js', value);
    await s.run('publishChangelog()');
    assert.equal(s.sent.length, 0);
    const m = sandbox('milestones.js', value);
    m.run('addMilestoneToChangelog(150)');
    assert.equal(JSON.parse(m.files.get('changelog-queue.json')).length, 1);
  }
});
