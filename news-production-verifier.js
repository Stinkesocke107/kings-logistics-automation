'use strict';

const fs = require('fs');
const path = require('path');
const { resilientFetchJson } = require('./api-resilience');

const ROOT = __dirname;
const VTC_ID = 64284;
const BASELINE_ARTICLE_ID = 70783;
const PUBLICATION_FILE = path.join(ROOT, 'data', 'news-publication-state.json');
const DEDUPE_FILE = path.join(ROOT, 'data', 'last-news.json');
const LIVE_PROOF_FILE = path.join(ROOT, 'data', 'news-live-proof.json');
const OUTPUT_FILE = path.join(ROOT, 'output', 'news-production-verification.json');
const DISCORD_API = 'https://discord.com/api/v10';

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function webhookIdFromUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.lastIndexOf('webhooks');
    const id = index >= 0 ? parts[index + 1] : null;
    return /^\d+$/.test(String(id || '')) ? String(id) : null;
  } catch {
    return null;
  }
}

function validatePublication(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return 'missing-or-invalid-publication-evidence';
  if (!Number.isInteger(Number(value.articleId)) || Number(value.articleId) <= 0) return 'invalid-article-id';
  if (!/^\d+$/.test(String(value.discordMessageId || ''))) return 'invalid-discord-message-id';
  if (!/^\d+$/.test(String(value.discordChannelId || ''))) return 'invalid-discord-channel-id';
  if (!/^https:\/\/truckersmp\.com\/vtc\/64284\/news\/\d+$/.test(String(value.url || ''))) return 'invalid-article-url';
  if (!value.title || typeof value.title !== 'string') return 'invalid-article-title';
  if (Number.isNaN(Date.parse(value.postedAt || ''))) return 'invalid-posted-at';
  return null;
}

async function discordGet(endpoint, token) {
  return resilientFetchJson(`${DISCORD_API}${endpoint}`, {
    label: 'discord-news-proof',
    retries: 3,
    timeoutMs: 15000,
    fetchOptions: {
      headers: {
        Authorization: `Bot ${token}`,
        Accept: 'application/json',
        'User-Agent': 'Kings Logistics News Production Verifier'
      }
    },
    validateJson: (payload) => payload !== null && payload !== undefined
  });
}

function messageMatchesArticle(message, evidence) {
  return Array.isArray(message?.embeds) && message.embeds.some((embed) => String(embed?.url || '') === String(evidence.url));
}

function proofAlreadyAccepted(value) {
  return Boolean(
    value &&
    value.version === 1 &&
    value.status === 'VERIFIED-LIVE-NEWS' &&
    Number(value.articleId) > BASELINE_ARTICLE_ID &&
    /^\d+$/.test(String(value.discordMessageId || '')) &&
    /^\d+$/.test(String(value.discordChannelId || '')) &&
    Number(value.duplicateMatches) === 1 &&
    !Number.isNaN(Date.parse(value.verifiedAt || ''))
  );
}

async function main() {
  const existingProof = readJson(LIVE_PROOF_FILE);
  if (proofAlreadyAccepted(existingProof)) {
    const report = {
      version: 1,
      point: 23,
      checkedAt: new Date().toISOString(),
      status: 'VERIFIED-LIVE-NEWS',
      reusedAcceptedProof: true,
      proof: existingProof,
      issues: []
    };
    writeJson(OUTPUT_FILE, report);
    console.log(`News live proof already accepted for article ${existingProof.articleId}.`);
    return;
  }

  const evidence = readJson(PUBLICATION_FILE);
  const publicationError = validatePublication(evidence);
  if (!evidence || publicationError || Number(evidence.articleId) <= BASELINE_ARTICLE_ID) {
    const report = {
      version: 1,
      point: 23,
      checkedAt: new Date().toISOString(),
      status: 'PENDING-LIVE-NEWS',
      baselineArticleId: BASELINE_ARTICLE_ID,
      currentPublicationArticleId: Number(evidence?.articleId || 0) || null,
      reason: publicationError || 'waiting-for-genuine-new-article-after-baseline',
      issues: []
    };
    writeJson(OUTPUT_FILE, report);
    console.log(`News live proof pending: ${report.reason}.`);
    return;
  }

  const botToken = String(process.env.DISCORD_BOT_TOKEN || '');
  const webhookUrl = String(process.env.NEWS_DISCORD_WEBHOOK_URL || '');
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN is required for News production verification.');
  const expectedWebhookId = webhookIdFromUrl(webhookUrl);
  if (!expectedWebhookId) throw new Error('NEWS_DISCORD_WEBHOOK_URL does not expose a valid Discord webhook ID.');

  const issues = [];
  const dedupe = readJson(DEDUPE_FILE);
  if (!dedupe || Number(dedupe.lastId) < Number(evidence.articleId)) issues.push('News dedupe state is behind publication evidence.');

  const articleData = await resilientFetchJson(`https://api.truckersmp.com/v2/vtc/${VTC_ID}/news`, {
    label: 'truckersmp-news-proof',
    retries: 3,
    timeoutMs: 15000,
    fetchOptions: { headers: { Accept: 'application/json', 'User-Agent': 'Kings Logistics News Production Verifier' } },
    validateJson: (payload) => Boolean(payload && payload.error !== true && Array.isArray(payload.response?.news))
  });
  const article = articleData.response.news.find((item) => Number(item.id) === Number(evidence.articleId));
  if (!article) issues.push(`TruckersMP article ${evidence.articleId} is not present in the current VTC News API response.`);
  if (article && String(article.title || '').trim() !== String(evidence.title).trim()) issues.push('Publication evidence title does not match TruckersMP.');

  const message = await discordGet(`/channels/${evidence.discordChannelId}/messages/${evidence.discordMessageId}`, botToken);
  if (String(message?.id || '') !== String(evidence.discordMessageId)) issues.push('Discord message ID mismatch.');
  if (String(message?.channel_id || '') !== String(evidence.discordChannelId)) issues.push('Discord channel ID mismatch.');
  if (String(message?.webhook_id || '') !== expectedWebhookId) issues.push('Discord message was not created by the configured News webhook.');
  if (!messageMatchesArticle(message, evidence)) issues.push('Discord message embed does not link to the expected TruckersMP News article.');
  const messageTitle = message?.embeds?.find((embed) => String(embed?.url || '') === String(evidence.url))?.title;
  if (String(messageTitle || '') !== String(evidence.title).slice(0, 256)) issues.push('Discord message title does not match publication evidence.');

  const history = await discordGet(`/channels/${evidence.discordChannelId}/messages?limit=100`, botToken);
  if (!Array.isArray(history)) issues.push('Discord channel history response is not an array.');
  const duplicateMatches = Array.isArray(history) ? history.filter((item) => messageMatchesArticle(item, evidence)).length : 0;
  if (duplicateMatches !== 1) issues.push(`Expected exactly one Discord message for article ${evidence.articleId}, found ${duplicateMatches} in the verification window.`);

  const healthy = issues.length === 0;
  const proof = healthy ? {
    version: 1,
    status: 'VERIFIED-LIVE-NEWS',
    articleId: Number(evidence.articleId),
    title: evidence.title,
    url: evidence.url,
    articlePublishedAt: evidence.articlePublishedAt || null,
    postedAt: evidence.postedAt,
    discordMessageId: String(evidence.discordMessageId),
    discordChannelId: String(evidence.discordChannelId),
    discordWebhookId: expectedWebhookId,
    duplicateMatches,
    verifiedAt: new Date().toISOString()
  } : null;

  const report = {
    version: 1,
    point: 23,
    checkedAt: new Date().toISOString(),
    status: healthy ? 'VERIFIED-LIVE-NEWS' : 'NEWS-LIVE-PROOF-FAILED',
    baselineArticleId: BASELINE_ARTICLE_ID,
    evidence,
    duplicateMatches,
    proof,
    issues
  };
  writeJson(OUTPUT_FILE, report);
  if (proof) writeJson(LIVE_PROOF_FILE, proof);

  console.log(`News production verification: ${report.status}`);
  console.log(`Article: ${evidence.articleId}; Discord duplicates in verification window: ${duplicateMatches}.`);
  if (issues.length) {
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`News production verifier failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});

module.exports = { webhookIdFromUrl, validatePublication, messageMatchesArticle, proofAlreadyAccepted };
