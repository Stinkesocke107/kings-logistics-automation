const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const DRIVER_CHANNEL_NAME = process.env.DRIVER_LEADERSHIP_CHANNEL_NAME || '🚛｜driver-leadership';
const HR_CHANNEL_NAME = process.env.HR_LEADERSHIP_CHANNEL_NAME || 'hr-leadership';
const MANAGEMENT_CHANNEL_NAME = process.env.MANAGEMENT_OVERVIEW_CHANNEL_NAME || 'management-overview';
const DISCORD_API = 'https://discord.com/api/v10';
const DAY_MS = 86400000;

const DATA = path.join(__dirname, 'data');
const DRIVER_WEEKLY = path.join(DATA, 'driver-weekly-summary-state.json');
const HR_WEEKLY = path.join(DATA, 'hr-weekly-summary-state.json');
const MANAGEMENT_WEEKLY = path.join(DATA, 'management-weekly-overview-state.json');
const DRIVER_MANAGEMENT = path.join(DATA, 'driver-management.json');
const STAFF_SUMMARY = path.join(DATA, 'staff-management-summary.json');
const OUTPUT = path.join(__dirname, 'output', 'weekly-reports-verification.json');

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}
if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function normalizeDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}
function deriveKey(domain) {
  return crypto.createHash('sha256').update(`${domain}\0`).update(String(DRIVER_STATE_KEY)).digest();
}
function decrypt(container, domain) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error(`Encrypted state for ${domain} is invalid.`);
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(domain), Buffer.from(container.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}
function getPreviousCompletedWeek() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const end = new Date(today.getTime() - daysSinceMonday * DAY_MS);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  return { start, end, key: start.toISOString().slice(0, 10) };
}
function formatShort(date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(date);
}
function formatLong(date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(date);
}
function normalizeChannelName(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
async function discord(pathname) {
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'User-Agent': 'Kings Logistics Weekly Reports Verifier/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status} on GET ${pathname}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function resolveChannel(name) {
  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const wanted = normalizeChannelName(name);
  const matches = (channels || []).filter((channel) => [0, 5].includes(channel.type) && normalizeChannelName(channel.name) === wanted);
  if (matches.length !== 1) throw new Error(`Could not uniquely resolve channel ${name}; matches=${matches.length}.`);
  return matches[0];
}
async function recentMessages(channelId) {
  const messages = await discord(`/channels/${channelId}/messages?limit=100`);
  return Array.isArray(messages) ? messages : [];
}
function stateEntry(state, key) {
  return state?.publishedWeeks?.find((item) => item.key === key) || null;
}
function findDriverPost(messages, botId, label) {
  return messages.find((message) =>
    message.author?.id === botId &&
    String(message.content || '').includes('Kings Driver Leadership Weekly Summary') &&
    String(message.content || '').includes(label)
  ) || null;
}
function findHrPost(messages, botId, label) {
  return messages.find((message) =>
    message.author?.id === botId &&
    String(message.content || '').includes('Kings HR Weekly Summary') &&
    !String(message.content || '').includes('TEST') &&
    String(message.content || '').includes(label)
  ) || null;
}
function findManagementPost(messages, botId, label) {
  return messages.find((message) =>
    message.author?.id === botId &&
    (message.embeds || []).some((embed) =>
      String(embed.title || '').includes('Kings Weekly Management Overview') &&
      !String(embed.title || '').includes('TEST') &&
      String(embed.description || '').includes(label)
    )
  ) || null;
}

async function main() {
  const target = getPreviousCompletedWeek();
  const endDisplay = new Date(target.end.getTime() - 1);
  const shortLabel = `${formatShort(target.start)} – ${formatShort(endDisplay)}`;
  const longLabel = `${formatLong(target.start)} – ${formatLong(endDisplay)}`;

  const driverState = readJson(DRIVER_WEEKLY, null);
  const hrState = readJson(HR_WEEKLY, null);
  const managementState = readJson(MANAGEMENT_WEEKLY, null);
  const staffSummary = readJson(STAFF_SUMMARY, null);
  const driverContainer = readJson(DRIVER_MANAGEMENT, null);
  if (!driverContainer) throw new Error('Driver Management encrypted state is missing.');
  const driverManagement = decrypt(driverContainer, 'kings-driver-management-v1');
  const initializedAt = normalizeDate(driverManagement.initializedAt);
  if (!initializedAt) throw new Error('Driver Management initializedAt is missing or invalid.');

  const coverageComplete = initializedAt <= target.start;
  const driverEntry = stateEntry(driverState, target.key);
  const hrEntry = stateEntry(hrState, target.key);
  const managementEntry = stateEntry(managementState, target.key);

  const bot = await discord('/users/@me');
  const [driverChannel, hrChannel, managementChannel] = await Promise.all([
    resolveChannel(DRIVER_CHANNEL_NAME),
    resolveChannel(HR_CHANNEL_NAME),
    resolveChannel(MANAGEMENT_CHANNEL_NAME)
  ]);
  const [driverMessages, hrMessages, managementMessages] = await Promise.all([
    recentMessages(driverChannel.id),
    recentMessages(hrChannel.id),
    recentMessages(managementChannel.id)
  ]);

  const driverPost = findDriverPost(driverMessages, bot.id, shortLabel);
  const hrPost = findHrPost(hrMessages, bot.id, shortLabel);
  const managementPost = findManagementPost(managementMessages, bot.id, longLabel);

  const issues = [];
  if (!driverEntry) issues.push(`Driver Weekly state missing ${target.key}.`);
  if (!driverPost) issues.push(`Driver Weekly Discord post missing ${target.key}.`);
  if (!managementEntry) issues.push(`Management Weekly state missing ${target.key}.`);
  if (!managementPost) issues.push(`Management Weekly Discord post missing ${target.key}.`);

  if (coverageComplete) {
    if (!hrEntry) issues.push(`HR Weekly state missing ${target.key} despite complete Driver Management coverage.`);
    if (!hrPost) issues.push(`HR Weekly Discord post missing ${target.key} despite complete Driver Management coverage.`);
  } else {
    if (hrEntry || hrPost) issues.push(`HR Weekly ${target.key} should have been deferred because tracking coverage was partial.`);
  }

  if (!staffSummary || !Number.isFinite(Number(staffSummary.currentStaff))) {
    issues.push('Staff Management summary is missing or invalid.');
  }

  const nextWeekStart = target.end;
  const nextWeekCoverageEligible = initializedAt <= nextWeekStart;
  const report = {
    version: 1,
    checkedAt: new Date().toISOString(),
    mode: 'read-only',
    targetWeek: {
      key: target.key,
      start: target.start.toISOString(),
      end: target.end.toISOString(),
      driverLabel: shortLabel,
      managementLabel: longLabel
    },
    driverManagement: {
      initializedAt: initializedAt.toISOString(),
      completeCoverageForTargetWeek: coverageComplete,
      completeCoverageFromNextWeek: nextWeekCoverageEligible,
      nextWeekStart: nextWeekStart.toISOString()
    },
    driverWeekly: {
      statePublished: Boolean(driverEntry),
      discordPostFound: Boolean(driverPost),
      messageId: driverPost?.id || null,
      state: driverEntry
    },
    hrWeekly: {
      expectedForTargetWeek: coverageComplete,
      expectedDeferredReason: coverageComplete ? null : 'Driver Management did not cover the complete reporting week.',
      statePublished: Boolean(hrEntry),
      discordPostFound: Boolean(hrPost),
      messageId: hrPost?.id || null,
      state: hrEntry
    },
    managementWeekly: {
      statePublished: Boolean(managementEntry),
      discordPostFound: Boolean(managementPost),
      messageId: managementPost?.id || null,
      state: managementEntry,
      staffSummaryAvailable: Boolean(staffSummary),
      currentStaff: Number(staffSummary?.currentStaff || 0)
    },
    issues,
    healthy: issues.length === 0
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Weekly Reports Verification — ${target.key}`);
  console.log(`Driver: state=${Boolean(driverEntry)} discord=${Boolean(driverPost)}`);
  console.log(`HR: expected=${coverageComplete} state=${Boolean(hrEntry)} discord=${Boolean(hrPost)}`);
  console.log(`Management: state=${Boolean(managementEntry)} discord=${Boolean(managementPost)} staff=${Number(staffSummary?.currentStaff || 0)}`);
  console.log(`Next week full-coverage eligible: ${nextWeekCoverageEligible}`);
  console.log(`Issues: ${issues.length}`);
  if (issues.length) {
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Weekly Reports Verification failed:', error.message);
  process.exit(1);
});
