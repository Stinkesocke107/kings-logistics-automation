const fs = require('fs');
const path = require('path');

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_BASE_DELAY_MS = 750;
const MAX_DELAY_MS = 15000;

const HEALTH_FILE = path.join(__dirname, 'data', 'api-health.json');
const circuitState = new Map();

function nowISO() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampDelay(ms) {
  return Math.max(0, Math.min(MAX_DELAY_MS, Number(ms) || 0));
}

function parseRetryAfter(value) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return clampDelay(seconds * 1000);
  }

  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return clampDelay(timestamp - Date.now());
  }

  return null;
}

function retryDelay(attempt, retryAfter, baseDelayMs = DEFAULT_BASE_DELAY_MS) {
  if (retryAfter !== null && retryAfter !== undefined) {
    return clampDelay(retryAfter);
  }

  const exponential = baseDelayMs * (2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(100, baseDelayMs));
  return clampDelay(exponential + jitter);
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function safeReadJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function getHealthState() {
  return safeReadJson(HEALTH_FILE, {
    version: 1,
    updatedAt: null,
    services: {}
  });
}

function writeHealth(label, patch) {
  const current = getHealthState();

  current.version = 1;
  current.updatedAt = nowISO();
  current.services = current.services || {};
  current.services[label] = {
    ...(current.services[label] || {}),
    ...patch,
    updatedAt: nowISO()
  };

  fs.mkdirSync(path.dirname(HEALTH_FILE), { recursive: true });
  fs.writeFileSync(HEALTH_FILE, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

function getCircuit(label) {
  if (!circuitState.has(label)) {
    circuitState.set(label, {
      failures: 0,
      openUntil: 0
    });
  }

  return circuitState.get(label);
}

function recordSuccess(label) {
  const circuit = getCircuit(label);
  circuit.failures = 0;
  circuit.openUntil = 0;

  const previous = getHealthState().services?.[label];

  // Do not rewrite api-health.json on every successful scheduled request.
  // Persist the first healthy state and every recovery from degraded/down.
  if (
    previous?.status === 'healthy' &&
    Number(previous?.consecutiveFailures || 0) === 0 &&
    !previous?.lastError
  ) {
    return;
  }

  writeHealth(label, {
    status: 'healthy',
    consecutiveFailures: 0,
    lastSuccessAt: nowISO(),
    lastError: null,
    circuitOpenUntil: null
  });
}

function recordFailure(label, error, threshold = 5, cooldownMs = 60000) {
  const circuit = getCircuit(label);
  circuit.failures += 1;

  if (circuit.failures >= threshold) {
    circuit.openUntil = Date.now() + cooldownMs;
  }

  writeHealth(label, {
    status: circuit.openUntil > Date.now() ? 'down' : 'degraded',
    consecutiveFailures: circuit.failures,
    lastFailureAt: nowISO(),
    lastError: String(error?.message || error || 'Unknown API error').slice(0, 500),
    circuitOpenUntil: circuit.openUntil
      ? new Date(circuit.openUntil).toISOString()
      : null
  });
}

function assertCircuitClosed(label) {
  const circuit = getCircuit(label);

  if (circuit.openUntil > Date.now()) {
    const error = new Error(
      `${label}: circuit breaker is open until ${new Date(circuit.openUntil).toISOString()}`
    );
    error.code = 'CIRCUIT_OPEN';
    throw error;
  }

  if (circuit.openUntil && circuit.openUntil <= Date.now()) {
    circuit.openUntil = 0;
  }
}

async function resilientFetch(url, options = {}) {
  const {
    label = 'external-api',
    retries = DEFAULT_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    circuitFailureThreshold = 5,
    circuitCooldownMs = 60000,
    fetchOptions = {},
    validateResponse = null
  } = options;

  assertCircuitClosed(label);

  let lastError = null;
  const totalAttempts = Math.max(1, Number(retries) + 1);

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const error = new Error(`${label}: HTTP ${response.status}`);
        error.status = response.status;
        error.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

        if (!isRetryableStatus(response.status) || attempt >= totalAttempts) {
          throw error;
        }

        const delay = retryDelay(attempt, error.retryAfterMs, baseDelayMs);
        console.warn(
          `${label}: HTTP ${response.status}; retry ${attempt}/${totalAttempts - 1} in ${delay}ms.`
        );
        await sleep(delay);
        continue;
      }

      if (typeof validateResponse === 'function') {
        await validateResponse(response);
      }

      recordSuccess(label);
      return response;
    } catch (error) {
      lastError = error;

      const status = Number(error?.status);
      const retryable =
        error?.name === 'AbortError' ||
        error?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' ||
        (Number.isFinite(status) && isRetryableStatus(status));

      if (!retryable || attempt >= totalAttempts) {
        break;
      }

      const delay = retryDelay(attempt, error?.retryAfterMs, baseDelayMs);
      console.warn(
        `${label}: ${error?.name === 'AbortError' ? 'timeout' : error.message}; ` +
        `retry ${attempt}/${totalAttempts - 1} in ${delay}ms.`
      );
      await sleep(delay);
    }
  }

  recordFailure(
    label,
    lastError,
    circuitFailureThreshold,
    circuitCooldownMs
  );

  throw lastError || new Error(`${label}: request failed.`);
}

async function resilientFetchJson(url, options = {}) {
  const response = await resilientFetch(url, options);

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error(`${options.label || 'external-api'}: invalid JSON response.`);
    recordFailure(options.label || 'external-api', error);
    throw error;
  }

  if (typeof options.validateJson === 'function') {
    const valid = await options.validateJson(data);
    if (valid === false) {
      const error = new Error(`${options.label || 'external-api'}: JSON validation failed.`);
      recordFailure(options.label || 'external-api', error);
      throw error;
    }
  }

  return data;
}

module.exports = {
  parseRetryAfter,
  retryDelay,
  isRetryableStatus,
  resilientFetch,
  resilientFetchJson
};
