const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kings-api-resilience-'));
process.env.KINGS_API_HEALTH_DIR = path.join(tempDir, 'api-health');
process.env.KINGS_API_HEALTH_NAMESPACE = 'point-13-test';

const {
  healthFile,
  parseRetryAfter,
  isRetryableStatus,
  resilientFetch,
  resilientFetchJson
} = require('../api-resilience');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readHealth(label) {
  return JSON.parse(fs.readFileSync(healthFile(label), 'utf8'));
}

function writeJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function writeText(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain', ...headers });
  res.end(body);
}

test('Kings API resilience failure matrix', async () => {
  const counts = new Map();
  let circuitHealthy = false;

  const hit = (key) => {
    const next = (counts.get(key) || 0) + 1;
    counts.set(key, next);
    return next;
  };

  const server = http.createServer((req, res) => {
    const key = req.url;
    const n = hit(key);

    if (key === '/ok') return writeJson(res, 200, { ok: true });

    if (key === '/discord-429') {
      if (n <= 2) return writeJson(res, 429, { retry: true }, { 'retry-after': '0' });
      return writeJson(res, 200, { ok: true, provider: 'discord' });
    }

    if (key === '/post-429') {
      if (n === 1) return writeJson(res, 429, { retry: true }, { 'retry-after': '0' });
      return writeJson(res, 200, { ok: true, created: true });
    }

    if (key === '/post-503') {
      return writeJson(res, 503, { error: 'ambiguous-post-failure' });
    }

    if (key === '/truckersmp-500') {
      if (n <= 2) return writeJson(res, 503, { error: 'temporary' });
      return writeJson(res, 200, { ok: true, provider: 'truckersmp' });
    }

    if (key === '/not-found') return writeJson(res, 404, { error: 'missing' });

    if (key === '/timeout') {
      if (n === 1) {
        setTimeout(() => {
          if (!res.destroyed && !res.writableEnded) writeJson(res, 200, { ok: true });
        }, 120);
        return;
      }
      return writeJson(res, 200, { ok: true });
    }

    if (key === '/bad-json') {
      if (n === 1) return writeText(res, 200, '{broken json');
      return writeJson(res, 200, { ok: true });
    }

    if (key === '/bad-schema') {
      if (n === 1) return writeJson(res, 200, { wrong: true });
      return writeJson(res, 200, { ok: true });
    }

    if (key === '/reset') {
      if (n === 1) {
        req.socket.destroy();
        return;
      }
      return writeJson(res, 200, { ok: true });
    }

    if (key === '/circuit') {
      if (!circuitHealthy) return writeJson(res, 503, { error: 'down' });
      return writeJson(res, 200, { ok: true, recovered: true });
    }

    return writeJson(res, 500, { error: 'unknown route' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const results = [];

  try {
    const ok = await resilientFetchJson(`${base}/ok`, {
      label: 'Baseline API', retries: 0, timeoutMs: 500, baseDelayMs: 1,
      validateJson: (data) => data?.ok === true
    });
    assert.equal(ok.ok, true);
    assert.equal(readHealth('Baseline API').status, 'healthy');
    results.push({ scenario: '200 success', passed: true, attempts: counts.get('/ok') });

    const discord = await resilientFetchJson(`${base}/discord-429`, {
      label: 'Discord API mock', retries: 3, timeoutMs: 500, baseDelayMs: 1,
      validateJson: (data) => data?.ok === true
    });
    assert.equal(discord.provider, 'discord');
    assert.equal(counts.get('/discord-429'), 3);
    assert.equal(readHealth('Discord API mock').status, 'healthy');
    results.push({ scenario: '429 Retry-After then recovery', passed: true, attempts: 3 });

    const safePost429 = await resilientFetchJson(`${base}/post-429`, {
      label: 'Discord POST 429 mock', retries: 3, timeoutMs: 500, baseDelayMs: 1,
      fetchOptions: { method: 'POST', body: '{}' },
      validateJson: (data) => data?.created === true
    });
    assert.equal(safePost429.created, true);
    assert.equal(counts.get('/post-429'), 2);
    results.push({ scenario: 'POST retries explicit 429 safely', passed: true, attempts: 2 });

    await assert.rejects(
      resilientFetchJson(`${base}/post-503`, {
        label: 'Ambiguous POST 5xx mock', retries: 3, timeoutMs: 500, baseDelayMs: 1,
        fetchOptions: { method: 'POST', body: '{}' }
      }),
      /HTTP 503/
    );
    assert.equal(counts.get('/post-503'), 1);
    results.push({ scenario: 'POST 5xx fails once to prevent duplicate creation', passed: true, attempts: 1 });

    const tmp = await resilientFetchJson(`${base}/truckersmp-500`, {
      label: 'TruckersMP API mock', retries: 3, timeoutMs: 500, baseDelayMs: 1,
      validateJson: (data) => data?.ok === true
    });
    assert.equal(tmp.provider, 'truckersmp');
    assert.equal(counts.get('/truckersmp-500'), 3);
    results.push({ scenario: '5xx retry then recovery', passed: true, attempts: 3 });

    await assert.rejects(
      resilientFetchJson(`${base}/not-found`, {
        label: '404 mock', retries: 3, timeoutMs: 500, baseDelayMs: 1
      }),
      /HTTP 404/
    );
    assert.equal(counts.get('/not-found'), 1);
    assert.equal(readHealth('404 mock').status, 'degraded');
    results.push({ scenario: '404 fail-fast without retry storm', passed: true, attempts: 1 });

    const timeoutRecovered = await resilientFetchJson(`${base}/timeout`, {
      label: 'Timeout mock', retries: 2, timeoutMs: 25, baseDelayMs: 1,
      validateJson: (data) => data?.ok === true
    });
    assert.equal(timeoutRecovered.ok, true);
    assert.equal(counts.get('/timeout'), 2);
    results.push({ scenario: 'timeout retry then recovery', passed: true, attempts: 2 });

    const jsonRecovered = await resilientFetchJson(`${base}/bad-json`, {
      label: 'Malformed JSON mock', retries: 2, timeoutMs: 500, baseDelayMs: 1,
      validateJson: (data) => data?.ok === true
    });
    assert.equal(jsonRecovered.ok, true);
    assert.equal(counts.get('/bad-json'), 2);
    results.push({ scenario: 'malformed JSON retry then recovery', passed: true, attempts: 2 });

    const schemaRecovered = await resilientFetchJson(`${base}/bad-schema`, {
      label: 'Schema mock', retries: 2, timeoutMs: 500, baseDelayMs: 1,
      validateJson: (data) => data?.ok === true
    });
    assert.equal(schemaRecovered.ok, true);
    assert.equal(counts.get('/bad-schema'), 2);
    results.push({ scenario: 'invalid schema retry then recovery', passed: true, attempts: 2 });

    const resetRecovered = await resilientFetchJson(`${base}/reset`, {
      label: 'Connection reset mock', retries: 2, timeoutMs: 500, baseDelayMs: 1,
      validateJson: (data) => data?.ok === true
    });
    assert.equal(resetRecovered.ok, true);
    assert.equal(counts.get('/reset'), 2);
    results.push({ scenario: 'connection reset/cause.code recovery', passed: true, attempts: 2 });

    for (let i = 0; i < 2; i += 1) {
      await assert.rejects(
        resilientFetch(`${base}/circuit`, {
          label: 'Circuit mock', retries: 0, timeoutMs: 500, baseDelayMs: 1,
          circuitFailureThreshold: 2, circuitCooldownMs: 80
        }),
        /HTTP 503/
      );
    }

    const requestsBeforeOpenCheck = counts.get('/circuit');
    await assert.rejects(
      resilientFetch(`${base}/circuit`, {
        label: 'Circuit mock', retries: 0, timeoutMs: 500, baseDelayMs: 1,
        circuitFailureThreshold: 2, circuitCooldownMs: 80
      }),
      (error) => error?.code === 'CIRCUIT_OPEN'
    );
    assert.equal(counts.get('/circuit'), requestsBeforeOpenCheck);
    assert.equal(readHealth('Circuit mock').status, 'down');

    await sleep(110);
    circuitHealthy = true;
    const circuitResponse = await resilientFetchJson(`${base}/circuit`, {
      label: 'Circuit mock', retries: 0, timeoutMs: 500, baseDelayMs: 1,
      circuitFailureThreshold: 2, circuitCooldownMs: 80,
      validateJson: (data) => data?.ok === true
    });
    assert.equal(circuitResponse.recovered, true);
    const circuitHealth = readHealth('Circuit mock');
    assert.equal(circuitHealth.status, 'healthy');
    assert.equal(circuitHealth.consecutiveFailures, 0);
    assert.ok(circuitHealth.recoveredAt);
    results.push({ scenario: 'circuit open, blocks traffic, cooldown recovery', passed: true });

    assert.equal(isRetryableStatus(408), true);
    assert.equal(isRetryableStatus(425), true);
    assert.equal(isRetryableStatus(429), true);
    assert.equal(isRetryableStatus(503), true);
    assert.equal(isRetryableStatus(404), false);
    assert.equal(parseRetryAfter('0'), 0);
    results.push({ scenario: 'status classification and Retry-After parsing', passed: true });

    const outputDir = path.join(process.cwd(), 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'api-resilience-verification.json'),
      `${JSON.stringify({
        version: 2,
        checkedAt: new Date().toISOString(),
        mode: 'controlled-local-failure-injection',
        externalTraffic: false,
        scenarios: results,
        passed: results.length,
        failed: 0,
        healthy: true
      }, null, 2)}\n`,
      'utf8'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
