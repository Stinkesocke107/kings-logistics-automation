const { installDiscordBranding, brandMessageContent } = require('./kings-branding');
installDiscordBranding();
const fs = require('fs');
const { discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_ID = process.env.DISCORD_CONVOY_OVERVIEW_CHANNEL_ID || '1550619865805754378';
const OVERVIEW_PATH = 'output/convoy-overview.json';
const MESSAGE_MARKER = '👑 **Kings Logistics | Convoy Overview**';
const MESSAGE_TEXT = 'Kings Logistics | Convoy Overview';

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
    'User-Agent': 'Kings Logistics Convoy Overview Discord/2.1'
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

function nextMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return date.toISOString().slice(0, 7);
}

function convoyMonthKey(convoy) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(convoy?.eventDate || ''))) {
    return convoy.eventDate.slice(0, 7);
  }
  const unix = Number(convoy?.eventUnix || 0);
  if (!Number.isFinite(unix) || unix <= 0) return null;
  return new Date(unix * 1000).toISOString().slice(0, 7);
}

function convoyDateUnix(convoy) {
  const unix = Number(convoy?.eventUnix || 0);
  if (Number.isFinite(unix) && unix > 0) return unix;

  const date = String(convoy?.eventDate || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function convoyDateLabel(convoy) {
  const unix = Number(convoy?.eventUnix || 0);
  if (Number.isFinite(unix) && unix > 0) {
    return discordTimestamp(unix, 'd');
  }

  const date = String(convoy?.eventDate || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 1000);
    return discordTimestamp(parsed, 'd');
  }

  return 'Date unavailable';
}

function isPlannedUpcoming(convoy, today) {
  const status = String(convoy?.status || '');
  if (['Completed', 'Cancelled', 'Legacy Past'].includes(status)) return false;

  const date = String(convoy?.eventDate || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date >= today;
  }

  const unix = Number(convoy?.eventUnix || 0);
  return Number.isFinite(unix) && unix > Math.floor(Date.now() / 1000);
}

function plannedSort(a, b) {
  const aValue = convoyDateUnix(a);
  const bValue = convoyDateUnix(b);

  if (aValue !== null && bValue !== null && aValue !== bValue) {
    return aValue - bValue;
  }

  const aDate = String(a?.eventDate || '9999-99-99');
  const bDate = String(b?.eventDate || '9999-99-99');
  const dateCompare = aDate.localeCompare(bDate);
  if (dateCompare !== 0) return dateCompare;

  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

function truncate(value, max = 58) {
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

function statusIcon(status) {
  const icons = {
    Scheduled: '🟢',
    Completed: '✅',
    Cancelled: '❌',
    'Needs Information': '⚠️',
    'Ready for Approval': '⏳',
    Submitted: '📥'
  };
  return icons[status] || '▫️';
}

function convoyTimeLabel(convoy) {
  if (convoy.eventUnix && convoy.eventTimeValid) {
    return `${discordTimestamp(convoy.eventUnix, 'f')} · ${discordTimestamp(convoy.eventUnix, 'R')}`;
  }
  return '⚠️ Time unavailable';
}

function compactUpcoming(convoy) {
  const server = convoy.server ? ` · 🎙️ ${truncate(convoy.server, 24)}` : '';
  const source = convoy.legacy ? ' 📚' : '';
  const info = !convoy.eventTimeValid || !convoy.confirmedKingsSlot ? ' · ⚠️ Info pending' : '';
  return `${statusIcon(convoy.status)}${source} ${convoyDateLabel(convoy)} — **${truncate(convoy.name, 42)}**${server}${info}`;
}

function buildMessage(overview) {
  const generatedAt = new Date(overview.generatedAt || Date.now());
  const currentMonth = generatedAt.toISOString().slice(0, 7);
  const followingMonth = nextMonthKey(currentMonth);
  const month = overview.months?.[currentMonth] || makeEmptyMonth();

  const today = generatedAt.toISOString().slice(0, 10);

  // Convoy Overview shows every planned convoy, even when some operational
  // details are still pending. Reminder eligibility remains stricter elsewhere.
  const upcoming = [...(overview.countedConvoys || [])]
    .filter((convoy) => {
      const key = convoyMonthKey(convoy);
      return (
        (key === currentMonth || key === followingMonth) &&
        isPlannedUpcoming(convoy, today)
      );
    })
    .sort(plannedSort);

  const next = upcoming[0] || null;

  const lines = [
    MESSAGE_MARKER,
    '💙 Live overview of Kings Logistics convoy operations.',
    '',
    `## 📊 ${monthLabel(currentMonth)}`,
    `🚛 **${month.countedConvoys}** Convoys  ·  🟢 **${month.scheduled}** Scheduled  ·  ✅ **${month.completed}** Completed  ·  ❌ **${month.cancelled}** Cancelled`,
    `⚠️ **${month.needsInformation}** Needs Info  ·  ⏳ **${month.readyForApproval}** Ready for Approval`,
    '',
    '## ⏭️ Next Convoy'
  ];

  if (!next) {
    lines.push('No upcoming planned convoy in the current or next month.');
  } else {
    lines.push(
      `**${truncate(next.name, 70)}**`,
      `🕒 **Meeting:** ${convoyTimeLabel(next)}`,
      next.server ? `🎙️ **Server:** ${next.server}` : null,
      next.meetingPoint ? `📍 **Meeting Point:** ${next.meetingPoint}` : null,
      next.route ? `🛣️ **Route:** ${next.route}` : null,
      next.kingsSlot ? `🚚 **Kings Slot:** ${next.kingsSlot}` : '🚚 **Kings Slot:** ⚠️ Not recorded yet',
      next.eventUrl ? `🔗 **TruckersMP Event:** ${next.eventUrl}` : '🔗 **TruckersMP Event:** ⚠️ Not recorded yet',
      next.legacy ? '📚 **Source:** Legacy Convoy Calendar (read-only migration)' : null
    );
  }

  lines.push('', `## 📅 Upcoming Convoys — ${monthLabel(currentMonth)} & ${monthLabel(followingMonth)}`);
  const shown = upcoming.slice(0, 5);
  if (shown.length === 0) {
    lines.push('— No upcoming convoys scheduled for the current or next month.');
  } else {
    for (const convoy of shown) lines.push(compactUpcoming(convoy));
    if (upcoming.length > shown.length) lines.push(`…and **${upcoming.length - shown.length}** more.`);
  }

  lines.push(
    '',
    '## 📋 System Overview',
    `👑 Confirmed Kings Slots: **${overview.overall?.confirmedKingsSlots ?? overview.overall?.countedConvoys ?? 0}**  ·  📥 New Convoy Center: **${overview.overall?.realConvoySubmissions || 0}**`,
    `📚 Legacy Calendar: **${overview.overall?.legacyActiveConvoys || 0}** active · **${overview.overall?.legacyDuplicatesSuppressed || 0}** duplicate(s) suppressed`,
    `🗓️ Upcoming Planned (current + next month): **${upcoming.length}**  ·  ⚠️ Missing Date: **${overview.overall?.undatedCountedConvoys || 0}**  ·  🕒 Missing/Invalid Time: **${overview.overall?.invalidEventTimeConvoys || 0}**`,
    '',
    '🤖 Updated automatically every 15 minutes. 📚 = migrated from the old Convoy Calendar. ⚠️ Info pending = still planned, but some reminder-critical details are missing. New convoys come only from the Convoy Center.'
  );

  let content = lines.filter((value) => value !== null && value !== undefined).join('\n');
  if (content.length > 1990) {
    content = `${content.slice(0, 1940)}\n…\n🤖 Updated automatically every 15 minutes.`;
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
  const expectedStoredContent = brandMessageContent(content);
  const messages = await discord(`/channels/${CHANNEL_ID}/messages?limit=100`);
  const matching = (messages || [])
    .filter((message) =>
      message.author?.id === bot.id &&
      (String(message.content || '').includes(MESSAGE_TEXT) || String(message.content || '').includes('Kings Convoy Overview'))
    )
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  let existing = matching[0] || null;

  if (!existing) {
    existing = await discord(`/channels/${CHANNEL_ID}/messages`, {
      method: 'POST',
      body: {
        content,
        allowed_mentions: { parse: [] }
      }
    });
    console.log(`Created Kings Convoy Overview message: ${existing?.id || 'unknown'}`);
  } else if ((existing.content || '').trim() === expectedStoredContent.trim()) {
    console.log(`Kings Convoy Overview unchanged: ${existing.id}`);
  } else {
    await discord(`/channels/${CHANNEL_ID}/messages/${existing.id}`, {
      method: 'PATCH',
      body: {
        content,
        allowed_mentions: { parse: [] }
      }
    });
    console.log(`Updated Kings Convoy Overview message: ${existing.id}`);
  }

  let removedDuplicates = 0;
  for (const duplicate of matching.slice(1)) {
    await discord(`/channels/${CHANNEL_ID}/messages/${duplicate.id}`, { method: 'DELETE' });
    removedDuplicates += 1;
  }
  if (removedDuplicates > 0) {
    console.log(`Removed ${removedDuplicates} duplicate Kings Convoy Overview message(s).`);
  }
}

main().catch((error) => {
  console.error('Kings Convoy Overview Discord sync failed:', error.message);
  process.exit(1);
});
