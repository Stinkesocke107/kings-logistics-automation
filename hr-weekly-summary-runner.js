const { spawnSync } = require('child_process');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_NAME = process.env.HR_LEADERSHIP_CHANNEL_NAME || 'hr-leadership';
const DISCORD_API = 'https://discord.com/api/v10';

if (!TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function normalizeChannelName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function discord(pathname) {
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics HR Weekly Channel Resolver/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on GET ${pathname}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function resolveHrChannel() {
  const bot = await discord('/users/@me');
  const channels = await discord(`/guilds/${GUILD_ID}/channels`);
  const wanted = normalizeChannelName(CHANNEL_NAME);
  const matches = (channels || []).filter((channel) =>
    [0, 5].includes(channel.type) && normalizeChannelName(channel.name) === wanted
  );

  if (matches.length === 0) {
    throw new Error(`No HR Leadership channel matches "${CHANNEL_NAME}".`);
  }
  if (matches.length === 1) return matches[0];

  const historical = [];
  for (const channel of matches) {
    const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
    const hasWeeklyHistory = (Array.isArray(messages) ? messages : []).some((message) =>
      message.author?.id === bot.id &&
      String(message.content || '').includes('Kings HR Weekly Summary')
    );
    if (hasWeeklyHistory) historical.push(channel);
  }

  if (historical.length === 1) return historical[0];

  throw new Error(
    `HR Leadership channel resolution is ambiguous. normalizedMatches=${matches.length}, ` +
    `matchesWithWeeklyHistory=${historical.length}. Configure HR_LEADERSHIP_CHANNEL_ID before publishing.`
  );
}

async function main() {
  if (process.env.HR_LEADERSHIP_CHANNEL_ID) {
    console.log(`Using configured HR Leadership channel ID ${process.env.HR_LEADERSHIP_CHANNEL_ID}.`);
  } else {
    const channel = await resolveHrChannel();
    process.env.HR_LEADERSHIP_CHANNEL_ID = String(channel.id);
    console.log(`Resolved HR Weekly target to #${channel.name} (${channel.id}) using existing weekly-report history.`);
  }

  const result = spawnSync(process.execPath, ['hr-weekly-summary.js'], {
    env: process.env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error('Kings HR Weekly Summary runner failed:', error.message);
  process.exit(1);
});
