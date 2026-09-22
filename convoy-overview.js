const fs = require('fs');

const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';
const REPORT_PATH = 'output/convoy-check-results.json';
const JSON_OUTPUT = 'output/convoy-overview.json';
const MARKDOWN_OUTPUT = 'output/convoy-overview.md';

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Missing ${REPORT_PATH}. Run convoy-checker.js first.`);
  process.exit(1);
}

function isTestThread(item) {
  if (typeof item.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item.name || '');
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
    Scheduled: 'scheduled',
    Completed: 'completed',
    Cancelled: 'cancelled',
    'Needs Information': 'needsInformation',
    'Ready for Approval': 'readyForApproval',
    Submitted: 'submitted'
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
    `- Convoys with confirmed Kings slot: **${overview.overall.countedConvoys}**`,
    `- Upcoming scheduled convoys: **${overview.overall.upcomingScheduledConvoys}**`,
    `- Excluded test threads: **${overview.overall.excludedTestThreads}**`,
    `- Confirmed-slot convoys awaiting a valid Event Date: **${overview.overall.undatedCountedConvoys}**`,
    `- Confirmed-slot convoys awaiting a valid timezone: **${overview.overall.invalidEventTimeConvoys}**`,
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

  lines.push('', '## Counted convoys', '', '| Date | Time | Convoy | Status | Server | Route | Event ID |', '|---|---|---|---|---|---|---|');

  if (overview.countedConvoys.length === 0) {
    lines.push('| — | — | No counted convoys yet | — | — | — | — |');
  } else {
    for (const convoy of [...overview.countedConvoys].sort((a, b) =>
      Number(b.eventUnix || 0) - Number(a.eventUnix || 0)
    )) {
      lines.push(
        `| ${escapeTable(convoy.eventDate || 'Awaiting valid date')} | ${escapeTable(convoy.meetingTime || 'Awaiting valid time')} | ${escapeTable(convoy.name)} | ${escapeTable(convoy.status)} | ${escapeTable(convoy.server || '—')} | ${escapeTable(convoy.route || '—')} | ${escapeTable(convoy.eventId || '—')} |`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function appendGithubSummary(overview) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = overview.months[currentMonth] || makeMonthStats();
  const next = overview.upcomingConvoys?.[0] || null;
  const lines = [
    '',
    '# Kings Convoy Monthly Overview',
    '',
    `Current month: **${currentMonth}**`,
    '',
    `Counted convoys: **${month.countedConvoys}** · Scheduled: **${month.scheduled}** · Completed: **${month.completed}** · Cancelled: **${month.cancelled}**`,
    '',
    next ? `Next convoy: **${next.name}** · ${next.server || 'Server unavailable'}` : 'Next convoy: **None scheduled**',
    '',
    `Awaiting valid Event Date: **${overview.overall.undatedCountedConvoys}** · Awaiting valid timezone: **${overview.overall.invalidEventTimeConvoys}**`,
    ''
  ];

  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

  if (report.guildId && report.guildId !== GUILD_ID) {
    throw new Error(`Report guild ${report.guildId} does not match configured guild ${GUILD_ID}.`);
  }
  if (report.forumId && report.forumId !== FORUM_ID) {
    throw new Error(`Report forum ${report.forumId} does not match configured forum ${FORUM_ID}.`);
  }

  const sourceThreads = (report.threads || []).filter((item) => !item.ignored && !item.error);
  const realThreads = sourceThreads.filter((item) => !isTestThread(item));
  const excludedTestThreads = sourceThreads.length - realThreads.length;

  const countedConvoys = [];
  const months = {};
  const statusCounts = {};
  let undatedCountedConvoys = 0;
  let invalidEventTimeConvoys = 0;

  for (const item of realThreads) {
    increment(statusCounts, item.status || 'Unknown');

    const confirmedKingsSlot = Boolean(item.validation?.checks?.kingsSlotConfirmed);
    if (!confirmedKingsSlot) continue;

    const parsed = item.validation?.parsed || {};
    const eventDate = parsed.eventDate || null;
    const rawEventDate = parsed.eventDateRaw || null;
    const meetingTime = parsed.meetupTime || null;
    const eventUnix = item.eventUnix || null;
    const eventTimeValid = Boolean(item.eventTimeValid && eventUnix);
    const eventId = item.eventId || null;

    const convoy = {
      threadId: item.threadId,
      name: item.name,
      eventId,
      eventUrl: item.truckersmp?.url || (eventId ? `https://truckersmp.com/events/${eventId}` : null),
      eventType: parsed.eventType || null,
      status: item.status || 'Unknown',
      confirmedKingsSlot,
      kingsSlot: parsed.kingsSlot || null,
      eventDate,
      rawEventDate,
      meetingTime,
      eventUnix,
      eventTimeValid,
      eventTimeZone: item.eventTimeZone || null,
      eventTimeOffsetMinutes: item.eventTimeOffsetMinutes ?? null,
      server: item.truckersmp?.server || parsed.server || null,
      route: parsed.route || (parsed.start && parsed.destination ? `${parsed.start} → ${parsed.destination}` : null),
      meetingPoint: parsed.meetup || null,
      start: parsed.start || null,
      destination: parsed.destination || null,
      game: item.truckersmp?.game || null,
      hostVtc: item.truckersmp?.hostVtc || null
    };

    countedConvoys.push(convoy);

    if (!eventTimeValid && eventDate && meetingTime) invalidEventTimeConvoys += 1;

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

  const nowUnix = Math.floor(Date.now() / 1000);
  const upcomingConvoys = countedConvoys
    .filter((convoy) => convoy.status === 'Scheduled' && convoy.eventTimeValid && Number(convoy.eventUnix) > nowUnix)
    .sort((a, b) => Number(a.eventUnix) - Number(b.eventUnix));

  const overview = {
    generatedAt: new Date().toISOString(),
    guildId: GUILD_ID,
    forumId: FORUM_ID,
    countingRule: 'Monthly statistics only include non-test convoy threads with a confirmed Kings slot and a validated Event Date.',
    overall: {
      realConvoySubmissions: realThreads.length,
      countedConvoys: countedConvoys.length,
      upcomingScheduledConvoys: upcomingConvoys.length,
      excludedTestThreads,
      undatedCountedConvoys,
      invalidEventTimeConvoys,
      statusesAcrossRealSubmissions: statusCounts
    },
    months,
    upcomingConvoys,
    countedConvoys
  };

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(overview, null, 2));
  fs.writeFileSync(MARKDOWN_OUTPUT, buildMarkdown(overview));
  appendGithubSummary(overview);

  console.log('Kings Convoy Overview generated successfully.');
  console.log(`Real convoy submissions: ${overview.overall.realConvoySubmissions}`);
  console.log(`Confirmed-slot convoys: ${overview.overall.countedConvoys}`);
  console.log(`Upcoming scheduled convoys: ${overview.overall.upcomingScheduledConvoys}`);
  console.log(`Excluded test threads: ${overview.overall.excludedTestThreads}`);
  console.log(`Awaiting valid Event Date: ${overview.overall.undatedCountedConvoys}`);
  console.log(`Awaiting valid timezone: ${overview.overall.invalidEventTimeConvoys}`);
  console.log(`Months: ${Object.keys(months).sort().join(', ') || 'none'}`);
}

try {
  main();
} catch (error) {
  console.error('Kings Convoy Overview failed:', error.message);
  process.exit(1);
}
