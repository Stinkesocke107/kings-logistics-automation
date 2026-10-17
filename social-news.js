'use strict';
// Read-only official social APIs -> Kings News Discord webhook.
// Never guess account identities, scrape social pages, or replay old posts.
const fs = require('node:fs');
const path = require('node:path');
const STATE_FILE = path.join(__dirname, 'data', 'social-news-state.json');
const NEWS_CHANNEL = process.env.NEWS_DISCORD_CHANNEL_ID || '1479853315264217202';
const COLOR = 0x182dff;
const MAX_SEEN = 1500;
const MARKER = 'Kings Social News: ';

function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function validateState(state) {
  if (!state || state.version !== 1 || !state.platforms || typeof state.platforms !== 'object') throw Error('Invalid social news state: refusing to reset deduplication.');
  for (const [key, p] of Object.entries(state.platforms)) {
    if (!['tiktok', 'instagram'].includes(key) || !p || !validDate(p.startedAt) || !Array.isArray(p.seen) || p.seen.some(v => typeof v !== 'string' || !v)) {
      throw Error('Invalid ' + key + ' state: refusing to reset deduplication.');
    }
  }
  return state;
}
function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {version: 1, platforms: {}};
  try { return validateState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); }
  catch (e) { throw Error('Social News state invalid; refusing to publish: ' + e.message); }
}
function saveState(state) {
  validateState(state);
  fs.mkdirSync(path.dirname(STATE_FILE), {recursive: true});
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}
function limitText(text, len) {
  const clean = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return clean.length > len ? clean.slice(0, len - 1) + '…' : clean;
}
function normalize(platform, video) {
  if (!video || !/^[0-9]+$/.test(String(video.id || ''))) throw Error('Invalid ' + platform + ' media ID');
  const date = platform === 'tiktok' ? new Date(Number(video.create_time) * 1000) : new Date(video.timestamp);
  if (!Number.isFinite(date.getTime())) throw Error('Invalid ' + platform + ' media time: ' + video.id);
  const url = platform === 'tiktok' ? video.share_url : video.permalink;
  const u = new URL(String(url || ''));
  if (u.protocol !== 'https:' || !(platform === 'tiktok' ? /(^|\.)tiktok\.com$/.test(u.hostname) : /(^|\.)instagram\.com$/.test(u.hostname))) {
    throw Error('Untrusted or missing ' + platform + ' media permalink: ' + video.id);
  }
  return {
    platform, id: String(video.id), url: u.toString(), date: date.toISOString(),
    caption: limitText(platform === 'tiktok' ? (video.title || video.video_description) : video.caption, 1200),
    type: platform === 'instagram' && video.media_product_type === 'REELS' ? 'Reel' : 'Video'
  };
}
async function readJson(url, options = {}) {
  for (let n = 0; n < 3; n++) {
    let response;
    try {
      response = await fetch(url, {...options, signal: AbortSignal.timeout(20000)});
    } catch (e) {
      if (n === 2) throw e;
      await new Promise(resolve => setTimeout(resolve, 1500 * (n + 1)));
      continue;
    }
    const body = await response.text();
    if (response.ok) {
      try { return body ? JSON.parse(body) : {}; }
      catch { throw Error('Invalid JSON from read-only API: ' + new URL(url).hostname); }
    }
    if ((response.status === 429 || response.status >= 500) && n < 2) {
      const retry = Number(response.headers.get('retry-after'));
      await new Promise(resolve => setTimeout(resolve, Math.min(60000, Math.max(1500, Number.isFinite(retry) ? retry * 1000 : 2500 * (n + 1)))));
      continue;
    }
    throw Error('Read-only API ' + new URL(url).hostname + ' returned HTTP ' + response.status + ': ' + body.slice(0, 300));
  }
}
async function fetchTikTok(token) {
  const result = [];
  let cursor = null;
  for (let page = 0; page < 5; page++) {
    const data = await readJson('https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,share_url', {
      method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify(cursor ? {max_count: 20, cursor} : {max_count: 20})
    });
    if (data.error?.code && data.error.code !== 'ok') throw Error('TikTok API: ' + data.error.code);
    if (!Array.isArray(data.data?.videos)) throw Error('TikTok API missing videos array');
    result.push(...data.data.videos.map(v => normalize('tiktok', v)));
    if (!data.data.has_more) return result;
    cursor = data.data.cursor;
    if (!cursor) throw Error('TikTok pagination cursor missing');
  }
  throw Error('TikTok has more than 100 unread videos. Refusing to silently skip any.');
}
async function fetchInstagram(token) {
  const result = [];
  let after = '';
  for (let page = 0; page < 5; page++) {
    const url = new URL('https://graph.instagram.com/v24.0/me/media');
    url.searchParams.set('fields', 'id,caption,media_type,media_product_type,permalink,timestamp');
    url.searchParams.set('limit', '50');
    if (after) url.searchParams.set('after', after);
    const data = await readJson(url.toString(), {headers: {Authorization: 'Bearer ' + token}});
    if (!Array.isArray(data.data)) throw Error('Instagram API missing media array');
    const videos = data.data.filter(v => v.media_product_type === 'REELS' || (v.media_type === 'VIDEO' && v.media_product_type !== 'STORY'));
    result.push(...videos.map(v => normalize('instagram', v)));
    if (!data.paging?.next) return result;
    const next = new URL(data.paging.next);
    if (next.hostname !== 'graph.instagram.com') throw Error('Untrusted Instagram paging host');
    after = next.searchParams.get('after') || data.paging.cursors?.after;
    if (!after) throw Error('Instagram paging cursor missing');
  }
  throw Error('Instagram has more than 250 unread media items. Refusing to silently skip any.');
}
function marker(item) { return MARKER + item.platform + ':' + item.id; }
async function alreadyOnDiscord(item, token) {
  let before = null;
  for (let i = 0; i < 5; i++) {
    const url = 'https://discord.com/api/v10/channels/' + NEWS_CHANNEL + '/messages?limit=100' + (before ? '&before=' + before : '');
    const messages = await readJson(url, {headers: {Authorization: 'Bot ' + token}});
    if (!Array.isArray(messages)) throw Error('Discord news history unreadable: refusing duplicate-risk post');
    if (messages.some(m => (m.embeds || []).some(e => e.footer?.text === marker(item)))) return true;
    if (messages.length < 100) return false;
    before = messages[messages.length - 1]?.id;
    if (!before) throw Error('Discord history pagination invalid');
  }
  // History visibility is bounded; older recovered writes must be resolved manually.
  throw Error('Discord news history exceeded 500 messages; refusing duplicate-risk post');
}
async function post(item, webhook) {
  const url = new URL(webhook);
  url.searchParams.set('wait', 'true');
  const label = item.platform === 'tiktok' ? 'TikTok' : 'Instagram';
  const payload = {
    content: '🎬 **New Kings Logistics ' + label + ' ' + item.type + '!**\n' + item.url,
    embeds: [{
      author: {name: 'Kings Logistics'},
      title: 'New ' + label + ' ' + item.type,
      url: item.url,
      description: item.caption || 'Watch our latest official Kings Logistics video!',
      color: COLOR, timestamp: item.date,
      footer: {text: marker(item)}
    }],
    allowed_mentions: {parse: []}
  };
  // Never automatically retry an uncertain write.
  const response = await fetch(url.toString(), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)});
  const text = await response.text();
  if (!response.ok) throw Error('Discord social news webhook HTTP ' + response.status + ': ' + text.slice(0, 250));
  const message = JSON.parse(text || 'null');
  if (!message?.id || String(message.channel_id) !== String(NEWS_CHANNEL)) throw Error('Discord webhook response missing proof or wrong news channel');
  return String(message.id);
}
function unseen(items, platformState) {
  const seen = new Set(platformState.seen);
  const start = Date.parse(platformState.startedAt);
  return items.filter(item => !seen.has(item.id) && Date.parse(item.date) > start)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
function checkpoint(platformState, id) {
  platformState.seen = [id, ...platformState.seen.filter(x => x !== id)].slice(0, MAX_SEEN);
  platformState.lastCheckedAt = new Date().toISOString();
}
async function processFeed(platform, items, state, {webhook, botToken, history = alreadyOnDiscord, publish = post} = {}) {
  if (!state.platforms[platform]) {
    const initial = {startedAt: new Date().toISOString(), seen: [...new Set(items.map(x => x.id))].slice(0, MAX_SEEN), lastCheckedAt: new Date().toISOString()};
    state.platforms[platform] = initial;
    saveState(state);
    console.log(platform + ': first connection baseline established (' + items.length + ' existing posts ignored).');
    return {baseline: true, posted: 0};
  }
  const p = state.platforms[platform];
  const next = unseen(items, p);
  let count = 0;
  for (const item of next) {
    const recovered = await history(item, botToken);
    if (!recovered) {
      await publish(item, webhook);
      count++;
    } else console.log(platform + ': recovered already published ' + item.id + ' from Discord history');
    checkpoint(p, item.id);
    saveState(state);
  }
  if (!next.length) console.log(platform + ': no new videos.');
  return {baseline: false, posted: count};
}
async function main() {
  const state = loadState();
  const accounts = [
    ['tiktok', process.env.SOCIAL_TIKTOK_ACCESS_TOKEN, fetchTikTok],
    ['instagram', process.env.SOCIAL_INSTAGRAM_ACCESS_TOKEN, fetchInstagram]
  ];
  const enabled = accounts.filter(([, token]) => Boolean(token));
  if (!enabled.length) { console.log('Kings Social News inactive: connect authorized TikTok/Instagram accounts using GitHub Secrets.'); return; }
  const webhook = process.env.NEWS_DISCORD_WEBHOOK_URL;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!webhook || !botToken) throw Error('Missing NEWS_DISCORD_WEBHOOK_URL or DISCORD_BOT_TOKEN. Refusing unsafe publication.');
  const failures = [];
  for (const [platform, token, loader] of enabled) {
    try {
      const items = await loader(token);
      const result = await processFeed(platform, items, state, {webhook, botToken});
      console.log(platform + ': ' + result.posted + ' new posts sent.');
    } catch (error) {
      failures.push(platform);
      console.error(platform + ' news failed: ' + error.message);
    }
  }
  if (failures.length) throw Error('Social News checks failed for: ' + failures.join(', '));
}
if (require.main === module) main().catch(e => {console.error('Kings Social News failed: ' + e.message);process.exitCode = 1;});
module.exports = {normalize, unseen, marker, validateState, processFeed, fetchTikTok, fetchInstagram, main};
