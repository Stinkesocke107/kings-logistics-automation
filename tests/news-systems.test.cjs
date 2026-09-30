const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sandbox } = require('./sandbox.cjs');

const newsItem = (id, publishedAt) => ({
  id,
  title: `News ${id}`,
  content_summary: `<p>Hello <b>Kings</b> &amp; article ${id}</p>`,
  author: 'Kings Logistics',
  published_at: publishedAt,
  updated_at: publishedAt
});

const validState = (id = 1) => JSON.stringify({
  lastId: id,
  lastTitle: `News ${id}`,
  lastUrl: `https://truckersmp.com/vtc/64284/news/${id}`,
  updatedAt: '2026-09-30T12:00:00.000Z'
});

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('News state corruption and invalid schemas fail closed without replacing dedupe state', () => {
  const badStates = [
    '{broken',
    JSON.stringify({ lastId: 0, lastTitle: 'x', lastUrl: 'https://truckersmp.com/vtc/64284/news/1', updatedAt: '2026-09-30T12:00:00Z' }),
    JSON.stringify({ lastId: 1, lastTitle: '', lastUrl: 'https://truckersmp.com/vtc/64284/news/1', updatedAt: '2026-09-30T12:00:00Z' }),
    JSON.stringify({ lastId: 1, lastTitle: 'x', lastUrl: 'https://example.com/news/1', updatedAt: '2026-09-30T12:00:00Z' }),
    JSON.stringify({ lastId: 1, lastTitle: 'x', lastUrl: 'https://truckersmp.com/vtc/64284/news/1', updatedAt: 'not-a-date' })
  ];

  for (const raw of badStates) {
    const s = sandbox('news.js', { files: { 'data/last-news.json': raw } });
    assert.throws(() => s.run('loadState()'), /refusing to reset/);
    assert.equal(s.files.get('data/last-news.json'), raw);
  }
});

test('News first run establishes a baseline and does not replay historical posts', async () => {
  const s = sandbox('news.js', {
    env: { NEWS_DISCORD_WEBHOOK_URL: 'https://discord.test/webhook' },
    fetch: async url => {
      if (url.includes('/vtc/64284/news')) {
        return json({ response: { news: [newsItem(2, '2026-09-30T12:00:00Z'), newsItem(1, '2026-09-29T12:00:00Z')] } });
      }
      throw new Error(`Unexpected network request: ${url}`);
    }
  });

  const result = await s.run('checkNews()');
  assert.equal(result.sent, 0);
  assert.equal(result.baseline, true);
  const state = JSON.parse(s.files.get('data/last-news.json'));
  assert.equal(state.lastId, 2);
  assert.equal(s.calls.filter(call => call.url === 'https://discord.test/webhook').length, 0);
});

test('News sends unseen articles oldest to newest and checkpoints after every successful Discord post', async () => {
  let discordAttempt = 0;
  const s = sandbox('news.js', {
    env: { NEWS_DISCORD_WEBHOOK_URL: 'https://discord.test/webhook' },
    files: { 'data/last-news.json': validState(1) },
    fetch: async (url, options = {}) => {
      if (url.includes('/vtc/64284/news')) {
        return json({ response: { news: [
          newsItem(3, '2026-09-30T13:00:00Z'),
          newsItem(2, '2026-09-30T12:30:00Z'),
          newsItem(1, '2026-09-30T12:00:00Z')
        ] } });
      }
      if (url === 'https://discord.test/webhook') {
        discordAttempt += 1;
        if (discordAttempt === 2) return new Response('temporary Discord failure', { status: 500 });
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected network request: ${url}`);
    }
  });

  await assert.rejects(s.run('checkNews()'), /Discord webhook failed: HTTP 500/);
  assert.equal(JSON.parse(s.files.get('data/last-news.json')).lastId, 2);

  const resumed = await s.run('checkNews()');
  assert.equal(resumed.sent, 1);
  assert.equal(resumed.lastId, 3);
  assert.equal(JSON.parse(s.files.get('data/last-news.json')).lastId, 3);

  const discordCalls = s.calls.filter(call => call.url === 'https://discord.test/webhook');
  assert.equal(discordCalls.length, 3);
  const titles = discordCalls.map(call => JSON.parse(call.options.body).embeds[0].title);
  assert.deepEqual(titles, ['News 2', 'News 3', 'News 3']);
});

test('News no-change run never posts to Discord or rewrites state', async () => {
  const original = validState(7);
  const s = sandbox('news.js', {
    env: { NEWS_DISCORD_WEBHOOK_URL: 'https://discord.test/webhook' },
    files: { 'data/last-news.json': original },
    fetch: async url => {
      if (url.includes('/vtc/64284/news')) {
        return json({ response: { news: [newsItem(7, '2026-09-30T12:00:00Z')] } });
      }
      throw new Error(`Unexpected network request: ${url}`);
    }
  });

  const result = await s.run('checkNews()');
  assert.equal(result.sent, 0);
  assert.equal(s.files.get('data/last-news.json'), original);
  assert.equal(s.calls.filter(call => call.url === 'https://discord.test/webhook').length, 0);
});

test('News missing prior API article sends only current latest to prevent replay spam', async () => {
  const s = sandbox('news.js', {
    env: { NEWS_DISCORD_WEBHOOK_URL: 'https://discord.test/webhook' },
    files: { 'data/last-news.json': validState(1) },
    fetch: async (url, options = {}) => {
      if (url.includes('/vtc/64284/news')) {
        return json({ response: { news: [
          newsItem(10, '2026-09-30T14:00:00Z'),
          newsItem(9, '2026-09-30T13:00:00Z')
        ] } });
      }
      if (url === 'https://discord.test/webhook') return new Response(null, { status: 204 });
      throw new Error(`Unexpected network request: ${url}`);
    }
  });

  const result = await s.run('checkNews()');
  assert.equal(result.sent, 1);
  assert.equal(result.lastId, 10);
  assert.equal(s.calls.filter(call => call.url === 'https://discord.test/webhook').length, 1);
});

test('News formatting strips HTML, respects Discord limits and disables all mentions', async () => {
  const s = sandbox('news.js', {
    env: { NEWS_DISCORD_WEBHOOK_URL: 'https://discord.test/webhook' },
    fetch: async (url, options = {}) => {
      if (url === 'https://discord.test/webhook') return new Response(null, { status: 204 });
      throw new Error(`Unexpected network request: ${url}`);
    }
  });

  assert.equal(s.run(`cleanText('<p>Hello<br>World &amp; &lt;Kings&gt;</p>')`), 'Hello\nWorld & <Kings>');
  assert.equal(s.run(`truncate('abcdef', 5)`), 'ab...');

  await s.run(`sendToDiscord({
    id:55,
    title:'@everyone ' + 'T'.repeat(300),
    description:'@here ' + 'D'.repeat(5000),
    publishedAt:'2026-09-30T12:00:00Z',
    url:'https://truckersmp.com/vtc/64284/news/55'
  })`);

  const call = s.calls.find(call => call.url === 'https://discord.test/webhook');
  const body = JSON.parse(call.options.body);
  assert.deepEqual(body.allowed_mentions, { parse: [] });
  assert.ok(body.embeds[0].title.length <= 256);
  assert.ok(body.embeds[0].description.length <= 4000);
  assert.equal(body.embeds[0].timestamp, '2026-09-30T12:00:00.000Z');
});
