const fs = require('fs');
const { parseMeetingTime, discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';
const REPORT_PATH = 'output/convoy-check-results.json';
const STATUS_MESSAGE_MARKER = '👑 **Kings Convoy Automation**';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Missing ${REPORT_PATH}. Run convoy-checker.js first.`);
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Convoy Time Display/1.1'
  };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${path}: ${text.slice(0, 500)}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalize(text = '') {
  return String(text).replace(/\r/g, '').trim();
}

function stripMarkdown(text = '') {
  return normalize(text).replace(/[*_`~]/g, '');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getFieldValue(text, labels) {
  const cleaned = stripMarkdown(text);
  const names = labels.map(escapeRegex).join('|');
  const match = cleaned.match(
    new RegExp(`(?:^|\\n)\\s*(?:[-#>]+\\s*)?(?:${names})\\s*(?::|-)\\s*([^\\n]+)`, 'i')
  );
  if (!match) return null;

  const value = match[1].trim();
  if (!value || /^(?:n\/?a|none|tbd|todo|unknown|-)$/i.test(value)) return null;
  return value;
}

function latestHumanField(messages, labels) {
  const sorted = [...(messages || [])]
    .filter((message) => !message.author?.bot)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  for (const message of sorted) {
    const value = getFieldValue(message.content || '', labels);
    if (value) {
      return {
        value,
        messageId: message.id,
        timestamp: message.timestamp || null
      };
    }
  }

  return null;
}

function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function toFourDigitYear(year) {
  const value = Number(year);
  if (String(year).length === 2) return value >= 70 ? 1900 + value : 2000 + value;
  return value;
}

function parseEventDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  let match = text.match(/^(20\d{2}|19\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!validDateParts(year, month, day)) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = toFourDigitYear(match[3]);
  if (!validDateParts(year, month, day)) return null;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function detectStatusPhrase(text = '') {
  const value = String(text).toLowerCase();
  if (/\b(cancelled|canceled)\b/.test(value)) return 'Cancelled';
  if (/\b(completed|finished)\b/.test(value)) return 'Completed';
  if (/\bneeds?\s+(?:more\s+)?information\b|\bneeds?\s+info\b|\bmissing\s+information\b/.test(value)) return 'Needs Information';
  if (/\bready\s+for\s+approval\b/.test(value)) return 'Ready for Approval';
  if (/\bsubmitted\b/.test(value)) return 'Submitted';
  if (/\b(?:scheduled|approved)\b/.test(value)) return 'Scheduled';
  return null;
}

function friendlyIssueName(issue) {
  const names = {
    eventLink: 'TruckersMP Event Link',
    eventType: 'Event Type',
    eventDate: 'Event Date (DD.MM.YYYY)',
    responsibleStaff: 'Responsible Staff',
    kingsSlotConfirmed: 'Confirmed Kings Slot',
    route: 'Route',
    meetup: 'Meeting Point',
    meetupTime: 'Meeting Time',
    meetingTimeTimezone: 'Meeting Time with timezone (example: 18:30 UTC)',
    imageProof: 'Slot / Event image proof',
    duplicateEventId: 'Duplicate TruckersMP Event ID'
  };
  return names[issue] || issue;
}

function getStatusTagConfiguration(availableTags) {
  const statusTagIds = new Map();
  const allStatusTagIds = new Set();

  for (const tag of availableTags || []) {
    const status = detectStatusPhrase(tag.name || '');
    if (!status) continue;
    allStatusTagIds.add(tag.id);
    if (!statusTagIds.has(status)) statusTagIds.set(status, tag.id);
  }

  return { statusTagIds, allStatusTagIds };
}

function deriveStatus(item) {
  const explicitStatus = item.staffStatus?.status || null;

  if (item.duplicateEventId) return 'Needs Information';
  if (!item.validation?.complete) return 'Needs Information';
  if (explicitStatus === 'Cancelled' || explicitStatus === 'Completed') return explicitStatus;
  if (explicitStatus === 'Needs Information') return 'Needs Information';
  if (explicitStatus === 'Scheduled') return 'Scheduled';
  return 'Ready for Approval';
}

function refreshDateAndTimeFromThread(item, messages) {
  if (!item.validation) return null;

  item.validation.parsed = item.validation.parsed || {};
  item.validation.checks = item.validation.checks || {};

  const dateField = latestHumanField(messages, ['Event Date', 'Convoy Date', 'Date']);
  const timeField = latestHumanField(messages, ['Meeting Time', 'Meetup Time', 'Departure Time', 'Time']);

  if (dateField) {
    item.validation.parsed.eventDateRaw = dateField.value;
    item.validation.parsed.eventDate = parseEventDate(dateField.value);
  }

  if (timeField) {
    item.validation.parsed.meetupTime = timeField.value;
  }

  const eventDate = item.validation.parsed.eventDate || null;
  const meetingTime = item.validation.parsed.meetupTime || null;
  const parsedTime = parseMeetingTime(eventDate, meetingTime);

  item.validation.checks.eventDate = Boolean(eventDate);
  item.validation.checks.meetupTime = Boolean(meetingTime);

  const existingMissing = (item.validation.missing || []).filter((issue) =>
    !['eventDate', 'meetupTime', 'meetingTimeTimezone'].includes(issue)
  );

  if (!eventDate) existingMissing.push('eventDate');
  if (!meetingTime) existingMissing.push('meetupTime');
  if (eventDate && meetingTime && !parsedTime) existingMissing.push('meetingTimeTimezone');

  item.validation.missing = [...new Set(existingMissing)];
  item.validation.complete = item.validation.missing.length === 0;

  item.eventTimeValid = Boolean(parsedTime);
  item.eventUnix = parsedTime?.unix || null;
  item.eventTimeOffsetMinutes = parsedTime?.offsetMinutes ?? null;
  item.eventTimeZone = parsedTime?.zoneLabel || null;
  item.status = deriveStatus(item);

  return {
    parsedTime,
    dateField,
    timeField
  };
}

function buildStatusMessage(item) {
  const issues = [
    ...(item.validation?.missing || []),
    ...(item.duplicateEventId ? ['duplicateEventId'] : [])
  ];

  const validationLine = issues.length === 0
    ? '✅ **Validation:** All required information is complete.'
    : `⚠️ **Missing / Issue:** ${issues.map(friendlyIssueName).join(', ')}`;

  let approvalLine = 'ℹ️ **Approval:** No authorized staff status has been detected yet.';
  if (item.status === 'Ready for Approval') {
    approvalLine = '⏳ **Approval:** Waiting for Event Team / CEO approval.';
  } else if (item.staffStatus?.authorId) {
    approvalLine = '✅ **Staff status:** Recognized from an authorized Kings role.';
  }

  const eventLine = item.eventId ? `🔗 **TruckersMP Event ID:** ${item.eventId}` : null;
  const eventTimeLine = item.eventUnix
    ? `🕒 **Event Time:** ${discordTimestamp(item.eventUnix, 'F')} · ${discordTimestamp(item.eventUnix, 'R')}`
    : null;

  return [
    STATUS_MESSAGE_MARKER,
    '',
    `**Status:** \`${item.status}\``,
    validationLine,
    approvalLine,
    eventLine,
    eventTimeLine,
    '',
    '🤖 This is the single automated status message for this convoy. It is checked every 15 minutes and updated only when something changes.'
  ].filter(Boolean).join('\n');
}

async function syncStatusMessage(item, messages, botId) {
  const content = buildStatusMessage(item);
  const existing = (messages || []).find((message) =>
    message.author?.id === botId &&
    (message.content || '').includes(STATUS_MESSAGE_MARKER)
  );

  if (!existing) {
    const created = await discord(`/channels/${item.threadId}/messages`, {
      method: 'POST',
      body: {
        content,
        allowed_mentions: { parse: [] }
      }
    });
    return { action: 'created', messageId: created?.id || null };
  }

  if (normalize(existing.content || '') === normalize(content)) {
    return { action: 'unchanged', messageId: existing.id };
  }

  await discord(`/channels/${item.threadId}/messages/${existing.id}`, {
    method: 'PATCH',
    body: {
      content,
      allowed_mentions: { parse: [] }
    }
  });

  return { action: 'updated', messageId: existing.id };
}

async function syncStatusTag(item, forum, thread) {
  const { statusTagIds, allStatusTagIds } = getStatusTagConfiguration(forum.available_tags || []);
  const targetTagId = statusTagIds.get(item.status);
  if (!targetTagId) return { action: 'skipped', reason: 'missing-status-tag' };

  const current = [...(thread.applied_tags || [])];
  const preserved = current.filter((tagId) => !allStatusTagIds.has(tagId));
  const desired = [...preserved, targetTagId];

  if (desired.length > 5) return { action: 'skipped', reason: 'too-many-tags' };

  const sameSet = current.length === desired.length && current.every((tagId) => desired.includes(tagId));
  if (sameSet) return { action: 'unchanged', tagId: targetTagId };

  await discord(`/channels/${item.threadId}`, {
    method: 'PATCH',
    body: { applied_tags: desired }
  });

  return { action: 'updated', tagId: targetTagId };
}

function statusKey(status) {
  return String(status || 'Unknown').replace(/\s+/g, '').replace(/^./, (char) => char.toLowerCase());
}

function refreshReportSummary(report) {
  const counts = {};
  for (const item of report.threads || []) {
    if (item.ignored || item.error || !item.status) continue;
    const key = statusKey(item.status);
    counts[key] = (counts[key] || 0) + 1;
  }
  report.summary = report.summary || {};
  report.summary.statuses = counts;
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const bot = await discord('/users/@me');
  const forum = await discord(`/channels/${FORUM_ID}`);

  if (forum.guild_id !== GUILD_ID) {
    throw new Error(`Forum ${FORUM_ID} does not belong to guild ${GUILD_ID}.`);
  }

  let changedReport = false;

  for (const item of report.threads || []) {
    if (item.ignored || item.error) continue;
    if (item.archived || item.locked) continue;

    try {
      const thread = await discord(`/channels/${item.threadId}`);
      const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);

      const before = JSON.stringify({
        eventDate: item.validation?.parsed?.eventDate || null,
        eventDateRaw: item.validation?.parsed?.eventDateRaw || null,
        meetupTime: item.validation?.parsed?.meetupTime || null,
        missing: item.validation?.missing || [],
        status: item.status || null,
        eventUnix: item.eventUnix || null
      });

      const refreshed = refreshDateAndTimeFromThread(item, messages);

      const after = JSON.stringify({
        eventDate: item.validation?.parsed?.eventDate || null,
        eventDateRaw: item.validation?.parsed?.eventDateRaw || null,
        meetupTime: item.validation?.parsed?.meetupTime || null,
        missing: item.validation?.missing || [],
        status: item.status || null,
        eventUnix: item.eventUnix || null
      });

      if (before !== after) changedReport = true;

      const messageResult = await syncStatusMessage(item, messages, bot.id);
      const tagResult = await syncStatusTag(item, forum, thread);

      console.log(
        `- ${item.name} | Status: ${item.status} | Date source: ${refreshed?.dateField?.messageId || 'existing report'} | Time source: ${refreshed?.timeField?.messageId || 'existing report'} | Message: ${messageResult.action} | Tag: ${tagResult.action}`
      );
    } catch (error) {
      console.warn(`- Time display failed | ${item.name} | ${error.message}`);
    }
  }

  refreshReportSummary(report);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Kings Convoy Time Display finished. Report updated: ${changedReport ? 'yes' : 'no'}.`);
}

main().catch((error) => {
  console.error('Kings Convoy Time Display failed:', error.message);
  process.exit(1);
});
