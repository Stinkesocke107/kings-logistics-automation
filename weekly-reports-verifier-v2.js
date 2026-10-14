const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const DRIVER_NAME = process.env.DRIVER_LEADERSHIP_CHANNEL_NAME || '🚛｜driver-leadership';
const HR_NAME = process.env.HR_LEADERSHIP_CHANNEL_NAME || 'hr-leadership';
const MANAGEMENT_NAME = process.env.MANAGEMENT_OVERVIEW_CHANNEL_NAME || 'management-overview';
const API = 'https://discord.com/api/v10';
const DAY_MS = 86400000;
const DATA = path.join(__dirname, 'data');
const OUTPUT = path.join(__dirname, 'output', 'weekly-reports-verification.json');

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) throw new Error('DRIVER_STATE_KEY is missing or too short.');
if (!TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');

function readJson(name, fallback = null) {
  const file = path.join(DATA, name);
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function normalizeDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function deriveKey(domain) {
  return crypto.createHash('sha256').update(`${domain}\0`).update(String(DRIVER_STATE_KEY)).digest();
}
function decrypt(container, domain) {
  if (!container?.encrypted || container.algorithm !== 'aes-256-gcm') throw new Error(`Invalid encrypted ${domain} state.`);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(domain), Buffer.from(container.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}
function targetWeek() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
  return { start: new Date(end.getTime() - 7 * DAY_MS), end };
}
function fmt(date, month) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' }).format(date);
}
function norm(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
async function discord(pathname) {
  const response = await fetch(`${API}${pathname}`, {
    headers: { Authorization: `Bot ${TOKEN}`, 'User-Agent': 'Kings Logistics Weekly Reports Verifier/2.1' },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Discord API ${response.status} on GET ${pathname}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}
async function readableMessages(channel) {
  try {
    const data = await discord(`/channels/${channel.id}/messages?limit=100`);
    return { channel, messages: Array.isArray(data) ? data : [] };
  } catch (error) {
    if (error.status === 403 || error.status === 404) return null;
    throw error;
  }
}
async function resolveByHistory(channels, name, botId, historicalPredicate, label) {
  const matches = channels.filter((c) => [0, 5].includes(c.type) && norm(c.name) === norm(name));
  if (matches.length === 0) throw new Error(`No ${label} channel matches ${name}.`);

  const readable = [];
  for (const channel of matches) {
    const candidate = await readableMessages(channel);
    if (candidate) readable.push(candidate);
  }

  if (readable.length === 0) throw new Error(`No readable ${label} channel matches ${name}.`);
  if (readable.length === 1) {
    return {
      ...readable[0],
      method: matches.length === 1 ? 'unique-name' : 'unique-readable-channel',
      normalizedMatches: matches.length,
      readableMatches: 1
    };
  }

  const historical = readable.filter(({ messages }) =>
    messages.some((m) => m.author?.id === botId && historicalPredicate(m))
  );
  if (historical.length !== 1) {
    throw new Error(
      `${label} channel is ambiguous: normalizedMatches=${matches.length}, ` +
      `readableMatches=${readable.length}, historicalMatches=${historical.length}.`
    );
  }
  return {
    ...historical[0],
    method: 'weekly-history',
    normalizedMatches: matches.length,
    readableMatches: readable.length
  };
}
function stateEntry(state, key) {
  return state?.publishedWeeks?.find((item) => item.key === key) || null;
}

async function main() {
  const period = targetWeek();
  const key = period.start.toISOString().slice(0, 10);
  const endDisplay = new Date(period.end.getTime() - 1);
  const shortLabel = `${fmt(period.start, 'short')} – ${fmt(endDisplay, 'short')}`;
  const longLabel = `${fmt(period.start, 'long')} – ${fmt(endDisplay, 'long')}`;

  const driverState = readJson('driver-weekly-summary-state.json');
  const hrState = readJson('hr-weekly-summary-state.json');
  const managementState = readJson('management-weekly-overview-state.json');
  const staff = readJson('staff-management-summary.json');
  const driverEncrypted = readJson('driver-management.json');
  if (!driverEncrypted) throw new Error('Driver Management state is missing.');
  const driverManagement = decrypt(driverEncrypted, 'kings-driver-management-v1');
  const initializedAt = normalizeDate(driverManagement.initializedAt);
  if (!initializedAt) throw new Error('Driver Management initializedAt is invalid.');
  const coverageComplete = initializedAt <= period.start;

  const bot = await discord('/users/@me');
  const channels = await discord(`/guilds/${GUILD_ID}/channels`);
  const textChannels = Array.isArray(channels) ? channels : [];

  const driverResolved = await resolveByHistory(
    textChannels, DRIVER_NAME, bot.id,
    (m) => /Kings Driver Leadership (?:Weekly Summary|— Weekly Review)/.test(String(m.content || '')),
    'Driver Leadership'
  );
  const hrResolved = await resolveByHistory(
    textChannels, HR_NAME, bot.id,
    (m) => /Kings HR (?:Weekly Summary|Leadership — Weekly Review)/.test(String(m.content || '')),
    'HR Leadership'
  );
  const managementResolved = await resolveByHistory(
    textChannels, MANAGEMENT_NAME, bot.id,
    (m) => (m.embeds || []).some((e) => /Kings (?:Weekly Management Overview|Management Weekly Review)/.test(String(e.title || ''))),
    'Management Overview'
  );

  const driverPost = driverResolved.messages.find((m) =>
    m.author?.id === bot.id && /Kings Driver Leadership (?:Weekly Summary|— Weekly Review)/.test(String(m.content || '')) && String(m.content || '').includes(shortLabel)
  ) || null;
  const hrPost = hrResolved.messages.find((m) =>
    m.author?.id === bot.id && /Kings HR (?:Weekly Summary|Leadership — Weekly Review)/.test(String(m.content || '')) && !String(m.content || '').includes('TEST') && String(m.content || '').includes(shortLabel)
  ) || null;
  const managementPost = managementResolved.messages.find((m) =>
    m.author?.id === bot.id && (m.embeds || []).some((e) =>
      /Kings (?:Weekly Management Overview|Management Weekly Review)/.test(String(e.title || '')) && !String(e.title || '').includes('TEST') && String(e.description || '').includes(longLabel)
    )
  ) || null;

  const driverEntry = stateEntry(driverState, key);
  const hrEntry = stateEntry(hrState, key);
  const managementEntry = stateEntry(managementState, key);
  const issues = [];

  // Weekly dashboards intentionally replace the previous week's message.
  // Historical state proves a prior publication was recorded; the latest
  // on-screen dashboard cannot prove which older period it once displayed.
  function dashboardEvidence(entry, post, resolved, state, currentPredicate) {
    if (post) return { found: true, mode: 'historical-period-visible', messageId: post.id };
    if (!entry) return { found: false, mode: 'missing-state', messageId: null };
    const latest = (state?.publishedWeeks || []).at(-1);
    if (!latest || latest.key === key) return { found: false, mode: 'missing-current-message', messageId: null };
    const active = resolved.messages.find(m => m.author?.id === bot.id && currentPredicate(m));
    return { found: Boolean(active), mode: active ? 'latest-dashboard-visible-historical-state-recorded' : 'missing-current-message', messageId: active?.id || null };
  }
  const driverEvidence = dashboardEvidence(driverEntry, driverPost, driverResolved, driverState,
    m => /Kings Driver Leadership (?:Weekly Summary|— Weekly Review)/.test(String(m.content || '')));
  const hrEvidence = dashboardEvidence(hrEntry, hrPost, hrResolved, hrState,
    m => /Kings HR (?:Weekly Summary|Leadership — Weekly Review)/.test(String(m.content || '')) && !String(m.content || '').includes('TEST'));
  const managementEvidence = dashboardEvidence(managementEntry, managementPost, managementResolved, managementState,
    m => (m.embeds || []).some(e => /Kings (?:Weekly Management Overview|Management Weekly Review)/.test(String(e.title || ''))));

  // The three legacy weekly producer workflows are intentionally configured
  // to suppress individual posts when a consolidated Leadership dashboard owns them.
  // Historical state may predate the suppression guard and cannot prove Discord delivery.
  const legacyWorkflows = {
    driver: '.github/workflows/driver-weekly-summary.yml',
    hr: '.github/workflows/hr-weekly-summary.yml',
    management: '.github/workflows/management-weekly-overview.yml'
  };
  const suppressed = Object.fromEntries(Object.entries(legacyWorkflows).map(([name, file]) => [
    name, /LEADERSHIP_CONSOLIDATED_ONLY:\s*['"]true['"]/.test(
      fs.readFileSync(path.join(__dirname, file), 'utf8'))
  ]));
  if (!suppressed.driver) {
    if (!driverEntry) issues.push(`Driver Weekly state missing ${key}.`);
    if (!driverEvidence.found) issues.push(`Driver Weekly dashboard publication could not be verified for ${key}.`);
  }
  if (!suppressed.management) {
    if (!managementEntry) issues.push(`Management Weekly state missing ${key}.`);
    if (!managementEvidence.found) issues.push(`Management Weekly dashboard publication could not be verified for ${key}.`);
  }
  if (!suppressed.hr) {
    if (coverageComplete) {
      if (!hrEntry) issues.push(`HR Weekly state missing ${key} despite complete coverage.`);
      if (!hrEvidence.found) issues.push(`HR Weekly dashboard publication could not be verified for ${key} despite complete coverage.`);
    } else if (hrEntry || hrPost) {
      issues.push(`HR Weekly ${key} should have been deferred because coverage was partial.`);
    }
  }

  if (!staff || !Number.isFinite(Number(staff.currentStaff))) issues.push('Staff Management summary missing or invalid.');
  const nextWeekCoverageEligible = initializedAt <= period.end;

  const channelSummary = (resolved) => ({
    id: resolved.channel.id,
    name: resolved.channel.name,
    method: resolved.method,
    normalizedMatches: resolved.normalizedMatches,
    readableMatches: resolved.readableMatches
  });

  const report = {
    version: 3,
    checkedAt: new Date().toISOString(),
    mode: 'read-only',
    targetWeek: { key, start: period.start.toISOString(), end: period.end.toISOString(), shortLabel, longLabel },
    driverManagement: {
      initializedAt: initializedAt.toISOString(),
      completeCoverageForTargetWeek: coverageComplete,
      nextWeekStart: period.end.toISOString(),
      completeCoverageFromNextWeek: nextWeekCoverageEligible
    },
    legacyWeeklySuppressed: suppressed,
    legacyPublicationEvidence: 'Historical records made by suppressed publishers are not accepted as proof of a Discord post.',
    channelResolution: {
      driver: channelSummary(driverResolved),
      hr: channelSummary(hrResolved),
      management: channelSummary(managementResolved)
    },
    driverWeekly: { statePublished: Boolean(driverEntry), discordPostFound: driverEvidence.found, verificationMode: driverEvidence.mode, messageId: driverEvidence.messageId, state: driverEntry },
    hrWeekly: {
      expectedForTargetWeek: coverageComplete,
      expectedDeferredReason: coverageComplete ? null : 'Driver Management did not cover the complete reporting week.',
      statePublished: Boolean(hrEntry), discordPostFound: hrEvidence.found, verificationMode: hrEvidence.mode, messageId: hrEvidence.messageId, state: hrEntry
    },
    managementWeekly: {
      statePublished: Boolean(managementEntry), discordPostFound: managementEvidence.found, verificationMode: managementEvidence.mode, messageId: managementEvidence.messageId,
      state: managementEntry, staffSummaryAvailable: Boolean(staff), currentStaff: Number(staff?.currentStaff || 0)
    },
    issues,
    healthy: issues.length === 0
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Weekly Reports Verification — ${key}`);
  console.log(`Driver: state=${Boolean(driverEntry)} discord=${driverEvidence.found} channel=${driverResolved.channel.id}`);
  console.log(
    `HR: expected=${coverageComplete} state=${Boolean(hrEntry)} discord=${hrEvidence.found} ` +
    `channel=${hrResolved.channel.id} resolution=${hrResolved.method}`
  );
  console.log(`Management: state=${Boolean(managementEntry)} discord=${managementEvidence.found} staff=${Number(staff?.currentStaff || 0)}`);
  console.log(`Next week full-coverage eligible: ${nextWeekCoverageEligible}`);
  console.log(`Issues: ${issues.length}`);
  for (const issue of issues) console.error(`- ${issue}`);
  if (issues.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Weekly Reports Verification failed:', error.message);
  process.exit(1);
});
