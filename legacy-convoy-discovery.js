const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

async function discord(pathname) {
  const response = await fetch(`${API}${pathname}`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Legacy Convoy Discovery/1.0'
    },
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on GET ${pathname}: ${text.slice(0, 500)}`);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function norm(value='') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function likelyChannel(channel) {
  const n = norm(channel?.name);
  return /(calendar|convoy|event|schedule|planning|planned|upcoming)/.test(n);
}

async function fetchRecentMessages(channel) {
  if (![0,5].includes(Number(channel.type))) return [];
  try {
    const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
    return Array.isArray(messages) ? messages : [];
  } catch (error) {
    console.warn(`Could not read messages from #${channel.name} (${channel.id}): ${error.message}`);
    return [];
  }
}

async function fetchForumThreads(channel) {
  if (Number(channel.type) !== 15) return [];
  const all = [];

  try {
    const active = await discord(`/guilds/${GUILD_ID}/threads/active`);
    for (const thread of active?.threads || []) {
      if (String(thread.parent_id || '') === String(channel.id)) all.push(thread);
    }
  } catch (error) {
    console.warn(`Could not read active threads for #${channel.name}: ${error.message}`);
  }

  let before = null;
  for (let page=0; page<10; page++) {
    const suffix = before ? `?limit=100&before=${encodeURIComponent(before)}` : '?limit=100';
    try {
      const archived = await discord(`/channels/${channel.id}/threads/archived/public${suffix}`);
      const batch = archived?.threads || [];
      all.push(...batch);
      if (!archived?.has_more || !batch.length) break;
      before = batch[batch.length-1]?.thread_metadata?.archive_timestamp || null;
      if (!before) break;
    } catch (error) {
      console.warn(`Could not read archived threads for #${channel.name}: ${error.message}`);
      break;
    }
  }

  return [...new Map(all.map((thread)=>[String(thread.id),thread])).values()];
}

async function readMonthChannel(channelId, label) {
  const channel = await discord(`/channels/${channelId}`);
  console.log(`\n=== MONTH ${label} ===`);
  console.log(`CHANNEL | ${channel.name} | id=${channel.id} | type=${channel.type} | parent=${channel.parent_id || 'none'}`);

  if ([0, 5].includes(Number(channel.type))) {
    const messages = await fetchRecentMessages(channel);
    console.log(`MESSAGES | ${messages.length}`);
    for (const message of messages) {
      const content = String(message.content || '').replace(/\s+/g, ' ').trim();
      const embedText = (message.embeds || []).map((embed) => [
        embed.title,
        embed.description,
        ...(embed.fields || []).flatMap((field) => [field.name, field.value])
      ].filter(Boolean).join(' | ')).join(' || ');
      const combined = [content, embedText].filter(Boolean).join(' || ');
      if (combined) {
        console.log(`MESSAGE | id=${message.id} | at=${message.timestamp} | ${combined.slice(0, 5000)}`);
      }
    }
  }

  if (Number(channel.type) === 15) {
    const threads = await fetchForumThreads(channel);
    console.log(`THREADS | ${threads.length}`);
    for (const thread of threads) {
      console.log(`THREAD | id=${thread.id} | archived=${Boolean(thread.thread_metadata?.archived)} | name=${thread.name}`);
      try {
        const messages = await discord(`/channels/${thread.id}/messages?limit=100`);
        for (const message of Array.isArray(messages) ? messages : []) {
          const content = String(message.content || '').replace(/\s+/g, ' ').trim();
          const embedText = (message.embeds || []).map((embed) => [
            embed.title,
            embed.description,
            ...(embed.fields || []).flatMap((field) => [field.name, field.value])
          ].filter(Boolean).join(' | ')).join(' || ');
          const combined = [content, embedText].filter(Boolean).join(' || ');
          if (combined) {
            console.log(`THREAD_MESSAGE | thread=${thread.id} | id=${message.id} | at=${message.timestamp} | ${combined.slice(0, 7000)}`);
          }
        }
      } catch (error) {
        console.warn(`Could not read thread ${thread.id}: ${error.message}`);
      }
    }
  }
}

async function main() {
  const months = [
    ['October 2026', '1394466082064171020'],
    ['November 2026', '1394466122270511244'],
    ['December 2026', '1394466158337458267'],
    ['January 2027', '1525976885853425864'],
    ['February 2027', '1525976942967394414'],
    ['March 2027', '1525976979902300160']
  ];

  console.log('=== TARGETED OLD CONVOY CALENDAR DISCOVERY ===');
  for (const [label, channelId] of months) {
    await readMonthChannel(channelId, label);
  }
}

main().catch((error)=>{
  console.error('Legacy Convoy Discovery failed:', error.message);
  process.exit(1);
});
