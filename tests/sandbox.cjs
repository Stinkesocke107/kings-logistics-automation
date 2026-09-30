const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

// Execute production code with in-memory state and a fail-closed network mock.
// Only module source and workflow definitions may be read from disk.
function sandbox(script, { files = {}, env = {}, fetch: transport } = {}) {
  const state = new Map(Object.entries(files));
  const calls = [];
  const key = p => path.relative(root, path.resolve(root, String(p)));
  const fakeFs = {
    existsSync: p => state.has(key(p)) || (!key(p).startsWith('data') && fs.existsSync(p)),
    readFileSync: p => {
      if (state.has(key(p))) return state.get(key(p));
      if (!key(p).startsWith('data')) return fs.readFileSync(p, 'utf8');
      throw new Error(`Missing fixture: ${key(p)}`);
    },
    writeFileSync: (p, value) => state.set(key(p), String(value)),
    appendFileSync: (p, value) => state.set(key(p), (state.get(key(p)) || '') + value),
    unlinkSync: p => state.delete(key(p)),
    mkdirSync() {},
    readdirSync: p => [...state.keys()].filter(k => path.dirname(k) === key(p)).map(k => path.basename(k))
  };
  const proc = { env: { DISCORD_BOT_TOKEN: 'test-only', DRIVER_STATE_KEY: 'x'.repeat(32), ...env }, exitCode: 0,
    exit(code) { throw new Error(`process.exit(${code})`); } };
  const ctx = vm.createContext({ __dirname: root, console: { log() {}, warn() {}, error() {} },
    process: proc, Buffer, URL, URLSearchParams, FormData, Blob, Response, Request, AbortController, AbortSignal,
    setTimeout, clearTimeout,
    fetch: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (!transport) throw new Error(`Unexpected network request: ${url}`);
      return transport(String(url), options);
    }
  });
  const cache = new Map();
  function isolatedRequire(name) {
    if (name === 'fs') return fakeFs;
    if (!name.startsWith('.')) return require(name);
    const filename = path.join(root, name.endsWith('.js') ? name : `${name}.js`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const fn = vm.runInContext(`(function(require,module,exports,__dirname){${fs.readFileSync(filename, 'utf8')}\n})`, ctx);
    fn(isolatedRequire, module, module.exports, root);
    return module.exports;
  }
  ctx.require = isolatedRequire;
  const source = fs.readFileSync(path.join(root, script), 'utf8');
  const markers = ['main().catch', 'start().catch', '\nmain();', '\ntry {\n  main();'];
  const end = Math.max(...markers.map(marker => source.lastIndexOf(marker)));
  if (end < 0) throw new Error(`No entrypoint marker: ${script}`);
  vm.runInContext(source.slice(0, end), ctx);
  return { files: state, calls, process: proc, run: code => vm.runInContext(code, ctx), context: ctx };
}
module.exports = { sandbox };
