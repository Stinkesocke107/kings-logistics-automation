const { installDiscordBranding, brandMessageContent } = require('./kings-branding');
installDiscordBranding();

const fs = require('fs');
const { discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_ID = process.env.DISCORD_EVENT_LEADERSHIP_CHANNEL_ID || null;
const CHANNEL_NAME = process.env.DISCORD_EVENT_LEADERSHIP_CHANNEL_NAME || 'event-leadership';
const DRY_RUN = /^(?:1|true|yes|on)$/i.test(process.env.EVENT_LEADERSHIP_DRY_RUN || '');

const REPORT_PATH = 'output/convoy-check-results.json';
const OVERVIEW_PATH = 'output/convoy-overview.json';
const API = 'https://discord.com/api/v10';

const MESSAGE_TEXT = 'Kings Event Leadership Overview';
const MESSAGE_MARKER = '👑 **Kings Event Leadership Overview**';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}
if (!fs.existsSync(REPORT_PATH) || !fs.existsSync(OVERVIEW_PATH)) {
  console.error('Missing convoy report/overview. Run convoy pipeline first.');
  process.exit(1);
}

async function discord(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (DRY_RUN && method !== 'GET') {
    throw new Error(`Dry-run safety guard blocked Discord write: ${method} ${path}`);
  }

  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Event Leadership Overview/1.0'
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

function normalizeChannelName(value = '') {
  return String(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function resolveChannel() {
  if (CHANNEL_ID) {
    const channel = await discord(`/channels/${CHANNEL_ID}`);
    if (channel.guild_id && String(channel.guild_id) !== String(GUILD_ID)) {
      throw new Error(`Configured Event Leadership channel ${CHANNEL_ID} is not in guild ${GUILD_ID}.`);
    }
    return channel;
  }

  const channels = await discord(`/guilds/${GUILD_ID}/channels`);
  const wanted = normalizeChannelName(CHANNEL_NAME);
  const matches = (Array.isArray(channels) ? channels : [])
    .filter((channel) => normalizeChannelName(channel.name) === wanted);

  if (matches.length === 1) return matches[0];

  const loose = (Array.isArray(channels) ? channels : [])
    .filter((channel) => normalizeChannelName(channel.name).endsWith(wanted));

  if (loose.length === 1) return loose[0];

  throw new Error(
    `Could not uniquely resolve Event Leadership channel "${CHANNEL_NAME}". Exact: ${matches.length}; loose: ${loose.length}.`
  );
}

function isTestThread(item) {
  if (typeof item?.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item?.name || '');
}

function truncate(value, max = 36) {
  const text = String(value || 'Unknown');
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function slotLabel(item) {
  return item?.validation?.parsed?.kingsSlot || 'No confirmed slot';
}

function responsibleLabel(item) {
  return item?.validation?.parsed?.responsibleStaff || 'No responsible staff';
}

function eventTime(item) {
  const unix = Number(item?.eventUnix || 0);
  return Number.isFinite(unix) && unix > 0 ? unix : null;
}

function listLine(item, extra = '') {
  const time = eventTime(item);
  const when = time ? discordTimestamp(time, 'd') : 'No valid date';
  return `• ${when} — **${truncate(item.name)}**${extra}`;
}

function buildMessage(report, overview) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const real = (report.threads || [])
    .filter((item) => !item.ignored && !item.error && !isTestThread(item));

  const needsInfo = real.filter((item) => item.status === 'Needs Information');
  const ready = real.filter((item) => item.status === 'Ready for Approval');
  const overdue = real.filter((item) =>
    item.status === 'Scheduled' &&
    eventTime(item) &&
    eventTime(item) < nowUnix - 3 * 60 * 60
  );

  const duplicateIds = new Set(
    (report.duplicateEventIds || []).map((item) => String(item.eventId))
  );
  const duplicateThreads = real.filter((item) => item.eventId && duplicateIds.has(String(item.eventId)));

  const invalid = real.filter((item) =>
    !item.validation?.parsed?.eventDate ||
    (item.validation?.parsed?.eventDate && item.validation?.parsed?.meetupTime && !item.eventTimeValid)
  );

  const upcoming = [...(overview.upcomingConvoys || [])]
    .filter((convoy) => Number(convoy.eventUnix || 0) > nowUnix)
    .sort((a, b) => Number(a.eventUnix || 0) - Number(b.eventUnix || 0))
    .slice(0, 5);

  const issueCount =
    needsInfo.length +
    overdue.length +
    duplicateThreads.length +
    invalid.length;

  const lines = [
    MESSAGE_MARKER,
    '',
    'Live leadership view of Kings convoy operations. Normal Driver reminders and public announcements are not repeated here.',
    '',
    '## 📊 Current Status',
    `📥 Real Convoys: **${real.length}** · ✅ Scheduled: **${real.filter((item) => item.status === 'Scheduled').length}** · ⏳ Ready: **${ready.length}** · ⚠️ Needs Info: **${needsInfo.length}**`,
    `🚨 Leadership Issues: **${issueCount}** · 🧾 Awaiting Final Status: **${overdue.length}** · 🔁 Duplicate Event IDs: **${duplicateThreads.length}**`,
    ''
  ];

  if (ready.length) {
    lines.push('## ⏳ Ready for Approval');
    for (const item of ready.slice(0, 4)) {
      lines.push(
        listLine(
          item,
          ` · ${responsibleLabel(item)} · ${slotLabel(item)}`
        )
      );
    }
    if (ready.length > 4) lines.push(`• +${ready.length - 4} more`);
    lines.push('');
  }

  if (needsInfo.length || overdue.length || duplicateThreads.length || invalid.length) {
    lines.push('## 🚨 Leadership Attention');

    for (const item of needsInfo.slice(0, 3)) {
      const missing = [
        ...(item.validation?.missing || []),
        ...(item.duplicateEventId ? ['duplicateEventId'] : [])
      ];
      lines.push(`• ⚠️ **${truncate(item.name)}** — Needs Information${missing.length ? `: ${missing.join(', ')}` : ''}`);
    }

    for (const item of overdue.slice(0, 3)) {
      lines.push(`• 🧾 **${truncate(item.name)}** — Scheduled but final status is still missing`);
    }

    for (const item of duplicateThreads.slice(0, 2)) {
      lines.push(`• 🔁 **${truncate(item.name)}** — duplicate TruckersMP Event ID ${item.eventId}`);
    }

    const invalidNotAlready = invalid.filter((item) =>
      item.status !== 'Needs Information' && !item.duplicateEventId
    );
    for (const item of invalidNotAlready.slice(0, 2)) {
      lines.push(`• 🕒 **${truncate(item.name)}** — invalid or missing event date/time`);
    }

    lines.push('');
  }

  lines.push('## 🗓️ Next Convoys');
  if (!upcoming.length) {
    lines.push('• No upcoming Scheduled convoy is currently available.');
  } else {
    for (const convoy of upcoming) {
      const time = Number(convoy.eventUnix || 0);
      lines.push(
        `• ${discordTimestamp(time, 'd')} · ${discordTimestamp(time, 't')} — **${truncate(convoy.name)}** · ${convoy.kingsSlot || 'No slot'}`
      );
    }
  }

  lines.push(
    '',
    `🕒 Updated: ${discordTimestamp(Math.floor(Date.now() / 1000), 'R')}`,
    ':kings_heart:'
  );

  let content = lines.join('\n');
  if (content.length > 2000) {
    content = [
      MESSAGE_MARKER,
      '',
      'Live leadership view of Kings convoy operations.',
      '',
      '## 📊 Current Status',
      `📥 Real Convoys: **${real.length}** · ✅ Scheduled: **${real.filter((item) => item.status === 'Scheduled').length}** · ⏳ Ready: **${ready.length}** · ⚠️ Needs Info: **${needsInfo.length}**`,
      `🚨 Leadership Issues: **${issueCount}** · 🧾 Awaiting Final Status: **${overdue.length}** · 🔁 Duplicates: **${duplicateThreads.length}**`,
      '',
      '## 🚨 Highest Priority',
      ...[
        ...needsInfo.slice(0, 3).map((item) => `• ⚠️ **${truncate(item.name, 30)}** — Needs Information`),
        ...overdue.slice(0, 3).map((item) => `• 🧾 **${truncate(item.name, 30)}** — final status missing`)
      ].slice(0, 5),
      '',
      '## 🗓️ Next Convoys',
      ...(upcoming.length
        ? upcoming.slice(0, 4).map((convoy) =>
            `• ${discordTimestamp(Number(convoy.eventUnix), 'd')} — **${truncate(convoy.name, 30)}** · ${convoy.kingsSlot || 'No slot'}`
          )
        : ['• No upcoming Scheduled convoy is currently available.']),
      '',
      `🕒 Updated: ${discordTimestamp(Math.floor(Date.now() / 1000), 'R')}`,
      ':kings_heart:'
    ].join('\n');
  }

  if (content.length > 2000) {
    throw new Error(`Event Leadership Overview still exceeds Discord limit: ${content.length}`);
  }

  return content;
}

async function syncMessage(channel, content, botId) {
  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const botMessages = (Array.isArray(messages) ? messages : [])
    .filter((message) =>
      String(message.author?.id || '') === String(botId) &&
      String(message.content || '').includes(MESSAGE_TEXT)
    )
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  if (DRY_RUN) {
    console.log(
      `DRY-RUN: Event Leadership Overview would ${botMessages[0] ? 'update' : 'create'} in #${channel.name} (${channel.id}).`
    );
    console.log(`DRY-RUN content length: ${brandMessageContent(content).length}`);
    return { action: botMessages[0] ? 'dry-run-update' : 'dry-run-create' };
  }

  const expected = brandMessageContent(content).trim();
  let canonical = botMessages[0] || null;
  let action = 'unchanged';

  if (!canonical) {
    canonical = await discord(`/channels/${channel.id}/messages`, {
      method: 'POST',
      body: {
        content,
        allowed_mentions: { parse: [], users: [], roles: [] }
      }
    });
    action = 'created';
  } else if (String(canonical.content || '').trim() !== expected) {
    canonical = await discord(`/channels/${channel.id}/messages/${canonical.id}`, {
      method: 'PATCH',
      body: {
        content,
        allowed_mentions: { parse: [], users: [], roles: [] }
      }
    });
    action = 'updated';
  }

  let duplicatesRemoved = 0;
  for (const duplicate of botMessages.slice(1)) {
    await discord(`/channels/${channel.id}/messages/${duplicate.id}`, { method: 'DELETE' });
    duplicatesRemoved += 1;
  }

  return {
    action,
    messageId: canonical?.id || null,
    duplicatesRemoved
  };
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const overview = JSON.parse(fs.readFileSync(OVERVIEW_PATH, 'utf8'));
  const channel = await resolveChannel();
  const bot = await discord('/users/@me');

  if (channel.guild_id && String(channel.guild_id) !== String(GUILD_ID)) {
    throw new Error(`Resolved channel ${channel.id} does not belong to guild ${GUILD_ID}.`);
  }

  const content = buildMessage(report, overview);
  const result = await syncMessage(channel, content, bot.id);

  console.log(`Event Leadership channel: #${channel.name} (${channel.id})`);
  console.log(`Event Leadership Overview: ${result.action}`);
  if (result.messageId) console.log(`Message ID: ${result.messageId}`);
  if (result.duplicatesRemoved) console.log(`Duplicates removed: ${result.duplicatesRemoved}`);
}

main().catch((error) => {
  console.error('Kings Event Leadership Overview failed:', error.message);
  process.exit(1);
});
