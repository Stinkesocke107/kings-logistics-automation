const fs = require('fs');
const { installDiscordBranding } = require('./kings-branding');

const STATS_PATH = process.env.KINGS_CONVOY_HISTORY_STATS_JSON || 'output/convoy-history-statistics.json';
const CHANNEL_ID = process.env.DISCORD_CONVOY_STATISTICS_CHANNEL_ID || '1558352669071118467';
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const MARKER = '📊 **Kings Logistics | Convoy Statistics**';
const API = 'https://discord.com/api/v10';
const COLOR = parseInt('182DFF', 16);

function monthName(monthNumber) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2026, monthNumber - 1, 1)));
}

function currentYearFrom(stats) {
  const parsed = new Date(stats?.generatedAt || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().getUTCFullYear() : parsed.getUTCFullYear();
}

function platformLabel(key) {
  const map = {
    truckersmp: 'TruckersMP',
    haulmp: 'HaulMP',
    tlmp: 'TLMP',
    realmmp: 'RealmMP',
    unknown: 'Unknown'
  };
  return map[key] || key;
}

function buildPayload(stats) {
  const year = currentYearFrom(stats);
  const years = Object.keys(stats?.years || {}).sort();
  const yearLines = years.length
    ? years.map(y => {
        const s = stats.years[y];
        return `**${y}** — ${s.total} total · ${s.own} own · ${s.external} external`;
      }).join('\n')
    : 'No completed convoy history stored yet.';

  const currentYear = stats?.years?.[String(year)] || { total: 0, own: 0, external: 0 };
  const monthLines = [];
  for (let month = 1; month <= 12; month += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const value = stats?.months?.[key]?.total || 0;
    monthLines.push(`**${monthName(month)}** — ${value}`);
  }

  const platformEntries = Object.entries(stats?.platforms || {})
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  const platformLines = platformEntries.length
    ? platformEntries.map(([key, value]) => `**${platformLabel(key)}** — ${value.total}`).join('\n')
    : 'No platform statistics yet.';

  const mostActiveYear = stats?.recordsHighLevel?.mostActiveYear;
  const mostActiveMonth = stats?.recordsHighLevel?.mostActiveMonth;
  const recordLines = [
    mostActiveYear ? `🏆 Most Active Year: **${mostActiveYear.year}** — ${mostActiveYear.total} convoys` : '🏆 Most Active Year: —',
    mostActiveMonth ? `📅 Most Active Month: **${mostActiveMonth.month}** — ${mostActiveMonth.total} convoys` : '📅 Most Active Month: —'
  ].join('\n');

  return {
    content: MARKER,
    embeds: [
      {
        title: 'Kings Logistics — Convoy Statistics',
        description:
          'Official convoy history and participation statistics for Kings Logistics.\n\n' +
          `**Total Convoys Attended:** ${stats?.allTime?.total || 0}\n` +
          `**Kings Hosted Convoys:** ${stats?.allTime?.own || 0}\n` +
          `**External Convoys Attended:** ${stats?.allTime?.external || 0}`,
        color: COLOR,
        fields: [
          { name: 'By Year', value: yearLines.slice(0, 1024) }
        ],
        footer: { text: 'Kings Logistics • Automatically updated' },
        timestamp: stats.generatedAt
      },
      {
        title: `Convoy Statistics — ${year}`,
        description:
          `**Total:** ${currentYear.total}\n` +
          `**Own:** ${currentYear.own}\n` +
          `**External:** ${currentYear.external}`,
        color: COLOR,
        fields: [
          { name: 'Monthly Statistics', value: monthLines.join('\n').slice(0, 1024) }
        ]
      },
      {
        title: 'Platforms & Records',
        color: COLOR,
        fields: [
          { name: 'Platforms', value: platformLines.slice(0, 1024), inline: true },
          { name: 'Records', value: recordLines.slice(0, 1024), inline: true }
        ],
        footer: {
          text: 'Convoys count when Kings participation is verified by the configured platform/history rules.'
        }
      }
    ],
    allowed_mentions: { parse: [] }
  };
}

async function discord(path, options = {}) {
  const response = await fetch(API + path, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Kings Logistics Convoy Statistics/1.0'
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function findExistingMessage(botId) {
  let before = null;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const messages = await discord(`/channels/${CHANNEL_ID}/messages?${query}`);
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const found = messages.find(message =>
      message.author?.id === botId &&
      String(message.content || '').includes('Kings Logistics | Convoy Statistics')
    );
    if (found) return found;

    if (messages.length < 100) return null;
    before = messages[messages.length - 1].id;
  }
  return null;
}

async function publish(stats) {
  if (!TOKEN) throw new Error('Missing DISCORD_BOT_TOKEN.');
  if (!/^\d+$/.test(CHANNEL_ID)) throw new Error('Invalid DISCORD_CONVOY_STATISTICS_CHANNEL_ID.');

  const total = Number(stats?.allTime?.total || 0);
  if (total <= 0 && !/^(?:1|true|yes)$/i.test(process.env.KINGS_ALLOW_EMPTY_CONVOY_STATS || '')) {
    throw new Error('Refusing to publish empty convoy statistics.');
  }

  installDiscordBranding();
  const me = await discord('/users/@me');
  const payload = buildPayload(stats);
  const existing = await findExistingMessage(String(me.id));

  if (existing) {
    await discord(`/channels/${CHANNEL_ID}/messages/${existing.id}`, {
      method: 'PATCH',
      body: payload
    });
    return { action: 'updated', messageId: existing.id };
  }

  const created = await discord(`/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    body: payload
  });
  return { action: 'created', messageId: created?.id || null };
}

async function main() {
  if (!fs.existsSync(STATS_PATH)) throw new Error(`Missing ${STATS_PATH}. Run convoy-history.js first.`);
  const stats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  const result = await publish(stats);
  console.log(`Convoy statistics Discord message ${result.action}: ${result.messageId || 'unknown'}`);
}

module.exports = { buildPayload, publish, currentYearFrom, platformLabel };

if (require.main === module) {
  main().catch(error => {
    console.error('Kings Convoy Statistics Discord publisher failed:', error.message);
    process.exit(1);
  });
}
