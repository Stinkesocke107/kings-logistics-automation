const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';

if (!TOKEN) throw new Error('DISCORD_BOT_TOKEN is missing.');

async function main() {
  const response = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Channel Discovery/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) throw new Error(`Discord API ${response.status}: ${await response.text()}`);
  const channels = await response.json();
  const wanted = /(stat|report|news|announce|monthly|overview)/i;

  for (const channel of channels) {
    if (![0, 5, 15].includes(channel.type)) continue;
    if (!wanted.test(String(channel.name || ''))) continue;
    console.log(`${channel.id} | type=${channel.type} | ${channel.name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
