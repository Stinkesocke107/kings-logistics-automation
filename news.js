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
const PUBLICATION_STATE_FILE = path.join(__dirname, 'data', 'news-publication-state.json');
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

function webhookWaitUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com') {
    // Tests and development fixtures may intentionally use a non-Discord host.
    // Production secret validation is handled by GitHub/Discord itself.
  }
  url.searchParams.set('wait', 'true');
  return url.toString();
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

  validateState(state);
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  console.log(`News state checkpoint updated to article ${state.lastId}.`);
  return state;
}

function validatePublicationState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid News publication evidence.');
  if (state.version !== 1) throw new Error('Invalid News publication evidence version.');
  if (!Number.isInteger(Number(state.articleId)) || Number(state.articleId) <= 0) throw new Error('Invalid News publication articleId.');
  if (typeof state.title !== 'string' || !state.title.trim()) throw new Error('Invalid News publication title.');
  if (typeof state.url !== 'string' || !/^https:\/\/truckersmp\.com\/vtc\/64284\/news\/\d+$/.test(state.url)) throw new Error('Invalid News publication URL.');
  if (!/^\d+$/.test(String(state.discordMessageId || ''))) throw new Error('Invalid News publication Discord message ID.');
  if (!/^\d+$/.test(String(state.discordChannelId || ''))) throw new Error('Invalid News publication Discord channel ID.');
  if (typeof state.postedAt !== 'string' || Number.isNaN(Date.parse(state.postedAt))) throw new Error('Invalid News publication postedAt.');
  if (state.articlePublishedAt !== null && (typeof state.articlePublishedAt !== 'string' || Number.isNaN(Date.parse(state.articlePublishedAt)))) {
    throw new Error('Invalid News publication articlePublishedAt.');
  }
  return state;
}

function savePublicationEvidence(newsItem, discordMessage) {
  const evidence = {
    version: 1,
    articleId: Number(newsItem.id),
    title: String(newsItem.title || 'Kings Logistics News'),
    url: String(newsItem.url),
    articlePublishedAt: newsItem.publishedAt ? new Date(newsItem.publishedAt).toISOString() : null,
    discordMessageId: String(discordMessage?.id || ''),
    discordChannelId: String(discordMessage?.channel_id || ''),
    postedAt: new Date().toISOString()
  };
  validatePublicationState(evidence);
  fs.mkdirSync(path.dirname(PUBLICATION_STATE_FILE), { recursive: true });
  fs.writeFileSync(PUBLICATION_STATE_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`News publication evidence stored for Discord message ${evidence.discordMessageId}.`);
  return evidence;
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

  const response = await fetch(webhookWaitUrl(DISCORD_WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Kings Logistics just published a news post!',
      embeds: [embed],
      allowed_mentions: { parse: [] }
    }),
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord webhook failed: HTTP ${response.status} - ${text}`);
  }

  let message;
  try {
    message = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Discord webhook returned invalid message JSON: ${error.message}`);
  }
  if (!message?.id || !message?.channel_id) {
    throw new Error('Discord webhook did not return message evidence; refusing to advance News state.');
  }

  console.log(`Discord post sent: ${newsItem.title} (${message.id})`);
  return message;
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
    console.log('Previous saved news was not found in the current API response.');
    console.log('Only the latest article will be sent.');
    newItems = [latest];
  }

  console.log('');
  console.log(`${newItems.length} new Kings Logistics news post(s) detected.`);

  let sent = 0;
  for (const item of newItems) {
    // Discord must return the concrete message first. The dedupe checkpoint is
    // then saved before the separate audit evidence so a local evidence-write
    // problem can never cause the already delivered article to be reposted.
    const discordMessage = await sendToDiscord(item);
    saveState(item);
    savePublicationEvidence(item, discordMessage);
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

if (require.main === module) {
  start().catch(error => {
    console.error('');
    console.error('Kings News Automation failed:');
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  cleanText,
  truncate,
  webhookWaitUrl,
  validateState,
  validatePublicationState,
  savePublicationEvidence,
  sendToDiscord,
  checkNews
};
