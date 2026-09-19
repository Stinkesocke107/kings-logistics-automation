const fs = require('fs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const FORUM_ID = process.env.DISCORD_CONVOY_FORUM_ID || '1550619824005062697';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN. Add it as a GitHub Actions repository secret.');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discord(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'User-Agent': 'Kings Logistics Convoy Checker/1.2'
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

function hasAny(text, expressions) {
  return expressions.some((expression) => expression.test(text));
}

function isTemplateThread(thread) {
  return /\btemplate\b/i.test(thread.name || '');
}

function extractEventId(text = '') {
  const match = text.match(/truckersmp\.com\/events\/(\d+)/i);
  return match ? match[1] : null;
}

function hasImage(attachments = []) {
  return attachments.some((attachment) => {
    const type = attachment.content_type || '';
    const name = attachment.filename || '';
    return type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name);
  });
}

function checkFields(text, attachments) {
  const checks = {
    eventLink: /https?:\/\/(?:www\.)?truckersmp\.com\/events\/\d+/i.test(text),
    eventType: hasAny(text, [/event\s*type\s*:/i, /convoy\s*type\s*:/i, /type\s*:/i]),
    responsibleStaff: hasAny(text, [/responsible\s*staff\s*:/i, /responsible\s*person\s*:/i, /staff\s*:/i, /organizer\s*:/i]),
    kingsSlot: hasAny(text, [/kings\s*slot\s*:/i, /slot\s*(?:confirmation|confirmed|number)?\s*:/i, /confirmed\s*slot/i]),
    route: hasAny(text, [/route\s*:/i, /start\s*:/i]) && hasAny(text, [/destination\s*:/i, /end\s*:/i, /route\s*:/i]),
    meetup: hasAny(text, [/meet(?:ing)?\s*(?:point|location)\s*:/i, /meetup\s*:/i, /meeting\s*:/i]),
    meetupTime: hasAny(text, [/meet(?:ing)?\s*time\s*:/i, /meetup\s*time\s*:/i, /departure\s*time\s*:/i, /time\s*:/i]),
    image: hasImage(attachments)
  };

  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  return { checks, missing, complete: missing.length === 0 };
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

    const last = threads[threads.length - 1];
    before = last.thread_metadata?.archive_timestamp;
    if (!before) break;
  }

  return all;
}

async function getStarterMessage(threadId) {
  try {
    return await discord(`/channels/${threadId}/messages/${threadId}`);
  } catch (error) {
    const messages = await discord(`/channels/${threadId}/messages?limit=100`);
    if (!Array.isArray(messages) || messages.length === 0) throw error;
    return messages.find((message) => message.id === threadId) || messages[messages.length - 1];
  }
}

async function main() {
  const bot = await discord('/users/@me');
  const forum = await discord(`/channels/${FORUM_ID}`);

  if (forum.guild_id !== GUILD_ID) {
    throw new Error(`Forum ${FORUM_ID} does not belong to guild ${GUILD_ID}.`);
  }

  const activeData = await discord(`/guilds/${GUILD_ID}/threads/active`);
  const activeThreads = (activeData.threads || []).filter((thread) => thread.parent_id === FORUM_ID);
  const archivedThreads = await getArchivedForumThreads();

  const byId = new Map();
  for (const thread of [...activeThreads, ...archivedThreads]) {
    if (thread.parent_id === FORUM_ID) byId.set(thread.id, thread);
  }

  const results = [];

  for (const thread of byId.values()) {
    if (isTemplateThread(thread)) {
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
      const starter = await getStarterMessage(thread.id);
      const text = normalize(starter.content || '');
      const validation = checkFields(text, starter.attachments || []);

      results.push({
        threadId: thread.id,
        name: thread.name,
        archived: Boolean(thread.thread_metadata?.archived),
        locked: Boolean(thread.thread_metadata?.locked),
        ownerId: thread.owner_id || null,
        starterAuthorId: starter.author?.id || null,
        eventId: extractEventId(text),
        attachmentCount: (starter.attachments || []).length,
        validation
      });
    } catch (error) {
      results.push({
        threadId: thread.id,
        name: thread.name,
        archived: Boolean(thread.thread_metadata?.archived),
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
      complete: actualConvoys.filter((item) => item.validation?.complete).length,
      incomplete: actualConvoys.filter((item) => item.validation && !item.validation.complete).length,
      errors: actualConvoys.filter((item) => item.error).length,
      duplicateEventIds: duplicateEventIds.length
    },
    duplicateEventIds,
    threads: results
  };

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync('output/convoy-check-results.json', JSON.stringify(report, null, 2));

  console.log('Kings Convoy Checker connected successfully.');
  console.log(`Bot: ${bot.username} (${bot.id})`);
  console.log(`Forum: ${forum.name} (${forum.id})`);
  console.log(`Threads found: ${report.summary.totalThreads}`);
  console.log(`Actual convoys: ${report.summary.actualConvoys} | Ignored templates: ${report.summary.ignoredTemplates}`);
  console.log(`Complete: ${report.summary.complete} | Incomplete: ${report.summary.incomplete} | Errors: ${report.summary.errors}`);
  console.log(`Duplicate TruckersMP event IDs: ${report.summary.duplicateEventIds}`);

  console.log('\nConvoy validation details:');
  if (results.length === 0) {
    console.log('- No convoy threads found.');
  }

  for (const item of results) {
    if (item.ignored) {
      console.log(`- IGNORED | ${item.name} (${item.threadId}) | Reason: ${item.ignoreReason}`);
      continue;
    }

    if (item.error) {
      console.log(`- ERROR | ${item.name} (${item.threadId}) | ${item.error}`);
      continue;
    }

    if (item.validation.complete) {
      console.log(`- COMPLETE | ${item.name} (${item.threadId})`);
    } else {
      console.log(`- INCOMPLETE | ${item.name} (${item.threadId}) | Missing: ${item.validation.missing.join(', ')}`);
    }
  }

  if (duplicateEventIds.length > 0) {
    console.log('\nDuplicate TruckersMP event IDs:');
    for (const duplicate of duplicateEventIds) {
      console.log(`- Event ${duplicate.eventId}: ${duplicate.threadIds.join(', ')}`);
    }
  }

  console.log('\nREAD_ONLY mode: no Discord data was changed.');
}

main().catch((error) => {
  console.error('Kings Convoy Checker failed:', error.message);
  process.exit(1);
});
