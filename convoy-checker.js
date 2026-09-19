const fs = require('fs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';

const EVENT_TEAM_ROLE_IDS = new Set([
  '1378658861816217600',
  '1363949241138941952',
  '1492930716156166165',
  '1492930713459364031',
  '1199767340787703828',
  '1433646186778329228',
  '1492929616019718285'
]);

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN. Add it as a GitHub Actions repository secret.');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discord(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Convoy Checker/2.0'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API ${response.status} on ${path}: ${body.slice(0, 500)}`);
  }

  return response.json();
}

function normalize(text = '') {
  return text.replace(/\r/g, '').trim();
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
  const match = cleaned.match(new RegExp(`(?:^|\\n)\\s*(?:[-#>]+\\s*)?(?:${names})\\s*(?::|-)\\s*([^\\n]+)`, 'i'));
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
  return messages.some((message) => (message.attachments || []).some((attachment) => {
    const type = attachment.content_type || '';
    const name = attachment.filename || '';
    return type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name);
  }));
}

function isConfirmedSlot(value) {
  if (!value) return false;
  const normalized = value.trim();
  if (/\b(?:no|none|n\/?a|tbd|pending|waiting|unconfirmed|not\s+confirmed|not\s+booked)\b/i.test(normalized)) return false;
  return normalized.length > 0;
}

function hasEventTeamRole(message) {
  const roles = message.member?.roles || [];
  return roles.some((roleId) => EVENT_TEAM_ROLE_IDS.has(roleId));
}

function detectStatusPhrase(text = '') {
  const value = stripMarkdown(text).toLowerCase();
  if (/\b(cancelled|canceled)\b/.test(value)) return 'Cancelled';
  if (/\b(completed|finished)\b/.test(value)) return 'Completed';
  if (/\b(needs?\s+(?:more\s+)?information|needs?\s+info|missing\s+information)\b/.test(value)) return 'Needs Information';
  if (/\bready\s+for\s+approval\b/.test(value)) return 'Ready for Approval';
  if (/\bsubmitted\b/.test(value)) return 'Submitted';
  if (/\b(?:scheduled|approved)\b/.test(value) && !/\b(?:not|isn['’]?t|is\s+not)\s+(?:yet\s+)?approved\b/.test(value)) return 'Scheduled';
  return null;
}

function detectForumTagStatus(thread, tagNamesById) {
  const statuses = (thread.applied_tags || [])
    .map((tagId) => tagNamesById.get(tagId))
    .filter(Boolean)
    .map(detectStatusPhrase)
    .filter(Boolean);

  const priority = ['Cancelled', 'Completed', 'Scheduled', 'Needs Information', 'Ready for Approval', 'Submitted'];
  return priority.find((status) => statuses.includes(status)) || null;
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

function getStaffStatus(messages) {
  const candidates = messages
    .filter((message) => hasEventTeamRole(message))
    .map((message) => ({
      status: detectStatusPhrase(message.content || ''),
      authorId: message.author?.id || null,
      messageId: message.id,
      timestamp: message.timestamp || ''
    }))
    .filter((item) => item.status)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return candidates[0] || null;
}

function deriveStatus({ validation, tagStatus, staffStatus, starterText, duplicate }) {
  const explicitStatus = tagStatus || staffStatus?.status || null;

  if (explicitStatus === 'Cancelled' || explicitStatus === 'Completed') return explicitStatus;
  if (duplicate) return 'Needs Information';
  if (!validation.complete) {
    const hasSubmissionSignal = Boolean(extractEventId(starterText)) || Object.values(validation.parsed).some(Boolean);
    return hasSubmissionSignal ? 'Needs Information' : 'Submitted';
  }
  if (explicitStatus === 'Needs Information') return 'Needs Information';
  if (explicitStatus === 'Scheduled') return 'Scheduled';
  return 'Ready for Approval';
}

function statusKey(status) {
  return status.replace(/\s+/g, '').replace(/^./, (char) => char.toLowerCase());
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
    '| Convoy | Status | Missing / Issue |',
    '|---|---|---|'
  ];

  const visible = report.threads.filter((item) => !item.ignored);
  if (visible.length === 0) {
    lines.push('| — | No real convoy submissions found | — |');
  } else {
    for (const item of visible) {
      const issue = item.error
        ? item.error
        : [
            ...(item.validation?.missing || []),
            ...(item.duplicateEventId ? ['duplicateEventId'] : [])
          ].join(', ') || '—';
      lines.push(`| ${String(item.name || '').replace(/\|/g, '\\|')} | ${item.status || 'Error'} | ${issue.replace(/\|/g, '\\|')} |`);
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

  const tagNamesById = new Map((forum.available_tags || []).map((tag) => [tag.id, tag.name]));
  const activeData = await discord(`/guilds/${GUILD_ID}/threads/active`);
  const activeThreads = (activeData.threads || []).filter((thread) => thread.parent_id === FORUM_ID);
  const archivedThreads = await getArchivedForumThreads();

  const byId = new Map();
  for (const thread of [...activeThreads, ...archivedThreads]) {
    if (thread.parent_id === FORUM_ID) byId.set(thread.id, thread);
  }

  const results = [];

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
      const starter = getStarterMessage(messages, thread.id);
      const starterText = normalize(starter.content || '');
      const validation = checkFields(starterText, messages);
      const tagStatus = detectForumTagStatus(thread, tagNamesById);
      const staffStatus = getStaffStatus(messages);

      results.push({
        threadId: thread.id,
        name: thread.name,
        archived: Boolean(thread.thread_metadata?.archived),
        locked: Boolean(thread.thread_metadata?.locked),
        ownerId: thread.owner_id || null,
        starterAuthorId: starter.author?.id || null,
        eventId: extractEventId(starterText),
        messageCountChecked: messages.length,
        attachmentCount: messages.reduce((count, message) => count + (message.attachments || []).length, 0),
        tagNames: (thread.applied_tags || []).map((tagId) => tagNamesById.get(tagId)).filter(Boolean),
        tagStatus,
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
  const duplicateThreadIds = new Set(duplicateEventIds.flatMap((item) => item.threadIds));

  for (const item of actualConvoys) {
    if (item.error) continue;
    item.duplicateEventId = duplicateThreadIds.has(item.threadId);
    item.status = deriveStatus({
      validation: item.validation,
      tagStatus: item.tagStatus,
      staffStatus: item.staffStatus,
      starterText: item.starterTextForStatus,
      duplicate: item.duplicateEventId
    });
    delete item.starterTextForStatus;
  }

  const statusCounts = {};
  for (const item of actualConvoys) {
    if (!item.status) continue;
    const key = statusKey(item.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    guildId: GUILD_ID,
    forumId: FORUM_ID,
    bot: { id: bot.id, username: bot.username },
    forum: { id: forum.id, name: forum.name, type: forum.type },
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
  fs.writeFileSync('output/convoy-check-results.json', JSON.stringify(report, null, 2));
  appendGithubSummary(report);

  console.log('Kings Convoy Checker connected successfully.');
  console.log(`Bot: ${bot.username} (${bot.id})`);
  console.log(`Forum: ${forum.name} (${forum.id})`);
  console.log(`Threads found: ${report.summary.totalThreads}`);
  console.log(`Actual convoys: ${report.summary.actualConvoys} | Ignored templates: ${report.summary.ignoredTemplates}`);
  console.log(`Duplicate TruckersMP event IDs: ${report.summary.duplicateEventIds}`);
  console.log(`Status counts: ${JSON.stringify(report.summary.statuses)}`);

  console.log('\nConvoy validation details:');
  if (results.length === 0) console.log('- No convoy threads found.');

  for (const item of results) {
    if (item.ignored) {
      console.log(`- IGNORED | ${item.name} (${item.threadId}) | Reason: ${item.ignoreReason}`);
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
    const approval = item.staffStatus?.authorId ? ` | Staff status by ${item.staffStatus.authorId}: ${item.staffStatus.status}` : '';
    console.log(`- ${item.status.toUpperCase()} | ${item.name} (${item.threadId}) | Event: ${item.eventId || 'none'} | Issues: ${issues.join(', ') || 'none'}${approval}`);
  }

  console.log('\nREAD_ONLY mode: no Discord data was changed.');
}

main().catch((error) => {
  console.error('Kings Convoy Checker failed:', error.message);
  process.exit(1);
});
