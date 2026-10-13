require('./kings-branding').installDiscordBranding();

const fs = require('fs');
const path = require('path');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_ID = process.env.MANAGEMENT_OVERVIEW_CHANNEL_ID || null;
const CHANNEL_NAME = process.env.MANAGEMENT_OVERVIEW_CHANNEL_NAME || 'management-overview';
const PREVIEW = /^(?:1|true|yes|on)$/i.test(process.env.MANAGEMENT_MONTHLY_PREVIEW || '');

const DRIVER_REPORTS = path.join(__dirname, 'data', 'driver-leadership-report-state.json');
const HR_REPORTS = path.join(__dirname, 'data', 'hr-leadership-report-state.json');
const STAFF_REPORTS = path.join(__dirname, 'data', 'staff-leadership-report-state.json');
const EVENT_REPORTS = path.join(__dirname, 'data', 'event-leadership-report-state.json');
const STATE_FILE = path.join(__dirname, 'data', 'management-monthly-overview-state.json');

const DISCORD_API = 'https://discord.com/api/v10';
const KINGS_BLUE = 0x182dff;

if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Invalid JSON in ${path.basename(file)}: ${error.message}`); }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function previousCompletedMonth(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  return {
    start,
    end,
    key: start.toISOString().slice(0, 7),
    label: new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(start)
  };
}

function monthlyReport(file, key) {
  const state = readJson(file, null);
  const reports = Array.isArray(state?.monthlyReports) ? state.monthlyReports : [];
  return reports.find((item) => item.key === key) || null;
}

function loadState() {
  const state = readJson(STATE_FILE, null);
  if (state && Array.isArray(state.publishedMonths) && Array.isArray(state.monthlyReports)) return state;
  return {
    version: 1,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    publishedMonths: [],
    monthlyReports: []
  };
}

function saveState(state) {
  state.updatedAt = nowISO();
  state.publishedMonths = state.publishedMonths.slice(-36);
  state.monthlyReports = state.monthlyReports.slice(-24);
  writeJson(STATE_FILE, state);
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function pct(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : 'n/a';
}

function days(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}d` : 'n/a';
}

function buildEmbed(period, reports, previous = null) {
  const { driver, hr, staff, event } = reports;
  const coverageOk = [driver, hr, staff]
    .every((item) => item.completeCoverage !== false);

  const attention = number(driver.openReviews) + number(hr.openProbation) +
    number(hr.extendedProbation) + number(hr.hrReviews) + number(event.needsInfo) + number(event.ready);

  const comparison = previous
    ? `Drivers **${signed(number(driver.endDrivers) - number(previous.drivers))}** • Staff **${signed(number(staff.endStaff) - number(previous.staff))}** • Open Reviews **${signed(number(driver.openReviews) - number(previous.openReviews))}** • Event Issues **${signed(number(event.needsInfo) + number(event.ready) - number(previous.eventIssues))}**`
    : 'First consolidated monthly report — comparison starts next month.';

  return {
    title: '👑 Kings Management — Monthly Report',
    description:
      `**Month:** ${period.label}\n` +
      `${coverageOk ? '✅ Core leadership reporting coverage is complete.' : '⚠️ One or more source reports have partial historical coverage.'}\n` +
      `Management attention indicators at report time: **${attention}**`,
    color: KINGS_BLUE,
    fields: [
      {
        name: '🚛 Drivers',
        value:
          `Start **${number(driver.startDrivers)}** • End **${number(driver.endDrivers)}** • Net **${signed(number(driver.netGrowth))}**\n` +
          `Joined **${number(driver.joined)}** • Left **${number(driver.left)}** • Retention **${pct(driver.retention)}**\n` +
          `Open Reviews **${number(driver.openReviews)}** • Active LOA **${number(driver.activeLoa)}** • Avg Membership **${days(driver.averageTenureDays)}**`,
        inline: false
      },
      {
        name: '👥 HR',
        value:
          `Probation Opened **${number(hr.probationOpened)}** • Completed **${number(hr.probationCompleted)}**\n` +
          `Current Open **${number(hr.openProbation)}** • Extended **${number(hr.extendedProbation)}** • 30d HR Reviews **${number(hr.hrReviews)}**\n` +
          `Active LOA **${number(hr.activeLoa)}** • Retention **${pct(hr.retention)}**`,
        inline: false
      },
      {
        name: '🛡️ Staff',
        value:
          `Start **${number(staff.startStaff)}** • End **${number(staff.endStaff)}** • Net **${signed(number(staff.netGrowth))}**\n` +
          `Joined **${number(staff.joined)}** • Left **${number(staff.left)}** • Role Changes **${number(staff.roleChanges)}**`,
        inline: false
      },
      {
        name: '📅 Events / Convoys — Internal Operations',
        value:
          `Counted **${number(event.counted)}** • Completed **${number(event.completed)}** • Cancelled **${number(event.cancelled)}**\n` +
          `Scheduled **${number(event.scheduled)}** • Ready **${number(event.ready)}** • Needs Info **${number(event.needsInfo)}**\n` +
          `Recorded Event changes **${number(event.changes)}**`,
        inline: false
      },
      {
        name: '📈 Compared with Previous Month',
        value: comparison,
        inline: false
      },
      {
        name: '🔒 Scope & Safety',
        value:
          'This is the consolidated Management summary. Detailed cases remain in Driver, HR, Staff and Event Leadership. ' +
          'Kings Systems never performs personnel, disciplinary, Staff-role or Event-approval decisions automatically.',
        inline: false
      }
    ],
    footer: { text: 'Kings Logistics • Management Control • Monthly' },
    timestamp: nowISO()
  };
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    const allowed = /^\/channels\/\d+\/messages$/.test(pathname) && method === 'POST';
    if (!allowed) throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics Management Monthly/1.0'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status} on ${method} ${pathname}: ${text.slice(0, 500)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function normalizeChannelName(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function resolveChannel() {
  if (CHANNEL_ID) {
    const channel = await discord(`/channels/${CHANNEL_ID}`);
    if (channel.guild_id && String(channel.guild_id) !== String(DISCORD_GUILD_ID)) {
      throw new Error('Configured Management Overview channel is not in the configured guild.');
    }
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const text = (channels || []).filter((channel) => [0, 5].includes(Number(channel.type)));
  const wanted = normalizeChannelName(CHANNEL_NAME);
  const exact = text.find((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact) return exact;

  const fuzzy = text.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('management') && name.includes('overview');
  });
  if (fuzzy.length === 1) return fuzzy[0];

  throw new Error(`Could not uniquely resolve Management Overview channel "${CHANNEL_NAME}".`);
}

async function main() {
  const period = previousCompletedMonth();
  const state = loadState();

  if (!PREVIEW && state.publishedMonths.includes(period.key)) {
    console.log(`Management Monthly Report ${period.key} already published.`);
    return;
  }

  const reports = {
    driver: monthlyReport(DRIVER_REPORTS, period.key),
    hr: monthlyReport(HR_REPORTS, period.key),
    staff: monthlyReport(STAFF_REPORTS, period.key),
    event: monthlyReport(EVENT_REPORTS, period.key)
  };

  const missing = Object.entries(reports).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    console.log(`Management Monthly Report waiting for source reports: ${missing.join(', ')}.`);
    console.log('No Management report posted; the next scheduled retry can complete it.');
    return;
  }

  const previous = state.monthlyReports.at(-1) || null;
  const embed = buildEmbed(period, reports, previous);
  const channel = await resolveChannel();

  if (PREVIEW) {
    console.log(`PREVIEW Management Monthly Report ready for #${channel.name}.`);
    return;
  }

  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: { embeds: [embed], allowed_mentions: { parse: [] } }
  });

  state.publishedMonths.push(period.key);
  state.monthlyReports.push({
    key: period.key,
    publishedAt: nowISO(),
    drivers: number(reports.driver.endDrivers),
    staff: number(reports.staff.endStaff),
    openReviews: number(reports.driver.openReviews),
    eventIssues: number(reports.event.needsInfo) + number(reports.event.ready),
    driverNetGrowth: number(reports.driver.netGrowth),
    staffNetGrowth: number(reports.staff.netGrowth),
    eventCompleted: number(reports.event.completed)
  });
  saveState(state);

  console.log(`Management Monthly Report ${period.key} published to #${channel.name}.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Kings Management Monthly Report failed:', error.message);
    process.exit(1);
  });
}

module.exports = { previousCompletedMonth, monthlyReport, buildEmbed };
