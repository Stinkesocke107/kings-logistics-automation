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
const memberCache = new Map();

async function discord(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Convoy Role Diagnostic/1.2'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API ${response.status} on ${path}: ${body.slice(0, 500)}`);
  }

  return response.json();
}

function clean(text = '') {
  return String(text)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[*_`~]/g, '')
    .trim();
}

function detectStatusPhrase(text = '') {
  const value = clean(text).toLowerCase();
  if (/(?:^|\s)(cancelled|canceled)(?:\s|$)/.test(value)) return 'Cancelled';
  if (/(?:^|\s)(completed|finished)(?:\s|$)/.test(value)) return 'Completed';
  if (/(?:^|\s)(scheduled|approved)(?:\s|$)/.test(value)) return 'Scheduled';
  return null;
}

function preview(text = '') {
  const value = clean(text).replace(/\s+/g, ' ');
  if (!value) return '<EMPTY>';
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

async function lookupMemberRoles(message) {
  const inlineRoles = message.member?.roles || [];
  const userId = message.author?.id || null;

  if (!userId) {
    return {
      inlineRoles,
      lookupRoles: [],
      lookupError: 'Missing author ID.'
    };
  }

  if (!memberCache.has(userId)) {
    try {
      const member = await discord(`/guilds/${GUILD_ID}/members/${userId}`);
      memberCache.set(userId, {
        roles: member.roles || [],
        error: null
      });
    } catch (error) {
      memberCache.set(userId, {
        roles: [],
        error: error.message
      });
    }
  }

  const cached = memberCache.get(userId);
  return {
    inlineRoles,
    lookupRoles: cached.roles,
    lookupError: cached.error
  };
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
    console.log('---');
    console.log(`Thread: ${thread.name} (${thread.id})`);
    console.log(`Messages returned by Discord: ${messages.length}`);

    for (const message of messages) {
      const content = message.content || '';
      const status = detectStatusPhrase(content);
      const inlineRoles = message.member?.roles || [];

      console.log(`Message ${message.id} | author ${message.author?.id || 'unknown'} | type ${message.type} | content: ${preview(content)} | inline roles: ${inlineRoles.length ? inlineRoles.join(', ') : 'NONE'}`);

      if (!status) continue;

      found += 1;
      console.log(`STATUS DETECTED: ${status}`);

      const roleInfo = await lookupMemberRoles(message);
      const matches = roleInfo.lookupRoles.filter((roleId) => EVENT_TEAM_ROLE_IDS.has(roleId));

      console.log(`Guild member lookup roles: ${roleInfo.lookupRoles.length ? roleInfo.lookupRoles.join(', ') : 'NONE'}`);
      console.log(`Configured Event Team role matches: ${matches.length ? matches.join(', ') : 'NONE'}`);
      if (roleInfo.lookupError) console.log(`Guild member lookup error: ${roleInfo.lookupError}`);
    }
  }

  if (found === 0) {
    console.log('No Approved/Scheduled/Completed/Cancelled status message was found in the text Discord returned.');
  }

  console.log('Diagnostic is READ_ONLY. No Discord data was changed.');
}

main().catch((error) => {
  console.error('Role diagnostic failed:', error.message);
  process.exit(1);
});