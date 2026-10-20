require('./kings-branding').installDiscordBranding();
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_NAME = process.env.SYSTEM_MONITOR_CHANNEL_NAME || 'system-monitor';
const HEALTH_FILE = path.join(__dirname, 'data', 'system-health.json');
const MARKER = '👑 **Kings Systems — Live Monitor**';
const MESSAGE_TEXT = 'Kings Systems — Live Monitor';
const API = 'https://discord.com/api/v10';

if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(HEALTH_FILE)) {
  console.error('Missing data/system-health.json. Run system monitoring first.');
  process.exit(1);
}

async function discord(endpoint, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'Kings Logistics System Monitor/1.0'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${API}${endpoint}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(20000)
      });
      const body = await response.text();
      if (response.ok) {
        if (!body) return null;
        try { return JSON.parse(body); } catch { return body; }
      }

      if (response.status !== 429 || attempt === 3) {
        throw new Error(`Discord API ${response.status} on ${method} ${endpoint}: ${body.slice(0, 400)}`);
      }
      let retrySeconds = Number(response.headers.get('retry-after'));
      try {
        const json = JSON.parse(body);
        if (Number.isFinite(Number(json.retry_after))) retrySeconds = Number(json.retry_after);
      } catch {}
      const waitMs = Math.min(30000, Math.max(1000, Number.isFinite(retrySeconds) ? retrySeconds * 1000 : 2000 * (attempt + 1)));
      console.warn(`Discord rate limited; retrying in ${waitMs}ms (attempt ${attempt + 1}/4).`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } catch (error) {
      const transient = error.name === 'TimeoutError' || error.name === 'AbortError' ||
        /timeout|fetch failed/i.test(String(error.message || ''));
      // Never replay an uncertain POST/PATCH/DELETE: the Discord write may have succeeded.
      if (!transient || method !== 'GET' || attempt === 3) throw error;
      const waitMs = 1500 * (attempt + 1);
      console.warn(`Discord GET transient error; retrying in ${waitMs}ms.`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

function simplifyChannelName(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function statusIcon(status) {
  if (status === 'HEALTHY') return '🟢';
  if (status === 'DEGRADED') return '🟡';
  if (status === 'UNHEALTHY') return '🔴';
  return '⚪';
}

function yesNoIcon(ok) {
  return ok ? '🟢' : '🔴';
}

function workflow(health, file) {
  return Array.isArray(health.workflows)
    ? health.workflows.find((item) => item.file === file)
    : null;
}

function workflowLine(health, file, label) {
  const item = workflow(health, file);
  if (!item) return `⚪ **${label}:** Unknown`;
  return `${yesNoIcon(Boolean(item.ok))} **${label}:** ${item.ok ? 'Healthy' : 'Needs review'}`;
}

function freshnessLine(health, file, label) {
  const items = health.data?.freshness;
  const item = Array.isArray(items) ? items.find((entry) => entry.file === file) : null;
  if (!item) return `⚪ **${label}:** Unknown`;
  return `${yesNoIcon(Boolean(item.ok))} **${label}:** ${item.ok ? 'Healthy' : 'Needs review'}`;
}

function ratioLine(icon, label, healthy, total) {
  const good = Number(healthy || 0);
  const count = Number(total || 0);
  const ok = count > 0 && good === count;
  return `${ok ? '🟢' : '🟡'} ${icon} **${label}:** ${good}/${count}`;
}

function recoveryLine() {
  const required = [
    'core-recovery.js',
    'recovery-safety-check.js',
    '.github/workflows/core-recovery.yml'
  ];
  const ready = required.every((relative) => fs.existsSync(path.join(__dirname, relative)));
  return `${ready ? '🟢' : '🔴'} ♻️ **Recovery / Restore:** ${ready ? 'Ready' : 'Incomplete'}`;
}

function technicalIssueLines(health) {
  const issues = Array.isArray(health.issues) ? health.issues : [];
  if (!issues.length) return ['✅ **Active technical issues:** 0'];

  const lines = [`⚠️ **Active technical issues:** ${issues.length}`];
  for (const item of issues.slice(0, 4)) {
    const marker = item.severity === 'critical' ? '🔴' : '🟡';
    const system = String(item.system || 'Technical').slice(0, 60);
    const message = String(item.message || 'Review required.').replace(/\s+/g, ' ').slice(0, 180);
    lines.push(`${marker} ${system} — ${message}`);
  }
  if (issues.length > 4) lines.push(`…and ${issues.length - 4} more technical issue(s).`);
  return lines;
}

function workflowGroupLine(health, area, label) {
  const all = Array.isArray(health.workflows) ? health.workflows : [];
  const matched = all.filter(item => item.area === area);
  if (!matched.length) return `⚪ **${label}:** Not monitored`;
  const good = matched.filter(item => item.ok).length;
  const state = good === matched.length ? '🟢' : '🟡';
  return `${state} **${label}:** ${good}/${matched.length} healthy`;
}

function buildMessage(health) {
  const checkedAt = health.checkedAt || health.updatedAt || new Date().toISOString();
  const checkedUnix = Math.floor(new Date(checkedAt).getTime() / 1000);
  const safeUnix = Number.isFinite(checkedUnix) ? checkedUnix : Math.floor(Date.now() / 1000);
  const summary = health.summary || {};
  const coverage = health.workflowRegistry || {};
  const lines = [
    MARKER,
    '',
    `${statusIcon(health.status)} **Overall Status:** \`${health.status || 'UNKNOWN'}\``,
    `🏗️ **Production Readiness:** \`${health.operationalReadiness?.status || 'UNKNOWN'}\` · ${health.operationalReadiness?.diagnosticsCount || 0} historic quality-gate finding(s) shown separately`,
    `🔎 **Automation Coverage:** ${summary.workflowsHealthy ?? 0}/${summary.workflowsChecked ?? 0} scheduled healthy · ${coverage.registered ?? 'unknown'} total workflows (${coverage.onDemand ?? '?'} on-demand)`,
    '',
    '**All Kings Automation Areas**',
    workflowGroupLine(health, 'Live Data', 'Live Tracker & Statistics'),
    workflowGroupLine(health, 'Drivers', 'Drivers, Probation & Awards'),
    workflowGroupLine(health, 'HR & Staff', 'HR & Staff Systems'),
    workflowGroupLine(health, 'Convoys', 'Convoy Center & Events'),
    workflowGroupLine(health, 'News', 'News, Social & Changelog'),
    workflowGroupLine(health, 'Leadership', 'Leadership Overview'),
    workflowGroupLine(health, 'Reports', 'Leadership & Periodic Reports'),
    workflowGroupLine(health, 'Backup', 'Backup & Restore Health'),
    workflowGroupLine(health, 'Automation', 'Scheduler & Recovery'),
    workflowGroupLine(health, 'Security', 'Technical Verification'),
    '',
    '**Data & Security**',
    freshnessLine(health, 'data/statistics.json', 'Statistics source'),
    ratioLine('🧩', 'Data Integrity', summary.deepIntegrityHealthy, summary.deepIntegrityChecks),
    ratioLine('🔐', 'Repository Security', summary.securityHealthy, summary.securityChecks),
    ratioLine('🔑', 'Discord Permissions', summary.discordPermissionHealthy, summary.discordPermissionChecks),
    recoveryLine(),
    '',
    ...technicalIssueLines(health),
    '',
    `🕒 **Last Check:** <t:${safeUnix}:F> · <t:${safeUnix}:R>`,
    '🛡️ Read-only monitoring. No automatic personnel, role or disciplinary changes.'
  ];
  const content = lines.join('\n');
  if (content.length <= 1850) return content;
  // Preserve whole lines and the actual last-check timestamp / safety note.
  // Silently truncating halfway through a system result can mislead staff.
  const importantFooter = lines.slice(-2).join('\n');
  const output = [];
  for (const line of lines.slice(0, -2)) {
    if ([...output, line, importantFooter].join('\n').length > 1850) {
      output.push('… More details in Kings System Monitoring.');
      break;
    }
    output.push(line);
  }
  const reduced = [...output, importantFooter].join('\n');
  if (reduced.length > 1900) throw Error('Kings Systems Monitor message is too long for Discord.');
  return reduced;
}

async function resolveMonitorChannel() {
  const channels = await discord(`/guilds/${GUILD_ID}/channels`);
  const target = simplifyChannelName(CHANNEL_NAME);

  return (channels || []).find((channel) => {
    if (![0, 5].includes(channel.type)) return false;
    const name = simplifyChannelName(channel.name || '');
    return name === target || name.endsWith(target) || name.includes(target);
  }) || null;
}

async function main() {
  const health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
  const bot = await discord('/users/@me');
  const channel = await resolveMonitorChannel();

  if (!channel) {
    console.log(`Kings System Monitor channel not found. Create a text channel containing "${CHANNEL_NAME}"; no Discord write performed.`);
    return;
  }

  const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
  const matches = (messages || [])
    .filter((message) =>
      message.author?.id === bot.id &&
      String(message.content || '').includes(MESSAGE_TEXT)
    )
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  let existing = matches[0] || null;

  const content = buildMessage(health);
  const body = { content, allowed_mentions: { parse: [] } };

  if (!existing) {
    existing = await discord(`/channels/${channel.id}/messages`, { method: 'POST', body });
    console.log(`Kings System Monitor created in #${channel.name} (${channel.id}); message ${existing?.id || 'unknown'}.`);
  } else if (String(existing.content || '').trim() === content.trim()) {
    console.log(`Kings System Monitor unchanged in #${channel.name} (${channel.id}).`);
  } else {
    await discord(`/channels/${channel.id}/messages/${existing.id}`, { method: 'PATCH', body });
    console.log(`Kings System Monitor updated in #${channel.name} (${channel.id}); message ${existing.id}.`);
  }

  let duplicatesRemoved = 0;
  for (const duplicate of matches.slice(1)) {
    await discord(`/channels/${channel.id}/messages/${duplicate.id}`, { method: 'DELETE' });
    duplicatesRemoved += 1;
  }

  if (duplicatesRemoved) {
    console.log(`Kings System Monitor duplicate cleanup: removed ${duplicatesRemoved} duplicate message(s).`);
  }
}

main().catch((error) => {
  console.error('Kings System Monitor failed:', error.message);
  process.exit(1);
});
