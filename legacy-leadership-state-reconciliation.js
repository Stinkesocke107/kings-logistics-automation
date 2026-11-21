'use strict';
// Safe, local, read-only projection of pre-fix Leadership publication state.
// State keys, "publishedAt" and report snapshots are NOT Discord receipts.
// Never print people, period keys, message IDs, private state or source records.
const fs = require('node:fs');
const path = require('node:path');

const SOURCES = Object.freeze([
  { alias: 'driver', file: 'driver-leadership-report-state.json',
    periods: { publishedDailyKeys: 'day', publishedMonthlyKeys: 'month' },
    summaries: ['monthlyReports'] },
  { alias: 'hr', file: 'hr-leadership-report-state.json',
    periods: { publishedDailyKeys: 'day', publishedMonthlyKeys: 'month' },
    summaries: ['monthlyReports'] },
  { alias: 'staff', file: 'staff-leadership-report-state.json',
    periods: { publishedDailyKeys: 'day', publishedWeeklyKeys: 'week', publishedMonthlyKeys: 'month' },
    summaries: ['weeklyReports', 'monthlyReports'] },
  { alias: 'event', file: 'event-leadership-report-state.json',
    periods: { publishedDailyKeys: 'day', publishedWeeklyKeys: 'week', publishedMonthlyKeys: 'month' },
    summaries: ['weeklyReports', 'monthlyReports'] },
  { alias: 'management', file: 'management-weekly-overview-state.json',
    periods: { publishedWeeks: 'week-object' }, summaries: [] }
]);

function validPeriod(value, kind) {
  if (typeof value !== 'string') return false;
  const pattern = kind === 'month' ? /^(\d{4})-(0[1-9]|1[0-2])$/ : /^(\d{4})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
  if (!pattern.test(value)) return false;
  if (kind === 'month') return true;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function projectSource(source, state) {
  if (!state || typeof state !== 'object' || Array.isArray(state))
    return { alias: source.alias, status: 'UNVERIFIED', reason: 'state-missing-or-unreadable' };
  if (state.encrypted === true)
    return { alias: source.alias, status: 'SEALED_UNVERIFIED', reason: 'encrypted-state-private-review-required' };

  const periods = { day: 0, week: 0, month: 0 };
  let invalid = 0, duplicate = 0, summaryEntries = 0, availableFields = 0;
  for (const [field, kind] of Object.entries(source.periods)) {
    if (!(field in state)) continue;
    availableFields++;
    if (!Array.isArray(state[field])) { invalid++; continue; }
    const seen = new Set();
    for (const entry of state[field]) {
      const key = kind === 'week-object' ? entry?.key : entry;
      const target = kind === 'week-object' ? 'week' : kind;
      if (!validPeriod(key, target)) { invalid++; continue; }
      if (seen.has(key)) { duplicate++; continue; }
      seen.add(key);
      periods[target]++;
    }
  }
  for (const field of source.summaries) {
    if (!(field in state)) continue;
    if (!Array.isArray(state[field])) { invalid++; continue; }
    summaryEntries += state[field].length;
  }
  return {
    alias: source.alias,
    status: 'RECORDED_UNVERIFIED',
    reason: invalid || duplicate || !availableFields
      ? 'metadata-integrity-or-availability-limited' : 'metadata-is-not-discord-proof',
    periods, summaryEntries, invalid, duplicate
  };
}

function readSource(dataDir, source) {
  try {
    return projectSource(source, JSON.parse(fs.readFileSync(path.join(dataDir, source.file), 'utf8')));
  } catch {
    return projectSource(source, null);
  }
}

function reconcile(dataDir = path.join(__dirname, 'data')) {
  return SOURCES.map(source => readSource(dataDir, source));
}

function safeLine(result) {
  const alias = SOURCES.some(s => s.alias === result.alias) ? result.alias : 'unknown';
  if (result.status === 'SEALED_UNVERIFIED')
    return '[Kings Legacy State] ' + alias + ': SEALED_UNVERIFIED (encrypted, no public period evidence)';
  if (result.status !== 'RECORDED_UNVERIFIED')
    return '[Kings Legacy State] ' + alias + ': UNVERIFIED (state unavailable)';
  const p = result.periods;
  return '[Kings Legacy State] ' + alias + ': RECORDED_UNVERIFIED (' +
    'day=' + p.day + ', week=' + p.week + ', month=' + p.month +
    ', summaries=' + result.summaryEntries +
    ', invalid=' + result.invalid + ', duplicate=' + result.duplicate +
    '; no direct per-period Discord delivery proof)';
}

if (require.main === module) {
  for (const result of reconcile()) console.log(safeLine(result));
  console.log('Historical period keys and publishedAt are state metadata ONLY. ' +
    'Direct Discord GET evidence must be independently linked to each period; ' +
    'four saved Legacy message IDs were NOT_VISIBLE in the separate 2026-11-21 audit. ' +
    'No state records were changed and no Discord write was attempted.');
}

module.exports = { SOURCES, validPeriod, projectSource, readSource, reconcile, safeLine };
