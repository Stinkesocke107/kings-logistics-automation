const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const LEADERSHIP_CHANNEL_ID = process.env.DRIVER_LEADERSHIP_CHANNEL_ID || null;
const LEADERSHIP_CHANNEL_NAME = process.env.DRIVER_LEADERSHIP_CHANNEL_NAME || '🚛｜driver-leadership';

const MANAGEMENT_FILE = path.join(__dirname, 'data', 'driver-management.json');
const SUMMARY_FILE = path.join(__dirname, 'data', 'driver-management-summary.json');
const LOA_FILE = path.join(__dirname, 'data', 'driver-loa.json');

const INFO_DAYS = 7;
const ATTENTION_DAYS = 14;
const HR_REVIEW_DAYS = 30;
const NEW_DRIVER_GRACE_DAYS = 14;
const RETENTION_DAYS = 730;

const DISCORD_API = 'https://discord.com/api/v10';
const LEADERSHIP_MARKER = '👑 **Kings Driver Leadership Overview**';
const SEVERITY_LEVELS = new Set(['Info', 'Attention', 'HR Review']);

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}

if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function deriveKey(domain) {
  return crypto
    .createHash('sha256')
    .update(`${domain}\0`)
    .update(String(DRIVER_STATE_KEY))
    .digest();
}

function encrypt(value, domain, version) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(domain), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version,
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decrypt(container, domain) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error('Encrypted state is not in the expected format.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(domain),
    Buffer.from(container.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

function readManagementState() {
  const container = readJson(MANAGEMENT_FILE, null);
  if (!container) throw new Error('Driver Management state is missing.');
  return decrypt(container, 'kings-driver-management-v1');
}

function writeManagementState(state) {
  writeJson(MANAGEMENT_FILE, encrypt(state, 'kings-driver-management-v1', 2));
}

function readLoaState() {
  const container = readJson(LOA_FILE, null);
  if (!container) {
    const now = nowISO();
    return {
      version: 1,
      initializedAt: now,
      updatedAt: now,
      lastProcessedMessageId: null,
      leaves: []
    };
  }
  return decrypt(container, 'kings-driver-loa-v1');
}

function writeLoaState(state) {
  state.updatedAt = nowISO();
  writeJson(LOA_FILE, encrypt(state, 'kings-driver-loa-v1', 1));
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD: LOA management is advisory/data-only. The module may
  // read Discord and create/update messages only. It cannot alter members,
  // roles, kicks, bans, permissions, or any other personnel setting.
  if (method !== 'GET') {
    const allowedWrite = /^\/channels\/\d+\/messages(?:\/\d+)?$/.test(pathname) &&
      (method === 'POST' || method === 'PATCH');
    if (!allowedWrite) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Driver LOA/1.0'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${pathname}: ${text.slice(0, 500)}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeChannelName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-');
}

async function resolveLeadershipChannel() {
  if (LEADERSHIP_CHANNEL_ID) {
    const channel = await discord(`/channels/${LEADERSHIP_CHANNEL_ID}`);
    if (channel.guild_id && channel.guild_id !== DISCORD_GUILD_ID) {
      throw new Error(`Driver Leadership channel ${LEADERSHIP_CHANNEL_ID} is not in the configured guild.`);
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const wanted = normalizeChannelName(LEADERSHIP_CHANNEL_NAME);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));
  const exact = textChannels.find((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact) return exact;

  throw new Error(`Could not uniquely find Driver Leadership channel "${LEADERSHIP_CHANNEL_NAME}".`);
}

function snowflakeGreater(a, b) {
  try {
    return BigInt(a) > BigInt(b || '0');
  } catch {
    return false;
  }
}

function maxSnowflake(messages) {
  let max = null;
  for (const message of messages || []) {
    if (!max || snowflakeGreater(message.id, max)) max = message.id;
  }
  return max;
}

function escapeMarkdown(value = '') {
  return String(value).replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function profileUrl(tmpId) {
  return `https://truckersmp.com/user/${tmpId}`;
}

function dateStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateEnd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

function effectiveLeaveEnd(leave) {
  const planned = new Date(leave.endAt).getTime();
  const closed = leave.closedAt ? new Date(leave.closedAt).getTime() : null;
  if (!Number.isFinite(planned)) return null;
  if (Number.isFinite(closed)) return Math.min(planned, closed);
  return planned;
}

function leaveStatus(leave, now = Date.now()) {
  const start = new Date(leave.startAt).getTime();
  const end = effectiveLeaveEnd(leave);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
  if (leave.closedAt && end <= now) return 'ended';
  if (now < start) return 'scheduled';
  if (now <= end) return 'active';
  return 'ended';
}

function currentOrScheduledLeave(leaves, tmpId, now = Date.now()) {
  return (leaves || []).find((leave) =>
    Number(leave.tmpId) === Number(tmpId) &&
    ['active', 'scheduled'].includes(leaveStatus(leave, now))
  ) || null;
}

async function post(channelId, content) {
  try {
    await discord(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: { content, allowed_mentions: { parse: [] } }
    });
  } catch (error) {
    console.warn(`LOA confirmation message failed: ${error.message}`);
  }
}

function helpText() {
  return [
    '🛡️ **Driver LOA / Approved Inactivity Commands**',
    '',
    '`!loa add TMP-ID YYYY-MM-DD` — approve leave from now until the end date',
    '`!loa add TMP-ID YYYY-MM-DD YYYY-MM-DD` — schedule leave from start date to end date',
    '`!loa remove TMP-ID` — end an active/scheduled leave early',
    '`!loa list` — show active and scheduled approved leave',
    '`!loa help` — show this help',
    '',
    'No absence reason is stored. Approved leave pauses inactivity counting only; Kings Systems never takes personnel action.'
  ].join('\n');
}

function driverLink(driver) {
  return `[${escapeMarkdown(driver.username || `TMP ${driver.tmpId}`)}](${profileUrl(driver.tmpId)})`;
}

async function handleAdd(channel, message, parts, managementState, loaState) {
  if (parts.length !== 4 && parts.length !== 5) {
    await post(channel.id, '❌ Usage: `!loa add TMP-ID YYYY-MM-DD` or `!loa add TMP-ID START-DATE END-DATE`.');
    return;
  }

  const tmpId = Number(parts[2]);
  if (!Number.isInteger(tmpId) || tmpId <= 0) {
    await post(channel.id, '❌ Invalid TruckersMP ID.');
    return;
  }

  const driver = (managementState.drivers || []).find((item) => item.current && Number(item.tmpId) === tmpId);
  if (!driver) {
    await post(channel.id, `❌ TMP ID **${tmpId}** is not a current Kings Driver.`);
    return;
  }

  const existing = currentOrScheduledLeave(loaState.leaves, tmpId);
  if (existing) {
    await post(channel.id, `❌ ${driverLink(driver)} already has an approved leave until **${formatDate(existing.endAt)}**. Remove it first with \`!loa remove ${tmpId}\`.`);
    return;
  }

  let start;
  let end;

  if (parts.length === 4) {
    start = new Date();
    end = dateEnd(parts[3]);
  } else {
    start = dateStart(parts[3]);
    end = dateEnd(parts[4]);
  }

  if (!start || !end) {
    await post(channel.id, '❌ Invalid date. Use `YYYY-MM-DD`.');
    return;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  if (parts.length === 5 && start.getTime() < todayStart.getTime()) {
    await post(channel.id, '❌ A scheduled LOA cannot start in the past.');
    return;
  }

  if (end.getTime() < start.getTime() || end.getTime() < Date.now()) {
    await post(channel.id, '❌ The LOA end date must be after the start time.');
    return;
  }

  loaState.leaves.push({
    id: crypto.randomUUID(),
    tmpId,
    username: driver.username,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    createdAt: nowISO(),
    createdByDiscordUserId: String(message.author?.id || ''),
    closedAt: null,
    closedByDiscordUserId: null
  });

  const scheduled = start.getTime() > Date.now();
  const timing = scheduled
    ? `from **${formatDate(start)}** until **${formatDate(end)}**`
    : `until **${formatDate(end)}**`;

  await post(channel.id, `✅ **Approved Leave Added**\n${driverLink(driver)} — ${timing}.\nInactivity counting is paused during the approved period.`);
}

async function handleRemove(channel, message, parts, managementState, loaState) {
  if (parts.length !== 3) {
    await post(channel.id, '❌ Usage: `!loa remove TMP-ID`.');
    return;
  }

  const tmpId = Number(parts[2]);
  if (!Number.isInteger(tmpId) || tmpId <= 0) {
    await post(channel.id, '❌ Invalid TruckersMP ID.');
    return;
  }

  const leave = currentOrScheduledLeave(loaState.leaves, tmpId);
  if (!leave) {
    await post(channel.id, `ℹ️ TMP ID **${tmpId}** has no active or scheduled approved leave.`);
    return;
  }

  leave.closedAt = nowISO();
  leave.closedByDiscordUserId = String(message.author?.id || '');

  const driver = (managementState.drivers || []).find((item) => Number(item.tmpId) === tmpId) || {
    tmpId,
    username: leave.username || `TMP ${tmpId}`
  };

  await post(channel.id, `✅ **Approved Leave Ended**\n${driverLink(driver)} — the LOA has been closed. Normal inactivity tracking resumes with the approved period excluded from the counter.`);
}

async function handleList(channel, loaState) {
  const now = Date.now();
  const visible = (loaState.leaves || [])
    .filter((leave) => ['active', 'scheduled'].includes(leaveStatus(leave, now)))
    .sort((a, b) => new Date(a.endAt) - new Date(b.endAt));

  if (!visible.length) {
    await post(channel.id, '📋 **Approved Leave**\nNo active or scheduled Driver LOAs.');
    return;
  }

  const lines = visible.slice(0, 20).map((leave) => {
    const status = leaveStatus(leave, now) === 'active' ? '🟢 Active' : '🗓️ Scheduled';
    const start = formatDate(leave.startAt);
    const end = formatDate(leave.endAt);
    return `• [${escapeMarkdown(leave.username || `TMP ${leave.tmpId}`)}](${profileUrl(leave.tmpId)}) — ${status} — ${start} → ${end}`;
  });

  if (visible.length > 20) lines.push(`• … and **${visible.length - 20} more**`);
  await post(channel.id, ['📋 **Approved Driver Leave**', '', ...lines].join('\n'));
}

async function processCommands(channel, managementState, loaState) {
  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const maxId = maxSnowflake(messages || []);

  if (!loaState.lastProcessedMessageId) {
    loaState.lastProcessedMessageId = maxId;
    writeLoaState(loaState);
    console.log('Driver LOA command baseline initialized. Historical messages were not processed.');
    return 0;
  }

  const newMessages = (messages || [])
    .filter((message) => snowflakeGreater(message.id, loaState.lastProcessedMessageId))
    .sort((a, b) => (snowflakeGreater(a.id, b.id) ? 1 : -1));

  let commands = 0;

  for (const message of newMessages) {
    if (message.author?.bot || message.webhook_id) continue;
    const content = String(message.content || '').trim();
    if (!content.toLowerCase().startsWith('!loa')) continue;

    const parts = content.split(/\s+/);
    const action = String(parts[1] || 'help').toLowerCase();
    commands += 1;

    if (action === 'add') {
      await handleAdd(channel, message, parts, managementState, loaState);
    } else if (action === 'remove') {
      await handleRemove(channel, message, parts, managementState, loaState);
    } else if (action === 'list') {
      await handleList(channel, loaState);
    } else {
      await post(channel.id, helpText());
    }
  }

  if (maxId && snowflakeGreater(maxId, loaState.lastProcessedMessageId)) {
    loaState.lastProcessedMessageId = maxId;
  }

  writeLoaState(loaState);
  return commands;
}

function ageDays(value, now = Date.now()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 86400000));
}

function mergedLeaveCreditMs(leaves, tmpId, basisMs, now) {
  const intervals = [];

  for (const leave of leaves || []) {
    if (Number(leave.tmpId) !== Number(tmpId)) continue;
    const start = new Date(leave.startAt).getTime();
    const end = effectiveLeaveEnd(leave);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const from = Math.max(start, basisMs);
    const to = Math.min(end, now);
    if (to > from) intervals.push([from, to]);
  }

  if (!intervals.length) return 0;
  intervals.sort((a, b) => a[0] - b[0]);

  let total = 0;
  let [start, end] = intervals[0];
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end) {
      end = Math.max(end, nextEnd);
    } else {
      total += end - start;
      start = nextStart;
      end = nextEnd;
    }
  }
  total += end - start;
  return total;
}

function evaluateWithLeave(driver, leaves, now = Date.now()) {
  if (!driver.current) return { level: 'Left', inactiveDays: null, basis: null };

  const activeLeave = (leaves || []).find((leave) =>
    Number(leave.tmpId) === Number(driver.tmpId) && leaveStatus(leave, now) === 'active'
  );

  if (activeLeave) {
    return {
      level: 'Approved Leave',
      inactiveDays: null,
      basis: 'approved-leave',
      leave: activeLeave
    };
  }

  const observedAge = ageDays(driver.firstObservedAt, now);
  const membershipAge = ageDays(driver.joinDate, now);
  const graceAge = observedAge === null
    ? membershipAge
    : membershipAge === null
      ? observedAge
      : Math.min(observedAge, membershipAge);

  if (graceAge !== null && graceAge < NEW_DRIVER_GRACE_DAYS) {
    return {
      level: 'Grace',
      inactiveDays: driver.lastOnlineSeenAt ? ageDays(driver.lastOnlineSeenAt, now) : null,
      basis: driver.lastOnlineSeenAt ? 'last-online' : 'tracking-grace'
    };
  }

  const activityBasis = driver.lastOnlineSeenAt || driver.firstObservedAt || driver.joinDate;
  const basisMs = activityBasis ? new Date(activityBasis).getTime() : NaN;
  if (!Number.isFinite(basisMs)) return { level: 'Unknown', inactiveDays: null, basis: null };

  const creditMs = mergedLeaveCreditMs(leaves, driver.tmpId, basisMs, now);
  const effectiveMs = Math.max(0, now - basisMs - creditMs);
  const inactiveDays = Math.floor(effectiveMs / 86400000);
  const suffix = creditMs > 0 ? '-loa-adjusted' : '';
  const basis = driver.lastOnlineSeenAt ? `last-online${suffix}` : `tracking-start${suffix}`;

  if (inactiveDays >= HR_REVIEW_DAYS) return { level: 'HR Review', inactiveDays, basis };
  if (inactiveDays >= ATTENTION_DAYS) return { level: 'Attention', inactiveDays, basis };
  if (inactiveDays >= INFO_DAYS) return { level: 'Info', inactiveDays, basis };
  return { level: 'Active', inactiveDays, basis };
}

function applyLeaveToManagement(managementState, loaState) {
  const now = Date.now();

  for (const driver of managementState.drivers || []) {
    const previousLevel = driver.activityLevel || null;
    const evaluation = evaluateWithLeave(driver, loaState.leaves, now);

    driver.inactiveDays = evaluation.inactiveDays;
    driver.activityBasis = evaluation.basis;

    if (evaluation.level === 'Approved Leave') {
      driver.approvedLeaveStartedAt = evaluation.leave.startAt;
      driver.approvedLeaveUntil = evaluation.leave.endAt;

      // Entering approved leave resets any previously sent inactivity-alert
      // state. This prevents a false "Activity Restored" message when an LOA
      // ends without actual TruckersMP activity.
      if (SEVERITY_LEVELS.has(driver.lastActivityAlertLevel)) {
        driver.lastActivityAlertLevel = null;
        driver.lastActivityAlertAt = null;
      }
    } else {
      delete driver.approvedLeaveStartedAt;
      delete driver.approvedLeaveUntil;
    }

    if (previousLevel !== evaluation.level) {
      driver.activityLevelSince = managementState.updatedAt || nowISO();
    }
    driver.activityLevel = evaluation.level;
  }
}

function pruneLeaveHistory(loaState) {
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  loaState.leaves = (loaState.leaves || []).filter((leave) => {
    const end = effectiveLeaveEnd(leave);
    return !Number.isFinite(end) || end >= cutoff;
  });
}

function updateSummary(managementState) {
  const summary = readJson(SUMMARY_FILE, {}) || {};
  const current = (managementState.drivers || []).filter((driver) => driver.current);
  const count = (level) => current.filter((driver) => driver.activityLevel === level).length;

  summary.version = 3;
  summary.mode = 'advisory-only';
  summary.updatedAt = managementState.updatedAt || nowISO();
  summary.currentDrivers = current.length;
  summary.activity = {
    grace: count('Grace'),
    active: count('Active'),
    approvedLeave: count('Approved Leave'),
    info7Days: count('Info'),
    attention14Days: count('Attention'),
    hrReview30Days: count('HR Review'),
    unknown: count('Unknown')
  };
  summary.rules = {
    ...(summary.rules || {}),
    infoDays: INFO_DAYS,
    attentionDays: ATTENTION_DAYS,
    hrReviewDays: HR_REVIEW_DAYS,
    newDriverGraceDays: NEW_DRIVER_GRACE_DAYS,
    approvedLeavePausesInactivity: true
  };
  summary.note = 'Advisory only. Approved leave pauses inactivity counting. The automation never kicks, bans, removes, disciplines, or changes roles for Drivers. Human Leadership/HR always decides any action.';

  writeJson(SUMMARY_FILE, summary);
  return summary;
}

function statusLine(driver) {
  const days = Number.isFinite(driver.inactiveDays) ? `${driver.inactiveDays}d` : 'unknown';
  return `• [${escapeMarkdown(driver.username)}](${profileUrl(driver.tmpId)}) — ${days}`;
}

function leaveLine(driver) {
  const until = Math.floor(new Date(driver.approvedLeaveUntil).getTime() / 1000);
  return `• [${escapeMarkdown(driver.username)}](${profileUrl(driver.tmpId)}) — until <t:${until}:D>`;
}

function compactSection(title, drivers, formatter) {
  if (!drivers.length) return [];
  const shown = drivers.slice(0, 4).map(formatter);
  if (drivers.length > 4) shown.push(`• … and **${drivers.length - 4} more**`);
  return ['', title, ...shown];
}

function buildLeadershipMessage(managementState, summary) {
  const current = (managementState.drivers || []).filter((driver) => driver.current);
  const info = current.filter((driver) => driver.activityLevel === 'Info');
  const attention = current.filter((driver) => driver.activityLevel === 'Attention');
  const hrReview = current.filter((driver) => driver.activityLevel === 'HR Review');
  const leave = current.filter((driver) => driver.activityLevel === 'Approved Leave');
  const timestamp = Math.floor(new Date(managementState.updatedAt || Date.now()).getTime() / 1000);

  return [
    LEADERSHIP_MARKER,
    '',
    '# 🚛 Driver Management',
    '',
    `**Current Drivers:** ${summary.currentDrivers}`,
    `**Online now:** ${summary.onlineNow ?? 0}`,
    `**Grace:** ${summary.activity?.grace ?? 0}`,
    `**Active:** ${summary.activity?.active ?? 0}`,
    `**Approved Leave:** ${summary.activity?.approvedLeave ?? 0}`,
    `**7d Info:** ${summary.activity?.info7Days ?? 0}`,
    `**14d Attention:** ${summary.activity?.attention14Days ?? 0}`,
    `**30d HR Review:** ${summary.activity?.hrReview30Days ?? 0}`,
    ...compactSection('## 🛡️ Approved Leave', leave, leaveLine),
    ...compactSection('## ℹ️ 7 Days — Information', info, statusLine),
    ...compactSection('## ⚠️ 14 Days — Attention', attention, statusLine),
    ...compactSection('## 👥 30 Days — HR Review', hrReview, statusLine),
    '',
    '🛡️ **Advisory only:** Approved leave pauses inactivity counting. Kings Systems never removes, kicks, bans, disciplines, or changes roles for any Driver.',
    '',
    `Last updated <t:${timestamp}:R>`
  ].join('\n').slice(0, 1990);
}

async function syncLeadershipOverview(channel, managementState, summary) {
  const bot = await discord('/users/@me');
  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const existing = (messages || []).find((message) =>
    message.author?.id === bot.id &&
    String(message.content || '').includes(LEADERSHIP_MARKER)
  );

  const content = buildLeadershipMessage(managementState, summary);

  if (existing) {
    await discord(`/channels/${channel.id}/messages/${existing.id}`, {
      method: 'PATCH',
      body: { content, allowed_mentions: { parse: [] } }
    });
    console.log(`Driver Leadership overview updated with LOA data in #${channel.name}.`);
  } else {
    await discord(`/channels/${channel.id}/messages`, {
      method: 'POST',
      body: { content, allowed_mentions: { parse: [] } }
    });
    console.log(`Driver Leadership overview created with LOA data in #${channel.name}.`);
  }
}

async function main() {
  const channel = await resolveLeadershipChannel();
  const managementState = readManagementState();
  const loaState = readLoaState();

  const commandCount = await processCommands(channel, managementState, loaState);
  pruneLeaveHistory(loaState);
  applyLeaveToManagement(managementState, loaState);

  writeLoaState(loaState);
  writeManagementState(managementState);
  const summary = updateSummary(managementState);
  await syncLeadershipOverview(channel, managementState, summary);

  const active = (loaState.leaves || []).filter((leave) => leaveStatus(leave) === 'active').length;
  const scheduled = (loaState.leaves || []).filter((leave) => leaveStatus(leave) === 'scheduled').length;

  console.log(`Kings Driver LOA updated successfully. Commands processed: ${commandCount}. Active: ${active}. Scheduled: ${scheduled}.`);
  console.log('Safety: LOA management never performs member, role, kick, ban, or disciplinary actions.');
}

main().catch((error) => {
  console.error('Kings Driver LOA failed:', error.message);
  process.exit(1);
});
