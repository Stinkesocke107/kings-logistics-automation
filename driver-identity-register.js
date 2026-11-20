'use strict';
// Shared, pure parser for private Kings Driver identity records.
// No personal ID/date mappings may be persisted to the public repository.
const ALIASES = Object.freeze({
  id: 'discord_id',
  discord_id: 'discord_id',
  datum: 'kings_join_date',
  kings_join_date: 'kings_join_date',
  truckersmp_id: 'truckersmp_id',
  haulmp_id: 'haulmp_id',
  trucklinemp_id: 'trucklinemp_id'
});
const PLATFORMS = Object.freeze(['truckersmp', 'haulmp', 'trucklinemp']);

function parseDriverIdentityRecord(content, now = new Date()) {
  const raw = String(content || '').trim();
  if (!/^(?:id|discord_id)\s*:/i.test(raw)) return null;

  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i.exec(line);
    const key = match && ALIASES[match[1].toLowerCase()];
    if (!key) throw new Error('Invalid Kings Driver identity record field or line.');
    if (values.has(key)) throw new Error('Duplicate field in Kings Driver identity record: ' + key);
    values.set(key, match[2].trim());
  }

  const discordId = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/.exec(values.get('discord_id') || '');
  if (!discordId) throw new Error('Invalid or missing Discord ID in Kings Driver identity record.');
  const userId = discordId[1] || discordId[2];
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(values.get('kings_join_date') || '');
  if (!match) throw new Error('Invalid or missing Kings joining date (D.M.YYYY).');
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText), month = Number(monthText), year = Number(yearText);
  const joinedAt = new Date(Date.UTC(year, month - 1, day));
  if (year < 2015 || !Number.isFinite(joinedAt.getTime()) ||
      joinedAt.getUTCFullYear() !== year || joinedAt.getUTCMonth() !== month - 1 ||
      joinedAt.getUTCDate() !== day || joinedAt > now) {
    throw new Error('Invalid or future Kings joining date in identity register.');
  }

  const platformIds = {};
  for (const platform of PLATFORMS) {
    const value = values.get(platform + '_id');
    if (value === undefined || value === '-') {
      platformIds[platform] = null;
      continue;
    }
    if (platform === 'truckersmp'
      ? !/^[1-9]\d{0,17}$/.test(value)
      : !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
      throw new Error('Invalid ' + platform + ' ID in Kings Driver identity record.');
    }
    platformIds[platform] = value;
  }
  return { userId, joinedAt, platformIds };
}

// Existing private register messages may contain multiple Driver records
// separated by '---' or simply followed by the next discord_id line. Accept
// both formats without rewriting or exposing private Discord messages.
// Explicit V1 batches retain their original stricter 12-record limit.
const BATCH_HEADER = 'KINGS_REGISTER_BATCH_V1';
const MAX_BATCH_RECORDS = 12;
const MAX_LEGACY_MESSAGE_RECORDS = 20;
function parseDriverIdentityRecords(content, now = new Date()) {
  const raw = String(content || '').trim();
  const hasHeader = raw.startsWith(BATCH_HEADER);
  if (!hasHeader && !/^(?:id|discord_id)\s*:/i.test(raw)) return [];

  let rest = raw;
  if (hasHeader) {
    const lines = raw.split(/\r?\n/);
    if (lines[0].trim() !== BATCH_HEADER) {
      throw new Error('Invalid private Kings Driver register batch header.');
    }
    rest = lines.slice(1).join('\n').trim();
  }

  const blocks = [];
  let current = [];
  for (const line of rest.split(/\r?\n/)) {
    if (/^\s*---\s*$/.test(line)) {
      if (!current.length) throw new Error('Invalid private Driver register separator.');
      blocks.push(current.join('\n').trim());
      current = [];
      continue;
    }
    // Missing '---' between entries is unambiguous at a fresh ID field.
    if (!hasHeader && current.length && /^\s*(?:id|discord_id)\s*:/i.test(line)) {
      blocks.push(current.join('\n').trim());
      current = [];
    }
    if (line.trim() || current.length) current.push(line);
  }
  if (!current.length && blocks.length) {
    throw new Error('Kings Driver register batch must contain nonempty records.');
  }
  if (current.length) blocks.push(current.join('\n').trim());
  const max = hasHeader ? MAX_BATCH_RECORDS : MAX_LEGACY_MESSAGE_RECORDS;
  if (!rest || !blocks.length || blocks.length > max || blocks.some(block => !block)) {
    throw new Error('Kings Driver register batch must contain 1 to ' + max +
      ' nonempty records.');
  }

  const ids = new Set();
  return blocks.map(block => {
    const parsed = parseDriverIdentityRecord(block, now);
    if (!parsed || ids.has(parsed.userId)) {
      throw new Error('Invalid or duplicate Driver identity in batch.');
    }
    ids.add(parsed.userId);
    return parsed;
  });
}

function createPlatformIndex() {
  return {
    truckersmp: new Map(),
    haulmp: new Map(),
    trucklinemp: new Map()
  };
}

function addIdentityToIndex(index, identity) {
  for (const platform of PLATFORMS) {
    const platformId = identity.platformIds[platform];
    if (!platformId) continue;
    if (index[platform].has(platformId)) {
      throw new Error('Duplicate ' + platform + ' ID assigned to multiple Kings Drivers.');
    }
    index[platform].set(platformId, identity.userId);
  }
}

module.exports = {
  PLATFORMS,
  parseDriverIdentityRecord,
  parseDriverIdentityRecords,
  createPlatformIndex,
  addIdentityToIndex
};
