const fs = require('fs');
const { discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_ID = process.env.DISCORD_CONVOY_ANNOUNCEMENT_CHANNEL_ID || '1550997669596631200';
const PING_ROLE_ID = process.env.DISCORD_CONVOY_ANNOUNCEMENT_ROLE_ID || '1476774746480709675';
const REPORT_PATH = 'output/convoy-check-results.json';
const MARKER_PREFIX = '📣 **Kings Convoy Announcement**';
const MANAGED_STATUSES = new Set(['Scheduled', 'Completed', 'Cancelled']);

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
    'User-Agent': 'Kings Logistics Convoy Announcements/2.0'
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

function isTestThread(item) {
  if (typeof item.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item.name || '');
}

function routeLabel(item) {
  const parsed = item.validation?.parsed || {};
  if (parsed.route) return parsed.route;
  if (parsed.start && parsed.destination) return `${parsed.start} → ${parsed.destination}`;
  return null;
}

function markerFor(item) {
  return `${MARKER_PREFIX}\n🔒 **Source Thread:** \`${item.threadId}\``;
}

async function findAnnouncement(item, botId) {
  const marker = markerFor(item);
  let before = null;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const messages = await discord(`/channels/${CHANNEL_ID}/messages?${query.toString()}`);
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const found = messages.find((message) =>
      message.author?.id === botId &&
      (message.content || '').includes(marker)
    );

    if (found) return found;
    if (messages.length < 100) return null;
    before = messages[messages.length - 1].id;
  }

  return null;
}

function statusPresentation(status) {
  if (status === 'Completed') {
    return {
      line: '✅ **Status:** `Completed`',
      intro: 'This Kings Logistics convoy has been completed. Thank you to everyone who took part! 👑🚛',
      footer: '✅ This event is finished. Thank you for driving with the Kings Family! :kings_heart:'
    };
  }

  if (status === 'Cancelled') {
    return {
      line: '❌ **Status:** `Cancelled`',
      intro: 'This Kings Logistics convoy has been cancelled.',
      footer: '❌ Please note that this convoy will no longer take place.'
    };
  }

  return {
    line: '🟢 **Status:** `Scheduled`',
    intro: 'A Kings Logistics convoy has been scheduled. 👑',
    footer: 'Please make sure you are ready before the meeting time. See you on the road! :kings_heart:'
  };
}

function buildAnnouncement(item) {
  const parsed = item.validation?.parsed || {};
  const route = routeLabel(item);
  const eventUrl = item.eventId ? `https://truckersmp.com/events/${item.eventId}` : null;
  const responsible = parsed.responsibleStaff || null;
  const slot = parsed.kingsSlot || null;
  const meetup = parsed.meetup || null;
  const eventType = parsed.eventType || null;
  const presentation = statusPresentation(item.status);

  return [
    markerFor(item),
    '',
    item.status === 'Scheduled' && PING_ROLE_ID ? `<@&${PING_ROLE_ID}>` : null,
    item.status === 'Scheduled' && PING_ROLE_ID ? '' : null,
    `# 🚛 ${item.name || 'Kings Convoy'}`,
    presentation.line,
    '',
    presentation.intro,
    '',
    item.eventUnix ? `🕒 **Event Time:** ${discordTimestamp(item.eventUnix, 'F')} · ${discordTimestamp(item.eventUnix, 'R')}` : null,
    eventType ? `📋 **Event Type:** ${eventType}` : null,
    meetup ? `📍 **Meeting Point:** ${meetup}` : null,
    route ? `🛣️ **Route:** ${route}` : null,
    slot ? `🚚 **Kings Slot:** ${slot}` : null,
    responsible ? `👤 **Responsible Staff:** ${responsible}` : null,
    eventUrl ? `🔗 **TruckersMP Event:** ${eventUrl}` : null,
    '',
    presentation.footer
  ].filter((value) => value !== null && value !== undefined).join('\n');
}

async function createAnnouncement(item) {
  const content = buildAnnouncement(item);
  const allowedMentions = { parse: [] };
  if (PING_ROLE_ID) allowedMentions.roles = [PING_ROLE_ID];

  return discord(`/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: allowedMentions
    }
  });
}

async function updateAnnouncement(item, existing) {
  const content = buildAnnouncement(item);

  if (normalize(existing.content || '') === normalize(content)) {
    return { action: 'unchanged', messageId: existing.id };
  }

  const updated = await discord(`/channels/${CHANNEL_ID}/messages/${existing.id}`, {
    method: 'PATCH',
    body: {
      content,
      allowed_mentions: { parse: [] }
    }
  });

  return { action: 'updated', messageId: updated?.id || existing.id };
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const bot = await discord('/users/@me');
  const channel = await discord(`/channels/${CHANNEL_ID}`);

  if (channel.guild_id && channel.guild_id !== GUILD_ID) {
    throw new Error(`Announcement channel ${CHANNEL_ID} does not belong to guild ${GUILD_ID}.`);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of report.threads || []) {
    if (item.ignored || item.error || isTestThread(item)) continue;
    if (!MANAGED_STATUSES.has(item.status)) continue;

    try {
      const existing = await findAnnouncement(item, bot.id);

      if (!existing) {
        if (item.status !== 'Scheduled') {
          console.log(`- ${item.name} | ${item.status}: no existing announcement; nothing to update`);
          skipped += 1;
          continue;
        }

        if (item.archived || item.locked) {
          console.log(`- ${item.name} | skipped: scheduled thread is archived or locked`);
          skipped += 1;
          continue;
        }

        if (!item.eventUnix || !item.eventTimeValid) {
          console.log(`- ${item.name} | skipped: valid event time required before first announcement`);
          skipped += 1;
          continue;
        }

        const message = await createAnnouncement(item);
        console.log(`- ${item.name} | announcement created: ${message?.id || 'unknown'}`);
        created += 1;
        continue;
      }

      const result = await updateAnnouncement(item, existing);
      console.log(`- ${item.name} | announcement ${result.action}: ${result.messageId}`);
      if (result.action === 'updated') updated += 1;
      else unchanged += 1;
    } catch (error) {
      failed += 1;
      console.warn(`- ${item.name} | announcement sync failed: ${error.message}`);
    }
  }

  console.log(
    `Kings Convoy Announcements finished. Created: ${created}. Updated: ${updated}. Unchanged: ${unchanged}. Skipped: ${skipped}. Failed: ${failed}.`
  );
}

main().catch((error) => {
  console.error('Kings Convoy Announcements failed:', error.message);
  process.exit(1);
});
