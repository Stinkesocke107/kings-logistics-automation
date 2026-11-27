'use strict';
// Reusable read-only Monthly Report acceptance proof. No Discord writes,
// no reconstructed statistics and no replacement of September 2026 evidence.
const ID = /^\d{17,22}$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const VERIFIED = 'VERIFIED-LIVE-MONTHLY';
const PENDING = 'PENDING-LIVE-MONTHLY';
function pending(reason) {
  return Object.freeze({status:PENDING,reason,proof:null});
}
function evaluateMonthlyProof(report,nowMs=Date.now()){
  const checkedAt = Date.parse(report?.checkedAt || '');
  const month = report?.targetMonth;
  const key = month?.key;
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0 ||
      !Number.isFinite(checkedAt) || checkedAt > nowMs + 300000 ||
      nowMs - checkedAt > 3600000) return pending('verification-not-fresh');
  if (!MONTH.test(String(key || '')) ||
      typeof month?.start !== 'string' || typeof month?.end !== 'string')
    return pending('target-month-unverified');
  const start = new Date(month.start);
  if (!Number.isFinite(start.getTime()) ||
      start.toISOString() !== key + '-01T00:00:00.000Z')
    return pending('target-month-unverified');
  const end = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
  if (month.end !== end.toISOString() || nowMs < end.getTime())
    return pending('target-month-not-closed');
  if (report.mode !== 'read-only' || report.phase !== 'post-publish' ||
      report.healthy !== true || report.statistics?.coverageHealthy !== true ||
      report.statistics?.monthClosed !== true || 
      !Array.isArray(report.statistics?.missingDates) ||
      report.statistics.missingDates.length !== 0 ||
      report.statistics.expectedDatesChecked !==
        Math.round((end.getTime()-start.getTime())/86400000))
    return pending('source-or-coverage-unverified');
  const channel = String(report.discord?.channelId || '');
  const webhook = String(report.discord?.webhookId || '');
  const message = String(report.discord?.messageId || '');
  const entry = report.state?.entry;
  if (!ID.test(channel) || !ID.test(webhook) || !ID.test(message) ||
      report.discord?.officialReportMatches !== 1 ||
      report.state?.published !== true || !entry || entry.key !== key ||
      String(entry.discordMessageId || '') !== message ||
      String(entry.discordChannelId || '') !== channel)
    return pending('discord-message-or-state-unverified');
  return Object.freeze({
    status:VERIFIED,
    reason:null,
    proof:Object.freeze({
      version:1,status:VERIFIED,targetMonth:{key,label:new Intl.DateTimeFormat('en-US', {month:'long',year:'numeric',timeZone:'UTC'}).format(start)},
      statisticsDaysVerified:report.statistics.expectedDatesChecked,
      discordChannelId:channel,discordWebhookId:webhook,
      discordMessageId:message,stateEntryKey:key,
      sourceVerifiedAt:new Date(checkedAt).toISOString(),
      verifiedAt:new Date(nowMs).toISOString()
    })
  });
}
module.exports={VERIFIED,PENDING,evaluateMonthlyProof};
