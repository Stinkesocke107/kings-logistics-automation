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
    'User-Agent': 'Kings Logistics Convoy Time Display/1.0'
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

async function syncStatusTag(item, forum, thread) {
  const { statusTagIds, allStatusTagIds } = getStatusTagConfiguration(forum.available_tags || []);
  const targetTagId = statusTagIds.get(item.status);
  if (!targetTagId) return { action: 'skipped', reason: 'missing-status-tag' };

  const current = [...(thread.applied_tags || [])];
  const preserved = current.filter((tagId) => !allStatusTagIds.has(tagId));
  const desired = [...preserved, targetTagId];

  const sameSet = current.length === desired.length && current.every((tagId) => desired.includes(tagId));
  if (sameSet) return { action: 'unchanged', tagId: targetTagId };

  await discord(`/channels/${item.threadId}`, {
    method: 'PATCH',
    body: { applied_tags: desired }
  });

  return { action: 'updated', tagId: targetTagId };
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

    const eventDate = item.validation?.parsed?.eventDate || null;
    const meetingTime = item.validation?.parsed?.meetupTime || null;
    const parsedTime = parseMeetingTime(eventDate, meetingTime);

    item.eventTimeValid = Boolean(parsedTime);
    item.eventUnix = parsedTime?.unix || null;
    item.eventTimeOffsetMinutes = parsedTime?.offsetMinutes ?? null;
    item.eventTimeZone = parsedTime?.zoneLabel || null;

    if (eventDate && meetingTime && !parsedTime) {
      const missing = item.validation?.missing || [];
      if (!missing.includes('meetingTimeTimezone')) missing.push('meetingTimeTimezone');
      if (item.validation) {
        item.validation.missing = missing;
        item.validation.complete = false;
      }

      if (!['Completed', 'Cancelled'].includes(item.status)) {
        item.status = 'Needs Information';
      }
      changedReport = true;
    }

    if (parsedTime && item.validation?.missing?.includes('meetingTimeTimezone')) {
      item.validation.missing = item.validation.missing.filter((issue) => issue !== 'meetingTimeTimezone');
      item.validation.complete = item.validation.missing.length === 0;
      changedReport = true;
    }

    if (item.archived || item.locked) continue;

    try {
      const thread = await discord(`/channels/${item.threadId}`);
      const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);
      const existing = (messages || []).find((message) =>
        message.author?.id === bot.id &&
        (message.content || '').includes(STATUS_MESSAGE_MARKER)
      );

      if (existing) {
        const content = buildStatusMessage(item);
        if (normalize(existing.content || '') !== normalize(content)) {
          await discord(`/channels/${item.threadId}/messages/${existing.id}`, {
            method: 'PATCH',
            body: {
              content,
              allowed_mentions: { parse: [] }
            }
          });
          console.log(`- Updated timestamp display | ${item.name}`);
        }
      }

      if (eventDate && meetingTime && !parsedTime && !['Completed', 'Cancelled'].includes(item.status)) {
        const tagResult = await syncStatusTag(item, forum, thread);
        console.log(`- Time validation tag sync | ${item.name} | ${tagResult.action}`);
      }
    } catch (error) {
      console.warn(`- Time display failed | ${item.name} | ${error.message}`);
    }
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Kings Convoy Time Display finished. Report updated: ${changedReport ? 'yes' : 'no'}.`);
}

main().catch((error) => {
  console.error('Kings Convoy Time Display failed:', error.message);
  process.exit(1);
});
