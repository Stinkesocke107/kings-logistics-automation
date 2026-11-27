'use strict';
// Pure, advisory-only planning rules. No Discord writes or status changes.
// The binding Kings Event Capacity policy applies to ALL UTC days alike.
// These are ADVISORY source-claim thresholds, not booking permissions.
const LIMITS = Object.freeze({
  dailyTotal: 3, partnerMonthly: 20, externalMonthly: 20,
  kingsMonthly: null, separationMinutes: 120
});
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
  const text=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const ms=Date.parse(text+'T00:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===text?text:null;
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
  const records = [], seen = new Set(), unknownTypes = [], missingDepartures = [], resolvedEventTypes = [], duplicateSourceClaims = [];
  for (const original of input || []) {
    if (!original || original.ignored || original.error || original.testThread || /^\s*\[?test\]?(?:\s|[-_:])/i.test(original.name || '')) continue;
    if (/^(Cancelled|Canceled)$/i.test(String(original.status || ''))) continue;
    let type = typeOf(original.validation?.parsed?.eventType || original.eventType);
    const verified = type ? null : publiclyVerifiedKingsHost(original);
    if (verified) type = verified.type;
    const rawStart = original.departureAtUtc || original.validation?.parsed?.departureAtUtc;
    const departureMs = departureMsFrom(rawStart);
    // A verified departure instant always determines the actual UTC planning
    // day/month, even if the display eventDate is in another timezone.
    // When no departure is verified, retain the tentative day only for
    // conservative Staff review. This never certifies a free slot.
    const date = Number.isFinite(departureMs)
      ? new Date(departureMs).toISOString().slice(0,10)
      : dateFrom(original.validation?.parsed?.eventDate || original.eventDate);
    if (!date) continue;
    const key = original.eventId ? 'event:' + String(original.eventId) : 'thread:' + String(original.threadId || original.legacyId || '');
    if (seen.has(key)) {
      // Repeated event IDs or Forum references must not count twice, but
      // silently dropping them could hide a source conflict from Event Staff.
      // Store only UTC day/category in the advisory, never private thread IDs.
      duplicateSourceClaims.push({date,kind:original.eventId?'event':'thread'});
      continue;
    }
    seen.add(key);
    if (verified) resolvedEventTypes.push({ threadId: original.threadId || null, eventId: verified.eventId, type: verified.type, source: 'truckersmp-authoritative-kings-host' });
    if (!type) {
      const eventId = String(original.eventId || '').trim();
      unknownTypes.push({
        threadId: original.threadId || null, eventId: eventId || null, date,
        name: original.name || null,
        publicHost: original.truckersmpSync?.ok ? (original.truckersmp?.hostVtc || null) : null,
        publicEventUrl: eventId && [...eventId].every(char => char >= '0' && char <= '9') ? 'https://truckersmp.com/events/' + eventId : null,
        actionRequired: 'Kings Event Staff must confirm Kings / Partner / External classification'
      });
      continue;
    }
    if (!Number.isFinite(departureMs)) missingDepartures.push({ threadId: original.threadId || null, eventId: original.eventId || null, date, type });
    records.push({ id: key, threadId: original.threadId || null, name: original.name || null, type, date, departureMs: Number.isFinite(departureMs) ? departureMs : null });
  }
  const months = {}, days = {}, warnings = [];
  const duplicateDays = {};
  for (const r of records) {
    const month = r.date.slice(0,7);
    (months[month] ||= { external: 0, partner: 0, kings: 0 });
    (days[r.date] ||= { external: 0, partner: 0, kings: 0 });
    const field = r.type === 'External Convoy' ? 'external' : r.type === 'Partner Convoy' ? 'partner' : 'kings';
    months[month][field]++; days[r.date][field]++;
  }
  for (const duplicate of duplicateSourceClaims) {
    duplicateDays[duplicate.date]=(duplicateDays[duplicate.date]||0)+1;
  }
  for (const [period,count] of Object.entries(duplicateDays)) {
    warnings.push({
      code:'duplicate-source-claim',period,count,
      actionRequired:'Event Staff must reconcile original records'
    });
  }
  for (const [month, counts] of Object.entries(months)) {
    for (const category of ['external','partner']) {
      const monthlyLimit = category==='external'?LIMITS.externalMonthly:LIMITS.partnerMonthly;
      for (const threshold of [15,18,20]) {
        if (counts[category] >= threshold) {
          warnings.push({
            code: category+'-month-threshold', period: month,
            threshold, count: counts[category]
          });
        }
      }
      if (counts[category] > monthlyLimit) {
        warnings.push({
          code: category+'-month-over-limit', period: month,
          count: counts[category], limit: monthlyLimit
        });
      }
    }
  }
  for (const [day, counts] of Object.entries(days)) {
    const combined = counts.external + counts.partner + counts.kings;
    counts.total=combined;
    if (combined > LIMITS.dailyTotal) {
      warnings.push({
        code:'total-day-over-limit', period:day,
        count:combined, limit:LIMITS.dailyTotal
      });
    }
  }
  // Attribute a cross-midnight spacing warning to the later departure's UTC
  // day, matching the 12-month Calendar and #12 human-review aggregate.
  // This changes the review notice key only, never an Event or Staff decision.
  const timed = records.filter(r => r.departureMs !== null).sort((a,b)=>a.departureMs-b.departureMs);
  for (let i=0;i<timed.length;i++) for (let j=i+1;j<timed.length && timed[j].departureMs-timed[i].departureMs<LIMITS.separationMinutes*60000;j++) {
    warnings.push({ code: 'departure-under-two-hours', period: timed[j].date, first: timed[i].id, second: timed[j].id, minutesApart: Math.round((timed[j].departureMs-timed[i].departureMs)/60000) });
  }
  // Classified and/or undated Center claims are incomplete historical
  // evidence. NEVER calculate or publish certified remaining/bookable slots.
  return { version:2, mode:'advisory-only', limits:LIMITS, months, days,
    warnings, unknownTypes, missingDepartures, resolvedEventTypes,
    duplicateSourceClaims:Object.entries(duplicateDays).map(([period,count])=>({period,count})),
    sourceUniquenessVerified:duplicateSourceClaims.length===0,
    counted:records.length, freeSlotsCertified:false,
    historicalApprovalsVerified:false, sourceClaimsOnly:true };
}
module.exports = { evaluate, typeOf, LIMITS };
