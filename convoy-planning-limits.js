'use strict';
// Pure, advisory-only planning rules. No Discord writes or status changes.
const LIMITS = Object.freeze({ externalMonthly: 20, externalDaily: 2, partnerDaily: 3, separationMinutes: 120 });
const TYPES = new Set(['Kings Convoy', 'Partner Convoy', 'External Convoy']);
// A Kings-hosted event is publicly verifiable from the authoritative
// TruckersMP event's VTC host. Never infer Kings partner/friend status here:
// private Kings relations cannot be embedded in a public source repository.
function publiclyVerifiedKingsHost(original) {
  if (!original?.truckersmpSync?.ok || !original.truckersmpSync.authoritative) return null;
  const event = original.truckersmp;
  const eventId = String(original.eventId || '').trim();
  if (!eventId || !event || String(event.id || '') !== eventId) return null;
  const normalized = String(event.hostVtc || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === 'kings logistics' ? { type: 'Kings Convoy', eventId } : null;
}
function typeOf(value) {
  const valueText = String(value || '').trim().toLowerCase();
  return [...TYPES].find(type => type.toLowerCase() === valueText) || null;
}
function dateFrom(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null;
}
// TruckersMP supplies UTC timestamps like "2027-03-20 16:00:00" without
// a timezone suffix. Only this known API format may omit an explicit zone.
function departureMsFrom(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const tmpUtc = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(raw);
  const normalized = tmpUtc ? tmpUtc[1] + 'T' + tmpUtc[2] + 'Z' : raw;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) return NaN;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return NaN;
  if (tmpUtc && new Date(timestamp).toISOString().slice(0, 19) !== tmpUtc[1] + 'T' + tmpUtc[2]) return NaN;
  return timestamp;
}
function evaluate(input) {
  const records = [], seen = new Set(), unknownTypes = [], missingDepartures = [], resolvedEventTypes = [];
  for (const original of input || []) {
    if (!original || original.ignored || original.error || original.testThread || /^\s*\[?test\]?(?:\s|[-_:])/i.test(original.name || '')) continue;
    if (/^(Cancelled|Canceled)$/i.test(String(original.status || ''))) continue;
    let type = typeOf(original.validation?.parsed?.eventType || original.eventType);
    const verified = type ? null : publiclyVerifiedKingsHost(original);
    if (verified) type = verified.type;
    const date = dateFrom(original.validation?.parsed?.eventDate || original.eventDate);
    if (!date) continue;
    const key = original.eventId ? 'event:' + String(original.eventId) : 'thread:' + String(original.threadId || original.legacyId || '');
    if (seen.has(key)) continue;
    seen.add(key);
    if (verified) resolvedEventTypes.push({ threadId: original.threadId || null, eventId: verified.eventId, type: verified.type, source: 'truckersmp-authoritative-kings-host' });
    if (!type) {
      const eventId = String(original.eventId || '').trim();
      unknownTypes.push({
        threadId: original.threadId || null, eventId: eventId || null, date,
        name: original.name || null,
        publicHost: original.truckersmpSync?.ok ? (original.truckersmp?.hostVtc || null) : null,
        publicEventUrl: /^\\d+$/.test(eventId) ? 'https://truckersmp.com/events/' + eventId : null,
        actionRequired: 'Kings Event Staff must confirm Kings / Partner / External classification'
      });
      continue;
    }
    const rawStart = original.departureAtUtc || original.validation?.parsed?.departureAtUtc;
    const departureMs = departureMsFrom(rawStart);
    if (!Number.isFinite(departureMs)) missingDepartures.push({ threadId: original.threadId || null, eventId: original.eventId || null, date, type });
    records.push({ id: key, threadId: original.threadId || null, name: original.name || null, type, date, departureMs: Number.isFinite(departureMs) ? departureMs : null });
  }
  const months = {}, days = {}, warnings = [];
  for (const r of records) {
    const month = r.date.slice(0,7);
    (months[month] ||= { external: 0, partner: 0, kings: 0 });
    (days[r.date] ||= { external: 0, partner: 0, kings: 0 });
    const field = r.type === 'External Convoy' ? 'external' : r.type === 'Partner Convoy' ? 'partner' : 'kings';
    months[month][field]++; days[r.date][field]++;
  }
  for (const [month, counts] of Object.entries(months)) {
    for (const threshold of [15,18,20]) if (counts.external >= threshold) warnings.push({ code: 'external-month-threshold', period: month, threshold, count: counts.external });
    if (counts.external > LIMITS.externalMonthly) warnings.push({ code: 'external-month-over-limit', period: month, count: counts.external, limit: LIMITS.externalMonthly });
  }
  for (const [day, counts] of Object.entries(days)) {
    if (counts.external > LIMITS.externalDaily) warnings.push({ code: 'external-day-over-limit', period: day, count: counts.external, limit: LIMITS.externalDaily });
    if (counts.partner > LIMITS.partnerDaily) warnings.push({ code: 'partner-day-over-limit', period: day, count: counts.partner, limit: LIMITS.partnerDaily });
  }
  const timed = records.filter(r => r.departureMs !== null).sort((a,b)=>a.departureMs-b.departureMs);
  for (let i=0;i<timed.length;i++) for (let j=i+1;j<timed.length && timed[j].departureMs-timed[i].departureMs<LIMITS.separationMinutes*60000;j++) {
    warnings.push({ code: 'departure-under-two-hours', period: timed[i].date, first: timed[i].id, second: timed[j].id, minutesApart: Math.round((timed[j].departureMs-timed[i].departureMs)/60000) });
  }
  return { version:1, mode:'advisory-only', limits:LIMITS, months, days, warnings, unknownTypes, missingDepartures, resolvedEventTypes, counted:records.length };
}
module.exports = { evaluate, typeOf, LIMITS };
