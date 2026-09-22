const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const CHANNEL_NAME = process.env.SYSTEM_MONITOR_CHANNEL_NAME || 'system-monitor';
const HEALTH_FILE = path.join(__dirname, 'data', 'system-health.json');
const MARKER = '👑 **Kings Systems — Live Monitor**';
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

  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${endpoint}: ${text.slice(0, 400)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
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

function buildMessage(health) {
  const checkedAt = health.checkedAt || health.updatedAt || new Date().toISOString();
  const checkedUnix = Math.floor(new Date(checkedAt).getTime() / 1000);
  const safeUnix = Number.isFinite(checkedUnix) ? checkedUnix : Math.floor(Date.now() / 1000);
  const summary = health.summary || {};

  const lines = [
    MARKER,
    '',
    `${statusIcon(health.status)} **Overall Status:** \`${health.status || 'UNKNOWN'}\``,
    '',
    '**Core Systems**',
    workflowLine(health, 'convoy-checker.yml', 'Convoy / Event System'),
    workflowLine(health, 'driver-management.yml', 'Driver Management'),
    workflowLine(health, 'hr-leadership.yml', 'HR & Probation'),
    workflowLine(health, 'staff-management.yml', 'Staff Management'),
    freshnessLine(health, 'data/statistics.json', 'Statistics'),
    workflowLine(health, 'core-backup.yml', 'Backup System'),
    recoveryLine(),
    '',
    '**Security & Integrity**',
    ratioLine('🧩', 'Data Integrity', summary.deepIntegrityHealthy, summary.deepIntegrityChecks),
    ratioLine('🔧', 'System Hardening', summary.hardeningHealthy, summary.hardeningChecks),
    ratioLine('🔐', 'Repository Security', summary.securityHealthy, summary.securityChecks),
    ratioLine('🔑', 'Discord Permissions', summary.discordPermissionHealthy, summary.discordPermissionChecks),
    '',
    ...technicalIssueLines(health),
    '',
    `🕒 **Last Check:** <t:${safeUnix}:F> · <t:${safeUnix}:R>`,
    '🔄 Updated automatically by Kings Systems every monitoring cycle.',
    '',
    '🛡️ Monitoring only — no automatic personnel, role, kick, ban, timeout, promotion, demotion, or disciplinary actions.'
  ];

  const content = lines.join('\n');
  if (content.length <= 1950) return content;
  return `${content.slice(0, 1900)}\n…\n🛡️ Monitoring only.`;
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

  const messages = await discord(`/channels/${channel.id}/messages?limit=50`);
  const existing = (messages || []).find((message) =>
    message.author?.id === bot.id && String(message.content || '').includes(MARKER)
  );

  const content = buildMessage(health);
  const body = { content, allowed_mentions: { parse: [] } };

  if (!existing) {
    const created = await discord(`/channels/${channel.id}/messages`, { method: 'POST', body });
    console.log(`Kings System Monitor created in #${channel.name} (${channel.id}); message ${created?.id || 'unknown'}.`);
    return;
  }

  if (String(existing.content || '').trim() === content.trim()) {
    console.log(`Kings System Monitor unchanged in #${channel.name} (${channel.id}).`);
    return;
  }

  await discord(`/channels/${channel.id}/messages/${existing.id}`, { method: 'PATCH', body });
  console.log(`Kings System Monitor updated in #${channel.name} (${channel.id}); message ${existing.id}.`);
}

main().catch((error) => {
  console.error('Kings System Monitor failed:', error.message);
  process.exit(1);
});
