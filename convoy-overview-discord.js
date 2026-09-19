const fs = require('fs');
const { discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_ID = process.env.DISCORD_CONVOY_OVERVIEW_CHANNEL_ID || '1550619865805754378';
const OVERVIEW_PATH = 'output/convoy-overview.json';
const MESSAGE_MARKER = '👑 **Kings Convoy Overview**';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(OVERVIEW_PATH)) {
  console.error(`Missing ${OVERVIEW_PATH}. Run convoy-overview.js first.`);
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Convoy Overview Discord/1.2'
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

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function truncate(value, max = 70) {
  const text = String(value || 'Unnamed Convoy').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function makeEmptyMonth() {
  return {
    countedConvoys: 0,
    scheduled: 0,
    completed: 0,
    cancelled: 0,
    needsInformation: 0,
    readyForApproval: 0,
    submitted: 0,
    other: 0,
    convoys: []
  };
}

function convoyTimeLabel(convoy) {
  if (convoy.eventUnix && convoy.eventTimeValid) {
    return `${discordTimestamp(convoy.eventUnix, 'F')} · ${discordTimestamp(convoy.eventUnix, 'R')}`;
  }
  return '⚠️ Awaiting valid event time / timezone';
}

function buildMessage(overview) {
  const currentMonth = new Date(overview.generatedAt || Date.now()).toISOString().slice(0, 7);
  const month = overview.months?.[currentMonth] || makeEmptyMonth();
  const currentConvoys = [...(month.convoys || [])]
    .sort((a, b) => Number(a.eventUnix || 0) - Number(b.eventUnix || 0));

  const lines = [
    MESSAGE_MARKER,
    '',
    `📅 **${monthLabel(currentMonth)}**`,
    `🚛 Counted Convoys: **${month.countedConvoys}**`,
    `🗓️ Scheduled: **${month.scheduled}**`,
    `✅ Completed: **${month.completed}**`,
    `❌ Cancelled: **${month.cancelled}**`,
    `⚠️ Needs Information: **${month.needsInformation}**`,
    `⏳ Ready for Approval: **${month.readyForApproval}**`,
    '',
    '**Overall**',
    `👑 Confirmed Kings-slot Convoys: **${overview.overall?.countedConvoys || 0}**`,
    `📋 Real Convoy Submissions: **${overview.overall?.realConvoySubmissions || 0}**`,
    `📅 Awaiting valid Event Date: **${overview.overall?.undatedCountedConvoys || 0}**`,
    `🕒 Awaiting valid timezone: **${overview.overall?.invalidEventTimeConvoys || 0}**`,
    '',
    '**Convoys this month**'
  ];

  if (currentConvoys.length === 0) {
    lines.push('— No counted convoys with a valid Event Date this month.');
  } else {
    const shown = currentConvoys.slice(0, 10);
    for (const convoy of shown) {
      lines.push(`• ${convoyTimeLabel(convoy)} — **${truncate(convoy.name)}** — \`${convoy.status || 'Unknown'}\``);
    }
    if (currentConvoys.length > shown.length) {
      lines.push(`• …and ${currentConvoys.length - shown.length} more.`);
    }
  }

  lines.push('', '🤖 Updated automatically every 15 minutes. Discord shows every event time in each member’s local timezone. TEST threads are excluded.');

  let content = lines.join('\n');
  if (content.length > 1990) {
    content = `${content.slice(0, 1950)}\n…\n🤖 Updated automatically.`;
  }
  return content;
}

async function main() {
  const overview = JSON.parse(fs.readFileSync(OVERVIEW_PATH, 'utf8'));
  const bot = await discord('/users/@me');
  const channel = await discord(`/channels/${CHANNEL_ID}`);

  if (channel.guild_id && channel.guild_id !== GUILD_ID) {
    throw new Error(`Overview channel ${CHANNEL_ID} does not belong to guild ${GUILD_ID}.`);
  }

  const content = buildMessage(overview);
  const messages = await discord(`/channels/${CHANNEL_ID}/messages?limit=100`);
  const existing = (messages || []).find((message) =>
    message.author?.id === bot.id &&
    (message.content || '').includes(MESSAGE_MARKER)
  );

  if (!existing) {
    const created = await discord(`/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      body: {
        content,
        allowed_mentions: { parse: [] }
      }
    });
    console.log(`Created Kings Convoy Overview message: ${created?.id || 'unknown'}`);
    return;
  }

  if ((existing.content || '').trim() === content.trim()) {
    console.log(`Kings Convoy Overview unchanged: ${existing.id}`);
    return;
  }

  await discord(`/channels/${CHANNEL_ID}/messages/${existing.id}`, {
    method: 'PATCH',
    body: {
      content,
      allowed_mentions: { parse: [] }
    }
  });

  console.log(`Updated Kings Convoy Overview message: ${existing.id}`);
}

main().catch((error) => {
  console.error('Kings Convoy Overview Discord sync failed:', error.message);
  process.exit(1);
});
