'use strict';

const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node convoy-e2e-dry-run.js <script.js>');
  process.exit(2);
}

const allowedTargets = new Set([
  'kings-convoy-announcements.js'
]);

if (!allowedTargets.has(target)) {
  console.error(`Dry-run target is not allowlisted: ${target}`);
  process.exit(2);
}

const originalFetch = global.fetch;
if (typeof originalFetch !== 'function') {
  console.error('Global fetch is unavailable. Node.js 18+ is required.');
  process.exit(2);
}

let blockedDiscordWrites = 0;
let validatedPublicAnnouncements = 0;

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input?.url || String(input);
}

function requestMethod(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

function validatePublicAnnouncement(init) {
  if (!(init?.body instanceof FormData)) {
    throw new Error('Public convoy dry-run expected a multipart FormData Discord message.');
  }

  const rawPayload = init.body.get('payload_json');
  if (typeof rawPayload !== 'string') {
    throw new Error('Public convoy dry-run payload_json is missing.');
  }

  const payload = JSON.parse(rawPayload);
  const content = String(payload?.content || '');
  const allowed = payload?.allowed_mentions || {};
  const file = init.body.get('files[0]');

  if (!content.includes('@everyone')) {
    throw new Error('Public convoy dry-run expected @everyone in the public announcement.');
  }

  if (!content.includes('🎙️ **Server:**')) {
    throw new Error('Public convoy dry-run requires the Server line before a post may be sent.');
  }

  if (!content.includes('🗺️ **Route Map**')) {
    throw new Error('Public convoy dry-run requires the Route Map section.');
  }

  if (!Array.isArray(allowed.parse) || !allowed.parse.includes('everyone')) {
    throw new Error('Public convoy dry-run expected allowed_mentions.parse to contain everyone.');
  }

  if (!file || typeof file === 'string') {
    throw new Error('Public convoy dry-run requires an attached route image.');
  }

  validatedPublicAnnouncements += 1;
}

global.fetch = async function convoyDryRunFetch(input, init = {}) {
  const url = requestUrl(input);
  const method = requestMethod(input, init);
  const isDiscord = /^https:\/\/discord\.com\/api\/v\d+\//i.test(url);

  if (!isDiscord || method === 'GET') {
    return originalFetch(input, init);
  }

  // Fail closed: the public announcement script may only attempt a message POST.
  if (target === 'kings-convoy-announcements.js') {
    if (method !== 'POST' || !/\/channels\/\d+\/messages(?:\?|$)/.test(url)) {
      throw new Error(`Unexpected Discord mutation blocked during convoy dry-run: ${method} ${url}`);
    }
    validatePublicAnnouncement(init);
  }

  blockedDiscordWrites += 1;
  console.log(`[CONVOY DRY-RUN] Blocked Discord write: ${method} ${url}`);

  return new Response(
    JSON.stringify({ id: `convoy-dry-run-${blockedDiscordWrites}`, dry_run: true }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
};

process.env.CONVOY_DRY_RUN = 'true';

process.on('beforeExit', () => {
  console.log(`Convoy E2E dry-run summary: blocked Discord writes=${blockedDiscordWrites}, validated public announcements=${validatedPublicAnnouncements}.`);
  console.log('No Discord mutation was sent by the dry-run wrapper.');
});

require(path.resolve(process.cwd(), target));
