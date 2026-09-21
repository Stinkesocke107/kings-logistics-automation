const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const STATS_WEBHOOK = process.env.STATS_DISCORD_WEBHOOK_URL || null;
const MONTHLY_WEBHOOK = process.env.MONTHLY_REPORT_DISCORD_WEBHOOK_URL || null;

if (!TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');

async function getJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function webhookTarget(label, url, channels) {
  if (!url) {
    console.log(`${label}: webhook secret unavailable`);
    return;
  }

  const webhook = await getJson(url);
  const channelId = String(webhook.channel_id || '');
  const channel = channels.find((item) => String(item.id) === channelId);
  console.log(`${label}: ${channelId} | ${channel?.name || 'channel name unavailable'}`);
}

async function main() {
  const channels = await getJson(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Channel Discovery/1.1'
    }
  });

  const wanted = /(stat|report|news|announce|monthly|overview)/i;
  for (const channel of channels) {
    if (![0, 5, 15].includes(channel.type)) continue;
    if (!wanted.test(String(channel.name || ''))) continue;
    console.log(`${channel.id} | type=${channel.type} | ${channel.name}`);
  }

  console.log('--- Legacy webhook targets ---');
  await webhookTarget('Statistics', STATS_WEBHOOK, channels);
  await webhookTarget('Monthly Report', MONTHLY_WEBHOOK, channels);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
