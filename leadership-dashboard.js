require('./kings-branding').installDiscordBranding();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { syncEmbedMessage } = require('./leadership-message-sync');

const DRIVER_STATE_KEY = process.env.DRIVER_STATE_KEY;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '1114967437788577792';

const CHANNELS = {
  driver: process.env.DRIVER_LEADERSHIP_CHANNEL_ID || '1551675577226887229',
  hr: process.env.HR_LEADERSHIP_CHANNEL_ID || '1383508442857340969',
  staff: process.env.STAFF_LEADERSHIP_CHANNEL_ID || '1551675877178474526',
  event: process.env.EVENT_LEADERSHIP_CHANNEL_ID || '1551675735633297418',
  management: process.env.MANAGEMENT_OVERVIEW_CHANNEL_ID || '1492936683304517792'
};

const DATA = path.join(__dirname, 'data');
const FILES = {
  driverState: path.join(DATA, 'driver-management.json'),
  driverSummary: path.join(DATA, 'driver-management-summary.json'),
  loa: path.join(DATA, 'driver-loa.json'),
  hr: path.join(DATA, 'hr-probation.json'),
  staffState: path.join(DATA, 'staff-management.json'),
  staffSummary: path.join(DATA, 'staff-management-summary.json'),
  driverReports: path.join(DATA, 'driver-leadership-report-state.json'),
  driverWeekly: path.join(DATA, 'driver-weekly-summary-state.json'),
  hrReports: path.join(DATA, 'hr-leadership-report-state.json'),
  hrWeekly: path.join(DATA, 'hr-weekly-summary-state.json'),
  staffReports: path.join(DATA, 'staff-leadership-report-state.json'),
  eventReports: path.join(DATA, 'event-leadership-report-state.json'),
  managementWeekly: path.join(DATA, 'management-weekly-overview-state.json'),
  managementMonthly: path.join(DATA, 'management-monthly-overview-state.json'),
  dashboardState: path.join(DATA, 'leadership-dashboard-state.json')
};

const KINGS_BLUE = 0x182dff;
const DAY_MS = 86400000;
const API = 'https://discord.com/api/v10';

if (!DRIVER_STATE_KEY || String(DRIVER_STATE_KEY).length < 32) {
  console.error('DRIVER_STATE_KEY is missing or too short.');
  process.exit(1);
}
if (!DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

function nowISO() { return new Date().toISOString(); }
function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Invalid JSON in ${path.basename(file)}: ${error.message}`); }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function deriveKey(domain) {
  return crypto.createHash('sha256').update(`${domain}\0`).update(String(DRIVER_STATE_KEY)).digest();
}
function decryptFile(file, domain, fallback) {
  const container = readJson(file, null);
  if (!container) return fallback;
  if (!container.encrypted || container.algorithm !== 'aes-256-gcm') {
    throw new Error(`Unexpected encrypted state format: ${path.basename(file)}`);
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(domain), Buffer.from(container.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(container.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}
function date(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function recent(value, start) {
  const d = date(value);
  return Boolean(d && d.getTime() >= start);
}
function ageDays(value, now = Date.now()) {
  const d = date(value);
  return d ? Math.max(0, Math.floor((now - d.getTime()) / DAY_MS)) : null;
}
function signed(value) {
  const n = Number(value || 0);
  return n > 0 ? `+${n}` : String(n);
}
function pct(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : 'n/a';
}
function latest(list) {
  return Array.isArray(list) && list.length ? list[list.length - 1] : null;
}
function fmtKey(key) { return key || 'n/a'; }
function field(name, value) { return { name, value: value || 'No data available.', inline: false }; }
function dashboardState() {
  const s = readJson(FILES.dashboardState, null);
  return {
    version: 1,
    createdAt: s?.createdAt || nowISO(),
    updatedAt: s?.updatedAt || nowISO(),
    messageIds: {
      driver: s?.messageIds?.driver || null,
      hr: s?.messageIds?.hr || null,
      staff: s?.messageIds?.staff || null,
      event: s?.messageIds?.event || null,
      management: s?.messageIds?.management || null
    }
  };
}
function leaveStatus(leave, now = Date.now()) {
  const start = date(leave?.startAt)?.getTime();
  const end = date(leave?.closedAt || leave?.endAt)?.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
  if (now < start) return 'scheduled';
  if (now <= end) return 'active';
  return 'ended';
}
function reviewStatus(review, now = Date.now()) {
  if (review?.status === 'completed') return 'completed';
  if (review?.status === 'extended') {
    const due = date(review.dueAt)?.getTime();
    return Number.isFinite(due) && due > now ? 'extended' : 'open';
  }
  return 'open';
}
function shortPeople(items, limit = 3) {
  const list = (items || []).slice(0, limit).map((x) => String(x.username || x.name || `TMP ${x.tmpId || '?'}`));
  if ((items || []).length > limit) list.push(`+${items.length - limit} more`);
  return list.length ? list.join(', ') : 'None';
}

function loadAll() {
  return {
    driver: decryptFile(FILES.driverState, 'kings-driver-management-v1', { drivers: [] }),
    driverSummary: readJson(FILES.driverSummary, {}),
    loa: decryptFile(FILES.loa, 'kings-driver-loa-v1', { leaves: [] }),
    hr: decryptFile(FILES.hr, 'kings-hr-probation-v1', { reviews: [] }),
    staff: decryptFile(FILES.staffState, 'kings-staff-management-v1', { staff: [], history: [] }),
    staffSummary: readJson(FILES.staffSummary, {}),
    driverReports: readJson(FILES.driverReports, {}),
    driverWeekly: readJson(FILES.driverWeekly, {}),
    hrReports: readJson(FILES.hrReports, {}),
    hrWeekly: readJson(FILES.hrWeekly, {}),
    staffReports: readJson(FILES.staffReports, {}),
    eventReports: readJson(FILES.eventReports, {}),
    managementWeekly: readJson(FILES.managementWeekly, {}),
    managementMonthly: readJson(FILES.managementMonthly, {})
  };
}

function buildDriver(data, now = Date.now()) {
  const start = now - DAY_MS;
  const drivers = data.driver.drivers || [];
  const current = drivers.filter((d) => d.current);
  const leaves = data.loa.leaves || [];
  const joined = drivers.filter((d) => recent(d.joinDate || d.firstObservedAt, start));
  const left = drivers.filter((d) => recent(d.leftAt, start));
  const restored = drivers.filter((d) => d.current && d.lastActivityAlertLevel === 'Active' && recent(d.lastActivityAlertAt, start));
  const reviewChanges = current.filter((d) => ['Info','Attention','HR Review'].includes(d.activityLevel) && recent(d.activityLevelSince, start));
  const loaStarted = leaves.filter((l) => recent(l.createdAt, start));
  const loaEnded = leaves.filter((l) => recent(l.closedAt || l.endAt, start) && leaveStatus(l, now) === 'ended');
  const w = latest(data.driverWeekly.publishedWeeks);
  const m = latest(data.driverReports.monthlyReports);
  const s = data.driverSummary;
  const t = s.tenure || {};
  const live =
    `Drivers **${s.currentDrivers ?? current.length}** • Online **${s.onlineNow ?? 0}** • Grace **${s.activity?.grace ?? 0}** • LOA **${s.activity?.approvedLeave ?? 0}**\n` +
    `Activity: Active **${s.activity?.active ?? 0}** • Info **${s.activity?.info7Days ?? 0}** • Attention **${s.activity?.attention14Days ?? 0}** • HR Review **${s.activity?.hrReview30Days ?? 0}**\n` +
    `Tenure: <1m **${t.under1Month ?? 0}** • 1–3m **${t.oneToThreeMonths ?? 0}** • 3–6m **${t.threeToSixMonths ?? 0}** • 6–12m **${t.sixToTwelveMonths ?? 0}** • 1y+ **${(t.oneToTwoYears||0)+(t.twoToThreeYears||0)+(t.threeYearsPlus||0)}**`;
  const daily =
    `Joined **${joined.length}** • Left **${left.length}** • Restored **${restored.length}** • New review levels **${reviewChanges.length}** • LOA +**${loaStarted.length}** / ended **${loaEnded.length}**\n` +
    `Newest: ${shortPeople(t.newestDrivers || [], 3)}`;
  const weekly = w
    ? `${fmtKey(w.key)} • Drivers **${w.currentDrivers}** • Joined **${w.joined}** • Left **${w.left}** • Net **${signed(w.netGrowth)}** • Open Reviews **${w.openReviews}** • Restored **${w.restored}**`
    : 'No completed weekly report yet.';
  const monthly = m
    ? `${fmtKey(m.key)} • Start **${m.startDrivers}** → End **${m.endDrivers}** • Joined **${m.joined}** • Left **${m.left}** • Net **${signed(m.netGrowth)}** • Retention **${pct(m.retention)}**`
    : 'No completed monthly report yet.';
  return {
    title: '🚛 Kings Driver Leadership Dashboard',
    description: 'One fixed dashboard message. Live, daily, weekly and monthly Driver information is kept together here.',
    color: KINGS_BLUE,
    fields: [field('🔵 Live Overview', live), field('🟢 Last 24 Hours', daily), field('🟣 Last Completed Week', weekly), field('👑 Last Completed Month', monthly)],
    footer: { text: 'Kings Logistics • Driver Leadership • Advisory only' },
    timestamp: nowISO()
  };
}

function buildHr(data, now = Date.now()) {
  const start = now - DAY_MS;
  const drivers = (data.driver.drivers || []).filter((d) => d.current);
  const reviews = data.hr.reviews || [];
  const leaves = data.loa.leaves || [];
  const first7 = drivers.filter((d) => {
    const days = ageDays(d.joinDate || d.firstObservedAt, now);
    return days !== null && days < 7;
  });
  const open = reviews.filter((r) => reviewStatus(r, now) === 'open');
  const extended = reviews.filter((r) => reviewStatus(r, now) === 'extended');
  const hrReviews = drivers.filter((d) => d.activityLevel === 'HR Review');
  const activeLoa = leaves.filter((l) => leaveStatus(l, now) === 'active');
  const scheduledLoa = leaves.filter((l) => leaveStatus(l, now) === 'scheduled');
  const opened24 = reviews.filter((r) => recent(r.openedAt, start));
  const completed24 = reviews.filter((r) => recent(r.completedAt, start));
  const hrStarted24 = drivers.filter((d) => d.activityLevel === 'HR Review' && recent(d.activityLevelSince, start));
  const loa24 = leaves.filter((l) => recent(l.createdAt, start));
  const w = latest(data.hrWeekly.publishedWeeks);
  const m = latest(data.hrReports.monthlyReports);
  return {
    title: '👥 Kings HR Leadership Dashboard',
    description: 'One fixed HR dashboard. Information only — all HR and personnel decisions remain human.',
    color: KINGS_BLUE,
    fields: [
      field('🔵 Live Overview', `Drivers **${drivers.length}** • First 7d **${first7.length}** • Open Probation **${open.length}** • Extended **${extended.length}** • 30d HR Reviews **${hrReviews.length}** • LOA active/scheduled **${activeLoa.length}/${scheduledLoa.length}**`),
      field('🟢 Last 24 Hours', `Probation opened **${opened24.length}** • Completed **${completed24.length}** • New HR Reviews **${hrStarted24.length}** • LOA approved **${loa24.length}**`),
      field('🟣 Last Completed Week', w ? `${fmtKey(w.key)} • Drivers **${w.currentDrivers}** • Joined **${w.joined}** • Left **${w.left}** • Net **${signed(w.netGrowth)}** • Probation open **${w.openProbation ?? 0}** • HR Reviews **${w.hrReviews30d ?? 0}**` : 'No completed weekly report yet.'),
      field('👑 Last Completed Month', m ? `${fmtKey(m.key)} • Start **${m.startDrivers}** → End **${m.endDrivers}** • Joined **${m.joined}** • Left **${m.left}** • Retention **${pct(m.retention)}** • Probation opened/completed **${m.probationOpened}/${m.probationCompleted}**` : 'No completed monthly report yet.')
    ],
    footer: { text: 'Kings Logistics • HR Leadership • Human review required' },
    timestamp: nowISO()
  };
}

function buildStaff(data, now = Date.now()) {
  const start = now - DAY_MS;
  const history = data.staff.history || [];
  const recentEvents = history.filter((e) => recent(e.at, start));
  const joined24 = recentEvents.filter((e) => e.type === 'staff_joined').length;
  const left24 = recentEvents.filter((e) => e.type === 'staff_left').length;
  const role24 = recentEvents.filter((e) => e.type === 'role_changed').length;
  const w = latest(data.staffReports.weeklyReports);
  const m = latest(data.staffReports.monthlyReports);
  const s = data.staffSummary;
  const topDepartments = Object.entries(s.departmentCounts || {}).slice(0,5).map(([k,v]) => `${k} **${v}**`).join(' • ') || 'No department data';
  return {
    title: '🛡️ Kings Staff Leadership Dashboard',
    description: 'One fixed Staff dashboard. Staff structure and changes are summarized without automatic role or personnel actions.',
    color: KINGS_BLUE,
    fields: [
      field('🔵 Live Overview', `Current Staff **${s.currentStaff ?? 0}** • Tracked Records **${s.trackedStaffRecords ?? 0}**\n${topDepartments}`),
      field('🟢 Last 24 Hours', `Joined **${joined24}** • Left **${left24}** • Role changes **${role24}**`),
      field('🟣 Last Completed Week', w ? `${fmtKey(w.key)} • Start **${w.startStaff}** → End **${w.endStaff}** • Joined **${w.joined}** • Left **${w.left}** • Role Changes **${w.roleChanges}** • Net **${signed(w.netGrowth)}**` : 'No completed weekly report yet.'),
      field('👑 Last Completed Month', m ? `${fmtKey(m.key)} • Start **${m.startStaff}** → End **${m.endStaff}** • Joined **${m.joined}** • Left **${m.left}** • Role Changes **${m.roleChanges}** • Net **${signed(m.netGrowth)}**` : 'No completed monthly report yet.')
    ],
    footer: { text: 'Kings Logistics • Staff Leadership • Advisory only' },
    timestamp: nowISO()
  };
}

function buildEvent(data, now = Date.now()) {
  const start = now - DAY_MS;
  const snapshot = data.eventReports.lastSnapshot || [];
  const changes = (data.eventReports.changeLog || []).filter((c) => recent(c.at, start));
  const count = (status) => snapshot.filter((e) => e.status === status).length;
  const upcoming = snapshot
    .filter((e) => Number(e.eventUnix || 0) * 1000 >= now && e.status !== 'Cancelled')
    .sort((a,b) => Number(a.eventUnix || 0) - Number(b.eventUnix || 0))
    .slice(0,3)
    .map((e) => `${e.eventDate || '?'} — ${String(e.name || 'Event').slice(0,45)}`)
    .join('\n') || 'No upcoming tracked events.';
  const w = latest(data.eventReports.weeklyReports);
  const m = latest(data.eventReports.monthlyReports);
  return {
    title: '📅 Kings Event Leadership Dashboard',
    description: 'One fixed Event Operations dashboard. Verified convoy attendance/history remains a separate statistics dataset.',
    color: KINGS_BLUE,
    fields: [
      field('🔵 Live Overview', `Tracked **${snapshot.length}** • Scheduled **${count('Scheduled')}** • Ready **${count('Ready for Approval')}** • Needs Info **${count('Needs Information')}** • Completed **${count('Completed')}**\nNext events:\n${upcoming}`),
      field('🟢 Last 24 Hours', `Recorded Event changes **${changes.length}** • Added **${changes.filter(c=>c.type==='event_added').length}** • Updated **${changes.filter(c=>c.type==='event_changed').length}** • Removed **${changes.filter(c=>c.type==='event_removed').length}**`),
      field('🟣 Last Completed Week', w ? `${fmtKey(w.key)} • Tracked **${w.realConvoys}** • Scheduled **${w.scheduled}** • Ready **${w.ready}** • Needs Info **${w.needsInfo}** • Changes **${w.changes}**` : 'No completed weekly report yet.'),
      field('👑 Last Completed Month', m ? `${fmtKey(m.key)} • Counted **${m.counted}** • Completed **${m.completed}** • Cancelled **${m.cancelled}** • Scheduled **${m.scheduled}** • Needs Info **${m.needsInfo}**` : 'No completed monthly report yet.')
    ],
    footer: { text: 'Kings Logistics • Event Leadership • Internal operations' },
    timestamp: nowISO()
  };
}

function buildManagement(data, driverEmbed, hrEmbed, staffEmbed, eventEmbed) {
  const dw = latest(data.managementWeekly.publishedWeeks);
  const mm = latest(data.managementMonthly.monthlyReports);
  const ds = data.driverSummary;
  const ss = data.staffSummary;
  const eventSnap = data.eventReports.lastSnapshot || [];
  const eventNeeds = eventSnap.filter((e) => e.status === 'Needs Information').length;
  const eventReady = eventSnap.filter((e) => e.status === 'Ready for Approval').length;
  const hrOpen = (data.hr.reviews || []).filter((r) => reviewStatus(r) !== 'completed').length;
  const attention = (ds.activity?.attention14Days || 0) + (ds.activity?.hrReview30Days || 0) + hrOpen + eventNeeds + eventReady;
  return {
    title: '👑 Kings Management Leadership Dashboard',
    description: `One fixed Management dashboard combining the key information from all Leadership areas. Current attention indicators: **${attention}**.`,
    color: KINGS_BLUE,
    fields: [
      field('🚛 Drivers — Live', `Drivers **${ds.currentDrivers ?? 0}** • Online **${ds.onlineNow ?? 0}** • Info **${ds.activity?.info7Days ?? 0}** • Attention **${ds.activity?.attention14Days ?? 0}** • HR Review **${ds.activity?.hrReview30Days ?? 0}**`),
      field('👥 HR — Live', `Open/extended probation **${hrOpen}** • Active LOA **${(data.loa.leaves || []).filter(l=>leaveStatus(l)==='active').length}**`),
      field('🛡️ Staff — Live', `Current Staff **${ss.currentStaff ?? 0}** • 30d joined **${ss.changesLast30Days?.joinedStaff ?? 0}** • role changes **${ss.changesLast30Days?.roleChanges ?? 0}** • left **${ss.changesLast30Days?.leftStaff ?? 0}**`),
      field('📅 Events — Live', `Tracked **${eventSnap.length}** • Scheduled **${eventSnap.filter(e=>e.status==='Scheduled').length}** • Ready **${eventReady}** • Needs Info **${eventNeeds}**`),
      field('🟣 Last Completed Week', dw ? `${fmtKey(dw.key)} • Drivers **${dw.members}** • Joined **${dw.joined}** • Left **${dw.left}** • Net **${signed(dw.netGrowth)}** • Staff **${dw.currentStaff ?? ss.currentStaff ?? 0}** • Active Event Threads **${dw.activeEventThreads ?? 0}** • Weekly Peak **${dw.weeklyPeak ?? 0}**` : 'No completed Management weekly report yet.'),
      field('👑 Last Completed Month', mm ? `${fmtKey(mm.key)} • Drivers **${mm.drivers}** • Driver Net **${signed(mm.driverNetGrowth)}** • Staff **${mm.staff}** • Staff Net **${signed(mm.staffNetGrowth)}** • Open Reviews **${mm.openReviews}** • Event Issues **${mm.eventIssues}**` : 'No completed Management monthly report yet.')
    ],
    footer: { text: 'Kings Logistics • Management Control • One-message dashboard' },
    timestamp: nowISO()
  };
}

async function discord(pathname, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(API + pathname, {
        method: options.method || 'GET',
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          'User-Agent': 'Kings Consolidated Leadership Dashboard/1.0',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(15000)
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Discord ${response.status}: ${text.slice(0,300)}`);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1200));
    }
  }
  throw lastError;
}

const OLD_MARKERS = {
  driver: [
    'Kings Driver Leadership Overview',
    'Kings Driver Leadership — Daily Changes',
    'Kings Driver Leadership — Weekly Review',
    'Kings Driver Leadership — Monthly Report',
    'Kings Driver Leadership Weekly Summary',
    'Kings Driver Leadership Dashboard'
  ],
  hr: [
    'Kings HR Leadership Overview',
    'Kings HR Leadership — Daily Changes',
    'Kings HR Leadership — Weekly Review',
    'Kings HR Leadership — Monthly Report',
    'Kings HR Weekly Summary',
    'Kings HR Leadership Dashboard'
  ],
  staff: [
    'Kings Staff Leadership Overview',
    'Kings Staff Management Overview',
    'Kings Staff Leadership — Daily Changes',
    'Kings Staff Leadership — Weekly Review',
    'Kings Staff Leadership — Monthly Report',
    'Kings Staff Leadership Dashboard'
  ],
  event: [
    'Kings Event Leadership Overview',
    'Kings Event Leadership — Daily Changes',
    'Kings Event Leadership — Weekly Review',
    'Kings Event Leadership — Monthly Report',
    'Kings Event Leadership Dashboard'
  ],
  management: [
    'Kings Management Overview',
    'Kings Weekly Management Overview',
    'Kings Management Weekly Review',
    'Kings Management — Monthly Report',
    'Kings Management Leadership Dashboard'
  ]
};

function messageHasMarker(message, markers) {
  const content = String(message?.content || '');
  if (markers.some((m) => content.includes(m))) return true;
  return (message?.embeds || []).some((embed) => {
    const haystack = `${embed?.title || ''}\n${embed?.description || ''}`;
    return markers.some((m) => haystack.includes(m));
  });
}

async function cleanupOld(key, keepId, botId) {
  const messages = await discord(`/channels/${CHANNELS[key]}/messages?limit=100`);
  let removed = 0;
  for (const message of messages || []) {
    if (String(message.id) === String(keepId)) continue;
    // Never delete staff/member/other-bot messages based solely on marker text.
    if (String(message.author?.id || '') !== String(botId)) continue;
    if (!messageHasMarker(message, OLD_MARKERS[key])) continue;
    await discord(`/channels/${CHANNELS[key]}/messages/${message.id}`, { method: 'DELETE' });
    removed++;
  }
  return removed;
}

async function main() {
  const data = loadAll();
  const state = dashboardState();
  const originalIds = JSON.stringify(state.messageIds);
  const self = await discord('/users/@me');
  if (!self?.id) throw new Error('Cannot verify Kings Bot identity; refusing cleanup.');

  const dashboards = {
    driver: buildDriver(data),
    hr: buildHr(data),
    staff: buildStaff(data),
    event: buildEvent(data)
  };
  dashboards.management = buildManagement(data, dashboards.driver, dashboards.hr, dashboards.staff, dashboards.event);

  for (const key of ['driver','hr','staff','event','management']) {
    const result = await syncEmbedMessage({
      token: DISCORD_BOT_TOKEN,
      channelId: CHANNELS[key],
      marker: dashboards[key].title,
      embed: dashboards[key],
      userAgent: 'Kings Consolidated Leadership Dashboard/1.0',
      messageId: state.messageIds[key],
      createWithoutDiscovery: true
    });
    state.messageIds[key] = result.messageId || state.messageIds[key];
    const removed = await cleanupOld(key, state.messageIds[key], self.id);
    console.log(`${key}: ${result.action}; kept ${state.messageIds[key]}; removed ${removed} old dashboard messages.`);
  }

  // Persist stable message IDs only when they change. Updating a heartbeat on
  // every run causes harmless simultaneous dashboard refreshes to conflict.
  if (JSON.stringify(state.messageIds) !== originalIds) {
    state.updatedAt = nowISO();
    writeJson(FILES.dashboardState, state);
  }
  console.log('All Kings Leadership channels now use one consolidated dashboard message each.');
}

main().catch((error) => {
  console.error('Kings consolidated Leadership dashboard failed:', error.message);
  process.exit(1);
});
