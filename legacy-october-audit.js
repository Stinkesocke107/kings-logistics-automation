const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const OCTOBER_ID = '1394466082064171020';
const FORCED_OCTOBER_THREADS = ['1525302183275401276'];

if (!TOKEN) throw new Error('DISCORD_BOT_TOKEN missing');

async function discord(pathname) {
  const response = await fetch(`${API}${pathname}`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics October Legacy Audit/1.0'
    },
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${text.slice(0,400)}`);
  return text ? JSON.parse(text) : null;
}

async function threads(channelId) {
  const byId = new Map();
  const active = await discord(`/guilds/${GUILD_ID}/threads/active`);
  for (const thread of active?.threads || []) {
    if (String(thread.parent_id) === String(channelId)) byId.set(String(thread.id), thread);
  }

  let before = null;
  for (let page=0; page<20; page++) {
    const q = new URLSearchParams({limit:'100'});
    if (before) q.set('before', before);
    const r = await discord(`/channels/${channelId}/threads/archived/public?${q.toString()}`);
    const batch = r?.threads || [];
    for (const thread of batch) byId.set(String(thread.id), thread);
    if (!r?.has_more || !batch.length) break;
    before = batch[batch.length-1]?.thread_metadata?.archive_timestamp || null;
    if (!before) break;
  }
  for (const threadId of FORCED_OCTOBER_THREADS) {
    if (byId.has(String(threadId))) continue;
    try {
      const thread = await discord(`/channels/${threadId}`);
      if (thread?.id) byId.set(String(thread.id), thread);
    } catch (error) {
      console.warn(`FORCED THREAD ${threadId} unavailable: ${error.message}`);
    }
  }

  return [...byId.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}

function imageLike(a) {
  const ct = String(a?.content_type || '');
  const name = String(a?.filename || '');
  return ct.startsWith('image/') || /\.(?:png|jpe?g|webp|gif)$/i.test(name);
}

function embedUrls(embed) {
  const out = [];
  for (const [kind,obj] of [['image',embed?.image],['thumbnail',embed?.thumbnail],['video',embed?.video]]) {
    const url = obj?.url || obj?.proxy_url || null;
    if (url) out.push({kind,url});
  }
  if (embed?.url) out.push({kind:'embed-url',url:embed.url});
  return out;
}

function componentUrls(components) {
  const out = [];
  function walk(items) {
    for (const item of items || []) {
      if (item?.url) out.push(item.url);
      if (item?.components) walk(item.components);
    }
  }
  walk(components);
  return out;
}

async function main() {
  const list = await threads(OCTOBER_ID);
  console.log(`OCTOBER THREADS: ${list.length}`);

  for (const thread of list) {
    const messages = await discord(`/channels/${thread.id}/messages?limit=100`);
    const sorted = [...(messages || [])].sort((a,b)=>new Date(a.timestamp||0)-new Date(b.timestamp||0));
    console.log(`\n=== ${thread.name} | ${thread.id} ===`);

    sorted.forEach((m,index)=>{
      const atts=(m.attachments||[]).map(a=>({
        id:a.id,
        filename:a.filename,
        content_type:a.content_type,
        url:a.url,
        proxy_url:a.proxy_url,
        width:a.width,
        height:a.height,
        image:imageLike(a)
      }));
      const embeds=(m.embeds||[]).map((e,i)=>({
        index:i,
        title:e.title||null,
        url:e.url||null,
        description:String(e.description||'').replace(/\s+/g,' ').slice(0,800)||null,
        media:embedUrls(e),
        fields:(e.fields||[]).map(f=>({name:f.name,value:String(f.value||'').replace(/\s+/g,' ').slice(0,800)}))
      }));
      const urls=componentUrls(m.components);
      const content=String(m.content||'').replace(/\s+/g,' ').trim();

      console.log(JSON.stringify({
        order:index+1,
        messageId:String(m.id),
        timestamp:m.timestamp,
        authorBot:Boolean(m.author?.bot),
        authorName:m.author?.username||null,
        content,
        attachments:atts,
        embeds,
        componentUrls:urls
      }));
    });
  }
}

main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
