// Legacy refresh preservation verification: deleted source threads must remain frozen.
const fs = require('fs');
const path = require('path');

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const DISCORD_API = 'https://discord.com/api/v10';
const TMP_API = 'https://api.truckersmp.com/v2';
const OUTPUT = path.join(__dirname, 'data', 'legacy-convoys.json');
const SUMMARY = path.join(__dirname, 'data', 'legacy-convoys-import-summary.json');

const MONTHS = [
  { label: 'October 2026', year: 2026, month: 10, channelId: '1394466082064171020' },
  { label: 'November 2026', year: 2026, month: 11, channelId: '1394466122270511244' },
  { label: 'December 2026', year: 2026, month: 12, channelId: '1394466158337458267' },
  { label: 'January 2027', year: 2027, month: 1, channelId: '1525976885853425864' },
  { label: 'February 2027', year: 2027, month: 2, channelId: '1525976942967394414' },
  { label: 'March 2027', year: 2027, month: 3, channelId: '1525976979902300160' }
];

if (!DISCORD_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function nowISO() {
  return new Date().toISOString();
}

function isoDateFromUnix(unix) {
  if (!Number.isFinite(Number(unix)) || Number(unix) <= 0) return null;
  return new Date(Number(unix) * 1000).toISOString().slice(0, 10);
}

function utcTimeFromUnix(unix) {
  if (!Number.isFinite(Number(unix)) || Number(unix) <= 0) return null;
  const d = new Date(Number(unix) * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

async function discord(pathname) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${DISCORD_API}${pathname}`, {
        headers: {
          Authorization: `Bot ${DISCORD_TOKEN}`,
          'User-Agent': 'Kings Logistics Legacy Convoy Import/1.0'
        },
        signal: AbortSignal.timeout(30000)
      });

      const text = await response.text();
      if (response.ok) return text ? JSON.parse(text) : null;

      const retryable = response.status === 429 || response.status === 408 || response.status >= 500;
      lastError = new Error(`Discord API ${response.status}: ${text.slice(0, 400)}`);
      if (!retryable || attempt === 4) throw lastError;

      const retryAfter = Number(response.headers.get('retry-after') || 0);
      await sleep(retryAfter > 0 ? Math.ceil(retryAfter * 1000) : 750 * attempt);
    } catch (error) {
      lastError = error;
      if (attempt === 4) throw error;
      await sleep(750 * attempt);
    }
  }
  throw lastError || new Error('Discord request failed.');
}

async function fetchEvent(eventId) {
  if (!eventId) return { event: null, error: null };

  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${TMP_API}/events/${encodeURIComponent(eventId)}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Kings Logistics Legacy Convoy Import/1.0'
        },
        signal: AbortSignal.timeout(15000)
      });

      const text = await response.text();

      if (response.status === 404) {
        return { event: null, error: 'event-not-found' };
      }

      if (response.status === 429) {
        const retryAfter = Number.parseFloat(response.headers.get('retry-after') || '');
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter * 1000) : 12000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`TruckersMP HTTP ${response.status}: ${text.slice(0, 300)}`);
      }

      const payload = text ? JSON.parse(text) : null;
      let current = payload;
      for (let depth = 0; depth < 5; depth += 1) {
        if (!current || typeof current !== 'object') break;
        if (current.id && (current.start_at || current.meetup_at || current.departure || current.arrive)) break;
        if (current.response && typeof current.response === 'object') current = current.response;
        else if (current.data && typeof current.data === 'object') current = current.data;
        else if (current.event && typeof current.event === 'object') current = current.event;
        else break;
      }

      return { event: current && typeof current === 'object' ? current : null, error: null };
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await sleep(1000 * attempt);
        continue;
      }
    }
  }

  return { event: null, error: String(lastError?.message || lastError || 'unknown-api-error') };
}

function allMessageText(message) {
  const pieces = [message?.content];
  for (const embed of message?.embeds || []) {
    pieces.push(embed.title, embed.description);
    for (const field of embed.fields || []) pieces.push(field.name, field.value);
  }
  return pieces.filter(Boolean).join('\n');
}

function componentUrls(components) {
  const urls = [];

  function walk(items) {
    for (const item of items || []) {
      if (item?.url) urls.push(String(item.url));
      if (Array.isArray(item?.components)) walk(item.components);
    }
  }

  walk(components);
  return urls;
}

function messageUrls(message) {
  const urls = [];

  const text = allMessageText(message);
  for (const match of text.matchAll(/https?:\/\/[^\s)\]>]+/gi)) {
    urls.push(match[0].replace(/[.,]+$/, ''));
  }

  for (const embed of message?.embeds || []) {
    if (embed?.url) urls.push(String(embed.url));
  }

  urls.push(...componentUrls(message?.components));

  return [...new Set(urls)];
}

function eventIdFromMessages(messages) {
  const sorted = [...messages].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  for (const message of sorted) {
    for (const url of messageUrls(message)) {
      const match = url.match(/truckersmp\.com\/events\/(\d+)/i);
      if (match) return match[1];
    }

    const text = allMessageText(message);
    const labeled = text.match(/\b(?:Event\s*(?:Link|ID)?|ID)\s*[:#-]?\s*(\d{4,})\b/i);
    if (labeled) return labeled[1];
  }

  return null;
}

function eventUrlFromMessages(messages, eventId) {
  const sorted = [...messages].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  for (const message of sorted) {
    for (const url of messageUrls(message)) {
      if (/truckersmp\.com\/events\/\d+/i.test(url)) return url;
    }
  }

  return eventId ? `https://truckersmp.com/events/${eventId}` : null;
}

function sourceNotes(messages) {
  return [...messages]
    .filter((message) => !message.author?.bot)
    .map((message) => ({
      messageId: String(message.id),
      timestamp: message.timestamp || null,
      text: String(message.content || '').trim()
    }))
    .filter((item) => item.text)
    .slice(0, 30);
}

function isImageAttachment(attachment) {
  const contentType = String(attachment?.content_type || '');
  const filename = String(attachment?.filename || '');
  return contentType.startsWith('image/') || /\.(?:png|jpe?g|webp|gif)$/i.test(filename);
}

function kingsSlotImages(messages, threadId) {
  const images = [];

  for (const message of messages || []) {
    if (message?.author?.bot) continue;

    for (const attachment of message?.attachments || []) {
      if (!isImageAttachment(attachment)) continue;

      images.push({
        messageId: String(message.id),
        timestamp: message.timestamp || null,
        attachmentId: String(attachment.id || ''),
        filename: String(attachment.filename || 'slot-image'),
        contentType: attachment.content_type || null,
        width: Number(attachment.width || 0) || null,
        height: Number(attachment.height || 0) || null,
        capturedUrl: attachment.url || null,
        messageUrl: `https://discord.com/channels/${GUILD_ID}/${threadId}/${message.id}`,
        accompanyingText: String(message.content || '').replace(/\s+/g, ' ').trim() || null
      });
    }
  }

  return images.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

function slotEvidence(messages) {
  const sorted = [...messages]
    .filter((message) => !message.author?.bot)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  const matches = [];
  for (const message of sorted) {
    const text = String(message.content || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    if (
      /\b(?:our\s+)?(?:potential\s+|provisional\s+)?slot\b/i.test(text) ||
      /\bslot\s*(?:confirmed|tbd|waiting|partner)\b/i.test(text)
    ) {
      matches.push({
        messageId: String(message.id),
        timestamp: message.timestamp || null,
        text: text.slice(0, 1200)
      });
    }
  }
  return matches;
}

function slotStatus(evidence, images) {
  // Old Convoy Calendar rule confirmed by Kings: a normal user-uploaded image
  // in the Calendar thread is the Kings slot/slot map and confirms the slot.
  if (Array.isArray(images) && images.length > 0) return 'confirmed';

  if (!evidence.length) return 'unknown';

  const latest = String(evidence[0].text || '').toLowerCase();
  if (/\b(?:tbd|to be determined|waiting|awaiting|potential|provisional|presumably|not confirmed|unconfirmed|to be confirmed)\b/.test(latest)) {
    return 'pending';
  }

  if (/\bslot\b/.test(latest)) return 'confirmed';
  return 'unknown';
}

function slotDisplay(evidence, status, images) {
  const text = evidence.length
    ? evidence[0].text
        .replace(/<@!?\d+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

  if (status === 'confirmed') {
    if (text && images?.length) return `Confirmed — ${text} · Slot image available`;
    if (text) return `Confirmed — ${text}`;
    if (images?.length) return 'Confirmed — Slot image available';
  }

  if (status === 'pending' && text) return `Pending — ${text}`;
  return text || null;
}

function parseThreadDate(threadName, month) {
  const match = String(threadName || '').match(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s*(?:[A-Za-z]+)?/);
  if (!match) return null;

  const day = Number(match[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  return `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function manualMeetingUnix(messages, eventDate) {
  if (!eventDate) return null;

  const sorted = [...messages].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  for (const message of sorted) {
    const text = String(message.content || '');

    const discordTs = text.match(/\b(?:meet(?:up|ing)(?:\s*time)?)\b[^\n<]{0,80}<t:(\d{9,12})/i);
    if (discordTs) return Number(discordTs[1]);

    const plain = text.match(/\b(?:meet(?:up|ing)(?:\s*time)?)\s*[:=-]?\s*(\d{1,2})[:.]([0-5]\d)\s*(?:UTC)?\b/i);
    if (plain) {
      const hour = Number(plain[1]);
      const minute = Number(plain[2]);
      if (hour >= 0 && hour <= 23) {
        const unix = Math.floor(new Date(`${eventDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`).getTime() / 1000);
        if (Number.isFinite(unix)) return unix;
      }
    }
  }

  return null;
}

function locationLabel(location) {
  if (!location) return null;
  if (typeof location === 'string') return clean(location);
  if (typeof location !== 'object') return null;

  const city = clean(location.city);
  const place = clean(location.location || location.name);

  if (city && place && city.toLowerCase() !== place.toLowerCase()) return `${city} — ${place}`;
  return city || place || null;
}

function hostVtc(event) {
  return clean(
    typeof event?.vtc === 'string'
      ? event.vtc
      : event?.vtc?.name || event?.vtc?.company_name || event?.host_vtc?.name
  );
}

function serverName(event) {
  return clean(typeof event?.server === 'string' ? event.server : event?.server?.name);
}

function gameName(event) {
  return clean(typeof event?.game === 'string' ? event.game : event?.game?.name || event?.game?.short_name);
}

function eventName(event) {
  return clean(event?.name || event?.title);
}

async function forumThreads(channelId) {
  const byId = new Map();

  const active = await discord(`/guilds/${GUILD_ID}/threads/active`);
  for (const thread of active?.threads || []) {
    if (String(thread.parent_id || '') === String(channelId)) byId.set(String(thread.id), thread);
  }

  let before = null;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const result = await discord(`/channels/${channelId}/threads/archived/public?${query.toString()}`);
    const batch = result?.threads || [];
    for (const thread of batch) byId.set(String(thread.id), thread);

    if (!result?.has_more || !batch.length) break;
    before = batch[batch.length - 1]?.thread_metadata?.archive_timestamp || null;
    if (!before) break;
  }

  return [...byId.values()];
}

function isCancelled(messages) {
  const sorted = [...messages]
    .filter((message) => !message.author?.bot)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  for (const message of sorted.slice(0, 10)) {
    const text = String(message.content || '');
    if (/\b(?:cancelled|canceled)\b/i.test(text)) return true;
  }
  return false;
}

function loadPreviousLegacy() {
  if (!fs.existsSync(OUTPUT)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    return Array.isArray(data?.convoys) ? data.convoys : [];
  } catch (error) {
    console.warn(`Previous Legacy Convoy file could not be read for preservation: ${error.message}`);
    return [];
  }
}

async function main() {
  const importedAt = nowISO();
  const previousLegacy = loadPreviousLegacy();
  const today = importedAt.slice(0, 10);
  const nowUnix = Math.floor(Date.now() / 1000);

  const convoys = [];
  const failures = [];
  const monthStats = {};

  for (const month of MONTHS) {
    const channel = await discord(`/channels/${month.channelId}`);
    if (Number(channel.type) !== 15) {
      throw new Error(`Old calendar channel ${month.channelId} (${channel.name}) is not a forum.`);
    }

    const threads = await forumThreads(month.channelId);
    monthStats[month.label] = { channelId: month.channelId, threads: threads.length, imported: 0, pastSkipped: 0 };

    for (const thread of threads) {
      try {
        const messages = await discord(`/channels/${thread.id}/messages?limit=100`);
        const eventId = eventIdFromMessages(messages);
        const eventUrl = eventUrlFromMessages(messages, eventId);
        const fallbackDate = parseThreadDate(thread.name, month);
        const slots = slotEvidence(messages);
        const slotImages = kingsSlotImages(messages, thread.id);
        const slotState = slotStatus(slots, slotImages);

        let tmp = null;
        let tmpError = null;
        if (eventId) {
          const fetched = await fetchEvent(eventId);
          tmp = fetched.event;
          tmpError = fetched.error;
          await sleep(550);
        }

        const tmpMeetupUnix = tmp?.meetup_at && !Number.isNaN(new Date(tmp.meetup_at).getTime())
          ? Math.floor(new Date(tmp.meetup_at).getTime() / 1000)
          : null;

        const tmpStartUnix = tmp?.start_at && !Number.isNaN(new Date(tmp.start_at).getTime())
          ? Math.floor(new Date(tmp.start_at).getTime() / 1000)
          : null;

        const eventDate =
          isoDateFromUnix(tmpMeetupUnix) ||
          isoDateFromUnix(tmpStartUnix) ||
          fallbackDate;

        const manualMeetupUnix = manualMeetingUnix(messages, eventDate);
        const meetingUnix = tmpMeetupUnix || manualMeetupUnix || null;

        const cancelled = isCancelled(messages);

        const definitelyPast =
          meetingUnix
            ? meetingUnix < nowUnix - 3 * 60 * 60
            : eventDate
              ? eventDate < today
              : false;

        if (definitelyPast || cancelled) {
          monthStats[month.label].pastSkipped += 1;
          continue;
        }

        const start = locationLabel(tmp?.departure);
        const destination = locationLabel(tmp?.arrive);
        const route = start && destination ? `${start} → ${destination}` : start || destination || null;
        const source = sourceNotes(messages);

        const convoy = {
          legacy: true,
          readOnly: true,
          legacyId: `old-calendar:${thread.id}`,
          source: 'old-discord-convoy-calendar',
          sourceMonth: month.label,
          sourceMonthChannelId: month.channelId,
          sourceThreadId: String(thread.id),
          sourceThreadName: String(thread.name || ''),
          sourceThreadArchived: Boolean(thread.thread_metadata?.archived),
          sourceMessageIds: source.map((entry) => entry.messageId),
          sourceNotes: source,
          eventId: eventId ? String(eventId) : null,
          eventUrl,
          name: eventName(tmp) || String(thread.name || 'Legacy Convoy'),
          eventDate,
          meetingTime: meetingUnix ? utcTimeFromUnix(meetingUnix) : null,
          eventUnix: meetingUnix,
          eventTimeValid: Boolean(meetingUnix),
          eventTimeZone: meetingUnix ? 'UTC' : null,
          departureUnix: tmpStartUnix,
          status: 'Scheduled',
          slotStatus: slotState,
          confirmedKingsSlot: slotState === 'confirmed',
          kingsSlot: slotDisplay(slots, slotState, slotImages),
          slotEvidence: slots,
          kingsSlotImage: slotImages[0] || null,
          kingsSlotImages: slotImages,
          server: serverName(tmp),
          game: gameName(tmp),
          hostVtc: hostVtc(tmp),
          meetingPoint: start,
          start,
          destination,
          route,
          truckersmp: tmp ? {
            id: Number(tmp.id || eventId),
            name: eventName(tmp),
            server: serverName(tmp),
            game: gameName(tmp),
            hostVtc: hostVtc(tmp),
            meetupAtUtc: clean(tmp.meetup_at),
            startAtUtc: clean(tmp.start_at),
            departure: tmp.departure || null,
            arrive: tmp.arrive || null,
            url: eventUrl || `https://truckersmp.com/events/${eventId}`
          } : null,
          truckersmpImportError: tmpError,
          importedAt
        };

        convoys.push(convoy);
        monthStats[month.label].imported += 1;
      } catch (error) {
        failures.push({
          month: month.label,
          threadId: String(thread.id),
          threadName: String(thread.name || ''),
          error: String(error.message || error)
        });
      }
    }
  }

  const currentLegacyIds = new Set(convoys.map((item) => String(item.legacyId || '')));
  let preservedMissingSource = 0;

  for (const previous of previousLegacy) {
    const legacyId = String(previous?.legacyId || '');
    if (!legacyId || currentLegacyIds.has(legacyId)) continue;

    const previousDate = String(previous?.eventDate || '');
    if (previousDate && previousDate < today) continue;

    const preserved = {
      ...previous,
      sourceUnavailable: true,
      sourceUnavailableReason: 'Previously imported old Calendar thread is no longer returned by Discord.',
      preservedFromPreviousImport: true,
      preservedAt: importedAt
    };

    convoys.push(preserved);
    currentLegacyIds.add(legacyId);
    preservedMissingSource += 1;

    const label = String(previous?.sourceMonth || '');
    if (label && monthStats[label]) {
      monthStats[label].imported += 1;
      monthStats[label].preservedMissingSource =
        Number(monthStats[label].preservedMissingSource || 0) + 1;
    }
  }

  convoys.sort((a, b) => {
    const aTime = Number(a.eventUnix || 0);
    const bTime = Number(b.eventUnix || 0);
    if (aTime && bTime) return aTime - bTime;
    if (a.eventDate && b.eventDate) return a.eventDate.localeCompare(b.eventDate);
    return String(a.sourceThreadName).localeCompare(String(b.sourceThreadName));
  });

  const eventIds = new Map();
  const duplicateEventIds = [];
  for (const convoy of convoys) {
    if (!convoy.eventId) continue;
    if (!eventIds.has(convoy.eventId)) {
      eventIds.set(convoy.eventId, convoy.legacyId);
      continue;
    }
    duplicateEventIds.push({
      eventId: convoy.eventId,
      firstLegacyId: eventIds.get(convoy.eventId),
      duplicateLegacyId: convoy.legacyId
    });
  }

  const output = {
    version: 1,
    mode: 'one-time-frozen-legacy-import',
    importedAt,
    authority: 'old Discord Convoy Calendar before Convoy Center',
    readOnly: true,
    monthChannels: MONTHS,
    policy: {
      newConvoysSource: 'Convoy Center only',
      legacySourceFrozen: true,
      duplicateRule: 'Convoy Center event ID wins over Legacy',
      overview: 'Legacy future convoys are included; confirmed and pending slot states are preserved.',
      driverReminders: 'Legacy reminders require a valid Meeting Time and a confirmed Kings slot.'
    },
    summary: {
      importedFutureLegacyConvoys: convoys.length,
      confirmedSlot: convoys.filter((item) => item.confirmedKingsSlot).length,
      pendingSlot: convoys.filter((item) => item.slotStatus === 'pending').length,
      unknownSlot: convoys.filter((item) => item.slotStatus === 'unknown').length,
      validMeetingTime: convoys.filter((item) => item.eventTimeValid).length,
      withTruckersmpEventId: convoys.filter((item) => item.eventId).length,
      withKingsSlotImage: convoys.filter((item) => item.kingsSlotImage).length,
      duplicateEventIdsWithinLegacy: duplicateEventIds.length,
      importFailures: failures.length,
      preservedMissingSource
    },
    monthStats,
    duplicateEventIds,
    failures,
    convoys
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  fs.writeFileSync(SUMMARY, `${JSON.stringify({
    version: 1,
    importedAt,
    summary: output.summary,
    monthStats,
    duplicateEventIds,
    failures
  }, null, 2)}\n`, 'utf8');

  console.log('Kings Legacy Convoy import completed.');
  console.log(`Future legacy convoys imported: ${output.summary.importedFutureLegacyConvoys}`);
  console.log(`Confirmed slot: ${output.summary.confirmedSlot}`);
  console.log(`Pending slot: ${output.summary.pendingSlot}`);
  console.log(`Unknown slot: ${output.summary.unknownSlot}`);
  console.log(`Valid Meeting Time: ${output.summary.validMeetingTime}`);
  console.log(`TruckersMP Event ID: ${output.summary.withTruckersmpEventId}`);
  console.log(`Kings Slot Image: ${output.summary.withKingsSlotImage}`);
  console.log(`Import failures: ${output.summary.importFailures}`);
  console.log(`Preserved missing source threads: ${output.summary.preservedMissingSource}`);

  for (const [month, stats] of Object.entries(monthStats)) {
    console.log(`- ${month}: ${stats.imported} imported, ${stats.pastSkipped} past/cancelled skipped from ${stats.threads} thread(s)`);
  }

  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Kings Legacy Convoy import failed:', error.stack || error.message);
  process.exit(1);
});
