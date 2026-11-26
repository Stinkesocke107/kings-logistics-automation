// Kings Event Leadership private report state. Never log raw state or encryption keys.
'use strict';

const crypto = require('node:crypto');
const {trustedRecords}=require('./event-operations-manual-review-state');
const DOMAIN = 'kings-event-leadership-private-state-v1';

function deriveKey(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Event Leadership private state key is missing or too short.');
  }
  return crypto.createHash('sha256').update(DOMAIN + '\0').update(secret).digest();
}

function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
      || state.version !== 1
      || !(state.lastSnapshot === null || Array.isArray(state.lastSnapshot))
      || !Array.isArray(state.changeLog)
      || !Array.isArray(state.publishedDailyKeys)
      || !Array.isArray(state.publishedWeeklyKeys)
      || !Array.isArray(state.publishedMonthlyKeys)
      || !Array.isArray(state.weeklyReports)
      || !Array.isArray(state.monthlyReports)) {
    throw new Error('Event Leadership private state structure is invalid.');
  }
  // Manual Staff review records are strictly allowlisted and never stored
  // in plaintext or accepted with arbitrary Event/Staff metadata.
  if(state.operationReviews!==undefined)trustedRecords(state.operationReviews);
  // Discord-native #18 message replay cursor and denied-command count are
  // encrypted-only metadata, never actual Event records or booked capacity.
  if(state.discordReviewCursor!==undefined&&
    state.discordReviewCursor!=='0'&&
    !(typeof state.discordReviewCursor==='string'&&
      /^\d{17,22}$/.test(state.discordReviewCursor)))
    throw new Error('Event Operations Discord cursor unverified');
  if(state.discordReviewIgnored!==undefined&&
    (!Number.isSafeInteger(state.discordReviewIgnored)||
      state.discordReviewIgnored<0||state.discordReviewIgnored>1000000))
    throw new Error('Event Operations Discord review count unverified');
  return state;
}

function encryptEventState(state, secret) {
  const key = deriveKey(secret);
  const checked = validateState(state);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(checked), 'utf8')),
    cipher.final()
  ]);
  return {
    version: 1,
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptEventState(container, secret) {
  const key = deriveKey(secret); // Key is mandatory even when migrating old plaintext.
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    throw new Error('Event Leadership private state container is invalid.');
  }
  if (container.encrypted !== true) {
    if (Object.hasOwn(container, 'encrypted') || Object.hasOwn(container, 'ciphertext')) {
      throw new Error('Event Leadership private state container is not trusted.');
    }
    // Once-only compatibility: the existing main-branch state is plaintext.
    // On the next explicitly authorized non-preview publish, save encrypted.
    return validateState(container);
  }
  if (container.version !== 1 || container.algorithm !== 'aes-256-gcm'
      || typeof container.iv !== 'string' || typeof container.authTag !== 'string'
      || typeof container.ciphertext !== 'string') {
    throw new Error('Event Leadership encrypted state container is invalid.');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(container.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(container.ciphertext, 'base64')),
      decipher.final()
    ]);
    return validateState(JSON.parse(plaintext.toString('utf8')));
  } catch {
    throw new Error('Event Leadership private state decryption or integrity check failed.');
  }
}

module.exports = { encryptEventState, decryptEventState, validateState };
