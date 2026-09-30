require('./kings-branding').installDiscordBranding();
const { resilientFetchJson } = require('./api-resilience');
const fs = require('fs');
const path = require('path');

// ======================================================
// KINGS LOGISTICS — TRUCKERSMP NEWS AUTOMATION
// ======================================================

const KINGS_VTC_ID = 64284;
const NEWS_API_URL = `https://api.truckersmp.com/v2/vtc/${KINGS_VTC_ID}/news`;
const DISCORD_WEBHOOK_URL = process.env.NEWS_DISCORD_WEBHOOK_URL;
const STATE_FILE = path.join(__dirname, 'data', 'last-news.json');
const KINGS_COLOR = parseInt('182dff', 16);

function cleanText(text = '') {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

async function getNews() {
  console.log('Loading Kings Logistics TruckersMP News API with resilience...');

  const data = await resilientFetchJson(NEWS_API_URL, {
    label: 'truckersmp-vtc-news',
    retries: 3,
    timeoutMs: 15000,
    fetchOptions: {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics GitHub Automation'
      }
    },
    validateJson: (payload) => Boolean(
      payload &&
      payload.error !== true &&
      payload.response &&
      Array.isArray(payload.response.news)
    )
  });

  const news = data.response.news
    .map(item => ({
      id: Number(item.id),
      title: String(item.title || 'Kings Logistics News').trim() || 'Kings Logistics News',
      description: cleanText(item.content_summary || ''),
      author: String(item.author || 'Kings Logistics').trim() || 'Kings Logistics',
      publishedAt: item.published_at || null,
      updatedAt: item.updated_at || null,
      url: `https://truckersmp.com/vtc/${KINGS_VTC_ID}/news/${item.id}`
    }))
    .filter(item => Number.isFinite(item.id) && item.id > 0);

  news.sort((a, b) => {
    const dateA = new Date(a.publishedAt || 0).getTime();
    const dateB = new Date(b.publishedAt || 0).getTime();
    return dateB - dateA;
  });

  if (news.length === 0) {
    throw new Error('No Kings Logistics news posts were returned by TruckersMP.');
  }

  console.log(`Loaded ${news.length} Kings Logistics news post(s).`);
  console.log(`Latest news: ${news[0].title}`);
  return news;
}

function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('Invalid last-news.json schema; refusing to reset it.');
  }

  const lastId = Number(state.lastId);
  if (!Number.isInteger(lastId) || lastId <= 0) {
    throw new Error('Invalid last-news.json lastId; refusing to reset it.');
  }

  if (typeof state.lastTitle !== 'string' || !state.lastTitle.trim()) {
    throw new Error('Invalid last-news.json lastTitle; refusing to reset it.');
  }

  if (typeof state.lastUrl !== 'string' || !/^https:\/\/truckersmp\.com\/vtc\/64284\/news\/\d+$/.test(state.lastUrl)) {
    throw new Error('Invalid last-news.json lastUrl; refusing to reset it.');
  }

  if (typeof state.updatedAt !== 'string' || Number.isNaN(new Date(state.updatedAt).getTime())) {
    throw new Error('Invalid last-news.json updatedAt; refusing to reset it.');
  }

  return {
    lastId,
    lastTitle: state.lastTitle,
    lastUrl: state.lastUrl,
    updatedAt: state.updatedAt
  };
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;

  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid state last-news.json; refusing to reset it: ${error.message}`);
  }

  return validateState(state);
}

function saveState(newsItem) {
  if (!newsItem || !Number.isInteger(Number(newsItem.id)) || Number(newsItem.id) <= 0) {
    throw new Error('Refusing to save invalid News state.');
  }

  const directory = path.dirname(STATE_FILE);
  fs.mkdirSync(directory, { recursive: true });

  const state = {
    lastId: Number(newsItem.id),
    lastTitle: String(newsItem.title || 'Kings Logistics News'),
    lastUrl: String(newsItem.url || `https://truckersmp.com/vtc/${KINGS_VTC_ID}/news/${newsItem.id}`),
    updatedAt: new Date().toISOString()
  };

  // Validate before writing so a malformed state can never replace a good one.
  validateState(state);
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  console.log(`News state checkpoint updated to article ${state.lastId}.`);
}

async function sendToDiscord(newsItem) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error('NEWS_DISCORD_WEBHOOK_URL is missing.');
  }

  let description = newsItem.description;
  if (!description) {
    description = 'A new Kings Logistics news post has been published on TruckersMP.';
  }
  description = truncate(description, 4000);

  const embed = {
    author: { name: 'Kings Logistics' },
    title: truncate(newsItem.title, 256),
    url: newsItem.url,
    description,
    color: KINGS_COLOR
  };

  if (newsItem.publishedAt) {
    const date = new Date(newsItem.publishedAt);
    if (!Number.isNaN(date.getTime())) embed.timestamp = date.toISOString();
  }

  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Kings Logistics just published a news post!',
      embeds: [embed],
      allowed_mentions: { parse: [] }
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord webhook failed: HTTP ${response.status} - ${errorText}`);
  }

  console.log(`Discord post sent: ${newsItem.title}`);
}

async function checkNews() {
  const news = await getNews();
  const latest = news[0];
  const state = loadState();

  // First run: establish a baseline without replaying historical news.
  if (!state) {
    console.log('');
    console.log('First run detected. Saving current latest news without posting it to Discord.');
    saveState(latest);
    return { sent: 0, baseline: true, lastId: latest.id };
  }

  if (Number(latest.id) === Number(state.lastId)) {
    console.log('');
    console.log('No new Kings Logistics news found.');
    return { sent: 0, baseline: false, lastId: state.lastId };
  }

  const oldIndex = news.findIndex(item => Number(item.id) === Number(state.lastId));
  let newItems;

  if (oldIndex > 0) {
    newItems = news.slice(0, oldIndex).reverse();
  } else {
    // If the previous article fell out of the API response, only send the newest
    // one. This deliberately prefers missing an old replay over causing spam.
    console.log('Previous saved news was not found in the current API response.');
    console.log('Only the latest article will be sent.');
    newItems = [latest];
  }

  console.log('');
  console.log(`${newItems.length} new Kings Logistics news post(s) detected.`);

  let sent = 0;
  for (const item of newItems) {
    // Critical ordering: Discord must succeed first. Then checkpoint THIS item.
    // If a later article fails, the next run resumes after the last successful
    // post instead of reposting already-delivered articles.
    await sendToDiscord(item);
    saveState(item);
    sent += 1;
  }

  return { sent, baseline: false, lastId: Number(newItems.at(-1)?.id || state.lastId) };
}

async function start() {
  console.log('==================================');
  console.log('Kings Logistics News Automation');
  console.log('==================================');
  console.log('');

  const result = await checkNews();

  console.log('');
  console.log(`Kings News check completed successfully. Sent: ${result.sent}.`);
}

start().catch(error => {
  console.error('');
  console.error('Kings News Automation failed:');
  console.error(error);
  process.exit(1);
});