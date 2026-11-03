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

// CEO reporting policy: Every registered Kings convoy that took place counts as
// participated, even when the Kings slot is not marked confirmed. The Kings
// Convoy Center and frozen Kings Legacy Calendar are registration records.
// Cancelled, future, test, undated and unreadable events never become claims.
function attendedRegisteredConvoysForPeriod(overview, period, now = new Date()) {
  if (!overview || !Array.isArray(overview.registeredConvoys)) {
    throw new Error('Fresh Kings Convoy Overview with registeredConvoys is required.');
  }
  if (Number(overview.overall?.convoyReadErrors || 0) > 0) {
    throw new Error('Convoy Overview has read errors; refuse an incomplete monthly participation count.');
  }
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  const current = new Date(now).getTime();
  if (![start, end, current].every(Number.isFinite) || start >= end) {
    throw new Error('Invalid Kings convoy reporting dates.');
  }

  const events = new Map();
  let undatedRegistered = 0;
  let cancelledExcluded = 0;
  let notYetHeld = 0;
  for (const event of overview.registeredConvoys) {
    if (!event || !['convoy-center', 'legacy-calendar'].includes(event.source)) continue;
    if (/cancelled|canceled/i.test(String(event.status || ''))) {
      cancelledExcluded++;
      continue;
    }
    // No public TruckersMP roster inference: only existing Kings calendar
    // entries. Convoy Center records need a linked event or Staff Completed.
    if (event.source === 'convoy-center' && !event.eventId &&
        event.status !== 'Completed') continue;
    const date = eventDateInMonth(event, period);
    if (!date) { undatedRegistered++; continue; }
    const t = date.getTime();
    if (t < start || t >= end) continue;
    // Wait until the event's calendar date is over if no confirmed actual
    // completion time exists. Avoid claiming attendance of future events.
    if (t + 86400000 > current) { notYetHeld++; continue; }

    const id = String(event.eventId || '').trim();
    const thread = String(event.threadId || event.sourceThreadId || '').trim();
    if (!id && !thread) throw new Error('Registered Kings convoy is missing a stable event identity.');
    const platform = String(event.platformId || 'truckersmp').trim().toLowerCase();
    const key = id ? 'event:' + platform + ':' + id : 'thread:' + thread;
    const previous = events.get(key);
    if (!previous || (previous.legacy && !event.legacy)) events.set(key, event);
  }
  const values = [...events.values()];
  return {
    count: events.size,
    confirmedSlotCount: values.filter(event => event.confirmedKingsSlot === true).length,
    source: 'registered-past-kings-convoys',
    recordIds: [...events.keys()].sort(),
    undatedRegistered,
    cancelledExcluded,
    notYetHeld
  };
}
module.exports = {
  confirmedKingsConvoysForPeriod,
  attendedRegisteredConvoysForPeriod,
  eventDateInMonth
};

