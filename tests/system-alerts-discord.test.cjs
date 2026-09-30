const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'system-alerts.js');
const GUILD_ID = '1114967437788577792';
const ALERT_CHANNEL_ID = '1551676060645597255';

function response(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    async text() {
      if (payload === null || payload === undefined) return '';
      return typeof payload === 'string' ? payload : JSON.stringify(payload);
    }
  };
}

function loadProductionModule(fetchImpl) {
  const original = fs.readFileSync(SOURCE_FILE, 'utf8');
  const mainBlock = `\nmain().catch((error) => {\n  console.error('Kings System Alerts failed:', error.message);\n  process.exit(1);\n});\n`;
  assert.ok(original.includes(mainBlock), 'system-alerts.js main block changed; verification loader must be reviewed');

  const source = original.replace(
    mainBlock,
    `\nmodule.exports = { discord, resolveSystemAlertsChannel, postAlertBatch, postResolvedBatch };\n`
  );

  const moduleObject = { exports: {} };
  const localRequire = createRequire(SOURCE_FILE);
  const sandboxRequire = (request) => {
    if (request === './kings-branding') return { installDiscordBranding() {} };
    return localRequire(request);
  };

  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    require: sandboxRequire,
    __dirname: ROOT,
    __filename: SOURCE_FILE,
    console,
    process: {
      env: {
        ...process.env,
        DISCORD_BOT_TOKEN: 'verification-token',
        DISCORD_GUILD_ID: GUILD_ID,
        SYSTEM_ALERTS_CHANNEL_NAME: 'system-alerts'
      },
      exit() { throw new Error('process.exit must not run in isolated Discord verification'); }
    },
    fetch: fetchImpl,
    AbortSignal,
    setTimeout,
    clearTimeout,
    Buffer
  };

  vm.runInNewContext(source, sandbox, { filename: SOURCE_FILE });
  return { api: moduleObject.exports, sandbox };
}

function alertIssue() {
  return {
    id: 'verification-workflow-failed',
    severity: 'critical',
    system: 'GitHub Actions',
    message: 'Controlled verification failure detected.',
    details: { controlled: true }
  };
}

test('System Alerts posts critical and recovery messages only to the resolved technical channel', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    const method = String(options.method || 'GET').toUpperCase();
    requests.push({ pathname, method, body: options.body ? JSON.parse(options.body) : null });

    if (method === 'GET' && pathname === `/api/v10/guilds/${GUILD_ID}/channels`) {
      return response([{ id: ALERT_CHANNEL_ID, guild_id: GUILD_ID, name: '⚙️┃system-alerts', type: 0 }]);
    }
    if (method === 'POST' && pathname === `/api/v10/channels/${ALERT_CHANNEL_ID}/messages`) {
      return response({ id: `message-${requests.length}` });
    }
    throw new Error(`Unexpected mocked Discord request: ${method} ${pathname}`);
  };

  const { api } = loadProductionModule(fetchImpl);
  const channel = await api.resolveSystemAlertsChannel();
  assert.equal(channel.id, ALERT_CHANNEL_ID);

  await api.postAlertBatch(channel, [alertIssue()], false);
  await api.postResolvedBatch(
    channel,
    [{ ...alertIssue(), firstAlertedAt: '2026-09-30T20:00:00.000Z' }],
    { status: 'HEALTHY', summary: { criticalIssues: 0, warnings: 0 } }
  );

  const posts = requests.filter((item) => item.method === 'POST');
  assert.equal(posts.length, 2);
  assert.ok(posts.every((item) => item.pathname === `/api/v10/channels/${ALERT_CHANNEL_ID}/messages`));
  assert.deepEqual(posts[0].body.allowed_mentions, { parse: [] });
  assert.deepEqual(posts[1].body.allowed_mentions, { parse: [] });
  assert.match(posts[0].body.embeds[0].title, /Critical/);
  assert.match(posts[1].body.embeds[0].title, /Resolved/);
  assert.equal(posts[1].body.embeds[0].fields[0].value.includes('HEALTHY'), true);
});

test('Discord write safety guard blocks other channels and every non-POST mutation', async () => {
  const fetchImpl = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET' && pathname === `/api/v10/guilds/${GUILD_ID}/channels`) {
      return response([{ id: ALERT_CHANNEL_ID, guild_id: GUILD_ID, name: 'system-alerts', type: 0 }]);
    }
    throw new Error(`No network call expected for blocked write: ${method} ${pathname}`);
  };

  const { api } = loadProductionModule(fetchImpl);
  await api.resolveSystemAlertsChannel();

  await assert.rejects(
    api.discord('/channels/999999999999/messages', { method: 'POST', body: { content: 'blocked' } }),
    /Safety guard blocked Discord write/
  );
  await assert.rejects(
    api.discord(`/channels/${ALERT_CHANNEL_ID}/messages`, { method: 'PATCH', body: { content: 'blocked' } }),
    /Safety guard blocked Discord write/
  );
  await assert.rejects(
    api.discord(`/channels/${ALERT_CHANNEL_ID}/messages/123`, { method: 'DELETE' }),
    /Safety guard blocked Discord write/
  );
});

test('Discord failure propagates so alert state cannot be advanced as if delivery succeeded', async () => {
  const fetchImpl = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET' && pathname === `/api/v10/guilds/${GUILD_ID}/channels`) {
      return response([{ id: ALERT_CHANNEL_ID, guild_id: GUILD_ID, name: 'system-alerts', type: 0 }]);
    }
    if (method === 'POST' && pathname === `/api/v10/channels/${ALERT_CHANNEL_ID}/messages`) {
      return response({ message: 'controlled failure' }, false, 503);
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  };

  const { api } = loadProductionModule(fetchImpl);
  const channel = await api.resolveSystemAlertsChannel();
  await assert.rejects(
    api.postAlertBatch(channel, [alertIssue()], false),
    /Discord API 503/
  );
});

test('production main persists alert state only after alert, escalation and resolved Discord sends', () => {
  const source = fs.readFileSync(SOURCE_FILE, 'utf8');
  const mainStart = source.indexOf('async function main()');
  const mainEnd = source.indexOf("main().catch((error)", mainStart);
  assert.ok(mainStart >= 0 && mainEnd > mainStart);
  const main = source.slice(mainStart, mainEnd);

  const alertPost = main.indexOf('await postAlertBatch(channel, result.alerts, false);');
  const escalationPost = main.indexOf('await postAlertBatch(channel, result.escalations, true);');
  const resolvedPost = main.indexOf('await postResolvedBatch(channel, result.resolved, health);');
  const stateWrite = main.indexOf('writeJson(STATE_FILE, result.state);');

  assert.ok(alertPost >= 0);
  assert.ok(escalationPost > alertPost);
  assert.ok(resolvedPost > escalationPost);
  assert.ok(stateWrite > resolvedPost, 'state must be written only after every Discord delivery succeeds');
});
