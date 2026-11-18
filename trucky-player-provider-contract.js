'use strict';

// Candidate Trucky player-status contract. Intentionally NOT wired into
// tracker.js or any production workflow until API registration and real
// response verification. Pure validation; no HTTP, Discord or file writes.
const MAX_BATCH_SIZE = 500;
const ALLOWED_GAMES = new Set(['ETS2', 'ATS']);

function toTruckersMpId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid TruckersMP player ID.');
    return String(value);
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) {
    throw new Error('Invalid TruckersMP player ID.');
  }
  if (!Number.isSafeInteger(Number(value))) throw new Error('Invalid TruckersMP player ID.');
  return value;
}

function validateRequestedRoster(rawIds) {
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > MAX_BATCH_SIZE) {
    throw new Error('Trucky candidate requires a nonempty bounded roster.');
  }
  const ids = rawIds.map(toTruckersMpId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate TruckersMP IDs in requested roster.');
  return ids;
}

function parseFreshObservationTime(value, nowMs, maxAgeMs) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Online observation has no trustworthy timestamp.');
  }
  // Trucky API versions have used Unix seconds; allow milliseconds too.
  const ms = value >= 1000000000000 ? value : value * 1000;
  if (!Number.isSafeInteger(ms) || ms > nowMs + 30000 || ms < nowMs - maxAgeMs) {
    throw new Error('Online observation is stale or from the future.');
  }
  return new Date(ms).toISOString();
}

function validateTruckyCandidateResponse(payload, rawRequestedIds, options = {}) {
  const requested = validateRequestedRoster(rawRequestedIds);
  const nowMs = options.now instanceof Date ? options.now.getTime() : Date.now();
  const maxAgeMs = options.maxAgeMs === undefined ? 120000 : options.maxAgeMs;
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(maxAgeMs) ||
      maxAgeMs < 1000 || maxAgeMs > 300000) {
    throw new Error('Invalid freshness policy.');
  }

  // Documentation for /v2/map/onlineList is not yet sufficiently precise.
  // Accept only an explicit, verified per-player array. An online-only list,
  // an ambiguous object or an error response cannot establish who is offline.
  if (!payload || typeof payload !== 'object' || payload.error ||
      !payload.response || !Array.isArray(payload.response.players)) {
    throw new Error('Trucky candidate response has no verified players array.');
  }
  const rows = payload.response.players;
  if (rows.length !== requested.length) {
    throw new Error('Trucky candidate response has incomplete roster coverage.');
  }
  const requestedSet = new Set(requested);
  const seen = new Set();
  const online = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Invalid Trucky candidate player row.');
    }
    const id = toTruckersMpId(row.mp_id);
    if (!requestedSet.has(id) || seen.has(id)) {
      throw new Error('Unexpected or duplicate Trucky candidate player ID.');
    }
    seen.add(id);
    if (typeof row.online !== 'boolean') {
      throw new Error('Trucky candidate player online state must be explicit.');
    }
    if (!row.online) continue;

    const meta = row.serverDetails;
    const game = String(meta?.game || '').toUpperCase();
    const server = typeof meta?.name === 'string' ? meta.name.trim() : '';
    if (!ALLOWED_GAMES.has(game) || !server || server.length > 100 ||
        /[\r\n<>@]/.test(server)) {
      throw new Error('Online player server/game details are missing or unsafe.');
    }
    const rawTimestamp = row.time ?? row.t;
    const observedAt = parseFreshObservationTime(rawTimestamp, nowMs, maxAgeMs);
    online.push({tmpId:Number(id),game,server,observedAt});
  }

  if (seen.size !== requestedSet.size) {
    throw new Error('Trucky candidate response did not cover every requested player.');
  }
  const ets2Online = online.filter(p => p.game === 'ETS2').length;
  const atsOnline = online.filter(p => p.game === 'ATS').length;
  return {
    source:'trucky-candidate',
    // A validated complete roster is a requirement; this flag must never
    // be computed from a subset, an empty response or missing offline users.
    complete:true,
    requested:requested.length,
    covered:seen.size,
    online,
    onlineCount:online.length,
    ets2Online,
    atsOnline
  };
}

module.exports = {
  validateRequestedRoster,
  parseFreshObservationTime,
  validateTruckyCandidateResponse
};
