const fs = require('fs');
const { discordTimestamp, localDateForUnix } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const REPORT_PATH = 'output/convoy-check-results.json';
const TEST_MODE = /^(?:1|true|yes|on)$/i.test(process.env.CONVOY_REMINDER_TEST_MODE || '');

const REMINDER_24H_MARKER = '⏰ **Kings Convoy Reminder — 24 Hours**';
const REMINDER_DAY_MARKER = '📅 **Kings Convoy Reminder — Event Day**';
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

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Convoy Reminders/1.1'
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
    eventDay: newestHumanCommand(messages, /(?:^|\n)\s*Reminder\s+Test\s*:\s*Event\s+Day\s*(?:$|\n)/i),
    afterConvoy: newestHumanCommand(messages, /(?:^|\n)\s*Reminder\s+Test\s*:\s*(?:After\s+Convoy|Follow\s*Up)\s*(?:$|\n)/i)
  };
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
    `🕒 **Event Time:** ${discordTimestamp(item.eventUnix, 'F')} · ${discordTimestamp(item.eventUnix, 'R')}`,
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
      'Convoy starts within 24 hours',
      'This is a TEST of the 24-hour convoy reminder. Real convoys receive this automatically when the event is within 24 hours.',
      messages,
      botId,
      { testTriggerId: commands.reminder24h.id }
    );
    console.log(`- ${item.name} | TEST 24h: ${result.action}`);
    handled = true;
  }

  if (commands.eventDay) {
    const result = await sendMessage(
      item,
      REMINDER_DAY_MARKER,
      'Convoy is today',
      'This is a TEST of the event-day reminder. Real convoys receive this automatically on the event day.',
      messages,
      botId,
      { testTriggerId: commands.eventDay.id }
    );
    console.log(`- ${item.name} | TEST event-day: ${result.action}`);
    handled = true;
  }

  if (commands.afterConvoy) {
    const result = await sendMessage(
      item,
      FOLLOW_UP_MARKER,
      'Convoy status update required',
      'This is a TEST of the post-convoy follow-up. Real convoys receive this automatically after the event if the status is still `Scheduled`.',
      messages,
      botId,
      { testTriggerId: commands.afterConvoy.id }
    );
    console.log(`- ${item.name} | TEST follow-up: ${result.action}`);
    handled = true;
  }

  if (!handled) {
    console.log(`- ${item.name} | TEST thread: no reminder test command found`);
  }
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const bot = await discord('/users/@me');
  const nowUnix = Math.floor(Date.now() / 1000);

  console.log(`Kings Convoy Reminders started. Test mode: ${TEST_MODE ? 'enabled' : 'disabled'}.`);

  for (const item of report.threads || []) {
    if (item.ignored || item.error) continue;
    if (item.archived || item.locked) continue;

    const testThread = isTestThread(item);

    if (testThread) {
      if (!TEST_MODE) continue;
      if (!item.eventUnix || !item.eventTimeValid) {
        console.log(`- ${item.name} | TEST skipped: valid event time required`);
        continue;
      }

      try {
        const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);
        await handleTestThread(item, messages, bot.id);
      } catch (error) {
        console.warn(`- TEST reminder failed | ${item.name} | ${error.message}`);
      }
      continue;
    }

    if (item.status !== 'Scheduled') continue;
    if (!item.eventUnix || !item.eventTimeValid) continue;

    try {
      const messages = await discord(`/channels/${item.threadId}/messages?limit=100`);
      const secondsUntil = item.eventUnix - nowUnix;
      const localToday = localDateForUnix(nowUnix, item.eventTimeOffsetMinutes ?? 0);
      const isEventDay = localToday === item.validation?.parsed?.eventDate;

      if (nowUnix >= item.eventUnix + 3 * 60 * 60) {
        const result = await sendMessage(
          item,
          FOLLOW_UP_MARKER,
          'Convoy status update required',
          'The convoy should now be finished. Please post `Completed` or `Cancelled` so the system can close the event correctly.',
          messages,
          bot.id
        );
        console.log(`- ${item.name} | follow-up: ${result.action}`);
        continue;
      }

      if (secondsUntil <= 0) continue;

      if (isEventDay) {
        const result = await sendMessage(
          item,
          REMINDER_DAY_MARKER,
          'Convoy is today',
          'This is the event-day reminder for this scheduled convoy.',
          messages,
          bot.id
        );
        console.log(`- ${item.name} | event-day: ${result.action}`);
        continue;
      }

      if (secondsUntil <= 24 * 60 * 60) {
        const result = await sendMessage(
          item,
          REMINDER_24H_MARKER,
          'Convoy starts within 24 hours',
          'Please make sure everything is ready for the convoy.',
          messages,
          bot.id
        );
        console.log(`- ${item.name} | 24h: ${result.action}`);
      }
    } catch (error) {
      console.warn(`- Reminder failed | ${item.name} | ${error.message}`);
    }
  }

  console.log('Kings Convoy Reminders finished.');
}

main().catch((error) => {
  console.error('Kings Convoy Reminders failed:', error.message);
  process.exit(1);
});
