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

// A provider outage and an operational fallback are distinct facts.
// The overall critical API/data findings remain unchanged and must still
// block full-live production readiness until complete coverage is restored.
function liveMapAvailabilityLine(health) {
  const services = health.data?.apiHealth?.services;
  const service = Array.isArray(services)
    ? services.find(item => item?.service === 'truckersmp-map-live' ||
        String(item?.file || '').endsWith('live-systems--truckersmp-map-live.json'))
    : null;
  const liveWorkflow = workflow(health, 'live-tracker.yml');
  const freshness = Array.isArray(health.data?.freshness) ? health.data.freshness : [];
  const trackerSnapshot = freshness.find(item => item.file === 'data/live-tracker-snapshot.json');
  const proof = health.data?.liveDelivery;
  const at = Date.parse(proof?.checkedAt || '');
  const ageMs = Date.now() - at;
  const recent = Number.isFinite(at) && at > 0 && ageMs >= -5*60*1000 && ageMs <= 25*60*1000;
  const required = ['Live Tracker','Advanced Statistics','Central Overview'];
  const allDisplays = proof?.allDisplaysVerified === true &&
    Array.isArray(proof.displaysVerified) &&
    required.every(name => proof.displaysVerified.includes(name));
  const liveRunOk = liveWorkflow?.ok === true;
  const official=health.data?.officialTracker;
  // Show the explicitly chosen official-only Tracker as its own healthy
  // LIMITED function. Never imply verified Kings player presence, restore
  // old map-derived statistics, or mask unrelated overall health failures.
  if(official?.mode==='map-live'){
    if(official.status==='verified'&&liveRunOk){
      return '🟢 🗺️ **Kings Live Tracker:** Verified player map restored automatically; current Kings online data and all 3 displays are current.';
    }
    return '🔴 🗺️ **Kings Live Tracker:** Full player-map coverage or 3-display delivery is not verified.';
  }
  if(official?.mode==='map-independent'){
    if(official.status==='verified'&&liveRunOk){
      return '🟢 📡 **Kings Live Tracker (no map):** Official membership and TruckersMP server totals verified on all 3 displays. Kings Drivers online: **Unavailable (not 0)**.';
    }
    return '🔴 📡 **Kings Live Tracker (no map):** Official data or 3-display delivery is unverified. Kings Drivers online: **Unavailable (not 0)**.';
  }

  if (service?.status === 'down' || service?.status === 'degraded') {
    if (recent && allDisplays && liveRunOk && proof?.mode === 'fallback-delivered') {
      if (proof.source === 'official-vtc-and-servers' || proof.source === 'official-vtc-only') {
        return '🟡 🗺️ **Live player map:** Provider down; official-data fallback verified on all 3 displays. Kings online: **Unavailable (not 0)**.';
      }
      if (proof.source === 'recent-roster') {
        return '🟡 🗺️ **Live player map:** Provider down; recent roster fallback verified on all 3 displays. Kings online: **Unavailable**.';
      }
      if (proof.source === 'status-only') {
        return '🟡 🗺️ **Live player map:** Provider down; unavailability notices delivered. Official feed also unavailable.';
      }
    }
    return '🔴 🗺️ **Live player map:** Provider down; no recent proof of complete fallback delivery.';
  }
  if (service?.status === 'healthy' && liveRunOk && trackerSnapshot?.ok === true &&
      recent && allDisplays && proof?.mode === 'verified-live' &&
      proof?.source === 'verified-map' &&
      proof?.sourceSnapshotAt === trackerSnapshot.updatedAt) {
    return '🟢 🗺️ **Live player map:** Full source and all 3 displays verified.';
  }
  return '⚪ 🗺️ **Live player map:** Full source or delivery not verified.';
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
    liveMapAvailabilityLine(health),
    workflowGroupLine(health, 'Drivers', 'Drivers, Probation & Awards'),
    workflowGroupLine(health, 'HR & Staff', 'HR & Staff Systems'),
    workflowGroupLine(health, 'Convoys', 'Convoy Center & Events'),
    workflowGroupLine(health, 'News', 'News & Changelog'),
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

  if (!Array.isArray(channels)) throw new Error('Monitor channel inventory is invalid.');
  const compatible = channels.filter((channel) =>
    [0, 5].includes(channel.type) &&
    simplifyChannelName(channel.name || '').endsWith(target)
  );
  const exact = compatible.filter((channel) => simplifyChannelName(channel.name || '') === target);
  const choices = exact.length ? exact : compatible;
  // Never publish into a guessed channel when two similar names are present.
  if (choices.length > 1) throw new Error('Ambiguous system monitor channel; no write performed.');
  return choices[0] || null;
}

async function main() {
  const health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
  const bot = await discord('/users/@me');
  const channel = await resolveMonitorChannel();

  if (!channel) {
    throw new Error(`Kings System Monitor channel "${CHANNEL_NAME}" not found; no Discord write performed.`);
  }

  // Optional immutable message ID is the most reliable long-lived path:
  // it can be read directly even after >100 unrelated channel messages.
  const pinnedId = String(process.env.SYSTEM_MONITOR_MESSAGE_ID || '').trim();
  if (pinnedId && !/^\\d{17,20}$/.test(pinnedId)) {
    throw new Error('Configured System Monitor message ID is invalid; no Discord write performed.');
  }

  let existing;
  if (pinnedId) {
    existing = await discord(`/channels/${channel.id}/messages/${pinnedId}`);
    if (String(existing?.id || '') !== pinnedId ||
        existing?.author?.id !== bot.id ||
        !String(existing?.content || '').startsWith(MARKER)) {
      throw new Error('Pinned System Monitor message is missing or not bot-owned; no Discord write performed.');
    }
  } else {
    const messages = await discord(`/channels/${channel.id}/messages?limit=100`);
    if (!Array.isArray(messages)) throw new Error('System Monitor message history is invalid.');
    const matches = messages.filter((message) =>
      message.author?.id === bot.id &&
      String(message.content || '').startsWith(MARKER)
    );
    // Never create or delete a monitor status message. Operators can pin the
    // original ID if it no longer occurs in the latest 100 channel messages.
    if (matches.length === 0) {
      throw new Error('Existing bot-owned System Monitor message not found; no new message will be sent. Check channel and message ownership manually.');
    }
    if (matches.length > 1) {
      throw new Error('Multiple bot-owned System Monitor messages found; manual cleanup required.');
    }
    existing = matches[0];
  }

  const content = buildMessage(health);
  const body = { content, allowed_mentions: { parse: [] } };

  let wrote = false;
  if (String(existing.content || '').trim() === content.trim()) {
    console.log(`Kings System Monitor unchanged in #${channel.name} (${channel.id}).`);
  } else {
    // Exactly one PATCH to the existing bot-owned monitor. Never POST/DELETE.
    await discord(`/channels/${channel.id}/messages/${existing.id}`, { method: 'PATCH', body });
    wrote = true;
  }

  if (wrote) {
    // A successful POST/PATCH HTTP response is not a Discord delivery proof.
    // Re-read the exact same bot-owned message before claiming success.
    const verified = await discord(`/channels/${channel.id}/messages/${existing.id}`);
    if (String(verified?.id || '') !== String(existing.id) ||
        verified?.author?.id !== bot.id ||
        String(verified?.content || '') !== content) {
      throw new Error('System Monitor Discord message readback mismatch; delivery not verified.');
    }
    console.log(`Kings System Monitor delivery verified in #${channel.name} (${channel.id}); message ${existing.id}.`);
  }
}

main().catch((error) => {
  console.error('Kings System Monitor failed:', error.message);
  process.exit(1);
});
