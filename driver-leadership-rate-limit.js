const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'data', 'driver-leadership-rate-limit.json');
const MIN_INTERVAL_MS = 5 * 60 * 60 * 1000;
const MAX_UPDATES_PER_DAY = 2;
const DAY_TIME_ZONE = 'Europe/Berlin';
const MARKER = 'Kings Driver Leadership Overview';
const WRITE_MODE = String(process.env.DRIVER_LEADERSHIP_WRITE_MODE || 'final').trim().toLowerCase();

const originalFetch = globalThis.fetch;
let suppressedReason = null;

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function berlinDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeState(raw, now = new Date()) {
  const today = berlinDayKey(now);
  const state = raw && typeof raw === 'object' ? { ...raw } : {};

  if (state.day !== today) {
    state.day = today;
    state.updatesToday = 0;
  }

  return {
    version: 1,
    timeZone: DAY_TIME_ZONE,
    day: state.day,
    updatesToday: Number.isFinite(Number(state.updatesToday)) ? Number(state.updatesToday) : 0,
    lastUpdateAt: state.lastUpdateAt || null,
    updatedAt: state.updatedAt || null
  };
}

function requestUrl(input) {
  try {
    if (typeof input === 'string' || input instanceof URL) return new URL(String(input));
    if (input?.url) return new URL(String(input.url));
  } catch {
    return null;
  }
  return null;
}

function requestMethod(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

function bodyContent(init) {
  if (typeof init?.body !== 'string') return '';
  try {
    const parsed = JSON.parse(init.body);
    return String(parsed?.content || '');
  } catch {
    return '';
  }
}

function isLeadershipWrite(input, init) {
  const url = requestUrl(input);
  if (!url) return false;
  if (!['discord.com', 'www.discord.com'].includes(url.hostname.toLowerCase())) return false;

  const method = requestMethod(input, init);
  if (!['POST', 'PATCH'].includes(method)) return false;
  if (!/^\/api\/v10\/channels\/\d+\/messages(?:\/\d+)?$/.test(url.pathname)) return false;

  return bodyContent(init).includes(MARKER);
}

function eligibility(now = new Date()) {
  const state = normalizeState(readState(), now);
  const last = state.lastUpdateAt ? new Date(state.lastUpdateAt).getTime() : NaN;
  const ageMs = Number.isFinite(last) ? now.getTime() - last : Infinity;

  if (state.updatesToday >= MAX_UPDATES_PER_DAY) {
    return { allowed: false, reason: `daily cap reached (${MAX_UPDATES_PER_DAY}/${MAX_UPDATES_PER_DAY})`, state };
  }

  if (ageMs < MIN_INTERVAL_MS) {
    const remainingMinutes = Math.ceil((MIN_INTERVAL_MS - ageMs) / 60000);
    return { allowed: false, reason: `5-hour cooldown active (${remainingMinutes} min remaining)`, state };
  }

  return { allowed: true, reason: null, state };
}

function syntheticSuccess() {
  return new Response(JSON.stringify({ id: 'kings-leadership-rate-limit-skip' }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

if (typeof originalFetch !== 'function') {
  throw new Error('Driver Leadership rate limit requires Node.js global fetch.');
}

globalThis.fetch = async function kingsLeadershipRateLimitedFetch(input, init = undefined) {
  if (!isLeadershipWrite(input, init)) {
    return originalFetch(input, init);
  }

  if (WRITE_MODE === 'suppress') {
    suppressedReason = 'base Driver Management write suppressed; final LOA stage owns Leadership Overview delivery';
    console.log(`Driver Leadership overview skipped: ${suppressedReason}.`);
    return syntheticSuccess();
  }

  if (WRITE_MODE === 'passthrough') {
    return originalFetch(input, init);
  }

  const now = new Date();
  const gate = eligibility(now);

  if (!gate.allowed) {
    suppressedReason = gate.reason;
    console.log(`Driver Leadership overview skipped: ${gate.reason}.`);
    return syntheticSuccess();
  }

  const response = await originalFetch(input, init);

  if (response?.ok) {
    const next = normalizeState(gate.state, now);
    next.updatesToday += 1;
    next.lastUpdateAt = now.toISOString();
    next.updatedAt = now.toISOString();
    writeState(next);
    console.log(`Driver Leadership overview delivery recorded: ${next.updatesToday}/${MAX_UPDATES_PER_DAY} today; next allowed after 5 hours.`);
  }

  return response;
};

const originalLog = console.log.bind(console);
console.log = (...args) => {
  const text = args.map((value) => String(value)).join(' ');
  if (suppressedReason && /Driver Leadership overview (?:updated|created)/i.test(text)) {
    originalLog(`Driver Leadership overview not sent: ${suppressedReason}.`);
    suppressedReason = null;
    return;
  }
  originalLog(...args);
};

module.exports = {
  MIN_INTERVAL_MS,
  MAX_UPDATES_PER_DAY,
  DAY_TIME_ZONE,
  WRITE_MODE,
  berlinDayKey,
  normalizeState,
  eligibility,
  isLeadershipWrite
};
