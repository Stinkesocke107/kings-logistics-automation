'use strict';

// CEO policy: a confirmed Kings slot means Kings participated.
// Count actual event occurrences; do not require a separate "Completed" tag.
const MONTH_NAMES = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december'
];
function eventDateInMonth(event, period) {
  const value = String(event?.eventDate || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value + 'T00:00:00.000Z');
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)) return parsed;
  }
  // Recovery for a positively completed, confirmed old Center thread with
  // a human-written day/month label but missing structured eventDate.
  // Require that the Discord thread itself was created in that SAME month
  // and year: never infer the year of an unrelated future/scheduled event.
  if (event?.legacy === true || event?.status !== 'Completed' || !event?.threadId) return null;
  const matched = String(event.name || '').match(/^(\d{1,2})\.\s*([A-Za-z]+)\b/i);
  if (!matched) return null;
  const index = MONTH_NAMES.indexOf(matched[2].toLowerCase());
  if (index < 0) return null;
  const start = new Date(period.start);
  if (index !== start.getUTCMonth()) return null;
  let created;
  try {
    const id = BigInt(String(event.threadId));
    if (id <= 0n) return null;
    created = new Date(Number((id >> 22n) + 1420070400000n));
  } catch { return null; }
  if (created.getUTCFullYear() !== start.getUTCFullYear() ||
      created.getUTCMonth() !== start.getUTCMonth()) return null;
  const day = Number(matched[1]);
  const candidate = new Date(Date.UTC(start.getUTCFullYear(), index, day));
  if (candidate.getUTCDate() !== day || candidate.getUTCMonth() !== index) return null;
  return candidate;
}

function confirmedKingsConvoysForPeriod(overview, period) {
  if (!overview || !Array.isArray(overview.countedConvoys)) {
    throw new Error('Fresh Kings Convoy Overview with countedConvoys is required.');
  }
  if (Number(overview.overall?.convoyReadErrors || 0) > 0) {
    throw new Error('Convoy Overview has read errors; refuse to publish an incomplete monthly count.');
  }
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(start < end)) {
    throw new Error('Invalid Kings monthly participation reporting period.');
  }
  const records = new Map();
  let undatedConfirmed = 0;
  for (const event of overview.countedConvoys) {
    if (!event || event.confirmedKingsSlot !== true) continue;
    const date = eventDateInMonth(event, period);
    if (!date) { undatedConfirmed++; continue; }
    if (date.getTime() < start || date.getTime() >= end) continue;
    const eventId = String(event.eventId || '').trim();
    const threadId = String(event.threadId || event.sourceThreadId || '').trim();
    if (!eventId && !threadId) throw new Error('Confirmed Kings convoy has no dedupe identity.');
    const key = eventId ? 'event:' + eventId : 'thread:' + threadId;
    const old = records.get(key);
    if (!old || (old.legacy === true && event.legacy === false)) records.set(key, event);
  }
  return {
    count: records.size,
    source: 'confirmed-kings-slot',
    recordIds: [...records.keys()].sort(),
    undatedConfirmed
  };
}
module.exports = { confirmedKingsConvoysForPeriod, eventDateInMonth };
