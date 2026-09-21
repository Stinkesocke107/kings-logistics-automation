const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HEALTH_FILE = path.join(ROOT, 'data', 'system-health.json');
const STATE_FILE = path.join(ROOT, 'data', 'system-alerts-state.json');

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';
const SYSTEM_ALERTS_CHANNEL_ID = process.env.SYSTEM_ALERTS_CHANNEL_ID || null;
const SYSTEM_ALERTS_CHANNEL_NAME = process.env.SYSTEM_ALERTS_CHANNEL_NAME || 'system-alerts';

const WARNING_CONFIRMATIONS = 2;
let resolvedWriteChannelId = null;

if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() {
  return new Date().toISOString();
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path.relative(ROOT, file)}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeChannelName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function severityRank(value) {
  return value === 'critical' ? 2 : value === 'warning' ? 1 : 0;
}

function compactDetails(details) {
  if (!details) return null;
  if (Array.isArray(details)) {
    const text = details.slice(0, 5).map(String).join(', ');
    return details.length > 5 ? `${text} (+${details.length - 5} more)` : text;
  }
  if (typeof details === 'object') {
    const entries = Object.entries(details)
      .filter(([, value]) => value !== null && value !== undefined)
      .slice(0, 5)
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    return entries.join(' • ') || null;
  }
  return String(details);
}

async function discord(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // HARD SAFETY GUARD:
  // System Alerts may only read Discord and POST technical messages to the
  // resolved system-alerts channel. It can never change members, roles,
  // permissions, channels, bans, kicks, or personnel data.
  if (method !== 'GET') {
    const messagePath = pathname.match(/^\/channels\/(\d+)\/messages$/);
    const allowed =
      messagePath &&
      resolvedWriteChannelId &&
      messagePath[1] === String(resolvedWriteChannelId) &&
      method === 'POST';

    if (!allowed) {
      throw new Error(`Safety guard blocked Discord write: ${method} ${pathname}`);
    }
  }

  const headers = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'User-Agent': 'Kings Logistics System Alerts/1.0'
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${DISCORD_API}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Discord API ${response.status} on ${method} ${pathname}: ${text.slice(0, 500)}`);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function resolveSystemAlertsChannel() {
  if (SYSTEM_ALERTS_CHANNEL_ID) {
    const channel = await discord(`/channels/${SYSTEM_ALERTS_CHANNEL_ID}`);
    if (channel.guild_id && String(channel.guild_id) !== String(DISCORD_GUILD_ID)) {
      throw new Error('Configured System Alerts channel is not in the configured guild.');
    }
    resolvedWriteChannelId = String(channel.id);
    return channel;
  }

  const channels = await discord(`/guilds/${DISCORD_GUILD_ID}/channels`);
  const textChannels = (channels || []).filter((channel) => [0, 5].includes(channel.type));
  const wanted = normalizeChannelName(SYSTEM_ALERTS_CHANNEL_NAME);

  const exact = textChannels.filter((channel) => normalizeChannelName(channel.name) === wanted);
  if (exact.length === 1) {
    resolvedWriteChannelId = String(exact[0].id);
    return exact[0];
  }
  if (exact.length > 1) {
    throw new Error(`Multiple exact System Alerts channels found: ${exact.map((c) => c.name).join(', ')}`);
  }

  const fuzzy = textChannels.filter((channel) => {
    const name = normalizeChannelName(channel.name);
    return name.includes('system') && name.includes('alert');
  });
  if (fuzzy.length === 1) {
    resolvedWriteChannelId = String(fuzzy[0].id);
    return fuzzy[0];
  }
  if (fuzzy.length > 1) {
    throw new Error(`Multiple System Alerts channels found: ${fuzzy.map((c) => c.name).join(', ')}`);
  }

  throw new Error(`Could not find System Alerts channel "${SYSTEM_ALERTS_CHANNEL_NAME}".`);
}

function emptyState() {
  return {
    version: 1,
    mode: 'technical-alerts-only',
    active: {},
    pending: {}
  };
}

function normalizeState(value) {
  if (!value || typeof value !== 'object') return emptyState();
  return {
    version: 1,
    mode: 'technical-alerts-only',
    active: value.active && typeof value.active === 'object' ? value.active : {},
    pending: value.pending && typeof value.pending === 'object' ? value.pending : {}
  };
}

function normalizedIssue(item) {
  return {
    id: String(item.id || '').trim(),
    severity: item.severity === 'critical' ? 'critical' : 'warning',
    system: String(item.system || 'Kings System').trim(),
    message: String(item.message || 'Technical health issue detected.').trim(),
    details: item.details ?? null
  };
}

function processHealth(health, previousState) {
  const state = normalizeState(previousState);
  const currentIssues = (Array.isArray(health?.issues) ? health.issues : [])
    .map(normalizedIssue)
    .filter((item) => item.id);
  const currentById = new Map(currentIssues.map((item) => [item.id, item]));

  const alerts = [];
  const escalations = [];
  const resolved = [];
  let changed = false;
  const checkedAt = health?.checkedAt || nowISO();

  // Resolve issues that were previously alerted but are no longer present.
  for (const [id, previous] of Object.entries(state.active)) {
    if (currentById.has(id)) continue;
    resolved.push({
      id,
      severity: previous.severity || 'warning',
      system: previous.system || 'Kings System',
      message: previous.message || id,
      firstAlertedAt: previous.firstAlertedAt || null
    });
    delete state.active[id];
    changed = true;
  }

  // Clear pending warnings that disappeared before confirmation.
  for (const id of Object.keys(state.pending)) {
    if (currentById.has(id)) continue;
    delete state.pending[id];
    changed = true;
  }

  for (const item of currentIssues) {
    const active = state.active[item.id];

    if (active) {
      if (severityRank(item.severity) > severityRank(active.severity)) {
        escalations.push(item);
        state.active[item.id] = {
          ...active,
          severity: item.severity,
          system: item.system,
          message: item.message,
          details: item.details,
          escalatedAt: checkedAt
        };
        changed = true;
      }
      continue;
    }

    if (item.severity === 'critical') {
      alerts.push(item);
      state.active[item.id] = {
        severity: item.severity,
        system: item.system,
        message: item.message,
        details: item.details,
        firstAlertedAt: checkedAt
      };
      if (state.pending[item.id]) delete state.pending[item.id];
      changed = true;
      continue;
    }

    const pending = state.pending[item.id];
    const count = Number(pending?.count || 0) + 1;
    if (count >= WARNING_CONFIRMATIONS) {
      alerts.push(item);
      state.active[item.id] = {
        severity: item.severity,
        system: item.system,
        message: item.message,
        details: item.details,
        firstAlertedAt: checkedAt
      };
      delete state.pending[item.id];
      changed = true;
    } else {
      state.pending[item.id] = {
        count,
        firstSeenAt: pending?.firstSeenAt || checkedAt,
        system: item.system,
        message: item.message
      };
      changed = true;
    }
  }

  return { state, alerts, escalations, resolved, changed };
}

function issueLines(items, limit = 8) {
  const lines = [];
  for (const item of items.slice(0, limit)) {
    const icon = item.severity === 'critical' ? '❌' : '⚠️';
    lines.push(`${icon} **${item.system}** — ${item.message}`);
    const details = compactDetails(item.details);
    if (details) lines.push(`↳ ${details}`);
  }
  if (items.length > limit) lines.push(`…and **${items.length - limit}** more technical finding(s).`);
  return lines.join('\n');
}

function resolvedLines(items, limit = 10) {
  const lines = items.slice(0, limit).map((item) => `✅ **${item.system}** — ${item.message}`);
  if (items.length > limit) lines.push(`…and **${items.length - limit}** more resolved finding(s).`);
  return lines.join('\n');
}

async function postAlertBatch(channel, items, escalated = false) {
  if (!items.length) return;
  const hasCritical = items.some((item) => item.severity === 'critical');
  const title = escalated
    ? '🚨 Kings System Alert — Escalated'
    : hasCritical
      ? '🚨 Kings System Alert — Critical'
      : '⚠️ Kings System Alert — Warning';

  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: {
      embeds: [{
        title,
        description: issueLines(items),
        color: hasCritical ? 0xed4245 : 0xfee75c,
        fields: [{
          name: 'Action',
          value: 'Technical review is required. Kings Systems will keep monitoring and will post once the issue is resolved.',
          inline: false
        }],
        footer: { text: 'Kings Logistics • System Monitoring • Technical only' },
        timestamp: new Date().toISOString()
      }],
      allowed_mentions: { parse: [] }
    }
  });
}

async function postResolvedBatch(channel, items, health) {
  if (!items.length) return;
  await discord(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: {
      embeds: [{
        title: '✅ Kings System Alert — Resolved',
        description: resolvedLines(items),
        color: 0x57f287,
        fields: [{
          name: 'Current Monitoring Status',
          value: `**${String(health?.status || 'UNKNOWN')}** • Critical: **${Number(health?.summary?.criticalIssues || 0)}** • Warnings: **${Number(health?.summary?.warnings || 0)}**`,
          inline: false
        }],
        footer: { text: 'Kings Logistics • System Monitoring • Resolved automatically' },
        timestamp: new Date().toISOString()
      }],
      allowed_mentions: { parse: [] }
    }
  });
}

async function main() {
  console.log('=================================');
  console.log('Kings System Alerts');
  console.log('=================================');

  const health = readJson(HEALTH_FILE, null);
  if (!health) throw new Error('data/system-health.json is missing. Run System Monitoring first.');

  const previousState = readJson(STATE_FILE, null);
  const result = processHealth(health, previousState);

  // Resolve the channel on every run. This also verifies that Kings Systems can
  // still see the technical alert channel even when there is nothing to post.
  const channel = await resolveSystemAlertsChannel();
  console.log(`System Alerts channel resolved: #${channel.name} (${channel.id})`);

  // Discord messages are sent before state persistence. If Discord fails, the
  // state is not advanced, so the alert can be retried safely next run.
  await postAlertBatch(channel, result.alerts, false);
  await postAlertBatch(channel, result.escalations, true);
  await postResolvedBatch(channel, result.resolved, health);

  if (result.changed || !previousState) {
    writeJson(STATE_FILE, result.state);
    console.log('System alert state updated.');
  } else {
    console.log('System alert state unchanged.');
  }

  console.log(`Health status: ${health.status || 'UNKNOWN'}`);
  console.log(`New alerts: ${result.alerts.length}`);
  console.log(`Escalations: ${result.escalations.length}`);
  console.log(`Resolved alerts: ${result.resolved.length}`);
  console.log(`Pending warning confirmations: ${Object.keys(result.state.pending).length}`);
  console.log(`Active alerted issues: ${Object.keys(result.state.active).length}`);
  console.log('Safety: technical Discord messages only. No role, member, permission, kick, ban, or personnel actions are implemented.');
}

main().catch((error) => {
  console.error('Kings System Alerts failed:', error.message);
  process.exit(1);
});
