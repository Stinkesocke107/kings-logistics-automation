'use strict';

// One-time, non-Discord migration of the existing Event Leadership state.
// The verified source data remains intact, but the persisted Git version
// becomes AES-256-GCM encrypted using the existing protected GitHub Secret.
const fs = require('node:fs');
const path = require('node:path');
const { encryptEventState, decryptEventState } = require('../event-leadership-state');

const STATE_PATH = path.join(__dirname, '..', 'data', 'event-leadership-report-state.json');

function migrateEventContainer(container, secret) {
  // Read and validate every field before changing any file; incorrect keys,
  // corrupted private state and incomplete legacy state are all fatal.
  const state = decryptEventState(container, secret);
  if (container.encrypted === true) {
    return { changed: false, sealed: container };
  }
  return { changed: true, sealed: encryptEventState(state, secret) };
}

function run() {
  const secret = process.env.EVENT_LEADERSHIP_STATE_KEY;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Event Leadership migration: protected key unavailable.');
  }
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error('Event Leadership migration: existing state file missing; refusing to initialize.');
  }
  let current;
  try {
    current = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    throw new Error('Event Leadership migration: invalid state JSON; details withheld.');
  }
  const result = migrateEventContainer(current, secret);
  if (!result.changed) {
    console.log('Event Leadership state already encrypted and authenticated; no migration needed.');
    return;
  }
  // Never expose the plaintext content through outputs, names, or previews.
  fs.writeFileSync(STATE_PATH, JSON.stringify(result.sealed, null, 2) + '\n', 'utf8');
  console.log('Event Leadership state migrated to authenticated encryption; awaiting guarded Git commit.');
}

if (require.main === module) {
  try {
    run();
  } catch {
    console.error('Event Leadership state migration blocked safely (private details withheld).');
    process.exitCode = 1;
  }
}

module.exports = { migrateEventContainer };
