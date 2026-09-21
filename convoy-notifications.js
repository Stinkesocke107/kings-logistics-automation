const fs = require('fs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';
const REPORT_PATH = 'output/convoy-check-results.json';

const READY_NOTIFICATION_MARKER = '🔔 **Kings Convoy Notification — Ready for Approval**';
const NEEDS_INFO_NOTIFICATION_MARKER = '⚠️ **Kings Convoy Notification — Needs Information**';

const APPROVAL_ROLE_IDS = [
  '1378658861816217600',
  '1363949241138941952',
  '1492930716156166165',
  '1492930713459364031',
  '1199767340787703828',
  '1433646186778329228',
  '1492929616019718285',
  '1114967608920395866'
];

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Missing ${REPORT_PATH}. Run convoy-checker.js and convoy-time-display.js first.`);
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Convoy Notifications/2.0'
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

function isTestThread(item) {
  if (typeof item?.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item?.name || '');
}

function botMessagesWithMarker(messages, botId, marker) {
  return (messages || []).filter((message) =>
    message.author?.id === botId &&
    (message.content || '').includes(marker)
  );
}

function alreadyNotified(messages, botId, marker) {
  return botMessagesWithMarker(messages, botId, marker).length > 0;
}

async function deleteNotifications(threadId, messages, botId, marker) {
  const matches = botMessagesWithMarker(messages, botId, marker);
  let deleted = 0;

  for (const message of matches) {
    await discord(`/channels/${threadId}/messages/${message.id}`, { method: 'DELETE' });
    deleted += 1;
  }

  return deleted;
}

function friendlyIssueName(issue) {
  const names = {
    eventLink: 'TruckersMP Event Link / Event ID',
    eventType: 'Event Type',
    eventDate: 'Event Date',
    responsibleStaff: 'Responsible Staff',
    kingsSlotConfirmed: 'Confirmed Kings Slot',
    route: 'Route',
    meetup: 'Meeting Point',
    meetupTime: 'Meeting Time',
    meetingTimeTimezone: 'Meeting Time with timezone',
    imageProof: 'Slot / Event image proof',
    duplicateEventId: 'Duplicate TruckersMP Event ID'
  };
  return names[issue] || issue;
}

function missingIssues(item) {
  return [
    ...(item.validation?.missing || []),
    ...(item.duplicateEventId ? ['duplicateEventId'] : [])
  ].map(friendlyIssueName);
}

async function sendReadyForApproval(thread, item, messages, botId) {
  if (alreadyNotified(messages, botId, READY_NOTIFICATION_MARKER)) {
    return { action: 'already-sent', type: 'ready-for-approval' };
  }

  const roleMentions = APPROVAL_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(' ');
  const eventId = item.eventId || null;

  const content = [
    READY_NOTIFICATION_MARKER,
    '',
    roleMentions,
    '',
    'A convoy is ready for review.',
    `**Convoy:** ${thread.name}`,
    eventId ? `**TruckersMP Event ID:** ${eventId}` : null,
    '',
    'Please review the convoy and post `Approved` if it is ready to be scheduled.',
    'This notification is sent only once for this convoy.'
  ].filter(Boolean).join('\n');

  const sent = await discord(`/channels/${thread.id}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: {
        parse: [],
        roles: APPROVAL_ROLE_IDS
      }
    }
  });

  return {
    action: 'sent',
    type: 'ready-for-approval',
    messageId: sent?.id || null
  };
}

async function sendNeedsInformation(thread, item, messages, botId) {
  if (alreadyNotified(messages, botId, NEEDS_INFO_NOTIFICATION_MARKER)) {
    return { action: 'already-sent', type: 'needs-information' };
  }

  const ownerId = thread.owner_id || item.ownerId || item.starterAuthorId || null;
  const ownerMention = ownerId ? `<@${ownerId}>` : null;
  const issues = missingIssues(item);
  const eventId = item.eventId || null;

  const content = [
    NEEDS_INFO_NOTIFICATION_MARKER,
    '',
    ownerMention,
    '',
    'This convoy is missing required information.',
    `**Convoy:** ${thread.name}`,
    eventId ? `**TruckersMP Event ID:** ${eventId}` : null,
    issues.length ? `**Missing / Issue:** ${issues.join(', ')}` : null,
    '',
    'Please update the convoy entry so it can continue through the approval process.',
    'This notification is sent only once for this convoy.'
  ].filter(Boolean).join('\n');

  const allowedMentions = { parse: [] };
  if (ownerId) allowedMentions.users = [ownerId];

  const sent = await discord(`/channels/${thread.id}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: allowedMentions
    }
  });

  return {
    action: 'sent',
    type: 'needs-information',
    messageId: sent?.id || null
  };
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const finalByThreadId = new Map(
    (report.threads || [])
      .filter((item) => item?.threadId)
      .map((item) => [item.threadId, item])
  );

  const bot = await discord('/users/@me');
  const activeData = await discord(`/guilds/${GUILD_ID}/threads/active`);
  const threads = (activeData.threads || []).filter((thread) => thread.parent_id === FORUM_ID);

  console.log('Kings Convoy Notifications started from finalized convoy report.');
  console.log(`Active convoy threads: ${threads.length}`);

  for (const thread of threads) {
    if (/\btemplate\b/i.test(thread.name || '')) {
      console.log(`- IGNORED | ${thread.name} | template`);
      continue;
    }

    const item = finalByThreadId.get(thread.id);
    if (!item || item.ignored || item.error || isTestThread(item)) {
      console.log(`- SKIPPED | ${thread.name} | no production-ready finalized report item`);
      continue;
    }

    try {
      const messages = await discord(`/channels/${thread.id}/messages?limit=100`);
      const status = item.status || null;

      // Remove stale Needs Information notices when the finalized post-sync status is no longer missing data.
      let staleNeedsInfoDeleted = 0;
      if (status !== 'Needs Information') {
        staleNeedsInfoDeleted = await deleteNotifications(
          thread.id,
          messages,
          bot.id,
          NEEDS_INFO_NOTIFICATION_MARKER
        );
      }

      // If a convoy falls back to Needs Information after previously being ready, remove the obsolete approval notice.
      let staleReadyDeleted = 0;
      if (status === 'Needs Information') {
        staleReadyDeleted = await deleteNotifications(
          thread.id,
          messages,
          bot.id,
          READY_NOTIFICATION_MARKER
        );
      }

      // Refresh message list after cleanup so duplicate protection uses the live state.
      const currentMessages = (staleNeedsInfoDeleted || staleReadyDeleted)
        ? await discord(`/channels/${thread.id}/messages?limit=100`)
        : messages;

      let result = { action: 'not-needed', type: status || 'unknown' };

      if (status === 'Ready for Approval') {
        result = await sendReadyForApproval(thread, item, currentMessages, bot.id);
      } else if (status === 'Needs Information') {
        result = await sendNeedsInformation(thread, item, currentMessages, bot.id);
      }

      console.log(
        `- ${thread.name} | Final status: ${status || 'unknown'} | Notification: ${result.action} | Stale Needs Info removed: ${staleNeedsInfoDeleted} | Stale Ready removed: ${staleReadyDeleted}`
      );
    } catch (error) {
      console.warn(`- FAILED | ${thread.name} | ${error.message}`);
    }
  }

  console.log('Kings Convoy Notifications finished.');
}

main().catch((error) => {
  console.error('Kings Convoy Notifications failed:', error.message);
  process.exit(1);
});
