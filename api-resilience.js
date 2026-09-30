const fs = require('fs');
const path = require('path');

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_BASE_DELAY_MS = 750;
const MAX_DELAY_MS = 15000;

const HEALTH_DIR = process.env.KINGS_API_HEALTH_DIR
  ? path.resolve(process.env.KINGS_API_HEALTH_DIR)
  : path.join(__dirname, 'data', 'api-health');
const HEALTH_NAMESPACE = String(process.env.KINGS_API_HEALTH_NAMESPACE || '').trim();
const circuitState = new Map();

const RETRYABLE_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'API_INVALID_RESPONSE'
]);

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

function errorCode(error) {
  return String(
    error?.code ||
    error?.cause?.code ||
    error?.cause?.cause?.code ||
    ''
  ).trim();
}

function isRetryableError(error) {
  const status = Number(error?.status);
  if (Number.isFinite(status) && isRetryableStatus(status)) return true;

  if (
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError'
  ) {
    return true;
  }

  return RETRYABLE_ERROR_CODES.has(errorCode(error));
}

function safeReadJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeLabel(value) {
  const normalized = String(value || 'external-api')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return normalized || 'external-api';
}

function safeLabel(label) {
  const service = normalizeLabel(label);
  if (!HEALTH_NAMESPACE) return service;
  return `${normalizeLabel(HEALTH_NAMESPACE)}--${service}`.slice(0, 180);
}

function healthFile(label) {
  return path.join(HEALTH_DIR, `${safeLabel(label)}.json`);
}

function readHealth(label) {
  return safeReadJson(healthFile(label), null);
}

function writeHealth(label, patch) {
  const file = healthFile(label);
  const previous = readHealth(label) || {};
  const value = {
    version: 1,
    namespace: HEALTH_NAMESPACE || null,
    service: String(label || 'external-api'),
    healthKey: safeLabel(label),
    ...previous,
    ...patch,
    updatedAt: nowISO()
  };

  fs.mkdirSync(HEALTH_DIR, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function getCircuit(label) {
  const key = safeLabel(label);

  if (!circuitState.has(key)) {
    const previous = readHealth(label);
    const openUntil = previous?.circuitOpenUntil
      ? new Date(previous.circuitOpenUntil).getTime()
      : 0;

    circuitState.set(key, {
      failures: Number(previous?.consecutiveFailures || 0),
      openUntil: Number.isFinite(openUntil) ? openUntil : 0
    });
  }

  return circuitState.get(key);
}

function recordSuccess(label) {
  const circuit = getCircuit(label);
  circuit.failures = 0;
  circuit.openUntil = 0;

  const previous = readHealth(label);

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
    recoveredAt: previous && previous.status !== 'healthy' ? nowISO() : null,
    lastError: null,
    circuitOpenUntil: null
  });
}

function recordFailure(label, error, threshold = 5, cooldownMs = 60000) {
  const circuit = getCircuit(label);
  const previous = readHealth(label);
  const persistedFailures = Number(previous?.consecutiveFailures || 0);

  circuit.failures = Math.max(circuit.failures + 1, persistedFailures + 1);

  if (circuit.failures >= threshold) {
    circuit.openUntil = Date.now() + cooldownMs;
  }

  writeHealth(label, {
    status: circuit.openUntil > Date.now() ? 'down' : 'degraded',
    consecutiveFailures: circuit.failures,
    lastFailureAt: nowISO(),
    lastError: String(error?.message || error || 'Unknown API error').slice(0, 500),
    lastErrorCode: errorCode(error) || null,
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
    validateResponse = null,
    deferSuccess = false
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

        lastError = error;
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

      if (!deferSuccess) recordSuccess(label);
      return response;
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt >= totalAttempts) {
        break;
      }

      const delay = retryDelay(attempt, error?.retryAfterMs, baseDelayMs);
      const code = errorCode(error);
      const reason =
        error?.name === 'AbortError' || error?.name === 'TimeoutError'
          ? 'timeout'
          : code
            ? `${error.message} (${code})`
            : error.message;

      console.warn(
        `${label}: ${reason}; retry ${attempt}/${totalAttempts - 1} in ${delay}ms.`
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
  const label = options.label || 'external-api';
  const validateJson = options.validateJson;
  const validateResponse = options.validateResponse;
  let parsedData;

  await resilientFetch(url, {
    ...options,
    deferSuccess: true,
    validateResponse: async (response) => {
      if (typeof validateResponse === 'function') {
        await validateResponse(response);
      }

      try {
        parsedData = await response.clone().json();
      } catch (cause) {
        const error = new Error(`${label}: invalid JSON response.`);
        error.code = 'API_INVALID_RESPONSE';
        error.cause = cause;
        throw error;
      }

      if (typeof validateJson === 'function') {
        let valid;
        try {
          valid = await validateJson(parsedData);
        } catch (cause) {
          const error = new Error(`${label}: JSON validation failed.`);
          error.code = 'API_INVALID_RESPONSE';
          error.cause = cause;
          throw error;
        }

        if (valid === false) {
          const error = new Error(`${label}: JSON validation failed.`);
          error.code = 'API_INVALID_RESPONSE';
          throw error;
        }
      }
    }
  });

  recordSuccess(label);
  return parsedData;
}

module.exports = {
  HEALTH_DIR,
  HEALTH_NAMESPACE,
  RETRYABLE_ERROR_CODES,
  healthFile,
  parseRetryAfter,
  retryDelay,
  isRetryableStatus,
  isRetryableError,
  resilientFetch,
  resilientFetchJson
};
