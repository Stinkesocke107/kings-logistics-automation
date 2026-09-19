const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';

const EVENT_TEAM_ROLE_IDS = new Set([
  '1378658861816217600',
  '1363949241138941952',
  '1492930716156166165',
  '1492930713459364031',
  '1199767340787703828',
  '1433646186778329228',
  '1492929616019718285'
]);

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discord(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Convoy Role Diagnostic/1.0'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API ${response.status} on ${path}: ${body.slice(0, 500)}`);
  }

  return response.json();
}

function detectStatusPhrase(text = '') {
  const value = text.toLowerCase().replace(/[*_`~]/g, '').trim();
  if (/\b(cancelled|canceled)\b/.test(value)) return 'Cancelled';
  if (/\b(completed|finished)\b/.test(value)) return 'Completed';
  if (/\b(?:scheduled|approved)\b/.test(value)) return 'Scheduled';
  return null;
}

async function main() {
  const activeData = await discord(`/guilds/${GUILD_ID}/threads/active`);
  const threads = (activeData.threads || []).filter((thread) => thread.parent_id === FORUM_ID);

  console.log('Kings Convoy approval role diagnostic');
  console.log(`Active convoy threads: ${threads.length}`);

  let found = 0;

  for (const thread of threads) {
    if (/\btemplate\b/i.test(thread.name || '')) continue;

    const messages = await discord(`/channels/${thread.id}/messages?limit=100`);
    for (const message of messages) {
      const status = detectStatusPhrase(message.content || '');
      if (!status) continue;

      found += 1;
      const roles = message.member?.roles || [];
      const matches = roles.filter((roleId) => EVENT_TEAM_ROLE_IDS.has(roleId));

      console.log('---');
      console.log(`Thread: ${thread.name} (${thread.id})`);
      console.log(`Status phrase detected: ${status}`);
      console.log(`Author ID: ${message.author?.id || 'unknown'}`);
      console.log(`Roles supplied by Discord: ${roles.length ? roles.join(', ') : 'NONE'}`);
      console.log(`Configured Event Team role matches: ${matches.length ? matches.join(', ') : 'NONE'}`);
    }
  }

  if (found === 0) {
    console.log('No Approved/Scheduled/Completed/Cancelled status message was found.');
  }

  console.log('Diagnostic is READ_ONLY. No Discord data was changed.');
}

main().catch((error) => {
  console.error('Role diagnostic failed:', error.message);
  process.exit(1);
});
