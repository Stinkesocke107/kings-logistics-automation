const fs = require('fs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';
const REPORT_PATH = 'output/convoy-check-results.json';
const JSON_OUTPUT = 'output/convoy-overview.json';
const MARKDOWN_OUTPUT = 'output/convoy-overview.md';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Missing ${REPORT_PATH}. Run convoy-checker.js first.`);
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discord(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Convoy Overview/1.0'
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${path}: ${text.slice(0, 500)}`);
  }

  return text ? JSON.parse(text) : null;
}

function normalize(text = '') {
  return String(text).replace(/\r/g, '').trim();
}

function isTestThread(name = '') {
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(name);
}

function getStarterMessage(messages, threadId) {
  return messages.find((message) => message.id === threadId) || messages[messages.length - 1] || null;
}

function getLabeledValue(text, labels) {
  const cleaned = normalize(text).replace(/[*_`~]/g, '');
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = cleaned.match(new RegExp(`(?:^|\\n)\\s*(?:[-#>]+\\s*)?${escaped}\\s*(?::|-)\\s*([^\\n]+)`, 'i'));
    if (match) return match[1].trim();
  }
  return null;
}

function toFourDigitYear(year) {
  const value = Number(year);
  if (String(year).length === 2) return value >= 70 ? 1900 + value : 2000 + value;
  return value;
}

function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseEventDate(value) {
  if (!value) return null;
  const text = value.trim();
  let match;

  match = text.match(/\b(20\d{2}|19\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (validDateParts(year, month, day)) return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  match = text.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = toFourDigitYear(match[3]);
    if (validDateParts(year, month, day)) return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    if (year >= 2020 && year <= 2100) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

function monthKey(date) {
  return date ? date.slice(0, 7) : null;
}

function increment(object, key) {
  object[key] = (object[key] || 0) + 1;
}

function makeMonthStats() {
  return {
    countedConvoys: 0,
    scheduled: 0,
    completed: 0,
    cancelled: 0,
    needsInformation: 0,
    readyForApproval: 0,
    submitted: 0,
    other: 0,
    convoys: []
  };
}

function statusCounterKey(status) {
  const map = {
    'Scheduled': 'scheduled',
    'Completed': 'completed',
    'Cancelled': 'cancelled',
    'Needs Information': 'needsInformation',
    'Ready for Approval': 'readyForApproval',
    'Submitted': 'submitted'
  };
  return map[status] || 'other';
}

function escapeTable(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildMarkdown(overview) {
  const lines = [
    '# Kings Convoy Overview',
    '',
    `Generated: ${overview.generatedAt}`,
    '',
    '## Overall',
    '',
    `- Real convoy submissions: **${overview.overall.realConvoySubmissions}**`,
    `- Counted convoys with confirmed Kings slot: **${overview.overall.countedConvoys}**`,
    `- Excluded test threads: **${overview.overall.excludedTestThreads}**`,
    `- Counted convoys without event date: **${overview.overall.undatedCountedConvoys}**`,
    '',
    '## Monthly statistics',
    '',
    '| Month | Counted | Scheduled | Completed | Cancelled | Needs Info | Ready |',
    '|---|---:|---:|---:|---:|---:|---:|'
  ];

  const months = Object.keys(overview.months).sort().reverse();
  if (months.length === 0) {
    lines.push('| — | 0 | 0 | 0 | 0 | 0 | 0 |');
  } else {
    for (const month of months) {
      const stats = overview.months[month];
      lines.push(`| ${month} | ${stats.countedConvoys} | ${stats.scheduled} | ${stats.completed} | ${stats.cancelled} | ${stats.needsInformation} | ${stats.readyForApproval} |`);
    }
  }

  lines.push('', '## Counted convoys', '', '| Date | Convoy | Status | Event ID | Type |', '|---|---|---|---|---|');

  if (overview.countedConvoys.length === 0) {
    lines.push('| — | No counted convoys yet | — | — | — |');
  } else {
    for (const convoy of [...overview.countedConvoys].sort((a, b) => String(b.eventDate || '').localeCompare(String(a.eventDate || '')))) {
      lines.push(`| ${escapeTable(convoy.eventDate || 'Undated')} | ${escapeTable(convoy.name)} | ${escapeTable(convoy.status)} | ${escapeTable(convoy.eventId || '—')} | ${escapeTable(convoy.eventType || '—')} |`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function appendGithubSummary(overview) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = overview.months[currentMonth] || makeMonthStats();
  const lines = [
    '',
    '# Kings Convoy Monthly Overview',
    '',
    `Current month: **${currentMonth}**`,
    '',
    `Counted convoys: **${month.countedConvoys}** · Scheduled: **${month.scheduled}** · Completed: **${month.completed}** · Cancelled: **${month.cancelled}**`,
    '',
    `Confirmed-slot convoys without event date: **${overview.overall.undatedCountedConvoys}**`,
    ''
  ];

  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

  if (report.guildId && report.guildId !== GUILD_ID) {
    throw new Error(`Report guild ${report.guildId} does not match configured guild ${GUILD_ID}.`);
  }
  if (report.forumId && report.forumId !== FORUM_ID) {
    throw new Error(`Report forum ${report.forumId} does not match configured forum ${FORUM_ID}.`);
  }

  const sourceThreads = (report.threads || []).filter((item) => !item.ignored && !item.error);
  const realThreads = sourceThreads.filter((item) => !isTestThread(item.name || ''));
  const excludedTestThreads = sourceThreads.length - realThreads.length;

  const countedConvoys = [];
  const months = {};
  const statusCounts = {};
  let undatedCountedConvoys = 0;

  for (const item of realThreads) {
    increment(statusCounts, item.status || 'Unknown');

    const confirmedKingsSlot = Boolean(item.validation?.checks?.kingsSlotConfirmed);
    if (!confirmedKingsSlot) continue;

    let eventDate = null;
    let rawEventDate = null;

    try {
      const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);
      const starter = getStarterMessage(messages, item.threadId);
      const starterText = normalize(starter?.content || '');
      rawEventDate = getLabeledValue(starterText, ['Event Date', 'Convoy Date', 'Date']);
      eventDate = parseEventDate(rawEventDate);
    } catch (error) {
      console.warn(`Could not read event date for ${item.name}: ${error.message}`);
    }

    const convoy = {
      threadId: item.threadId,
      name: item.name,
      eventId: item.eventId || null,
      eventType: item.validation?.parsed?.eventType || null,
      status: item.status || 'Unknown',
      confirmedKingsSlot,
      eventDate,
      rawEventDate
    };

    countedConvoys.push(convoy);

    const month = monthKey(eventDate);
    if (!month) {
      undatedCountedConvoys += 1;
      continue;
    }

    if (!months[month]) months[month] = makeMonthStats();
    const stats = months[month];
    stats.countedConvoys += 1;
    stats[statusCounterKey(convoy.status)] += 1;
    stats.convoys.push(convoy);
  }

  const overview = {
    generatedAt: new Date().toISOString(),
    guildId: GUILD_ID,
    forumId: FORUM_ID,
    countingRule: 'Only non-test convoy threads with a confirmed Kings slot are counted in monthly statistics.',
    overall: {
      realConvoySubmissions: realThreads.length,
      countedConvoys: countedConvoys.length,
      excludedTestThreads,
      undatedCountedConvoys,
      statusesAcrossRealSubmissions: statusCounts
    },
    months,
    countedConvoys
  };

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(overview, null, 2));
  fs.writeFileSync(MARKDOWN_OUTPUT, buildMarkdown(overview));
  appendGithubSummary(overview);

  console.log('Kings Convoy Overview generated successfully.');
  console.log(`Real convoy submissions: ${overview.overall.realConvoySubmissions}`);
  console.log(`Counted confirmed-slot convoys: ${overview.overall.countedConvoys}`);
  console.log(`Excluded test threads: ${overview.overall.excludedTestThreads}`);
  console.log(`Undated counted convoys: ${overview.overall.undatedCountedConvoys}`);
  console.log(`Months: ${Object.keys(months).sort().join(', ') || 'none'}`);
}

main().catch((error) => {
  console.error('Kings Convoy Overview failed:', error.message);
  process.exit(1);
});