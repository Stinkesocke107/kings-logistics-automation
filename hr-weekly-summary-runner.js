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
      'User-Agent': 'Kings Logistics HR Weekly Channel Resolver/1.1'
    },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Discord API ${response.status} on GET ${pathname}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

async function readableMessages(channel) {
  try {
    const value = await discord(`/channels/${channel.id}/messages?limit=100`);
    return { channel, messages: Array.isArray(value) ? value : [] };
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      console.log(`Ignoring inaccessible HR channel #${channel.name} (${channel.id}) during target resolution.`);
      return null;
    }
    throw error;
  }
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

  const readable = [];
  for (const channel of matches) {
    const candidate = await readableMessages(channel);
    if (candidate) readable.push(candidate);
  }

  if (readable.length === 0) {
    throw new Error(`No readable HR Leadership channel matches "${CHANNEL_NAME}".`);
  }
  if (readable.length === 1) {
    return { ...readable[0].channel, resolutionMethod: matches.length === 1 ? 'unique-name' : 'unique-readable-channel' };
  }

  const historical = readable.filter(({ messages }) =>
    messages.some((message) =>
      message.author?.id === bot.id &&
      String(message.content || '').includes('Kings HR Weekly Summary')
    )
  );

  if (historical.length === 1) {
    return { ...historical[0].channel, resolutionMethod: 'weekly-history' };
  }

  throw new Error(
    `HR Leadership channel resolution is ambiguous. normalizedMatches=${matches.length}, ` +
    `readableMatches=${readable.length}, matchesWithWeeklyHistory=${historical.length}. ` +
    `Configure HR_LEADERSHIP_CHANNEL_ID before publishing.`
  );
}

async function main() {
  if (process.env.HR_LEADERSHIP_CHANNEL_ID) {
    console.log(`Using configured HR Leadership channel ID ${process.env.HR_LEADERSHIP_CHANNEL_ID}.`);
  } else {
    const channel = await resolveHrChannel();
    process.env.HR_LEADERSHIP_CHANNEL_ID = String(channel.id);
    console.log(
      `Resolved HR Weekly target to #${channel.name} (${channel.id}) via ${channel.resolutionMethod}.`
    );
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
