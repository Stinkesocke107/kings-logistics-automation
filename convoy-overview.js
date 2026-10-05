// Frozen Legacy Convoy Calendar migration is active for Overview and Driver Reminders.
const fs = require('fs');

const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';
const REPORT_PATH = 'output/convoy-check-results.json';
const JSON_OUTPUT = 'output/convoy-overview.json';
const MARKDOWN_OUTPUT = 'output/convoy-overview.md';
const LEGACY_PATH = 'data/legacy-convoys.json';

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

function loadLegacyConvoys() {
  if (!fs.existsSync(LEGACY_PATH)) {
    return { convoys: [], importedAt: null };
  }

  try {
    const data = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'));
    return {
      convoys: Array.isArray(data?.convoys) ? data.convoys : [],
      importedAt: data?.importedAt || null
    };
  } catch (error) {
    throw new Error(`Legacy Convoy data is invalid: ${error.message}`);
  }
}

function legacyStatus(item, nowUnix) {
  const unix = Number(item?.eventUnix || 0);
  const past = Number.isFinite(unix) && unix > 0
    ? unix < nowUnix - 3 * 60 * 60
    : item?.eventDate
      ? item.eventDate < new Date().toISOString().slice(0, 10)
      : false;

  if (past) return 'Legacy Past';
  return item?.confirmedKingsSlot ? 'Scheduled' : 'Needs Information';
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
  let confirmedKingsSlots = 0;

  const nowUnix = Math.floor(Date.now() / 1000);
  const newCenterEventIds = new Set(
    realThreads
      .map((item) => item.eventId ? String(item.eventId) : null)
      .filter(Boolean)
  );

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
      source: 'convoy-center',
      legacy: false,
      name: item.name,
      eventId,
      eventUrl: item.truckersmp?.url || (eventId ? `https://truckersmp.com/events/${eventId}` : null),
      eventType: parsed.eventType || null,
      status: item.status || 'Unknown',
      confirmedKingsSlot,
      kingsSlot: parsed.kingsSlot || null,
      slotStatus: confirmedKingsSlot ? 'confirmed' : 'unknown',
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
    confirmedKingsSlots += 1;

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

  const legacy = loadLegacyConvoys();
  let legacyDuplicatesSuppressed = 0;
  let legacyActiveConvoys = 0;
  let legacyConfirmedSlots = 0;
  let legacyPendingSlots = 0;

  for (const item of legacy.convoys) {
    const eventId = item.eventId ? String(item.eventId) : null;

    if (eventId && newCenterEventIds.has(eventId)) {
      legacyDuplicatesSuppressed += 1;
      continue;
    }

    const status = legacyStatus(item, nowUnix);
    const eventDate = item.eventDate || null;
    const eventUnix = Number(item.eventUnix || 0) || null;
    const eventTimeValid = Boolean(item.eventTimeValid && eventUnix);
    const confirmedKingsSlot = Boolean(item.confirmedKingsSlot);

    const convoy = {
      threadId: item.sourceThreadId || item.legacyId,
      sourceThreadId: item.sourceThreadId || null,
      sourceMonthChannelId: item.sourceMonthChannelId || null,
      sourceMonth: item.sourceMonth || null,
      source: 'legacy-calendar',
      legacy: true,
      readOnly: true,
      name: item.name || item.sourceThreadName || 'Legacy Convoy',
      eventId,
      eventUrl: item.eventUrl || (eventId ? `https://truckersmp.com/events/${eventId}` : null),
      eventType: 'Legacy Calendar',
      status,
      confirmedKingsSlot,
      kingsSlot: item.kingsSlot || null,
      slotStatus: item.slotStatus || 'unknown',
      eventDate,
      rawEventDate: eventDate,
      meetingTime: item.meetingTime || null,
      eventUnix,
      eventTimeValid,
      eventTimeZone: item.eventTimeZone || (eventTimeValid ? 'UTC' : null),
      eventTimeOffsetMinutes: eventTimeValid ? 0 : null,
      server: item.server || item.truckersmp?.server || null,
      route: item.route || null,
      meetingPoint: item.meetingPoint || item.start || null,
      start: item.start || null,
      destination: item.destination || null,
      game: item.game || item.truckersmp?.game || null,
      hostVtc: item.hostVtc || item.truckersmp?.hostVtc || null
    };

    countedConvoys.push(convoy);
    if (status !== 'Legacy Past') legacyActiveConvoys += 1;
    if (confirmedKingsSlot) {
      confirmedKingsSlots += 1;
      legacyConfirmedSlots += 1;
    } else {
      legacyPendingSlots += 1;
    }

    if (!eventTimeValid && eventDate) invalidEventTimeConvoys += 1;

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

  const upcomingConvoys = countedConvoys
    .filter((convoy) =>
      convoy.status === 'Scheduled' &&
      convoy.confirmedKingsSlot &&
      convoy.eventTimeValid &&
      Number(convoy.eventUnix) > nowUnix
    )
    .sort((a, b) => Number(a.eventUnix) - Number(b.eventUnix));

  const overview = {
    generatedAt: new Date().toISOString(),
    guildId: GUILD_ID,
    forumId: FORUM_ID,
    countingRule: 'Convoy Center confirmed-slot convoys plus the one-time frozen Legacy Calendar migration. Convoy Center Event IDs always override matching Legacy entries. Legacy pending/unknown slots stay visible as Needs Information but do not trigger Driver reminders.',
    overall: {
      realConvoySubmissions: realThreads.length,
      countedConvoys: countedConvoys.length,
      confirmedKingsSlots,
      upcomingScheduledConvoys: upcomingConvoys.length,
      excludedTestThreads,
      undatedCountedConvoys,
      invalidEventTimeConvoys,
      statusesAcrossRealSubmissions: statusCounts,
      legacyImportedConvoys: legacy.convoys.length,
      legacyActiveConvoys,
      legacyConfirmedSlots,
      legacyPendingSlots,
      legacyDuplicatesSuppressed,
      legacyImportedAt: legacy.importedAt
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
  console.log(`Tracked convoys incl. Legacy: ${overview.overall.countedConvoys}`);
  console.log(`Confirmed Kings slots: ${overview.overall.confirmedKingsSlots}`);
  console.log(`Legacy imported: ${overview.overall.legacyImportedConvoys}; active: ${overview.overall.legacyActiveConvoys}; duplicates suppressed: ${overview.overall.legacyDuplicatesSuppressed}`);
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
