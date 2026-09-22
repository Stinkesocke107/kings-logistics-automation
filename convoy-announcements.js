const fs = require('fs');
const { discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_ID = process.env.DISCORD_CONVOY_ANNOUNCEMENT_CHANNEL_ID || '1550997669596631200';
const PING_ROLE_ID = process.env.DISCORD_CONVOY_ANNOUNCEMENT_ROLE_ID || '1476774746480709675';
const REPORT_PATH = 'output/convoy-check-results.json';
const TEST_MODE = /^(?:1|true|yes|on)$/i.test(process.env.CONVOY_ANNOUNCEMENT_TEST_MODE || '');
const ANNOUNCEMENT_MARKER = '📣 **Kings Convoy Announcement**';
const MANAGED_STATUSES = new Set(['Scheduled', 'Completed', 'Cancelled']);
const ANNOUNCEMENT_WINDOW_SECONDS = 24 * 60 * 60;

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
    'User-Agent': 'Kings Logistics Convoy Announcements/3.1'
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
    if (value) return value;
  }

  return null;
}

function announcementTestCommand(messages) {
  return [...(messages || [])]
    .filter((message) =>
      !message.author?.bot &&
      /^\s*Announcement\s+Test\s*$/i.test(message.content || '')
    )
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] || null;
}

function applyLatestThreadFields(item, messages) {
  item.validation = item.validation || {};
  item.validation.parsed = item.validation.parsed || {};
  const parsed = item.validation.parsed;

  const fields = [
    ['eventType', ['Event Type', 'Convoy Type', 'Type']],
    ['responsibleStaff', ['Responsible Staff', 'Responsible Person', 'Staff', 'Organizer']],
    ['kingsSlot', ['Kings Slot', 'Slot Confirmation', 'Confirmed Slot', 'Slot Number', 'Slot']],
    ['route', ['Route']],
    ['start', ['Start', 'Starting Point', 'Departure']],
    ['destination', ['Destination', 'End', 'End Point']],
    ['meetup', ['Meeting Point', 'Meeting Location', 'Meetup', 'Meetup Point']],
    ['meetupTime', ['Meeting Time', 'Meetup Time', 'Departure Time', 'Time']]
  ];

  for (const [key, labels] of fields) {
    const value = latestHumanField(messages, labels);
    if (value) parsed[key] = value;
  }

  return item;
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

function sourceMarker(item) {
  return `🔒 **Source Thread:** \`${item.threadId}\``;
}

function markerFor(item, marker) {
  return `${marker}\n${sourceMarker(item)}`;
}

async function findManagedMessage(item, botId, marker) {
  const lookupMarker = markerFor(item, marker);
  let before = null;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const messages = await discord(`/channels/${CHANNEL_ID}/messages?${query.toString()}`);
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const found = messages.find((message) =>
      message.author?.id === botId &&
      (message.content || '').includes(lookupMarker)
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

  if (status === 'Needs Information') {
    return {
      line: '⚠️ **Status:** `Needs Information`',
      intro: 'This is a test preview of a Kings Logistics convoy announcement.',
      footer: '🧪 TEST ONLY — this message is not a real convoy announcement.'
    };
  }

  if (status === 'Ready for Approval') {
    return {
      line: '⏳ **Status:** `Ready for Approval`',
      intro: 'This is a test preview of a Kings Logistics convoy announcement.',
      footer: '🧪 TEST ONLY — this message is not a real convoy announcement.'
    };
  }

  return {
    line: '🟢 **Status:** `Scheduled`',
    intro: 'A Kings Logistics convoy is coming up within 24 hours. 👑',
    footer: 'Please make sure you are ready before the meeting time. See you on the road! :kings_heart:'
  };
}

function buildAnnouncement(item, options = {}) {
  const testMode = Boolean(options.testMode);
  const testTriggerId = options.testTriggerId || null;
  const parsed = item.validation?.parsed || {};
  const route = routeLabel(item);
  const eventUrl = item.eventId ? `https://truckersmp.com/events/${item.eventId}` : null;
  const responsible = parsed.responsibleStaff || null;
  const slot = parsed.kingsSlot || null;
  const meetup = parsed.meetup || null;
  const eventType = parsed.eventType || null;
  const presentation = statusPresentation(item.status);
  const showRoleMention = !testMode && item.status === 'Scheduled' && PING_ROLE_ID;

  return [
    markerFor(item, ANNOUNCEMENT_MARKER),
    testMode ? '🧪 **TEST ANNOUNCEMENT — NOT A REAL CONVOY NOTICE**' : null,
    testMode && testTriggerId ? `🧪 **Test Trigger ID:** \`${testTriggerId}\`` : null,
    '',
    showRoleMention ? `<@&${PING_ROLE_ID}>` : null,
    showRoleMention ? '' : null,
    `# 🚛 ${item.name || 'Kings Convoy'}`,
    presentation.line,
    '',
    testMode ? 'This message was generated by the safe announcement test command.' : presentation.intro,
    '',
    item.eventUnix ? `🕒 **Meeting Time:** ${discordTimestamp(item.eventUnix, 'F')} · ${discordTimestamp(item.eventUnix, 'R')}` : null,
    eventType ? `📋 **Event Type:** ${eventType}` : null,
    meetup ? `📍 **Meeting Point:** ${meetup}` : null,
    route ? `🛣️ **Route:** ${route}` : null,
    slot ? `🚚 **Kings Slot:** ${slot}` : null,
    responsible ? `👤 **Responsible Staff:** ${responsible}` : null,
    eventUrl ? `🔗 **TruckersMP Event:** ${eventUrl}` : null,
    '',
    testMode ? '🧪 TEST ONLY — no real convoy role was pinged.' : presentation.footer
  ].filter((value) => value !== null && value !== undefined).join('\n');
}

async function createMessage(content, pingRole = false) {
  const allowedMentions = { parse: [] };
  if (pingRole && PING_ROLE_ID) allowedMentions.roles = [PING_ROLE_ID];

  return discord(`/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: allowedMentions
    }
  });
}

async function updateMessage(existing, content) {
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
  const nowUnix = Math.floor(Date.now() / 1000);

  if (channel.guild_id && channel.guild_id !== GUILD_ID) {
    throw new Error(`Announcement channel ${CHANNEL_ID} does not belong to guild ${GUILD_ID}.`);
  }

  let announcementsCreated = 0;
  let announcementsUpdated = 0;
  let announcementsUnchanged = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Kings Convoy Announcements started. Test mode: ${TEST_MODE ? 'enabled' : 'disabled'}.`);

  for (const item of report.threads || []) {
    if (item.ignored || item.error) continue;

    try {
      let sourceMessages = [];
      try {
        sourceMessages = await discord(`/channels/${item.threadId}/messages?limit=100`);
        if (Array.isArray(sourceMessages)) applyLatestThreadFields(item, sourceMessages);
      } catch (sourceError) {
        console.warn(`- ${item.name} | source refresh skipped: ${sourceError.message}`);
      }

      const testThread = isTestThread(item);

      if (testThread) {
        if (!TEST_MODE) {
          skipped += 1;
          continue;
        }

        const trigger = announcementTestCommand(sourceMessages);
        if (!trigger) {
          console.log(`- ${item.name} | TEST skipped: no exact \`Announcement Test\` command found`);
          skipped += 1;
          continue;
        }

        if (!item.eventUnix || !item.eventTimeValid) {
          console.log(`- ${item.name} | TEST skipped: valid Meeting Time required`);
          skipped += 1;
          continue;
        }

        const existing = await findManagedMessage(item, bot.id, ANNOUNCEMENT_MARKER);
        const content = buildAnnouncement(item, { testMode: true, testTriggerId: trigger.id });

        if (!existing) {
          const message = await createMessage(content, false);
          console.log(`- ${item.name} | TEST announcement created: ${message?.id || 'unknown'}`);
          announcementsCreated += 1;
        } else {
          const result = await updateMessage(existing, content);
          console.log(`- ${item.name} | TEST announcement ${result.action}: ${result.messageId}`);
          if (result.action === 'updated') announcementsUpdated += 1;
          else announcementsUnchanged += 1;
        }
        continue;
      }

      if (!MANAGED_STATUSES.has(item.status)) continue;

      const existingAnnouncement = await findManagedMessage(item, bot.id, ANNOUNCEMENT_MARKER);

      if (item.status === 'Completed' || item.status === 'Cancelled') {
        if (!existingAnnouncement) {
          console.log(`- ${item.name} | ${item.status}: no existing public announcement; nothing to update`);
          skipped += 1;
          continue;
        }

        const result = await updateMessage(existingAnnouncement, buildAnnouncement(item));
        console.log(`- ${item.name} | terminal announcement ${result.action}: ${result.messageId}`);
        if (result.action === 'updated') announcementsUpdated += 1;
        else announcementsUnchanged += 1;
        continue;
      }

      if (item.archived || item.locked) {
        console.log(`- ${item.name} | skipped: scheduled thread is archived or locked`);
        skipped += 1;
        continue;
      }

      if (!item.eventUnix || !item.eventTimeValid) {
        console.log(`- ${item.name} | skipped: valid Meeting Time required`);
        skipped += 1;
        continue;
      }

      const secondsUntilMeeting = item.eventUnix - nowUnix;

      if (secondsUntilMeeting <= 0) {
        if (existingAnnouncement) {
          const result = await updateMessage(existingAnnouncement, buildAnnouncement(item));
          console.log(`- ${item.name} | meeting time passed; existing announcement ${result.action}`);
          if (result.action === 'updated') announcementsUpdated += 1;
          else announcementsUnchanged += 1;
        } else {
          console.log(`- ${item.name} | skipped: Meeting Time already passed`);
          skipped += 1;
        }
        continue;
      }

      if (!existingAnnouncement) {
        if (secondsUntilMeeting > ANNOUNCEMENT_WINDOW_SECONDS) {
          console.log(`- ${item.name} | waiting: public announcement starts 24h before Meeting Time`);
          skipped += 1;
          continue;
        }

        const message = await createMessage(buildAnnouncement(item), true);
        console.log(`- ${item.name} | 24h public announcement created: ${message?.id || 'unknown'}`);
        announcementsCreated += 1;
      } else {
        const result = await updateMessage(existingAnnouncement, buildAnnouncement(item));
        console.log(`- ${item.name} | public announcement ${result.action}: ${result.messageId}`);
        if (result.action === 'updated') announcementsUpdated += 1;
        else announcementsUnchanged += 1;
      }
    } catch (error) {
      failed += 1;
      console.warn(`- ${item.name} | public convoy sync failed: ${error.message}`);
    }
  }

  console.log(
    `Kings Convoy Announcements finished. 24h created: ${announcementsCreated}. 24h updated: ${announcementsUpdated}. 24h unchanged: ${announcementsUnchanged}. Skipped: ${skipped}. Failed: ${failed}.`
  );
}

main().catch((error) => {
  console.error('Kings Convoy Announcements failed:', error.message);
  process.exit(1);
});