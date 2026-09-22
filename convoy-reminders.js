const fs = require('fs');
const { discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';
const REPORT_PATH = 'output/convoy-check-results.json';
const TEST_MODE = /^(?:1|true|yes|on)$/i.test(process.env.CONVOY_REMINDER_TEST_MODE || '');

const REMINDER_24H_MARKER = '⏰ **Kings Convoy Reminder — 24 Hours**';
const REMINDER_2H_MARKER = '🚨 **Kings Convoy Reminder — 2 Hours**';
const FOLLOW_UP_MARKER = '✅ **Kings Convoy Follow-up — Status Required**';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Missing ${REPORT_PATH}. Run convoy-checker.js first.`);
  process.exit(1);
}

const API = 'https://discord.com/api/v10';
let statusTagConfiguration = null;

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Convoy Reminders/1.5'
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
  if (typeof item.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item.name || '');
}

function alreadySent(messages, botId, marker, testTriggerId = null) {
  return (messages || []).some((message) => {
    if (message.author?.id !== botId) return false;
    const content = message.content || '';
    if (!content.includes(marker)) return false;
    if (!testTriggerId) return true;
    return content.includes(`Test Trigger ID:** \`${testTriggerId}\``);
  });
}

function extractUserId(value = '') {
  const match = String(value).match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function responsibleUserId(item) {
  return extractUserId(item.validation?.parsed?.responsibleStaff || '') ||
    item.ownerId ||
    item.starterAuthorId ||
    null;
}

function routeLabel(item) {
  const parsed = item.validation?.parsed || {};
  if (parsed.route) return parsed.route;
  if (parsed.start && parsed.destination) return `${parsed.start} → ${parsed.destination}`;
  return null;
}

function newestHumanCommand(messages, regex) {
  return [...(messages || [])]
    .filter((message) => !message.author?.bot && regex.test(message.content || ''))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] || null;
}

function getTestCommands(messages) {
  return {
    reminder24h: newestHumanCommand(messages, /(?:^|\n)\s*Reminder\s+Test\s*:\s*(?:24h|24\s*hours?)\s*(?:$|\n)/i),
    reminder2h: newestHumanCommand(messages, /(?:^|\n)\s*Reminder\s+Test\s*:\s*(?:2h|2\s*hours?)\s*(?:$|\n)/i),
    afterConvoy: newestHumanCommand(messages, /(?:^|\n)\s*Reminder\s+Test\s*:\s*(?:After\s+Convoy|Follow\s*Up)\s*(?:$|\n)/i)
  };
}

function newestHumanTerminalStatus(messages) {
  return [...(messages || [])]
    .filter((message) => {
      if (message.author?.bot) return false;
      return /^\s*(?:Completed|Finished|Cancelled|Canceled)\s*$/i.test(message.content || '');
    })
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] || null;
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

async function getStatusTagConfiguration() {
  if (statusTagConfiguration) return statusTagConfiguration;

  const forum = await discord(`/channels/${FORUM_ID}`);
  if (forum.guild_id && forum.guild_id !== GUILD_ID) {
    throw new Error(`Forum ${FORUM_ID} does not belong to guild ${GUILD_ID}.`);
  }

  const statusTagIds = new Map();
  const allStatusTagIds = new Set();

  for (const tag of forum.available_tags || []) {
    const status = detectStatusPhrase(tag.name || '');
    if (!status) continue;
    allStatusTagIds.add(tag.id);
    if (!statusTagIds.has(status)) statusTagIds.set(status, tag.id);
  }

  statusTagConfiguration = { statusTagIds, allStatusTagIds };
  return statusTagConfiguration;
}

async function syncThreadStatusTag(item, targetStatus) {
  const { statusTagIds, allStatusTagIds } = await getStatusTagConfiguration();
  const targetTagId = statusTagIds.get(targetStatus);
  if (!targetTagId) return { action: 'skipped', reason: 'missing-status-tag' };

  const thread = await discord(`/channels/${item.threadId}`);
  const current = [...(thread.applied_tags || [])];
  const preserved = current.filter((tagId) => !allStatusTagIds.has(tagId));
  const desired = [...preserved, targetTagId];

  if (desired.length > 5) {
    return { action: 'skipped', reason: 'too-many-tags' };
  }

  const sameSet = current.length === desired.length && current.every((tagId) => desired.includes(tagId));
  if (sameSet) return { action: 'unchanged', tagId: targetTagId };

  await discord(`/channels/${item.threadId}`, {
    method: 'PATCH',
    body: { applied_tags: desired }
  });

  return { action: 'updated', tagId: targetTagId };
}

async function markPostConvoyNeedsInformation(item) {
  item.status = 'Needs Information';
  const tagResult = await syncThreadStatusTag(item, 'Needs Information');
  console.log(`- ${item.name} | post-convoy forum tag: ${tagResult.action}${tagResult.reason ? ` (${tagResult.reason})` : ''}`);
  return tagResult;
}

async function sendMessage(item, marker, title, description, messages, botId, options = {}) {
  const testTriggerId = options.testTriggerId || null;

  if (alreadySent(messages, botId, marker, testTriggerId)) {
    return { action: 'already-sent' };
  }

  const userId = responsibleUserId(item);
  const mention = userId ? `<@${userId}>` : null;
  const route = routeLabel(item);
  const meetup = item.validation?.parsed?.meetup || null;
  const eventId = item.eventId || null;

  const content = [
    marker,
    testTriggerId ? '🧪 **TEST MODE**' : null,
    testTriggerId ? `🧪 **Test Trigger ID:** \`${testTriggerId}\`` : null,
    '',
    mention,
    '',
    `**${title}**`,
    description,
    '',
    `🕒 **Meeting Time:** ${discordTimestamp(item.eventUnix, 'F')} · ${discordTimestamp(item.eventUnix, 'R')}`,
    meetup ? `📍 **Meeting Point:** ${meetup}` : null,
    route ? `🛣️ **Route:** ${route}` : null,
    eventId ? `🔗 **TruckersMP Event ID:** ${eventId}` : null
  ].filter(Boolean).join('\n');

  const allowedMentions = { parse: [] };
  if (userId) allowedMentions.users = [userId];

  const sent = await discord(`/channels/${item.threadId}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: allowedMentions
    }
  });

  return { action: 'sent', messageId: sent?.id || null };
}

async function handleTestThread(item, messages, botId) {
  const commands = getTestCommands(messages);
  let handled = false;

  if (commands.reminder24h) {
    const result = await sendMessage(
      item,
      REMINDER_24H_MARKER,
      'Convoy meeting starts within 24 hours',
      'This is a TEST of the 24-hour convoy reminder. The countdown is based on the convoy Meeting Time.',
      messages,
      botId,
      { testTriggerId: commands.reminder24h.id }
    );
    console.log(`- ${item.name} | TEST 24h: ${result.action}`);
    handled = true;
  }

  if (commands.reminder2h) {
    const result = await sendMessage(
      item,
      REMINDER_2H_MARKER,
      'Convoy meeting starts within 2 hours',
      'This is a TEST of the final pre-convoy reminder. The countdown is based on the convoy Meeting Time.',
      messages,
      botId,
      { testTriggerId: commands.reminder2h.id }
    );
    console.log(`- ${item.name} | TEST 2h: ${result.action}`);
    handled = true;
  }

  if (commands.afterConvoy) {
    const terminalMessage = newestHumanTerminalStatus(messages);
    const terminalAfterTrigger = terminalMessage &&
      new Date(terminalMessage.timestamp || 0) > new Date(commands.afterConvoy.timestamp || 0);

    if (terminalAfterTrigger) {
      console.log(`- ${item.name} | TEST follow-up: terminal status posted after trigger; no Needs Information override`);
      handled = true;
    } else {
      const result = await sendMessage(
        item,
        FOLLOW_UP_MARKER,
        'Convoy status update required',
        'The convoy should now be finished. Please post `Completed` or `Cancelled` so the system can set the final status and forum tag correctly. This is a TEST of the automatic post-convoy follow-up.',
        messages,
        botId,
        { testTriggerId: commands.afterConvoy.id }
      );
      console.log(`- ${item.name} | TEST follow-up: ${result.action}`);

      if (result.action === 'sent') {
        const tagResult = await markPostConvoyNeedsInformation(item);
        console.log(`- ${item.name} | TEST post-convoy status: Needs Information | Tag: ${tagResult.action}`);
      }
      handled = true;
    }
  }

  if (!handled) {
    console.log(`- ${item.name} | TEST thread: no reminder test command found`);
  }
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const bot = await discord('/users/@me');
  const nowUnix = Math.floor(Date.now() / 1000);
  let reportChanged = false;

  console.log(`Kings Convoy Follow-up started. Test mode: ${TEST_MODE ? 'enabled' : 'disabled'}.`);

  for (const item of report.threads || []) {
    if (item.ignored || item.error) continue;
    if (item.archived || item.locked) continue;

    const testThread = isTestThread(item);

    if (testThread) {
      if (!TEST_MODE) continue;
      if (!item.eventUnix || !item.eventTimeValid) {
        console.log(`- ${item.name} | TEST skipped: valid Meeting Time required`);
        continue;
      }

      try {
        const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);
        const beforeStatus = item.status;
        await handleTestThread(item, messages, bot.id);
        if (beforeStatus !== item.status) reportChanged = true;
      } catch (error) {
        console.warn(`- TEST reminder failed | ${item.name} | ${error.message}`);
      }
      continue;
    }

    if (item.status !== 'Scheduled') continue;
    if (!item.eventUnix || !item.eventTimeValid) continue;

    try {
      const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);

      if (nowUnix >= item.eventUnix + 3 * 60 * 60) {
        const result = await sendMessage(
          item,
          FOLLOW_UP_MARKER,
          'Convoy status update required',
          'The convoy should now be finished. Please post `Completed` or `Cancelled` so the system can set the final status and forum tag correctly.',
          messages,
          bot.id
        );
        console.log(`- ${item.name} | follow-up: ${result.action}`);

        await markPostConvoyNeedsInformation(item);
        reportChanged = true;
        continue;
      }

      console.log(`- ${item.name} | pre-convoy source-thread reminder disabled; Convoy Driver reminders handle 24h/1h notifications`);
    } catch (error) {
      console.warn(`- Follow-up failed | ${item.name} | ${error.message}`);
    }
  }

  if (reportChanged) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log('Convoy report updated with post-convoy status changes.');
  }

  console.log('Kings Convoy Follow-up finished.');
}

main().catch((error) => {
  console.error('Kings Convoy Follow-up failed:', error.message);
  process.exit(1);
});
