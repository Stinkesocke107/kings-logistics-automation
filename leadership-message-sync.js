const DISCORD_API = 'https://discord.com/api/v10';

function consolidatedOnly() {
  return /^(?:1|true|yes|on)$/i.test(String(process.env.LEADERSHIP_CONSOLIDATED_ONLY || ''));
}

async function api(token, pathname, options = {}, userAgent = 'Kings Logistics Leadership Message Sync/1.0') {
  const method = String(options.method || 'GET').toUpperCase();
  const allowed =
    method === 'GET' ||
    (method === 'POST' && /^\/channels\/\d+\/messages$/.test(pathname)) ||
    ((method === 'PATCH' || method === 'DELETE') && /^\/channels\/\d+\/messages\/\d+$/.test(pathname));

  if (!allowed) throw new Error(`Leadership message safety guard blocked: ${method} ${pathname}`);

  const headers = {
    Authorization: `Bot ${token}`,
    'User-Agent': userAgent
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} (${method} request failed)`);
  }

  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function findBotMessages(token, channelId, matcher, userAgent) {
  const bot = await api(token, '/users/@me', {}, userAgent);
  const messages = await api(token, `/channels/${channelId}/messages?limit=100`, {}, userAgent);
  return (messages || []).filter((message) =>
    String(message?.author?.id || '') === String(bot?.id || '') && matcher(message)
  );
}

async function syncTextMessage({
  token,
  channelId,
  marker,
  content,
  suppressEmbeds = true,
  userAgent,
  messageId = null,
  createWithoutDiscovery = false
}) {
  if (consolidatedOnly()) return { action: 'suppressed', messageId: messageId || null, duplicatesRemoved: 0 };
  if (!token) throw new Error('Missing Discord bot token.');
  if (!/^\d+$/.test(String(channelId || ''))) throw new Error('Invalid Discord channel ID.');
  if (!marker) throw new Error('Missing Leadership message marker.');

  const body = {
    content,
    allowed_mentions: { parse: [] },
    ...(suppressEmbeds ? { flags: 4 } : {})
  };

  if (messageId) {
    try {
      const updated = await api(
        token,
        `/channels/${channelId}/messages/${messageId}`,
        { method: 'PATCH', body },
        userAgent
      );
      return { action: 'updated', messageId: updated?.id || messageId, duplicatesRemoved: 0 };
    } catch (error) {
      if (!/Discord API (403|404)/.test(String(error?.message || ''))) throw error;
    }
  }

  if (createWithoutDiscovery) {
    const created = await api(
      token,
      `/channels/${channelId}/messages`,
      { method: 'POST', body },
      userAgent
    );
    return { action: 'created', messageId: created?.id || null, duplicatesRemoved: 0 };
  }

  const matches = await findBotMessages(
    token,
    channelId,
    (message) => String(message?.content || '').includes(marker),
    userAgent
  );
  const existing = matches[0] || null;

  let action;
  let resolvedMessageId;

  if (existing) {
    if (String(existing.content || '').trim() === String(content || '').trim()) {
      action = 'unchanged';
      resolvedMessageId = existing.id;
    } else {
      const updated = await api(
        token,
        `/channels/${channelId}/messages/${existing.id}`,
        { method: 'PATCH', body },
        userAgent
      );
      action = 'updated';
      resolvedMessageId = updated?.id || existing.id;
    }
  } else {
    const created = await api(
      token,
      `/channels/${channelId}/messages`,
      { method: 'POST', body },
      userAgent
    );
    action = 'created';
    resolvedMessageId = created?.id || null;
  }

  let duplicatesRemoved = 0;
  for (const duplicate of matches.slice(1)) {
    await api(
      token,
      `/channels/${channelId}/messages/${duplicate.id}`,
      { method: 'DELETE' },
      userAgent
    );
    duplicatesRemoved += 1;
  }

  return { action, messageId: resolvedMessageId, duplicatesRemoved };
}

// A successful HTTP write does not by itself prove that the updated embed
// can be read back. Compare public display structure without logging content.
async function verifyEmbedDelivery({token,channelId,messageId,embed,userAgent}){
  if(!/^[0-9]+$/.test(String(channelId||''))||
     !/^[0-9]+$/.test(String(messageId||''))||
     !embed||typeof embed!=='object')
    throw Error('Leadership embed delivery not verified');
  const message=await api(token,
    `/channels/${channelId}/messages/${messageId}`,{},userAgent);
  const actual=Array.isArray(message?.embeds)&&message.embeds.length===1?
    message.embeds[0]:null;
  const wanted=Array.isArray(embed.fields)?embed.fields:[];
  const received=Array.isArray(actual?.fields)?actual.fields:[];
  const fieldsMatch=wanted.length===received.length&&
    wanted.every((field,index)=>{
      const row=received[index];
      return row&&String(row.name)===String(field.name)&&
        String(row.value)===String(field.value)&&
        Boolean(row.inline)===Boolean(field.inline);
    });
  if(!(actual&&fieldsMatch&&
    String(actual.title||'')===String(embed.title||'')&&
    String(actual.description||'')===String(embed.description||'')&&
    String(actual?.footer?.text||'')===String(embed?.footer?.text||'')&&
    (embed.color===undefined||actual.color===embed.color)))
    throw Error('Leadership embed delivery not verified');
  return true;
}

async function syncEmbedMessage({
  token,
  channelId,
  marker,
  embed,
  userAgent,
  messageId = null,
  createWithoutDiscovery = false,
  verifyDelivery = false
}) {
  if (consolidatedOnly()) return { action: 'suppressed', messageId: messageId || null, duplicatesRemoved: 0 };
  if (!token) throw new Error('Missing Discord bot token.');
  if (!/^\d+$/.test(String(channelId || ''))) throw new Error('Invalid Discord channel ID.');
  if (!marker) throw new Error('Missing Leadership embed marker.');

  const body = { embeds: [embed], allowed_mentions: { parse: [] } };
  const confirm=async result=>{
    if(!verifyDelivery)return result;
    await verifyEmbedDelivery({token,channelId,messageId:result.messageId,
      embed,userAgent});
    return {...result,deliveryVerified:true};
  };

  if (messageId) {
    try {
      const updated = await api(
        token,
        `/channels/${channelId}/messages/${messageId}`,
        { method: 'PATCH', body },
        userAgent
      );
      return confirm({ action: 'updated', messageId: updated?.id || messageId, duplicatesRemoved: 0 });
    } catch (error) {
      if (!/Discord API (403|404)/.test(String(error?.message || ''))) throw error;
    }
  }

  if (createWithoutDiscovery) {
    const created = await api(
      token,
      `/channels/${channelId}/messages`,
      { method: 'POST', body },
      userAgent
    );
    return confirm({ action: 'created', messageId: created?.id || null, duplicatesRemoved: 0 });
  }

  const matches = await findBotMessages(
    token,
    channelId,
    (message) => (message?.embeds || []).some((item) =>
      String(item?.title || '').includes(marker) ||
      String(item?.description || '').includes(marker)
    ),
    userAgent
  );
  const existing = matches[0] || null;

  let action;
  let resolvedMessageId;

  if (existing) {
    const updated = await api(
      token,
      `/channels/${channelId}/messages/${existing.id}`,
      { method: 'PATCH', body },
      userAgent
    );
    action = 'updated';
    resolvedMessageId = updated?.id || existing.id;
  } else {
    const created = await api(
      token,
      `/channels/${channelId}/messages`,
      { method: 'POST', body },
      userAgent
    );
    action = 'created';
    resolvedMessageId = created?.id || null;
  }

  let duplicatesRemoved = 0;
  for (const duplicate of matches.slice(1)) {
    await api(
      token,
      `/channels/${channelId}/messages/${duplicate.id}`,
      { method: 'DELETE' },
      userAgent
    );
    duplicatesRemoved += 1;
  }

  return confirm({ action, messageId: resolvedMessageId, duplicatesRemoved });
}

module.exports = { syncTextMessage, syncEmbedMessage, verifyEmbedDelivery };
