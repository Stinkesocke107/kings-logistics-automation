'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const OUTPUT = path.join(ROOT, 'output');

function read(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function validExisting(file, status) {
  const value = read(file);
  return value && value.version === 1 && value.status === status && !Number.isNaN(Date.parse(value.verifiedAt || '')) ? value : null;
}

function collectWeekly() {
  const proofFile = path.join(DATA, 'hr-weekly-live-proof.json');
  const existing = validExisting(proofFile, 'VERIFIED-LIVE-HR-WEEKLY');
  if (existing) return { mode: 'weekly', status: existing.status, reused: true, proof: existing };

  const report = read(path.join(OUTPUT, 'weekly-reports-verification.json'));
  if (!report) throw new Error('weekly-reports-verification.json is missing.');
  const ready = Boolean(
    report.healthy === true &&
    report.driverManagement?.completeCoverageForTargetWeek === true &&
    report.hrWeekly?.expectedForTargetWeek === true &&
    report.hrWeekly?.statePublished === true &&
    report.hrWeekly?.discordPostFound === true &&
    report.hrWeekly?.messageId
  );
  if (!ready) return {
    mode: 'weekly',
    status: 'PENDING-LIVE-HR-WEEKLY',
    reason: report.hrWeekly?.expectedForTargetWeek ? 'waiting-for-successful-hr-publication' : 'waiting-for-first-complete-coverage-week',
    targetWeek: report.targetWeek || null
  };

  const proof = {
    version: 1,
    status: 'VERIFIED-LIVE-HR-WEEKLY',
    targetWeek: report.targetWeek,
    discordChannelId: report.channelResolution?.hr?.id || null,
    discordMessageId: String(report.hrWeekly.messageId),
    statePublished: true,
    verifiedAt: new Date().toISOString()
  };
  write(proofFile, proof);
  return { mode: 'weekly', status: proof.status, reused: false, proof };
}

function collectMonthly() {
  const proofFile = path.join(DATA, 'monthly-live-proof.json');
  const existing = validExisting(proofFile, 'VERIFIED-LIVE-MONTHLY-2026-09');
  if (existing) return { mode: 'monthly', status: existing.status, reused: true, proof: existing };

  const report = read(path.join(OUTPUT, 'monthly-report-verification.json'));
  if (!report) throw new Error('monthly-report-verification.json is missing.');
  const isSeptember = report.targetMonth?.key === '2026-09';
  const ready = Boolean(
    isSeptember &&
    report.phase === 'post-publish' &&
    report.healthy === true &&
    report.state?.published === true &&
    Number(report.discord?.officialReportMatches) === 1 &&
    report.discord?.messageId
  );
  if (!ready) return {
    mode: 'monthly',
    status: 'PENDING-LIVE-MONTHLY-2026-09',
    reason: isSeptember ? 'waiting-for-successful-september-publication' : 'september-proof-window-not-current-and-no-accepted-proof-yet',
    targetMonth: report.targetMonth || null,
    phase: report.phase || null
  };

  const proof = {
    version: 1,
    status: 'VERIFIED-LIVE-MONTHLY-2026-09',
    targetMonth: report.targetMonth,
    discordWebhookId: String(report.discord.webhookId),
    discordChannelId: String(report.discord.channelId),
    discordMessageId: String(report.discord.messageId),
    officialReportMatches: 1,
    stateEntry: report.state.entry || null,
    verifiedAt: new Date().toISOString()
  };
  write(proofFile, proof);
  return { mode: 'monthly', status: proof.status, reused: false, proof };
}

function collectConvoy() {
  const proofFile = path.join(DATA, 'public-convoy-live-proof.json');
  const existing = validExisting(proofFile, 'VERIFIED-LIVE-PUBLIC-CONVOY-35810');
  if (existing) return { mode: 'convoy', status: existing.status, reused: true, proof: existing };

  const report = read(path.join(OUTPUT, 'kings-convoy-announcement-verification.json'));
  if (!report) throw new Error('kings-convoy-announcement-verification.json is missing.');
  const entry = (report.entries || []).find((item) => String(item.eventId || '') === '35810');
  const ready = Boolean(
    entry &&
    entry.announcementFound === true &&
    entry.verified === true &&
    ['in-window', 'past'].includes(entry.state) &&
    entry.announcementMessageId &&
    report.bot?.id &&
    report.announcementChannel?.id
  );
  if (!ready) return {
    mode: 'convoy',
    status: 'PENDING-LIVE-PUBLIC-CONVOY-35810',
    reason: entry?.reason || 'event-35810-not-yet-verifiable',
    entry: entry || null
  };

  const proof = {
    version: 1,
    status: 'VERIFIED-LIVE-PUBLIC-CONVOY-35810',
    eventId: 35810,
    name: entry.name,
    meetingAt: entry.meetingAt,
    windowOpensAt: entry.windowOpensAt,
    verificationState: entry.state,
    discordMessageId: String(entry.announcementMessageId),
    discordChannelId: String(report.announcementChannel.id),
    discordBotId: String(report.bot.id),
    verifiedAt: new Date().toISOString()
  };
  write(proofFile, proof);
  return { mode: 'convoy', status: proof.status, reused: false, proof };
}

function main() {
  const mode = String(process.argv[2] || '').trim().toLowerCase();
  let result;
  if (mode === 'weekly') result = collectWeekly();
  else if (mode === 'monthly') result = collectMonthly();
  else if (mode === 'convoy') result = collectConvoy();
  else throw new Error('Usage: node production-proof-collector.js <weekly|monthly|convoy>');

  const reportFile = path.join(OUTPUT, `production-proof-${mode}.json`);
  write(reportFile, { version: 1, checkedAt: new Date().toISOString(), ...result });
  console.log(`Production proof collector (${mode}): ${result.status}`);
  if (result.reason) console.log(`Reason: ${result.reason}`);
}

try { main(); } catch (error) { console.error(`Production proof collector failed: ${error.stack || error.message}`); process.exitCode = 1; }
