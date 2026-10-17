'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalize, unseen, marker, validateState, processFeed} = require('../social-news');

function item(platform, id, date) {
  return {
    platform, id: String(id), date, url: platform === 'tiktok'
      ? 'https://www.tiktok.com/@official/video/' + id
      : 'https://www.instagram.com/reel/' + id,
    caption: 'New Kings Logistics video', type: 'Video'
  };
}
function state(platform, ids = []) {
  return {version: 1, platforms: {
    [platform]: {startedAt: '2026-10-01T00:00:00.000Z', seen: ids, lastCheckedAt: '2026-10-01T00:00:00.000Z'}
  }};
}

test('official TikTok video URL, ID and timestamp are validated', () => {
  const v = normalize('tiktok', {id: '12345', share_url: 'https://www.tiktok.com/@kings/video/12345', create_time: 1790000000, title: 'Test'});
  assert.equal(v.platform, 'tiktok');
  assert.equal(v.id, '12345');
  assert.equal(marker(v), 'Kings Social News: tiktok:12345');
  assert.throws(() => normalize('tiktok', {id: '123', share_url: 'https://example.net/video/123', create_time: 1790000000}), /Untrusted/);
});

test('Instagram Reel URL and metadata are preserved', () => {
  const v = normalize('instagram', {id: '99876', permalink: 'https://www.instagram.com/reel/abc123/', timestamp: '2026-10-17T11:00:00Z', media_product_type: 'REELS'});
  assert.equal(v.type, 'Reel');
  assert.equal(v.url, 'https://www.instagram.com/reel/abc123/');
  assert.equal(marker(v), 'Kings Social News: instagram:99876');
});

test('first account connection baselines all existing posts without publishing', async () => {
  const original = {version: 1, platforms: {}};
  const published = [], checkpoints = [];
  const result = await processFeed('tiktok', [item('tiktok', '200', '2026-10-10T00:00:00Z')], original, {
    history: async () => false,
    publish: async v => published.push(v.id),
    persist: state => checkpoints.push(JSON.stringify(state))
  });
  assert.equal(result.baseline, true);
  assert.equal(result.posted, 0);
  assert.deepEqual(published, []);
  assert.deepEqual(original.platforms.tiktok.seen, ['200']);
  assert.equal(checkpoints.length, 1);
});

test('each unseen new post is sent oldest first and then deduplicated', async () => {
  const data = state('tiktok', ['100']);
  const items = [item('tiktok', '102', '2026-10-14T03:00:00Z'), item('tiktok', '101', '2026-10-13T03:00:00Z'), item('tiktok', '100', '2026-10-12T03:00:00Z')];
  const published = [], checkpoints = [];
  const opts = {
    history: async () => false,
    publish: async v => published.push(v.id),
    persist: v => checkpoints.push(JSON.stringify(v))
  };
  const first = await processFeed('tiktok', items, data, opts);
  assert.equal(first.posted, 2);
  assert.deepEqual(published, ['101', '102']);
  assert.equal(checkpoints.length, 2);
  const second = await processFeed('tiktok', items, data, opts);
  assert.equal(second.posted, 0);
  assert.deepEqual(data.platforms.tiktok.seen.slice(0, 3), ['102', '101', '100']);
});

test('Discord history recovers a posted message when Git checkpoint was lost', async () => {
  const data = state('instagram', []);
  const sent = [];
  const result = await processFeed('instagram', [item('instagram', '321', '2026-10-16T00:00:00Z')], data, {
    history: async () => true,
    publish: async item => sent.push(item.id),
    persist: () => {}
  });
  assert.equal(result.posted, 0);
  assert.deepEqual(sent, []);
  assert.deepEqual(data.platforms.instagram.seen, ['321']);
});

test('failed Discord publication does not mark the video as sent', async () => {
  const data = state('tiktok', []);
  const before = JSON.stringify(data);
  await assert.rejects(processFeed('tiktok', [item('tiktok', '400', '2026-10-16T00:00:00Z')], data, {
    history: async () => false,
    publish: async () => {throw Error('temporary Discord failure');},
    persist: () => {throw Error('must not checkpoint failed post');}
  }), /temporary Discord failure/);
  assert.equal(JSON.stringify(data), before);
});

test('TikTok and Instagram have independent publication baselines', async () => {
  const data = state('tiktok', ['100']);
  const sent = [];
  const opts = {
    history: async () => false,
    publish: async value => sent.push(value.platform + ':' + value.id),
    persist: () => {}
  };
  await processFeed('instagram', [item('instagram', '700', '2026-10-12T00:00:00Z')], data, opts);
  await processFeed('tiktok', [item('tiktok', '101', '2026-10-15T00:00:00Z')], data, opts);
  assert.deepEqual(sent, ['tiktok:101']);
  assert.deepEqual(data.platforms.instagram.seen, ['700']);
});

test('corrupt state fails closed', () => {
  assert.throws(() => validateState({version: 1, platforms: {tiktok: {startedAt: 'bad', seen: []}}}), /refusing to reset/);
  assert.throws(() => validateState({version: 1, platforms: {instagram: {startedAt: '2026-10-01T00:00:00Z', seen: [null]}}}), /refusing to reset/);
});

test('unseen filtering excludes pre-activation posts even if not tracked in seen IDs', () => {
  const p = state('tiktok', []).platforms.tiktok;
  assert.deepEqual(unseen([item('tiktok', '9', '2026-09-30T00:00:00Z')], p), []);
});


const {parseYouTubeFeed, OFFICIAL_PROFILES, YOUTUBE_CHANNEL_ID} = require('../social-news');

function youtubeFeed(entries, channel = YOUTUBE_CHANNEL_ID) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">' +
    '<yt:channelId>' + channel + '</yt:channelId>' +
    entries.map(e => '<entry><yt:videoId>' + e.id + '</yt:videoId>' +
      '<yt:channelId>' + (e.channel || channel) + '</yt:channelId>' +
      '<title>' + e.title + '</title><published>' + e.date + '</published></entry>').join('') +
    '</feed>';
}
test('all three Kings social profiles are configured with the exact official URLs', () => {
  assert.deepEqual(OFFICIAL_PROFILES, {
    tiktok: 'https://www.tiktok.com/@kings__logistics',
    instagram: 'https://www.instagram.com/kings___logistics/',
    youtube: 'https://www.youtube.com/channel/UCB6vBqCWktsZnAyrITC6E-Q'
  });
});

test('YouTube public channel RSS recognizes official videos and Shorts in oldest-first news order', async () => {
  const feed = youtubeFeed([
    {id: 'dQw4w9WgXcQ', date: '2026-10-17T10:00:00+00:00', title: 'Kings &amp; Friends | Video'},
    {id: 'abcDE123_-X', date: '2026-10-17T11:00:00+00:00', title: 'New Kings Short'}
  ]);
  const items = parseYouTubeFeed(feed);
  assert.equal(items.length, 2);
  assert.equal(items[0].caption, 'Kings & Friends | Video');
  assert.equal(items[0].url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(marker(items[1]), 'Kings Social News: youtube:abcDE123_-X');
  const data = {version: 1, platforms: {}}, posted = [];
  const hooks = {
    history: async () => false,
    publish: async value => {posted.push(value.id);},
    persist: () => {}
  };
  await processFeed('youtube', items, data, hooks);
  assert.deepEqual(posted, []);
  const later = parseYouTubeFeed(youtubeFeed([
    ...[{id:'dQw4w9WgXcQ',date:'2026-10-17T10:00:00Z',title:'Video'},
        {id:'abcDE123_-X',date:'2026-10-17T11:00:00Z',title:'Short'}],
    {id:'zzzzzZ12345',date:'2090-10-17T12:00:00Z',title:'Fresh YouTube Short'}
  ]));
  const result = await processFeed('youtube', later, data, hooks);
  assert.equal(result.posted, 1);
  assert.deepEqual(posted, ['zzzzzZ12345']);
  const again = await processFeed('youtube', later, data, hooks);
  assert.equal(again.posted, 0);
});

test('YouTube rejects non-Kings channel feeds, corrupt XML and bogus entries', () => {
  assert.throws(() => parseYouTubeFeed(youtubeFeed([
    {id: 'abcdefghijk', title: 'Another channel', date: '2026-10-17T10:00:00Z'}
  ], 'UCOtherWrongChannel12345')), /does not belong/);
  assert.throws(() => parseYouTubeFeed('<html>blocked</html>'), /Invalid or oversized/);
  assert.throws(() => parseYouTubeFeed(youtubeFeed([
    {id: 'bad', title:'Bad ID', date:'2026-10-17T10:00:00Z'}
  ])), /missing valid ID/);
  assert.throws(() => validateState({version: 1, platforms: {youtube: {startedAt: 'invalid', seen: []}}}), /refusing to reset/);
});

test('YouTube news can recover posted messages from Discord without duplicating them', async () => {
  const feed = parseYouTubeFeed(youtubeFeed([
    {id:'abcdefghijk',title:'Kings Video',date:'2026-10-17T10:00:00Z'}
  ]));
  const data = state('youtube', []);
  let posted = 0, saved = 0;
  const result = await processFeed('youtube', feed, data, {
    history: async item => marker(item) === 'Kings Social News: youtube:abcdefghijk',
    publish: async () => {posted++;},
    persist: () => {saved++;}
  });
  assert.equal(result.posted, 0);
  assert.equal(posted, 0);
  assert.equal(saved, 1);
});
