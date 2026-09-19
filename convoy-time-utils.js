function parseMeetingTime(eventDate, meetingTime) {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  if (!meetingTime) return null;

  const text = String(meetingTime).trim();
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!timeMatch) return null;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  let offsetMinutes = null;
  let zoneLabel = null;

  const numericOffset = text.match(/(?:\b(?:UTC|GMT)\s*)?([+-])(\d{1,2})(?::?(\d{2}))?\b/i);
  const explicitUtc = /\b(?:UTC|GMT|Z)\b/i.test(text);

  if (numericOffset) {
    const sign = numericOffset[1] === '-' ? -1 : 1;
    const hours = Number(numericOffset[2]);
    const minutes = Number(numericOffset[3] || 0);
    if (hours > 14 || minutes > 59) return null;
    offsetMinutes = sign * (hours * 60 + minutes);
    zoneLabel = `${sign < 0 ? '-' : '+'}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  } else if (/\bCEST\b/i.test(text)) {
    offsetMinutes = 120;
    zoneLabel = 'CEST';
  } else if (/\bCET\b/i.test(text)) {
    offsetMinutes = 60;
    zoneLabel = 'CET';
  } else if (/\bEEST\b/i.test(text)) {
    offsetMinutes = 180;
    zoneLabel = 'EEST';
  } else if (/\bEET\b/i.test(text)) {
    offsetMinutes = 120;
    zoneLabel = 'EET';
  } else if (/\bBST\b/i.test(text)) {
    offsetMinutes = 60;
    zoneLabel = 'BST';
  } else if (explicitUtc) {
    offsetMinutes = 0;
    zoneLabel = 'UTC';
  }

  if (offsetMinutes === null) return null;

  const [year, month, day] = eventDate.split('-').map(Number);
  const localMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const utcMs = localMs - offsetMinutes * 60 * 1000;

  return {
    unix: Math.floor(utcMs / 1000),
    offsetMinutes,
    zoneLabel,
    hour,
    minute,
    eventDate,
    rawMeetingTime: text
  };
}

function discordTimestamp(unix, style = 'F') {
  if (!Number.isFinite(Number(unix))) return null;
  return `<t:${Math.floor(Number(unix))}:${style}>`;
}

function localDateForUnix(unix, offsetMinutes) {
  if (!Number.isFinite(Number(unix)) || !Number.isFinite(Number(offsetMinutes))) return null;
  const shifted = new Date((Number(unix) + Number(offsetMinutes) * 60) * 1000);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0')
  ].join('-');
}

module.exports = {
  parseMeetingTime,
  discordTimestamp,
  localDateForUnix
};
