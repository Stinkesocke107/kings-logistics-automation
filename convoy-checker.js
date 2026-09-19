const fs = require('fs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';
const WRITE_MODE = /^(?:1|true|yes|on)$/i.test(process.env.DISCORD_WRITE_MODE || '');
const STATUS_MESSAGE_MARKER = '👑 **Kings Convoy Automation**';

const EVENT_TEAM_ROLE_IDS = new Set([
  '1378658861816217600',
  '1363949241138941952',
  '1492930716156166165',
  '1492930713459364031',
  '1199767340787703828',
  '1433646186778329228',
  '1492929616019718285',
  '1114967608920395866'
]);

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN. Add it as a GitHub Actions repository secret.');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';
const memberRoleCache = new Map();

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Convoy Checker/3.1'
  };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
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

function normalize(text = '') {
  return String(text).replace(/\r/g, '').trim();
}

function stripMarkdown(text = '') {
  return normalize(text).replace(/[*_`~]/g, '');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getFieldValue(text, labels) {
  const cleaned = stripMarkdown(text);
  const names = labels.map(escapeRegex).join('|');
  const match = cleaned.match(
    new RegExp(`(?:^|\\n)\\s*(?:[-#>]+\\s*)?(?:${names})\\s*(?::|-)\\s*([^\\n]+)`, 'i')
  );
  if (!match) return null;

  const value = match[1].trim();
  if (!value || /^(?:n\/?a|none|tbd|todo|unknown|-)$/i.test(value)) return null;
  return value;
}

function extractEventId(text = '') {
  const match = text.match(/truckersmp\.com\/events\/(\d+)/i);
  return match ? match[1] : null;
}

function hasImage(messages = []) {
  return messages.some((message) =>
    (message.attachments || []).some((attachment) => {
      const type = attachment.content_type || '';
      const name = attachment.filename || '';
      return type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name);
    })
  );
}

function isConfirmedSlot(value) {
  if (!value) return false;
  const cleaned = value.trim();
  if (/\b(?:no|none|n\/?a|tbd|pending|waiting|unconfirmed|not\s+confirmed|not\s+booked)\b/i.test(cleaned)) {
    return false;
  }
  return cleaned.length > 0;
}

async function getMemberRoles(message) {
  const inlineRoles = message.member?.roles || [];
  if (inlineRoles.length > 0) {
    return { roles: inlineRoles, source: 'message.member', error: null };
  }

  const userId = message.author?.id || null;
  if (!userId) return { roles: [], source: 'none', error: 'Message has no author ID.' };
  if (memberRoleCache.has(userId)) return memberRoleCache.get(userId);

  try {
    const member = await discord(`/guilds/${GUILD_ID}/members/${userId}`);
    const result = {
      roles: member.roles || [],
      source: 'guild-member-lookup',
      error: null
    };
    memberRoleCache.set(userId, result);
    return result;
  } catch (error) {
    const result = {
      roles: [],
      source: 'guild-member-lookup',
      error: error.message
    };
    memberRoleCache.set(userId, result);
    return result;
  }
}

function detectStatusPhrase(text = '') {
  const value = stripMarkdown(text).toLowerCase();
  if (/\b(cancelled|canceled)\b/.test(value)) return 'Cancelled';
  if (/\b(completed|finished)\b/.test(value)) return 'Completed';
  if (/\b(needs?\s+(?:more\s+)?information|needs?\s+info|missing\s+information)\b/.test(value)) {
    return 'Needs Information';
  }
  if (/\bready\s+for\s+approval\b/.test(value)) return 'Ready for Approval';
  if (/\bsubmitted\b/.test(value)) return 'Submitted';
  if (
    /\b(?:scheduled|approved)\b/.test(value) &&
    !/\b(?:not|isn['’]?t|is\s+not)\s+(?:yet\s+)?approved\b/.test(value)
  ) {
    return 'Scheduled';
  }
  return null;
}

function isTemplateThread(thread, tagNamesById) {
  if (/\btemplate\b/i.test(thread.name || '')) return true;
  return (thread.applied_tags || [])
    .map((tagId) => tagNamesById.get(tagId) || '')
    .some((name) => /\btemplate\b/i.test(name));
}

function checkFields(starterText, messages) {
  const eventType = getFieldValue(starterText, ['Event Type', 'Convoy Type', 'Type']);
  const responsibleStaff = getFieldValue(starterText, ['Responsible Staff', 'Responsible Person', 'Staff', 'Organizer']);
  const kingsSlot = getFieldValue(starterText, ['Kings Slot', 'Slot Confirmation', 'Confirmed Slot', 'Slot Number', 'Slot']);
  const route = getFieldValue(starterText, ['Route']);
  const start = getFieldValue(starterText, ['Start', 'Starting Point', 'Departure']);
  const destination = getFieldValue(starterText, ['Destination', 'End', 'End Point']);
  const meetup = getFieldValue(starterText, ['Meeting Point', 'Meeting Location', 'Meetup', 'Meetup Point']);
  const meetupTime = getFieldValue(starterText, ['Meeting Time', 'Meetup Time', 'Departure Time', 'Time']);

  const checks = {
    eventLink: /https?:\/\/(?:www\.)?truckersmp\.com\/events\/\d+/i.test(starterText),
    eventType: Boolean(eventType),
    responsibleStaff: Boolean(responsibleStaff),
    kingsSlotConfirmed: isConfirmedSlot(kingsSlot),
    route: Boolean(route || (start && destination)),
    meetup: Boolean(meetup),
    meetupTime: Boolean(meetupTime),
    imageProof: hasImage(messages)
  };

  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  return {
    checks,
    missing,
    complete: missing.length === 0,
    parsed: {
      eventType,
      responsibleStaff,
      kingsSlot,
      route,
      start,
      destination,
      meetup,
      meetupTime
    }
  };
}

async function getArchivedForumThreads() {
  const all = [];
  let before = null;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);

    const data = await discord(`/channels/${FORUM_ID}/threads/archived/public?${query.toString()}`);
    const threads = data.threads || [];
    all.push(...threads);

    if (!data.has_more || threads.length === 0) break;
    before = threads[threads.length - 1].thread_metadata?.archive_timestamp;
    if (!before) break;
  }

  return all;
}

async function getThreadMessages(threadId) {
  const messages = await discord(`/channels/${threadId}/messages?limit=100`);
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('No messages found in thread.');
  }
  return messages;
}

function getStarterMessage(messages, threadId) {
  return messages.find((message) => message.id === threadId) || messages[messages.length - 1];
}

async function getStaffStatus(messages) {
  const candidates = [];

  for (const message of messages) {
    if (message.author?.bot) continue;

    const status = detectStatusPhrase(message.content || '');
    if (!status) continue;

    const roleInfo = await getMemberRoles(message);
    const matchedRoleIds = roleInfo.roles.filter((roleId) => EVENT_TEAM_ROLE_IDS.has(roleId));
    if (matchedRoleIds.length === 0) continue;

    candidates.push({
      status,
      authorId: message.author?.id || null,
      messageId: message.id,
      timestamp: message.timestamp || '',
      roleSource: roleInfo.source,
      matchedRoleIds
    });
  }

  candidates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return candidates[0] || null;
}

function deriveStatus({ validation, staffStatus, starterText, duplicate }) {
  const explicitStatus = staffStatus?.status || null;

  if (explicitStatus === 'Cancelled' || explicitStatus === 'Completed') return explicitStatus;
  if (duplicate) return 'Needs Information';

  if (!validation.complete) {
    const hasSubmissionSignal =
      Boolean(extractEventId(starterText)) ||
      Object.values(validation.parsed).some(Boolean);
    return hasSubmissionSignal ? 'Needs Information' : 'Submitted';
  }

  if (explicitStatus === 'Needs Information') return 'Needs Information';
  if (explicitStatus === 'Scheduled') return 'Scheduled';
  return 'Ready for Approval';
}

function statusKey(status) {
  return status.replace(/\s+/g, '').replace(/^./, (char) => char.toLowerCase());
}

function friendlyIssueName(issue) {
  const names = {
    eventLink: 'TruckersMP Event Link',
    eventType: 'Event Type',
    responsibleStaff: 'Responsible Staff',
    kingsSlotConfirmed: 'Confirmed Kings Slot',
    route: 'Route',
    meetup: 'Meeting Point',
    meetupTime: 'Meeting Time',
    imageProof: 'Slot / Event image proof',
    duplicateEventId: 'Duplicate TruckersMP Event ID'
  };
  return names[issue] || issue;
}

function buildDiscordStatusMessage(item) {
  const issues = [
    ...(item.validation?.missing || []),
    ...(item.duplicateEventId ? ['duplicateEventId'] : [])
  ];

  const validationLine = issues.length === 0
    ? '✅ **Validation:** All required information is complete.'
    : `⚠️ **Missing / Issue:** ${issues.map(friendlyIssueName).join(', ')}`;

  let approvalLine = 'ℹ️ **Approval:** No authorized staff status has been detected yet.';
  if (item.status === 'Ready for Approval') {
    approvalLine = '⏳ **Approval:** Waiting for Event Team / CEO approval.';
  } else if (item.staffStatus?.authorId) {
    approvalLine = '✅ **Staff status:** Recognized from an authorized Kings role.';
  }

  const eventLine = item.eventId ? `🔗 **TruckersMP Event ID:** ${item.eventId}` : null;

  return [
    STATUS_MESSAGE_MARKER,
    '',
    `**Status:** \`${item.status}\``,
    validationLine,
    approvalLine,
    eventLine,
    '',
    '🤖 This is the single automated status message for this convoy. It is checked every 15 minutes and updated only when something changes.'
  ].filter(Boolean).join('\n');
}

async function syncDiscordStatus(item, messages, botId) {
  if (!WRITE_MODE) return { action: 'disabled' };
  if (item.archived) return { action: 'skipped', reason: 'archived-thread' };
  if (item.locked) return { action: 'skipped', reason: 'locked-thread' };

  const content = buildDiscordStatusMessage(item);
  const existing = messages.find((message) =>
    message.author?.id === botId &&
    (message.content || '').includes(STATUS_MESSAGE_MARKER)
  );

  if (!existing) {
    const created = await discord(`/channels/${item.threadId}/messages`, {
      method: 'POST',
      body: {
        content,
        allowed_mentions: { parse: [] }
      }
    });
    return { action: 'created', messageId: created?.id || null };
  }

  if (normalize(existing.content || '') === normalize(content)) {
    return { action: 'unchanged', messageId: existing.id };
  }

  const updated = await discord(`/channels/${item.threadId}/messages/${existing.id}`, {
    method: 'PATCH',
    body: {
      content,
      allowed_mentions: { parse: [] }
    }
  });

  return { action: 'updated', messageId: updated?.id || existing.id };
}

function getStatusTagConfiguration(availableTags) {
  const statusTagIds = new Map();
  const allStatusTagIds = new Set();

  for (const tag of availableTags || []) {
    const status = detectStatusPhrase(tag.name || '');
    if (!status) continue;

    allStatusTagIds.add(tag.id);
    if (!statusTagIds.has(status)) statusTagIds.set(status, tag.id);
  }

  return { statusTagIds, allStatusTagIds };
}

async function syncForumStatusTag(item, statusTagIds, allStatusTagIds) {
  if (!WRITE_MODE) return { action: 'disabled' };
  if (item.archived) return { action: 'skipped', reason: 'archived-thread' };
  if (item.locked) return { action: 'skipped', reason: 'locked-thread' };

  const targetTagId = statusTagIds.get(item.status);
  if (!targetTagId) {
    return {
      action: 'skipped',
      reason: 'missing-status-tag',
      status: item.status
    };
  }

  const current = [...(item.appliedTagIds || [])];
  const preserved = current.filter((tagId) => !allStatusTagIds.has(tagId));
  const desired = [...preserved, targetTagId];

  if (desired.length > 5) {
    return {
      action: 'skipped',
      reason: 'too-many-tags',
      preservedTagCount: preserved.length
    };
  }

  const sameSet =
    current.length === desired.length &&
    current.every((tagId) => desired.includes(tagId));

  if (sameSet) {
    return { action: 'unchanged', tagId: targetTagId };
  }

  await discord(`/channels/${item.threadId}`, {
    method: 'PATCH',
    body: { applied_tags: desired }
  });

  item.appliedTagIds = desired;
  return { action: 'updated', tagId: targetTagId };
}

function appendGithubSummary(report) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    '# Kings Convoy Checker',
    '',
    `Mode: **${report.mode}**`,
    '',
    `Actual convoys: **${report.summary.actualConvoys}** · Ignored templates: **${report.summary.ignoredTemplates}**`,
    '',
    '| Convoy | Status | Missing / Issue | Discord message | Forum tag |',
    '|---|---|---|---|---|'
  ];

  const visible = report.threads.filter((item) => !item.ignored);

  if (visible.length === 0) {
    lines.push('| — | No real convoy submissions found | — | — | — |');
  } else {
    for (const item of visible) {
      const issue = item.error
        ? item.error
        : [
            ...(item.validation?.missing || []),
            ...(item.duplicateEventId ? ['duplicateEventId'] : [])
          ].join(', ') || '—';

      const messageSync = item.discordStatusSync?.action || (WRITE_MODE ? 'not-run' : 'disabled');
      const tagSync = item.forumTagSync?.action
        ? `${item.forumTagSync.action}${item.forumTagSync.reason ? ` (${item.forumTagSync.reason})` : ''}`
        : (WRITE_MODE ? 'not-run' : 'disabled');

      lines.push(
        `| ${String(item.name || '').replace(/\|/g, '\\|')} | ${item.status || 'Error'} | ${String(issue).replace(/\|/g, '\\|')} | ${messageSync} | ${tagSync} |`
      );
    }
  }

  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

async function main() {
  const bot = await discord('/users/@me');
  const forum = await discord(`/channels/${FORUM_ID}`);

  if (forum.guild_id !== GUILD_ID) {
    throw new Error(`Forum ${FORUM_ID} does not belong to guild ${GUILD_ID}.`);
  }

  const availableTags = forum.available_tags || [];
  const tagNamesById = new Map(availableTags.map((tag) => [tag.id, tag.name]));
  const { statusTagIds, allStatusTagIds } = getStatusTagConfiguration(availableTags);

  const activeData = await discord(`/guilds/${GUILD_ID}/threads/active`);
  const activeThreads = (activeData.threads || []).filter((thread) => thread.parent_id === FORUM_ID);
  const archivedThreads = await getArchivedForumThreads();

  const byId = new Map();
  for (const thread of [...activeThreads, ...archivedThreads]) {
    if (thread.parent_id === FORUM_ID) byId.set(thread.id, thread);
  }

  const results = [];
  const messagesByThreadId = new Map();

  for (const thread of byId.values()) {
    if (isTemplateThread(thread, tagNamesById)) {
      results.push({
        threadId: thread.id,
        name: thread.name,
        archived: Boolean(thread.thread_metadata?.archived),
        ignored: true,
        ignoreReason: 'template'
      });
      continue;
    }

    try {
      const messages = await getThreadMessages(thread.id);
      messagesByThreadId.set(thread.id, messages);

      const starter = getStarterMessage(messages, thread.id);
      const starterText = normalize(starter.content || '');
      const validation = checkFields(starterText, messages);
      const staffStatus = await getStaffStatus(messages);

      results.push({
        threadId: thread.id,
        name: thread.name,
        archived: Boolean(thread.thread_metadata?.archived),
        locked: Boolean(thread.thread_metadata?.locked),
        ownerId: thread.owner_id || null,
        starterAuthorId: starter.author?.id || null,
        eventId: extractEventId(starterText),
        messageCountChecked: messages.length,
        attachmentCount: messages.reduce(
          (count, message) => count + (message.attachments || []).length,
          0
        ),
        appliedTagIds: [...(thread.applied_tags || [])],
        tagNames: (thread.applied_tags || [])
          .map((tagId) => tagNamesById.get(tagId))
          .filter(Boolean),
        tagStatusBeforeSync: (thread.applied_tags || [])
          .map((tagId) => tagNamesById.get(tagId))
          .map((name) => detectStatusPhrase(name || ''))
          .find(Boolean) || null,
        staffStatus,
        validation,
        starterTextForStatus: starterText
      });
    } catch (error) {
      results.push({
        threadId: thread.id,
        name: thread.name,
        archived: Boolean(thread.thread_metadata?.archived),
        status: 'Error',
        error: error.message
      });
    }
  }

  const actualConvoys = results.filter((item) => !item.ignored);
  const eventMap = new Map();

  for (const item of actualConvoys) {
    if (!item.eventId) continue;
    if (!eventMap.has(item.eventId)) eventMap.set(item.eventId, []);
    eventMap.get(item.eventId).push(item.threadId);
  }

  const duplicateEventIds = [...eventMap.entries()]
    .filter(([, threadIds]) => threadIds.length > 1)
    .map(([eventId, threadIds]) => ({ eventId, threadIds }));

  const duplicateThreadIds = new Set(
    duplicateEventIds.flatMap((item) => item.threadIds)
  );

  for (const item of actualConvoys) {
    if (item.error) continue;

    item.duplicateEventId = duplicateThreadIds.has(item.threadId);
    item.status = deriveStatus({
      validation: item.validation,
      staffStatus: item.staffStatus,
      starterText: item.starterTextForStatus,
      duplicate: item.duplicateEventId
    });

    delete item.starterTextForStatus;
  }

  if (WRITE_MODE) {
    for (const item of actualConvoys) {
      if (item.error) continue;

      try {
        item.forumTagSync = await syncForumStatusTag(
          item,
          statusTagIds,
          allStatusTagIds
        );
      } catch (error) {
        item.forumTagSync = { action: 'failed', error: error.message };
        console.warn(`Forum tag sync failed for ${item.name}: ${error.message}`);
      }

      try {
        item.discordStatusSync = await syncDiscordStatus(
          item,
          messagesByThreadId.get(item.threadId) || [],
          bot.id
        );
      } catch (error) {
        item.discordStatusSync = { action: 'failed', error: error.message };
        console.warn(`Discord status sync failed for ${item.name}: ${error.message}`);
      }
    }
  }

  const statusCounts = {};
  for (const item of actualConvoys) {
    if (!item.status) continue;
    const key = statusKey(item.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }

  const statusTagsAvailable = Object.fromEntries(
    [...statusTagIds.entries()].map(([status, tagId]) => [
      status,
      {
        id: tagId,
        name: tagNamesById.get(tagId) || null
      }
    ])
  );

  const report = {
    generatedAt: new Date().toISOString(),
    mode: WRITE_MODE ? 'DISCORD_MESSAGE_AND_TAG_WRITE' : 'READ_ONLY',
    guildId: GUILD_ID,
    forumId: FORUM_ID,
    bot: { id: bot.id, username: bot.username },
    forum: {
      id: forum.id,
      name: forum.name,
      type: forum.type,
      statusTagsAvailable
    },
    summary: {
      totalThreads: results.length,
      actualConvoys: actualConvoys.length,
      ignoredTemplates: results.filter((item) => item.ignored).length,
      activeThreads: activeThreads.length,
      archivedThreads: results.filter((item) => item.archived).length,
      errors: actualConvoys.filter((item) => item.error).length,
      duplicateEventIds: duplicateEventIds.length,
      statuses: statusCounts
    },
    duplicateEventIds,
    threads: results
  };

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(
    'output/convoy-check-results.json',
    JSON.stringify(report, null, 2)
  );

  appendGithubSummary(report);

  console.log('Kings Convoy Checker connected successfully.');
  console.log(`Bot: ${bot.username} (${bot.id})`);
  console.log(`Forum: ${forum.name} (${forum.id})`);
  console.log(`Mode: ${report.mode}`);
  console.log(`Threads found: ${report.summary.totalThreads}`);
  console.log(
    `Actual convoys: ${report.summary.actualConvoys} | Ignored templates: ${report.summary.ignoredTemplates}`
  );
  console.log(`Duplicate TruckersMP event IDs: ${report.summary.duplicateEventIds}`);
  console.log(`Status counts: ${JSON.stringify(report.summary.statuses)}`);
  console.log(`Status tags available: ${JSON.stringify(statusTagsAvailable)}`);

  console.log('\nConvoy validation details:');
  if (results.length === 0) console.log('- No convoy threads found.');

  for (const item of results) {
    if (item.ignored) {
      console.log(
        `- IGNORED | ${item.name} (${item.threadId}) | Reason: ${item.ignoreReason}`
      );
      continue;
    }

    if (item.error) {
      console.log(`- ERROR | ${item.name} (${item.threadId}) | ${item.error}`);
      continue;
    }

    const issues = [
      ...(item.validation.missing || []),
      ...(item.duplicateEventId ? ['duplicateEventId'] : [])
    ];

    const approval = item.staffStatus?.authorId
      ? ` | Staff status by ${item.staffStatus.authorId}: ${item.staffStatus.status} via ${item.staffStatus.roleSource}; matched roles: ${item.staffStatus.matchedRoleIds.join(', ')}`
      : '';

    const messageSync = item.discordStatusSync
      ? ` | Discord message: ${item.discordStatusSync.action}${item.discordStatusSync.reason ? ` (${item.discordStatusSync.reason})` : ''}`
      : '';

    const tagSync = item.forumTagSync
      ? ` | Forum tag: ${item.forumTagSync.action}${item.forumTagSync.reason ? ` (${item.forumTagSync.reason})` : ''}`
      : '';

    console.log(
      `- ${item.status.toUpperCase()} | ${item.name} (${item.threadId}) | Event: ${item.eventId || 'none'} | Issues: ${issues.join(', ') || 'none'}${approval}${messageSync}${tagSync}`
    );
  }

  console.log(
    WRITE_MODE
      ? '\nDiscord write mode: bot only creates/edits its own convoy status message and synchronizes existing forum status tags.'
      : '\nREAD_ONLY mode: no Discord data was changed.'
  );
}

main().catch((error) => {
  console.error('Kings Convoy Checker failed:', error.message);
  process.exit(1);
});
