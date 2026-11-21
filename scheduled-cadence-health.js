'use strict';

// Read-only evaluator for the actual creation time of a daily GitHub
// Actions schedule run. Manual recovery and push checks are NOT replacements
// for the expected scheduled occurrence. All calculations use UTC.
function assessDailyUtcSchedule(runs, {
  hour, minute, graceMinutes = 120, now = Date.now()
} = {}) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !Number.isInteger(minute) || minute < 0 || minute > 59 ||
      !Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 1440) {
    throw new Error('Invalid monitored daily UTC schedule');
  }
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Invalid schedule monitor clock');

  const expected = new Date(nowMs);
  expected.setUTCHours(hour, minute, 0, 0);
  let expectedMs = expected.getTime();

  // Before today's slot has passed its grace period, assess yesterday's slot.
  if (nowMs < expectedMs + graceMinutes * 60000) {
    expectedMs -= 86400000;
  }
  const dueAt = new Date(expectedMs).toISOString();
  const scheduledRuns = (Array.isArray(runs) ? runs : [])
    .filter(run => run?.event === 'schedule' && typeof run.created_at === 'string')
    .map(run => ({id:run.id || null, timestamp:Date.parse(run.created_at)}))
    .filter(run => Number.isFinite(run.timestamp) && run.timestamp <= nowMs)
    .sort((a,b)=>b.timestamp-a.timestamp);

  // A run is assigned to the expected UTC calendar day's scheduled slot,
  // with 5 minutes allowance for a GitHub clock timestamp preceding the slot.
  const match = scheduledRuns.find(run =>
    run.timestamp >= expectedMs - 5 * 60000 && run.timestamp < expectedMs + 86400000
  );
  if (!match) {
    return {
      status:'missing', expectedAt:dueAt, actualAt:null,
      delayMinutes:null, graceMinutes,
      latestScheduledAt:scheduledRuns.length ? new Date(scheduledRuns[0].timestamp).toISOString() : null
    };
  }
  const delayMinutes = Math.max(0, Math.floor((match.timestamp - expectedMs) / 60000));
  return {
    status:delayMinutes > graceMinutes ? 'late' : 'on-time',
    expectedAt:dueAt, actualAt:new Date(match.timestamp).toISOString(),
    delayMinutes, graceMinutes, runId:match.id
  };
}
module.exports={assessDailyUtcSchedule};
