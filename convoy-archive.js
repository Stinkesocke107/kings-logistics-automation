const fs = require('fs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const REPORT_PATH = 'output/convoy-check-results.json';
const ARCHIVE_DELAY_HOURS = Number(process.env.CONVOY_ARCHIVE_DELAY_HOURS || 72);

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Missing ${REPORT_PATH}. Run convoy-checker.js first.`);
  process.exit(1);
}

if (!Number.isFinite(ARCHIVE_DELAY_HOURS) || ARCHIVE_DELAY_HOURS < 1) {
  console.error('CONVOY_ARCHIVE_DELAY_HOURS must be a number of at least 1.');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';
const ARCHIVE_DELAY_SECONDS = ARCHIVE_DELAY_HOURS * 60 * 60;

async function discord(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics Convoy Archive/1.0'
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

function isTestThread(item) {
  if (typeof item.testThread === 'boolean') return item.testThread;
  return /^\s*\[?test\]?(?:\s|[-_:])/i.test(item.name || '');
}

function unixFromIso(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function archiveBaseUnix(item) {
  if (!item.eventTimeValid || !Number.isFinite(Number(item.eventUnix))) return null;

  const eventUnix = Number(item.eventUnix);

  if (item.status === 'Cancelled') {
    const cancelledUnix = unixFromIso(item.staffStatus?.timestamp);
    if (cancelledUnix) return cancelledUnix;
  }

  return eventUnix;
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

  if (report.guildId && report.guildId !== GUILD_ID) {
    throw new Error(`Report guild ${report.guildId} does not match configured guild ${GUILD_ID}.`);
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  let archivedCount = 0;

  console.log(`Kings Convoy Archive started. Delay: ${ARCHIVE_DELAY_HOURS} hours.`);

  for (const item of report.threads || []) {
    if (item.ignored || item.error) continue;
    if (isTestThread(item)) continue;
    if (!['Completed', 'Cancelled'].includes(item.status)) continue;
    if (item.archived || item.locked) continue;

    const baseUnix = archiveBaseUnix(item);
    if (!baseUnix) {
      console.log(`- ${item.name} | skipped: valid event time required`);
      continue;
    }

    const archiveAt = baseUnix + ARCHIVE_DELAY_SECONDS;
    if (nowUnix < archiveAt) {
      console.log(`- ${item.name} | not due yet`);
      continue;
    }

    try {
      const thread = await discord(`/channels/${item.threadId}`);

      if (thread.guild_id && thread.guild_id !== GUILD_ID) {
        console.warn(`- ${item.name} | skipped: thread belongs to another guild`);
        continue;
      }

      if (thread.thread_metadata?.archived) {
        console.log(`- ${item.name} | already archived`);
        continue;
      }

      if (thread.thread_metadata?.locked) {
        console.log(`- ${item.name} | skipped: thread is locked`);
        continue;
      }

      await discord(`/channels/${item.threadId}`, {
        method: 'PATCH',
        body: { archived: true }
      });

      archivedCount += 1;
      console.log(`- ${item.name} | archived automatically`);
    } catch (error) {
      console.warn(`- Archive failed | ${item.name} | ${error.message}`);
    }
  }

  console.log(`Kings Convoy Archive finished. Archived this run: ${archivedCount}.`);
}

main().catch((error) => {
  console.error('Kings Convoy Archive failed:', error.message);
  process.exit(1);
});
