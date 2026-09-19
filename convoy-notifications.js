const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';

const STATUS_MESSAGE_MARKER = '👑 **Kings Convoy Automation**';
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

const API = 'https://discord.com/api/v10';

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Convoy Notifications/1.0'
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

function extractStatus(content = '') {
  const match = content.match(/\*\*Status:\*\*\s*`([^`]+)`/i);
  return match ? match[1].trim() : null;
}

function extractMissingIssues(content = '') {
  const match = content.match(/⚠️\s*\*\*Missing\s*\/\s*Issue:\*\*\s*([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractEventId(content = '') {
  const match = content.match(/TruckersMP Event ID:\*\*\s*(\d+)/i);
  return match ? match[1] : null;
}

function alreadyNotified(messages, botId, marker) {
  return messages.some((message) =>
    message.author?.id === botId &&
    (message.content || '').includes(marker)
  );
}

async function sendReadyForApproval(thread, messages, botId, statusMessage) {
  if (alreadyNotified(messages, botId, READY_NOTIFICATION_MARKER)) {
    return { action: 'already-sent', type: 'ready-for-approval' };
  }

  const roleMentions = APPROVAL_ROLE_IDS.map((roleId) => `<@&${roleId}>`).join(' ');
  const eventId = extractEventId(statusMessage.content || '');

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

async function sendNeedsInformation(thread, messages, botId, statusMessage) {
  if (alreadyNotified(messages, botId, NEEDS_INFO_NOTIFICATION_MARKER)) {
    return { action: 'already-sent', type: 'needs-information' };
  }

  const ownerId = thread.owner_id || null;
  const ownerMention = ownerId ? `<@${ownerId}>` : null;
  const missing = extractMissingIssues(statusMessage.content || '');
  const eventId = extractEventId(statusMessage.content || '');

  const content = [
    NEEDS_INFO_NOTIFICATION_MARKER,
    '',
    ownerMention,
    '',
    'This convoy is missing required information.',
    `**Convoy:** ${thread.name}`,
    eventId ? `**TruckersMP Event ID:** ${eventId}` : null,
    missing ? `**Missing / Issue:** ${missing}` : null,
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
  const bot = await discord('/users/@me');
  const activeData = await discord(`/guilds/${GUILD_ID}/threads/active`);
  const threads = (activeData.threads || []).filter((thread) => thread.parent_id === FORUM_ID);

  console.log('Kings Convoy Notifications started.');
  console.log(`Active convoy threads: ${threads.length}`);

  for (const thread of threads) {
    if (/\btemplate\b/i.test(thread.name || '')) {
      console.log(`- IGNORED | ${thread.name} | template`);
      continue;
    }

    try {
      const messages = await discord(`/channels/${thread.id}/messages?limit=100`);
      const statusMessage = messages.find((message) =>
        message.author?.id === bot.id &&
        (message.content || '').includes(STATUS_MESSAGE_MARKER)
      );

      if (!statusMessage) {
        console.log(`- SKIPPED | ${thread.name} | no Kings status message found`);
        continue;
      }

      const status = extractStatus(statusMessage.content || '');
      let result = { action: 'not-needed', type: status || 'unknown' };

      if (status === 'Ready for Approval') {
        result = await sendReadyForApproval(thread, messages, bot.id, statusMessage);
      } else if (status === 'Needs Information') {
        result = await sendNeedsInformation(thread, messages, bot.id, statusMessage);
      }

      console.log(`- ${thread.name} | Status: ${status || 'unknown'} | Notification: ${result.action}`);
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
