require('./kings-branding').installDiscordBranding();
const fs = require('fs');
const { discordTimestamp } = require('./convoy-time-utils');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const REPORT_PATH = 'output/convoy-check-results.json';
const LEGACY_PATH = 'data/legacy-convoys.json';

const REMINDER_CHANNEL_ID = process.env.DISCORD_CONVOY_REMINDER_CHANNEL_ID || null;
const REMINDER_CHANNEL_NAME = process.env.DISCORD_CONVOY_REMINDER_CHANNEL_NAME || 'convoy-reminders';
const DRIVER_ROLE_ID = process.env.DISCORD_DRIVER_ROLE_ID || null;
const DRIVER_ROLE_NAME = process.env.DISCORD_DRIVER_ROLE_NAME || 'Convoy Driver';
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.CONVOY_DRY_RUN || '').trim().toLowerCase());

const REMINDER_24H_MARKER = '⏰ **Kings Driver Convoy Reminder — 24 Hours**';
const REMINDER_1H_MARKER = '🚨 **Kings Driver Convoy Reminder — 1 Hour**';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Missing ${REPORT_PATH}. Run convoy-checker.js first.`);
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Driver Convoy Reminders/1.4'
  };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${path}: ${text.slice(0, 500)}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isTestThread(item) {
  if (typeof item.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item.name || '');
}

function isImageAttachment(attachment) {
  const type = String(attachment?.content_type || '');
  const name = String(attachment?.filename || '');
  return type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function slotImageMeta(item) {
  return (
    item?.kingsSlotImage ||
    item?.validation?.parsed?.kingsSlotImage ||
    null
  );
}

async function resolveFreshSlotImage(item) {
  const meta = slotImageMeta(item);
  if (!meta?.messageId || !item?.threadId) return null;

  try {
    const message = await discord(`/channels/${item.threadId}/messages/${meta.messageId}`);
    const attachments = (message?.attachments || []).filter(isImageAttachment);

    let attachment = null;
    if (meta.attachmentId) {
      attachment = attachments.find((entry) => String(entry.id) === String(meta.attachmentId)) || null;
    }
    if (!attachment) attachment = attachments[0] || null;

    if (!attachment?.url) return null;

    return {
      url: attachment.url,
      attachmentId: String(attachment.id || meta.attachmentId || ''),
      filename: attachment.filename || meta.filename || 'slot-image'
    };
  } catch (error) {
    console.warn(`Could not refresh Kings slot image for ${item.name || item.threadId}: ${error.message}`);

    if (meta.capturedUrl) {
      return {
        url: meta.capturedUrl,
        attachmentId: String(meta.attachmentId || ''),
        filename: meta.filename || 'slot-image'
      };
    }

    return null;
  }
}

function buildSlotImageEmbed(image) {
  if (!image?.url) return [];
  return [{
    title: '🚚 Kings Slot',
    image: { url: image.url }
  }];
}

function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-');
}

async function resolveReminderChannel() {
  if (REMINDER_CHANNEL_ID) {
    const channel = await discord(`/channels/${REMINDER_CHANNEL_ID}`);
    if (channel.guild_id && channel.guild_id !== GUILD_ID) {
      throw new Error(`Reminder channel ${REMINDER_CHANNEL_ID} does not belong to guild ${GUILD_ID}.`);
    }
    return channel;
  }

  const channels = await discord(`/guilds/${GUILD_ID}/channels`);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));
  const wanted = normalizeName(REMINDER_CHANNEL_NAME);

  const exact = textChannels.find((channel) => normalizeName(channel.name) === wanted);
  if (exact) return exact;

  const fuzzy = textChannels.filter((channel) => {
    const name = normalizeName(channel.name);
    return name.includes('convoy') && name.includes('reminder');
  });

  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(`Multiple convoy reminder channels found: ${fuzzy.map((channel) => `${channel.name} (${channel.id})`).join(', ')}`);
  }

  throw new Error(`Could not find a Discord channel matching "${REMINDER_CHANNEL_NAME}".`);
}

async function resolveDriverRole() {
  if (DRIVER_ROLE_ID) {
    const roles = await discord(`/guilds/${GUILD_ID}/roles`);
    const role = (roles || []).find((item) => item.id === DRIVER_ROLE_ID);
    if (!role) throw new Error(`Driver role ${DRIVER_ROLE_ID} was not found in guild ${GUILD_ID}.`);
    return role;
  }

  const roles = await discord(`/guilds/${GUILD_ID}/roles`);
  const wanted = String(DRIVER_ROLE_NAME).trim().toLowerCase();

  const exact = (roles || []).find((role) => String(role.name || '').trim().toLowerCase() === wanted);
  if (exact) return exact;

  const aliases = ['convoy driver', 'driver', 'kings driver', 'kings logistics driver'];
  const aliasMatch = (roles || []).find((role) => aliases.includes(String(role.name || '').trim().toLowerCase()));
  if (aliasMatch) return aliasMatch;

  const fuzzy = (roles || []).filter((role) => /\bdriver\b/i.test(role.name || ''));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(`Multiple Driver-like roles found: ${fuzzy.map((role) => `${role.name} (${role.id})`).join(', ')}`);
  }

  throw new Error(`Could not find a Discord role matching "${DRIVER_ROLE_NAME}".`);
}

function loadLegacyReminderItems(report) {
  if (!fs.existsSync(LEGACY_PATH)) return [];

  let data;
  try {
    data = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Legacy Convoy data is invalid: ${error.message}`);
  }

  const centerEventIds = new Set(
    (report.threads || [])
      .map((item) => item?.eventId ? String(item.eventId) : null)
      .filter(Boolean)
  );

  const items = [];
  let duplicatesSuppressed = 0;
  let notReminderEligible = 0;

  for (const legacy of Array.isArray(data?.convoys) ? data.convoys : []) {
    const eventId = legacy?.eventId ? String(legacy.eventId) : null;

    if (eventId && centerEventIds.has(eventId)) {
      duplicatesSuppressed += 1;
      continue;
    }

    if (!legacy?.confirmedKingsSlot || !legacy?.kingsSlot || !legacy?.kingsSlotImage || !legacy?.eventTimeValid || !legacy?.eventUnix) {
      notReminderEligible += 1;
      continue;
    }

    items.push({
      legacy: true,
      readOnly: true,
      ignored: false,
      error: null,
      archived: false,
      locked: false,
      status: 'Scheduled',
      threadId: String(legacy.sourceThreadId || legacy.legacyId),
      name: legacy.name || legacy.sourceThreadName || 'Legacy Convoy',
      eventId,
      eventUnix: Number(legacy.eventUnix),
      eventTimeValid: true,
      kingsSlotImage: legacy.kingsSlotImage || null,
      validation: {
        checks: { kingsSlotConfirmed: true },
        parsed: {
          eventDate: legacy.eventDate || null,
          meetupTime: legacy.meetingTime || null,
          meetup: legacy.meetingPoint || legacy.start || null,
          route: legacy.route || null,
          start: legacy.start || null,
          destination: legacy.destination || null,
          kingsSlot: legacy.kingsSlot || null,
          server: legacy.server || null
        }
      },
      truckersmp: {
        name: legacy.truckersmp?.name || legacy.name || null,
        server: legacy.truckersmp?.server || legacy.server || null,
        game: legacy.truckersmp?.game || legacy.game || null,
        hostVtc: legacy.truckersmp?.hostVtc || legacy.hostVtc || null,
        url: legacy.eventUrl || (eventId ? `https://truckersmp.com/events/${eventId}` : null)
      }
    });
  }

  console.log(
    `Legacy Driver reminder feed: ${items.length} eligible; ${duplicatesSuppressed} Convoy Center duplicate(s) suppressed; ${notReminderEligible} pending/incomplete legacy convoy(s) kept out of reminders.`
  );

  return items;
}

function routeLabel(item) {
  const parsed = item.validation?.parsed || {};
  if (parsed.route) return parsed.route;
  if (parsed.start && parsed.destination) return `${parsed.start} → ${parsed.destination}`;
  return null;
}

function markerFor(item, marker) {
  const sourceLabel = item.legacy ? 'Legacy Source Thread' : 'Source Thread';
  return `${marker}\n🔒 **${sourceLabel}:** \`${item.threadId}\``;
}

async function findExistingReminder(channelId, item, marker, botId) {
  const lookup = markerFor(item, marker);
  let before = null;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const messages = await discord(`/channels/${channelId}/messages?${query.toString()}`);
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const found = messages.find((message) => {
      if (message.author?.id !== botId) return false;
      const content = message.content || '';
      if (content.includes(lookup)) return true;

      if (item.eventId) {
        const sameTier = content.includes(marker);
        const sameEvent = content.includes(`truckersmp.com/events/${item.eventId}`);
        if (sameTier && sameEvent) return true;
      }

      return false;
    });

    if (found) return found;
    if (messages.length < 100) return null;
    before = messages[messages.length - 1].id;
  }

  return null;
}

function buildReminder(item, marker, title, description, driverRoleId) {
  const parsed = item.validation?.parsed || {};
  const route = routeLabel(item);
  const meetup = parsed.meetup || null;
  const slot = parsed.kingsSlot || null;
  const server = item.truckersmp?.server || parsed.server || null;
  const convoyName = item.truckersmp?.name || item.name || 'Kings Convoy';
  const eventUrl = item.eventId ? `https://truckersmp.com/events/${item.eventId}` : null;

  if (!slot) {
    throw new Error('Internal Convoy Driver reminder requires a confirmed Kings Slot.');
  }

  return [
    markerFor(item, marker),
    '',
    `<@&${driverRoleId}>`,
    '',
    `# ${title}`,
    '',
    description,
    '',
    `🚛 **Convoy:** ${convoyName}`,
    `🕒 **Meeting Time:** ${discordTimestamp(item.eventUnix, 'F')} · ${discordTimestamp(item.eventUnix, 'R')}`,
    server ? `🎙️ **Server:** ${server}` : null,
    meetup ? `📍 **Meeting Point:** ${meetup}` : null,
    route ? `🛣️ **Route:** ${route}` : null,
    slot ? `🚚 **Kings Slot:** ${slot}` : null,
    eventUrl ? `🔗 **TruckersMP Event:** ${eventUrl}` : null,
    item.legacy ? '📚 **Source:** Migrated old Convoy Calendar' : null,
    '',
    'Please make sure you are ready and arrive before the meeting time. 💙'
  ].filter(Boolean).join('\n');
}

async function sendReminder(channelId, item, marker, title, description, botId, driverRoleId) {
  const content = buildReminder(item, marker, title, description, driverRoleId);
  const existing = await findExistingReminder(channelId, item, marker, botId);
  const slotImage = await resolveFreshSlotImage(item);

  if (!slotImage?.url) {
    throw new Error('Kings Slot image is required for Driver reminders.');
  }

  const embeds = buildSlotImageEmbed(slotImage);

  if (DRY_RUN) {
    if (!content.includes(`<@&${driverRoleId}>`)) {
      throw new Error('Dry-run safety check failed: Convoy Driver role mention is missing.');
    }
    if (/@everyone|@here/i.test(content)) {
      throw new Error('Dry-run safety check failed: internal reminder contains a forbidden broad mention.');
    }
    if (!embeds[0]?.image?.url) {
      throw new Error('Dry-run safety check failed: Kings Slot image embed is missing.');
    }
    return {
      action: existing ? 'dry-run-update' : 'dry-run',
      messageId: existing?.id || null,
      slotImage: slotImage.filename
    };
  }

  const body = {
    content,
    embeds,
    allowed_mentions: {
      parse: [],
      roles: [driverRoleId]
    }
  };

  if (existing) {
    const branded = require('./kings-branding').brandMessageContent(content).trim();
    const existingImageUrl = existing.embeds?.[0]?.image?.url || '';
    const sameAttachment =
      slotImage.attachmentId &&
      existingImageUrl.includes(slotImage.attachmentId);

    if (
      String(existing.content || '').trim() === branded &&
      sameAttachment
    ) {
      return { action: 'already-current', messageId: existing.id };
    }

    const updated = await discord(`/channels/${channelId}/messages/${existing.id}`, {
      method: 'PATCH',
      body
    });

    return { action: 'updated', messageId: updated?.id || existing.id };
  }

  const sent = await discord(`/channels/${channelId}/messages`, {
    method: 'POST',
    body
  });

  return { action: 'sent', messageId: sent?.id || null };
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const legacyItems = loadLegacyReminderItems(report);
  const reminderItems = [...(report.threads || []), ...legacyItems];
  const bot = await discord('/users/@me');
  const reminderChannel = await resolveReminderChannel();
  const driverRole = await resolveDriverRole();
  const nowUnix = Math.floor(Date.now() / 1000);

  console.log(`Driver reminder channel: ${reminderChannel.name} (${reminderChannel.id})`);
  console.log(`Driver ping role: ${driverRole.name} (${driverRole.id})`);
  console.log(`Convoy Driver reminder dry-run: ${DRY_RUN}`);

  let sent24h = 0;
  let sent1h = 0;
  let dryRun24h = 0;
  let dryRun1h = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of reminderItems) {
    if (item.ignored || item.error || isTestThread(item)) {
      skipped += 1;
      continue;
    }

    if (item.archived || item.locked || item.status !== 'Scheduled') {
      skipped += 1;
      continue;
    }

    if (!item.eventUnix || !item.eventTimeValid) {
      skipped += 1;
      continue;
    }

    const secondsUntilMeeting = item.eventUnix - nowUnix;
    if (secondsUntilMeeting <= 0 || secondsUntilMeeting > 24 * 60 * 60) {
      skipped += 1;
      continue;
    }

    try {
      if (secondsUntilMeeting <= 60 * 60) {
        const result = await sendReminder(
          reminderChannel.id,
          item,
          REMINDER_1H_MARKER,
          '🚨 Convoy Reminder — 1 Hour',
          'The convoy Meeting Time is now within 1 hour. Please get ready and make sure you arrive on time.',
          bot.id,
          driverRole.id
        );
        console.log(`- ${item.name} | 1h driver reminder: ${result.action}`);
        if (result.action === 'sent') sent1h += 1;
        if (result.action === 'dry-run') dryRun1h += 1;
        continue;
      }

      const result = await sendReminder(
        reminderChannel.id,
        item,
        REMINDER_24H_MARKER,
        '⏰ Convoy Reminder — 24 Hours',
        'The convoy Meeting Time is now within 24 hours. Please check the details below and make sure you are prepared.',
        bot.id,
        driverRole.id
      );
      console.log(`- ${item.name} | 24h driver reminder: ${result.action}`);
      if (result.action === 'sent') sent24h += 1;
      if (result.action === 'dry-run') dryRun24h += 1;
    } catch (error) {
      failed += 1;
      console.warn(`- Driver reminder failed | ${item.name} | ${error.message}`);
    }
  }

  console.log(
    `Kings Driver Convoy Reminders finished. 24h sent: ${sent24h}. 1h sent: ${sent1h}. Dry-run 24h: ${dryRun24h}. Dry-run 1h: ${dryRun1h}. Skipped: ${skipped}. Failed: ${failed}.`
  );
  if (failed > 0) process.exitCode = 1;

}

main().catch((error) => {
  console.error('Kings Driver Convoy Reminders failed:', error.message);
  process.exit(1);
});
