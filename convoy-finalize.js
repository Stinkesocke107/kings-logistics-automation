require('./kings-branding').installDiscordBranding();
const { brandMessageContent } = require('./kings-branding');
const fs = require('fs');
const { parseMeetingTime, discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';
const REPORT_PATH = 'output/convoy-check-results.json';
const STATUS_MESSAGE_TEXT = 'Kings Convoy Automation';
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
    'User-Agent': 'Kings Logistics Convoy Finalizer/1.0'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${path}: ${text.slice(0, 500)}`);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
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
  if (!value || /^(?:n\/?a|none|tbd|todo|unknown|-|hh:mm(?:\s+utc)?)$/i.test(value)) return null;
  return value;
}

function latestHumanField(messages, labels) {
  const sorted = [...(messages || [])]
    .filter((message) => !message.author?.bot)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  for (const message of sorted) {
    const value = getFieldValue(message.content || '', labels);
    if (value) return { value, messageId: message.id, timestamp: message.timestamp || null };
  }
  return null;
}

function latestHumanEventLink(messages) {
  const sorted = [...(messages || [])]
    .filter((message) => !message.author?.bot)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  for (const message of sorted) {
    const match = String(message.content || '').match(/https?:\/\/(?:www\.)?truckersmp\.com\/events\/(\d+)/i);
    if (match) {
      return {
        eventId: match[1],
        url: `https://truckersmp.com/events/${match[1]}`,
        messageId: message.id,
        timestamp: message.timestamp || null
      };
    }
  }
  return null;
}

function isResponsibleStaff(value = '') {
  return /<@!?\d+>/.test(String(value));
}

function isConfirmedSlot(value = '') {
  const text = String(value).trim();
  if (!text) return false;
  if (/\b(?:not\s+confirmed|unconfirmed|pending|waiting|requested|request|tbd|unknown|none|no)\b/i.test(text)) return false;
  return (
    /\bconfirmed\b[\s\S]*\bslot\s*[#:-]?\s*\d+\b/i.test(text) ||
    /\bslot\s*[#:-]?\s*\d+\b[\s\S]*\bconfirmed\b/i.test(text)
  );
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

function statusKey(status) {
  return String(status || 'Unknown').replace(/\s+/g, '').replace(/^./, (char) => char.toLowerCase());
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

function friendlyIssueName(issue) {
  const names = {
    eventLink: 'TruckersMP Event Link',
    responsibleStaff: 'Responsible Staff (@mention)',
    kingsSlotConfirmed: 'Confirmed Kings Slot with slot number',
    truckersmpSync: 'TruckersMP event data unavailable',
    eventDate: 'Event Date unavailable from TruckersMP',
    route: 'Route unavailable from TruckersMP',
    meetup: 'Meeting Point unavailable from TruckersMP',
    meetupTime: 'Meeting Time unavailable from TruckersMP',
    meetingTimeTimezone: 'Kings Meeting Time override needs a timezone (example: 18:30 UTC)',
    duplicateEventId: 'Duplicate TruckersMP Event ID'
  };
  return names[issue] || issue;
}

function applyFinalFields(item, messages) {
  item.validation = item.validation || {};
  item.validation.parsed = item.validation.parsed || {};
  const parsed = item.validation.parsed;
  const sources = {};

  const eventLink = latestHumanEventLink(messages);
  if (eventLink) {
    item.eventId = eventLink.eventId;
    sources.eventLink = eventLink;
  }

  const responsibleStaff = latestHumanField(messages, ['Responsible Staff', 'Responsible Person', 'Staff', 'Organizer']);
  const kingsSlot = latestHumanField(messages, ['Kings Slot', 'Slot Confirmation', 'Confirmed Slot', 'Slot Number', 'Slot']);
  const routeOverride = latestHumanField(messages, ['Route']);
  const meetupOverride = latestHumanField(messages, ['Meeting Point', 'Meeting Location', 'Meetup', 'Meetup Point']);
  const meetupTimeOverride = latestHumanField(messages, ['Meeting Time', 'Meetup Time']);
  const notesOverride = latestHumanField(messages, ['Additional Notes', 'Notes']);

  if (responsibleStaff) {
    parsed.responsibleStaff = responsibleStaff.value;
    sources.responsibleStaff = responsibleStaff;
  }
  if (kingsSlot) {
    parsed.kingsSlot = kingsSlot.value;
    sources.kingsSlot = kingsSlot;
  }

  const tmpOk = Boolean(item.truckersmpSync?.ok && item.truckersmpSync?.authoritative && item.truckersmp?.authoritative);
  const authoritative = tmpOk ? item.truckersmp.authoritative : null;

  if (authoritative) {
    for (const key of ['eventType', 'route', 'start', 'destination', 'meetup', 'meetupTime']) {
      const value = authoritative[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') parsed[key] = value;
    }
    if (authoritative.eventDate) {
      parsed.eventDate = authoritative.eventDate;
      parsed.eventDateRaw = authoritative.eventDate;
    }
    sources.truckersmp = {
      eventId: item.eventId || item.truckersmp?.id || null,
      syncedAt: item.truckersmpSync?.syncedAt || null,
      authoritative: true
    };
  }

  if (routeOverride) {
    parsed.route = routeOverride.value;
    sources.routeOverride = routeOverride;
  }
  if (meetupOverride) {
    parsed.meetup = meetupOverride.value;
    sources.meetupOverride = meetupOverride;
  }
  if (meetupTimeOverride) {
    parsed.meetupTime = meetupTimeOverride.value;
    sources.meetupTimeOverride = meetupTimeOverride;
  }
  if (notesOverride) {
    parsed.additionalNotes = notesOverride.value;
    sources.additionalNotes = notesOverride;
  }

  const eventDate = parsed.eventDate || null;
  const meetingTime = parsed.meetupTime || null;
  const parsedTime = parseMeetingTime(eventDate, meetingTime);

  const checks = {
    eventLink: Boolean(eventLink),
    responsibleStaff: isResponsibleStaff(parsed.responsibleStaff),
    kingsSlotConfirmed: isConfirmedSlot(parsed.kingsSlot),
    truckersmpSync: tmpOk,
    eventDate: Boolean(eventDate),
    route: Boolean(parsed.route || (parsed.start && parsed.destination)),
    meetup: Boolean(parsed.meetup),
    meetupTime: Boolean(meetingTime)
  };

  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  if (eventDate && meetingTime && !parsedTime) missing.push('meetingTimeTimezone');

  item.validation.checks = checks;
  item.validation.missing = [...new Set(missing)];
  item.validation.complete = item.validation.missing.length === 0;
  item.eventTimeValid = Boolean(parsedTime);
  item.eventUnix = parsedTime?.unix || null;
  item.eventTimeOffsetMinutes = parsedTime?.offsetMinutes ?? null;
  item.eventTimeZone = parsedTime?.zoneLabel || null;
  item.manualRequirements = {
    eventLink: Boolean(eventLink),
    responsibleStaff: isResponsibleStaff(parsed.responsibleStaff),
    kingsSlotConfirmed: isConfirmedSlot(parsed.kingsSlot)
  };
  item.kingsOverrides = {
    route: routeOverride?.value || null,
    meetingPoint: meetupOverride?.value || null,
    meetingTime: meetupTimeOverride?.value || null,
    additionalNotes: notesOverride?.value || null
  };

  return { parsedTime, sources };
}

function deriveStatus(item) {
  const explicitStatus = item.staffStatus?.status || null;
  if (explicitStatus === 'Cancelled' || explicitStatus === 'Completed') return explicitStatus;
  if (item.duplicateEventId) return 'Needs Information';
  if (!item.validation?.complete) return 'Needs Information';
  if (explicitStatus === 'Needs Information') return 'Needs Information';
  if (explicitStatus === 'Scheduled') return 'Scheduled';
  return 'Ready for Approval';
}

function buildStatusMessage(item) {
  const issues = [
    ...(item.validation?.missing || []),
    ...(item.duplicateEventId ? ['duplicateEventId'] : [])
  ];
  const parsed = item.validation?.parsed || {};
  const validationLine = issues.length === 0
    ? '✅ **Validation:** TruckersMP data loaded and all required Kings information is complete.'
    : `⚠️ **Missing / Issue:** ${issues.map(friendlyIssueName).join(', ')}`;

  let approvalLine = 'ℹ️ **Approval:** No authorized staff status has been detected yet.';
  if (item.status === 'Ready for Approval') {
    approvalLine = '⏳ **Approval:** Waiting for Event Team / CEO approval.';
  } else if (item.staffStatus?.authorId) {
    approvalLine = '✅ **Staff status:** Recognized from an authorized Kings role.';
  }

  const tmpDisplay = Boolean(item.truckersmpSync?.ok && item.truckersmpSync?.authoritative);
  return [
    STATUS_MESSAGE_MARKER,
    '',
    `**Status:** \`${item.status}\``,
    validationLine,
    approvalLine,
    item.eventId ? `🔗 **TruckersMP Event ID:** ${item.eventId}` : null,
    tmpDisplay ? `🌐 **Event Source:** TruckersMP Event #${item.eventId || item.truckersmp?.id} · authoritative` : null,
    parsed.eventType ? `📋 **Event Type:** ${parsed.eventType}` : null,
    parsed.eventDate ? `📅 **Event Date:** ${parsed.eventDate}` : null,
    parsed.route ? `🛣️ **Route:** ${parsed.route}` : null,
    parsed.meetup ? `📍 **Meeting Point:** ${parsed.meetup}` : null,
    (item.truckersmp?.game || item.truckersmp?.server)
      ? `🎮 **Game / Server:** ${[item.truckersmp?.game, item.truckersmp?.server].filter(Boolean).join(' · ')}`
      : null,
    item.eventUnix ? `🕒 **Meeting Time:** ${discordTimestamp(item.eventUnix, 'F')} · ${discordTimestamp(item.eventUnix, 'R')}` : null,
    parsed.responsibleStaff ? `👤 **Responsible Staff:** ${parsed.responsibleStaff}` : null,
    parsed.kingsSlot ? `🚚 **Kings Slot:** ${parsed.kingsSlot}` : null,
    parsed.additionalNotes ? `📝 **Additional Notes:** ${parsed.additionalNotes}` : null,
    '',
    '🤖 This is the single automated status message for this convoy. It is checked every 15 minutes and updated only when something changes.'
  ].filter(Boolean).join('\n');
}

async function syncStatusMessage(item, messages, botId) {
  if (item.archived || item.locked) return { action: 'skipped', reason: item.archived ? 'archived-thread' : 'locked-thread' };

  const statusMessages = (messages || [])
    .filter((message) => message.author?.id === botId && String(message.content || '').includes(STATUS_MESSAGE_TEXT))
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  const content = buildStatusMessage(item);
  const expectedStoredContent = brandMessageContent(content);
  let canonical = statusMessages[0] || null;
  let action = 'unchanged';

  if (!canonical) {
    canonical = await discord(`/channels/${item.threadId}/messages`, {
      method: 'POST',
      body: { content, allowed_mentions: { parse: [] } }
    });
    action = 'created';
  } else if (normalize(canonical.content || '') !== normalize(expectedStoredContent)) {
    canonical = await discord(`/channels/${item.threadId}/messages/${canonical.id}`, {
      method: 'PATCH',
      body: { content, allowed_mentions: { parse: [] } }
    });
    action = 'updated';
  }

  let removedDuplicates = 0;
  for (const duplicate of statusMessages.slice(1)) {
    await discord(`/channels/${item.threadId}/messages/${duplicate.id}`, { method: 'DELETE' });
    removedDuplicates += 1;
  }

  return { action, messageId: canonical?.id || null, removedDuplicates };
}

async function syncStatusTag(item, thread, statusTagIds, allStatusTagIds) {
  if (item.archived || item.locked) return { action: 'skipped', reason: item.archived ? 'archived-thread' : 'locked-thread' };
  const targetTagId = statusTagIds.get(item.status);
  if (!targetTagId) return { action: 'skipped', reason: 'missing-status-tag' };

  const current = [...(thread.applied_tags || [])];
  const preserved = current.filter((tagId) => !allStatusTagIds.has(tagId));
  const desired = [...preserved, targetTagId];
  if (desired.length > 5) return { action: 'skipped', reason: 'too-many-tags' };

  const sameSet = current.length === desired.length && current.every((tagId) => desired.includes(tagId));
  if (sameSet) return { action: 'unchanged', tagId: targetTagId };

  await discord(`/channels/${item.threadId}`, { method: 'PATCH', body: { applied_tags: desired } });
  item.appliedTagIds = desired;
  return { action: 'updated', tagId: targetTagId };
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
  if (forum.guild_id && forum.guild_id !== GUILD_ID) {
    throw new Error(`Forum ${FORUM_ID} does not belong to guild ${GUILD_ID}.`);
  }

  const { statusTagIds, allStatusTagIds } = getStatusTagConfiguration(forum.available_tags || []);
  let failed = 0;
  let changed = false;

  for (const item of report.threads || []) {
    if (item.ignored || item.error || item.archived || item.locked) continue;

    try {
      const thread = await discord(`/channels/${item.threadId}`);
      const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);
      const before = JSON.stringify({
        eventId: item.eventId || null,
        parsed: item.validation?.parsed || {},
        checks: item.validation?.checks || {},
        missing: item.validation?.missing || [],
        status: item.status || null,
        eventUnix: item.eventUnix || null
      });

      const result = applyFinalFields(item, messages);
      item.status = deriveStatus(item);

      item.discordStatusSync = await syncStatusMessage(item, messages, bot.id);
      item.forumTagSync = await syncStatusTag(item, thread, statusTagIds, allStatusTagIds);
      item.finalizedAt = new Date().toISOString();

      const after = JSON.stringify({
        eventId: item.eventId || null,
        parsed: item.validation?.parsed || {},
        checks: item.validation?.checks || {},
        missing: item.validation?.missing || [],
        status: item.status || null,
        eventUnix: item.eventUnix || null
      });
      if (before !== after) changed = true;

      console.log(
        `- ${item.name} | Status: ${item.status} | Manual: ${JSON.stringify(item.manualRequirements)} | ` +
        `TMP: ${item.truckersmpSync?.ok ? 'loaded' : 'unavailable'} | Message: ${item.discordStatusSync.action} | ` +
        `Duplicates removed: ${item.discordStatusSync.removedDuplicates || 0} | Tag: ${item.forumTagSync.action} | ` +
        `Overrides: ${Object.values(item.kingsOverrides || {}).filter(Boolean).length}`
      );
      if (result.sources.meetupTimeOverride) {
        console.log(`  Kings Meeting Time override source message: ${result.sources.meetupTimeOverride.messageId}`);
      }
    } catch (error) {
      failed += 1;
      console.warn(`- Convoy finalization failed | ${item.name} | ${error.message}`);
    }
  }

  refreshReportSummary(report);
  report.finalization = {
    mode: 'TRUCKERSMP_FIRST_WITH_KINGS_OVERRIDES',
    manualRequired: ['TruckersMP Event Link', 'Responsible Staff @mention', 'Kings Slot: Confirmed — Slot [Number]'],
    optionalOverrides: ['Meeting Point', 'Meeting Time', 'Route', 'Additional Notes'],
    changed,
    finalizedAt: new Date().toISOString()
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Kings Convoy Finalizer finished. Changed: ${changed ? 'yes' : 'no'}. Failed: ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Kings Convoy Finalizer failed:', error.message);
  process.exit(1);
});
