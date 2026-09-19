const fs = require('fs');
const { discordTimestamp, localDateForUnix } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const REPORT_PATH = 'output/convoy-check-results.json';

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
    'User-Agent': 'Kings Logistics Convoy Reminders/1.0'
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

function alreadySent(messages, botId, marker) {
  return (messages || []).some((message) =>
    message.author?.id === botId &&
    (message.content || '').includes(marker)
  );
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

async function sendMessage(item, marker, title, description, messages, botId) {
  if (alreadySent(messages, botId, marker)) {
    return { action: 'already-sent' };
  }

  const userId = responsibleUserId(item);
  const mention = userId ? `<@${userId}>` : null;
  const route = routeLabel(item);
  const meetup = item.validation?.parsed?.meetup || null;
  const eventId = item.eventId || null;

  const content = [
    marker,
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

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const bot = await discord('/users/@me');
  const nowUnix = Math.floor(Date.now() / 1000);

  console.log('Kings Convoy Reminders started.');

  for (const item of report.threads || []) {
    if (item.ignored || item.error || isTestThread(item)) continue;
    if (item.status !== 'Scheduled') continue;
    if (!item.eventUnix || !item.eventTimeValid) continue;
    if (item.archived || item.locked) continue;

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
