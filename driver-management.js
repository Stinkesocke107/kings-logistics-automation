const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KINGS_VTC_ID = 64284;
const RETENTION_DAYS = 730;
const MEMBERS_URL = `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/members`;
const SERVERS_URL = 'https://api.truckersmp.com/v2/servers';

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const STATE_FILE = path.join(__dirname, 'data', 'driver-management.json');
const SUMMARY_FILE = path.join(__dirname, 'data', 'driver-management-summary.json');

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update('kings-driver-management-v1\0')
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function encryptState(state) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(state), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptState(container) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') return null;

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(container.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Kings Logistics Driver Management/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}

async function getCurrentMembers() {
  const data = await fetchJson(MEMBERS_URL, 'TruckersMP VTC members');
  const members = data?.response?.members;
  if (!Array.isArray(members)) throw new Error('Invalid TruckersMP VTC members response.');

  return members
    .map((member) => ({
      tmpId: Number(member.user_id),
      vtcMemberId: Number(member.id),
      username: String(member.username || '').trim(),
      joinDate: member.joinDate ? new Date(member.joinDate).toISOString() : null
    }))
    .filter((member) => Number.isFinite(member.tmpId) && member.username);
}

async function getOnlineKingsDrivers() {
  const data = await fetchJson(SERVERS_URL, 'TruckersMP servers');
  const servers = Array.isArray(data?.response)
    ? data.response.filter((server) => server.online && Number.isFinite(Number(server.mapid)))
    : [];

  const online = new Map();

  for (const server of servers) {
    const mapId = Number(server.mapid);
    const url =
      'https://tracker.ets2map.com/v3/area' +
      `?x1=-1000000&y1=1000000&x2=1000000&y2=-1000000&server=${mapId}`;

    try {
      const players = await fetchJson(url, `${server.game} ${server.name}`);
      if (!players?.Success || !Array.isArray(players.Data)) continue;

      for (const player of players.Data) {
        if (Number(player.VtcId) !== KINGS_VTC_ID) continue;
        const tmpId = Number(player.MpId);
        if (!Number.isFinite(tmpId)) continue;

        online.set(tmpId, {
          game: String(server.game || ''),
          server: String(server.name || '')
        });
      }
    } catch (error) {
      console.warn(`Online lookup skipped for ${server.name}: ${error.message}`);
    }
  }

  return online;
}

function ageDays(value, now = Date.now()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((now - time) / 86400000);
}

function updateState(previous, currentMembers, onlineMap) {
  const now = nowISO();
  const previousDrivers = Array.isArray(previous?.drivers) ? previous.drivers : [];
  const byId = new Map(previousDrivers.map((driver) => [Number(driver.tmpId), { ...driver }]));
  const currentIds = new Set();

  for (const member of currentMembers) {
    currentIds.add(member.tmpId);
    let driver = byId.get(member.tmpId);

    if (!driver) {
      driver = {
        tmpId: member.tmpId,
        vtcMemberId: member.vtcMemberId,
        username: member.username,
        previousNames: [],
        joinDate: member.joinDate,
        firstObservedAt: now,
        lastRosterSeenAt: now,
        lastOnlineSeenAt: null,
        lastOnlineGame: null,
        lastOnlineServer: null,
        current: true,
        leftAt: null,
        lastRejoinedAt: null
      };
      byId.set(member.tmpId, driver);
    } else {
      if (driver.username && driver.username !== member.username) {
        driver.previousNames = Array.isArray(driver.previousNames) ? driver.previousNames : [];
        if (!driver.previousNames.includes(driver.username)) driver.previousNames.push(driver.username);
      }

      if (driver.current === false) driver.lastRejoinedAt = now;
      driver.username = member.username;
      driver.vtcMemberId = member.vtcMemberId;
      driver.joinDate = member.joinDate || driver.joinDate || null;
      driver.lastRosterSeenAt = now;
      driver.current = true;
      driver.leftAt = null;
    }

    const online = onlineMap.get(member.tmpId);
    if (online) {
      driver.lastOnlineSeenAt = now;
      driver.lastOnlineGame = online.game || null;
      driver.lastOnlineServer = online.server || null;
    }
  }

  for (const driver of byId.values()) {
    if (!currentIds.has(Number(driver.tmpId)) && driver.current !== false) {
      driver.current = false;
      driver.leftAt = now;
    }
  }

  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const drivers = [...byId.values()]
    .filter((driver) => driver.current || !driver.leftAt || new Date(driver.leftAt).getTime() >= cutoff)
    .sort((a, b) => Number(a.tmpId) - Number(b.tmpId));

  return {
    version: 1,
    initializedAt: previous?.initializedAt || now,
    updatedAt: now,
    drivers
  };
}

function buildSummary(state, onlineMap) {
  const now = Date.now();
  const current = state.drivers.filter((driver) => driver.current);
  const left = state.drivers.filter((driver) => !driver.current);

  const joinedWithin = (days) => current.filter((driver) => {
    const value = driver.joinDate || driver.firstObservedAt;
    const age = ageDays(value, now);
    return age !== null && age <= days;
  }).length;

  const leftWithin = (days) => left.filter((driver) => {
    const age = ageDays(driver.leftAt, now);
    return age !== null && age <= days;
  }).length;

  const knownActivity = current.filter((driver) => driver.lastOnlineSeenAt);
  const notSeenFor = (days) => knownActivity.filter((driver) => ageDays(driver.lastOnlineSeenAt, now) >= days).length;

  return {
    version: 1,
    updatedAt: state.updatedAt,
    currentDrivers: current.length,
    onlineNow: [...onlineMap.keys()].filter((tmpId) => current.some((driver) => driver.tmpId === tmpId)).length,
    joinedLast7Days: joinedWithin(7),
    joinedLast30Days: joinedWithin(30),
    leftLast7Days: leftWithin(7),
    leftLast30Days: leftWithin(30),
    driversWithKnownOnlineActivity: knownActivity.length,
    notSeenOnline7Days: notSeenFor(7),
    notSeenOnline14Days: notSeenFor(14),
    notSeenOnline30Days: notSeenFor(30),
    note: 'Individual driver management data is stored encrypted. Activity counters are informational only and do not trigger disciplinary actions.'
  };
}

async function main() {
  const existingContainer = readJson(STATE_FILE, null);
  let previous = null;

  if (existingContainer) {
    try {
      previous = decryptState(existingContainer);
    } catch (error) {
      throw new Error(`Could not decrypt Driver Management state: ${error.message}`);
    }
  }

  const [members, onlineMap] = await Promise.all([
    getCurrentMembers(),
    getOnlineKingsDrivers()
  ]);

  if (previous?.drivers?.length >= 20 && members.length < previous.drivers.filter((driver) => driver.current).length * 0.5) {
    throw new Error('Safety stop: TruckersMP member count dropped by more than 50%.');
  }

  const state = updateState(previous, members, onlineMap);
  const summary = buildSummary(state, onlineMap);

  writeJson(STATE_FILE, encryptState(state));
  writeJson(SUMMARY_FILE, summary);

  console.log('Kings Driver Management updated successfully.');
  console.log(`Current Drivers: ${summary.currentDrivers}`);
  console.log(`Online Now: ${summary.onlineNow}`);
  console.log(`Known Activity: ${summary.driversWithKnownOnlineActivity}`);
  console.log(`Not seen 7d / 14d / 30d: ${summary.notSeenOnline7Days} / ${summary.notSeenOnline14Days} / ${summary.notSeenOnline30Days}`);
}

main().catch((error) => {
  console.error('Kings Driver Management failed:', error.message);
  process.exit(1);
});
