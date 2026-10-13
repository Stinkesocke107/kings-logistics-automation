const DISCORD_API = 'https://discord.com/api/v10';

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
    throw new Error(`Discord API ${response.status} on ${method} ${pathname}: ${text.slice(0, 500)}`);
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
  let messageId;

  if (existing) {
    if (String(existing.content || '').trim() === String(content || '').trim()) {
      action = 'unchanged';
      messageId = existing.id;
    } else {
      const updated = await api(
        token,
        `/channels/${channelId}/messages/${existing.id}`,
        { method: 'PATCH', body },
        userAgent
      );
      action = 'updated';
      messageId = updated?.id || existing.id;
    }
  } else {
    const created = await api(
      token,
      `/channels/${channelId}/messages`,
      { method: 'POST', body },
      userAgent
    );
    action = 'created';
    messageId = created?.id || null;
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

  return { action, messageId, duplicatesRemoved };
}

async function syncEmbedMessage({
  token,
  channelId,
  marker,
  embed,
  userAgent
}) {
  if (!token) throw new Error('Missing Discord bot token.');
  if (!/^\d+$/.test(String(channelId || ''))) throw new Error('Invalid Discord channel ID.');
  if (!marker) throw new Error('Missing Leadership embed marker.');

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
  const body = { embeds: [embed], allowed_mentions: { parse: [] } };

  let action;
  let messageId;

  if (existing) {
    const updated = await api(
      token,
      `/channels/${channelId}/messages/${existing.id}`,
      { method: 'PATCH', body },
      userAgent
    );
    action = 'updated';
    messageId = updated?.id || existing.id;
  } else {
    const created = await api(
      token,
      `/channels/${channelId}/messages`,
      { method: 'POST', body },
      userAgent
    );
    action = 'created';
    messageId = created?.id || null;
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

  return { action, messageId, duplicatesRemoved };
}

module.exports = { syncTextMessage, syncEmbedMessage };
