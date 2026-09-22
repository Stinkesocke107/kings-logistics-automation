const fs = require('fs');
const { discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const REPORT_PATH = 'output/convoy-check-results.json';

const REMINDER_CHANNEL_ID = process.env.DISCORD_CONVOY_REMINDER_CHANNEL_ID || null;
const REMINDER_CHANNEL_NAME = process.env.DISCORD_CONVOY_REMINDER_CHANNEL_NAME || 'convoy-reminders';
const DRIVER_ROLE_ID = process.env.DISCORD_DRIVER_ROLE_ID || null;
const DRIVER_ROLE_NAME = process.env.DISCORD_DRIVER_ROLE_NAME || 'Convoy Driver';

const REMINDER_24H_MARKER = '⏰ **Kings Driver Convoy Reminder — 24 Hours**';
const REMINDER_1H_MARKER = '🚨 **Kings Driver Convoy Reminder — 1 Hour**';
const LEGACY_REMINDER_2H_MARKER = '🚨 **Kings Driver Convoy Reminder — 2 Hours**';

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
    'User-Agent': 'Kings Logistics Driver Convoy Reminders/1.2'
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

function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-');
}

async function resolveReminderChannel() {
  if (REMINDER_CHANNEL_ID) {
    const channel = await discord(`/channels/${REMINDER_CHANNEL_ID}`);
    if (channel.guild_id && channel.guild_id !== GUILD_ID) {
      throw new Error(`Reminder channel ${REMINDER_CHANNEL_ID} does not belong to guild ${GUILD_ID}.`);
    }
    return channel;
  }

  const channels = await discord(`/guilds/${GUILD_ID}/channels`);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));
  const wanted = normalizeName(REMINDER_CHANNEL_NAME);

  const exact = textChannels.find((channel) => normalizeName(channel.name) === wanted);
  if (exact) return exact;

  const fuzzy = textChannels.filter((channel) => {
    const name = normalizeName(channel.name);
    return name.includes('convoy') && name.includes('reminder');
  });

  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(`Multiple convoy reminder channels found: ${fuzzy.map((channel) => `${channel.name} (${channel.id})`).join(', ')}`);
  }

  throw new Error(`Could not find a Discord channel matching "${REMINDER_CHANNEL_NAME}".`);
}

async function resolveDriverRole() {
  if (DRIVER_ROLE_ID) {
    const roles = await discord(`/guilds/${GUILD_ID}/roles`);
    const role = (roles || []).find((item) => item.id === DRIVER_ROLE_ID);
    if (!role) throw new Error(`Driver role ${DRIVER_ROLE_ID} was not found in guild ${GUILD_ID}.`);
    return role;
  }

  const roles = await discord(`/guilds/${GUILD_ID}/roles`);
  const wanted = String(DRIVER_ROLE_NAME).trim().toLowerCase();

  const exact = (roles || []).find((role) => String(role.name || '').trim().toLowerCase() === wanted);
  if (exact) return exact;

  const aliases = ['convoy driver', 'driver', 'kings driver', 'kings logistics driver'];
  const aliasMatch = (roles || []).find((role) => aliases.includes(String(role.name || '').trim().toLowerCase()));
  if (aliasMatch) return aliasMatch;

  const fuzzy = (roles || []).filter((role) => /\bdriver\b/i.test(role.name || ''));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(`Multiple Driver-like roles found: ${fuzzy.map((role) => `${role.name} (${role.id})`).join(', ')}`);
  }

  throw new Error(`Could not find a Discord role matching "${DRIVER_ROLE_NAME}".`);
}

function routeLabel(item) {
  const parsed = item.validation?.parsed || {};
  if (parsed.route) return parsed.route;
  if (parsed.start && parsed.destination) return `${parsed.start} → ${parsed.destination}`;
  return null;
}

function markerFor(item, marker) {
  return `${marker}\n🔒 **Source Thread:** \`${item.threadId}\``;
}

async function findExistingReminder(channelId, item, marker, botId) {
  const lookup = markerFor(item, marker);
  let before = null;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const messages = await discord(`/channels/${channelId}/messages?${query.toString()}`);
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const found = messages.find((message) =>
      message.author?.id === botId &&
      (message.content || '').includes(lookup)
    );

    if (found) return found;
    if (messages.length < 100) return null;
    before = messages[messages.length - 1].id;
  }

  return null;
}

function buildReminder(item, marker, title, description, driverRoleId) {
  const parsed = item.validation?.parsed || {};
  const route = routeLabel(item);
  const meetup = parsed.meetup || null;
  const slot = parsed.kingsSlot || null;
  const server = item.truckersmp?.server || parsed.server || null;
  const eventUrl = item.eventId ? `https://truckersmp.com/events/${item.eventId}` : null;

  return [
    markerFor(item, marker),
    '',
    `<@&${driverRoleId}>`,
    '',
    `# ${title}`,
    '',
    description,
    '',
    `🚛 **Convoy:** ${item.name || 'Kings Convoy'}`,
    `🕒 **Meeting Time:** ${discordTimestamp(item.eventUnix, 'F')} · ${discordTimestamp(item.eventUnix, 'R')}`,
    server ? `🎙️ **Server:** ${server}` : null,
    meetup ? `📍 **Meeting Point:** ${meetup}` : null,
    route ? `🛣️ **Route:** ${route}` : null,
    slot ? `🚚 **Kings Slot:** ${slot}` : null,
    eventUrl ? `🔗 **TruckersMP Event:** ${eventUrl}` : null,
    '',
    'Please make sure you are ready and arrive before the meeting time. 💙'
  ].filter(Boolean).join('\n');
}

async function sendReminder(channelId, item, marker, title, description, botId, driverRoleId) {
  const existing = await findExistingReminder(channelId, item, marker, botId);
  if (existing) return { action: 'already-sent', messageId: existing.id };

  const content = buildReminder(item, marker, title, description, driverRoleId);
  const sent = await discord(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: {
        parse: [],
        roles: [driverRoleId]
      }
    }
  });

  return { action: 'sent', messageId: sent?.id || null };
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const bot = await discord('/users/@me');
  const reminderChannel = await resolveReminderChannel();
  const driverRole = await resolveDriverRole();
  const nowUnix = Math.floor(Date.now() / 1000);

  console.log(`Driver reminder channel: ${reminderChannel.name} (${reminderChannel.id})`);
  console.log(`Driver ping role: ${driverRole.name} (${driverRole.id})`);

  let sent24h = 0;
  let sent1h = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of report.threads || []) {
    if (item.ignored || item.error || isTestThread(item)) {
      skipped += 1;
      continue;
    }

    if (item.archived || item.locked || item.status !== 'Scheduled') {
      skipped += 1;
      continue;
    }

    if (!item.eventUnix || !item.eventTimeValid) {
      skipped += 1;
      continue;
    }

    const secondsUntilMeeting = item.eventUnix - nowUnix;
    if (secondsUntilMeeting <= 0 || secondsUntilMeeting > 24 * 60 * 60) {
      skipped += 1;
      continue;
    }

    try {
      if (secondsUntilMeeting <= 60 * 60) {
        const legacy2h = await findExistingReminder(
          reminderChannel.id,
          item,
          LEGACY_REMINDER_2H_MARKER,
          bot.id
        );

        if (legacy2h) {
          console.log(`- ${item.name} | 1h driver reminder skipped: legacy 2h reminder already sent`);
          skipped += 1;
          continue;
        }

        const result = await sendReminder(
          reminderChannel.id,
          item,
          REMINDER_1H_MARKER,
          '🚨 Convoy Reminder — 1 Hour',
          'The convoy Meeting Time is now within 1 hour. Please get ready and make sure you arrive on time.',
          bot.id,
          driverRole.id
        );
        console.log(`- ${item.name} | 1h driver reminder: ${result.action}`);
        if (result.action === 'sent') sent1h += 1;
        continue;
      }

      const result = await sendReminder(
        reminderChannel.id,
        item,
        REMINDER_24H_MARKER,
        '⏰ Convoy Reminder — 24 Hours',
        'The convoy Meeting Time is now within 24 hours. Please check the details below and make sure you are prepared.',
        bot.id,
        driverRole.id
      );
      console.log(`- ${item.name} | 24h driver reminder: ${result.action}`);
      if (result.action === 'sent') sent24h += 1;
    } catch (error) {
      failed += 1;
      console.warn(`- Driver reminder failed | ${item.name} | ${error.message}`);
    }
  }

  console.log(
    `Kings Driver Convoy Reminders finished. 24h sent: ${sent24h}. 1h sent: ${sent1h}. Skipped: ${skipped}. Failed: ${failed}.`
  );
}

main().catch((error) => {
  console.error('Kings Driver Convoy Reminders failed:', error.message);
  process.exit(1);
});